// The browser axis of gate D.
//
// No heavy tooling. The core has no node: imports, so the build output loads as a plain
// module, and a static server with headless Chrome is enough.
//
// --dump-dom is deliberately not used. Module loading is async, so dumping the DOM means
// guessing when to do it, and a wrong guess reads "pending" as the result. The page posts
// its result back instead, and arrival is the completion signal.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!existsSync(join(ROOT, "dist/index.js")))
  { console.log("SKIP no build output; run the build first"); process.exit(2); }
if (!existsSync(CHROME)) { console.log("SKIP Chrome not found"); process.exit(2); }

const PAGE = `<!doctype html><meta charset="utf-8"><title>denary</title>
<script type="module">
  const send = (o) => fetch("/result", { method: "POST", body: JSON.stringify(o) });
  try {
    const d = await import("/dist/index.js");
    const { runWorkload, digestOf, limitsOf } = await import("/test/runtime/workload.mjs");
    const lines = runWorkload(d);
    await send({ runtime: "browser/Blink", cases: lines.length,
                 digest: digestOf(lines), ...limitsOf(d) });
  } catch (e) { await send({ error: String(e && e.stack || e) }); }
</script>`;

const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".map": "application/json" };
let resolve;
const done = new Promise((r) => { resolve = r; });

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/result") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { res.end("ok"); resolve(body); });
    return;
  }
  const url = req.url.split("?")[0];
  if (url === "/") { res.setHeader("content-type", "text/html"); return res.end(PAGE); }
  const file = join(ROOT, url);
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", MIME[extname(file)] ?? "text/plain");
  res.end(readFileSync(file));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
// A throwaway profile, so this never collides with a Chrome the user already has open.
const profile = mkdtempSync(join(tmpdir(), "denary-chrome-"));
// Started in its own process group. Chrome spawns several children, and killing only the
// parent leaves them running and eating CPU, which then shows up in the benchmark that
// runs next. That contamination once looked like a 1.3x regression in addition. Killing
// the group also avoids a broad pkill that would reach the user's own browser.
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  `--user-data-dir=${profile}`, `http://127.0.0.1:${port}/`,
], { stdio: ["ignore", "ignore", "pipe"], detached: true });

let stderr = "";
chrome.stderr.on("data", (c) => (stderr += c));
// The timer is cleared rather than left to fire. A pending timeout keeps the event loop
// alive after the race is already decided, so this probe took the full sixty seconds every
// time even when the answer arrived in one, and gate D was ninety-seven percent of the
// wall time of the whole check.
let timer;
const timeout = new Promise((r) => { timer = setTimeout(() => r(null), 60000); });
const body = await Promise.race([done, timeout]);
clearTimeout(timer);

// A negative pid signals the whole group.
try { process.kill(-chrome.pid, "SIGKILL"); } catch { chrome.kill("SIGKILL"); }
server.closeAllConnections?.();
server.close();
rmSync(profile, { recursive: true, force: true });

if (body === null) {
  console.log("FAIL no result within 60 seconds: " + stderr.split("\n").filter((l) => !l.includes("CVDisplayLink")).slice(0, 2).join(" "));
  process.exit(1);
}
const parsed = JSON.parse(body);
if (parsed.error) { console.log("FAIL " + parsed.error.slice(0, 300)); process.exit(1); }
console.log(body);
