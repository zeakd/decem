// Gate D: the runtime matrix.
//
// Two questions. Are the results identical across runtimes, compared by digest, and are
// the declared limits the ones each runtime actually has? The digit ceiling differs per
// runtime; the magnitude ceiling does not.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE = join(HERE, "probe.mjs");

const RUNTIMES = [
  ["node", process.execPath, [PROBE]],
  ["bun", "bun", [PROBE]],
  ["deno", "deno", ["run", "--allow-read", "--allow-env", "--no-check", PROBE]],
  // The browser axis needs the build output. Without it, or without Chrome, the probe
  // exits with status 2 and is reported below as skipped rather than dropped in silence.
  ["browser", process.execPath, [join(HERE, "browser.mjs")]],
];

// The declared limits. If a runtime's ceiling moves, this is what notices first.
const DECLARED = { "node/V8": 322905000, "bun/JSC": 315000, "deno/V8": 322905000,
                   "browser/Blink": 322905000 };

const results = [];
const missing = [];
for (const [name, cmd, args] of RUNTIMES) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status === 2) { missing.push([name, (r.stdout ?? "").trim() || "skipped"]); continue; }
  if (r.error || r.status !== 0) {
    missing.push([name, (r.stdout || r.stderr || String(r.error)).split("\n")[0]]);
    continue;
  }
  results.push(JSON.parse(r.stdout.trim().split("\n").pop()));
}

let fail = 0;
console.log(`Gate D (runtime matrix)  ${results.length} runtimes`);
const digests = new Set(results.map((r) => r.digest));
for (const r of results) {
  const want = DECLARED[r.runtime];
  const limitOk = want === undefined || r.maxDigits === want;
  const errOk = r.digitOverflow === "DigitOverflow" && r.exponentOverflow === "ExponentOverflow";
  if (!limitOk || !errOk) fail++;
  console.log(`  ${r.runtime.padEnd(14)} digest ${r.digest}  ` +
    `digits ${r.maxDigits.toLocaleString()}${limitOk ? "" : ` (declared ${want?.toLocaleString()})`}  ` +
    `${errOk ? "raises correctly" : `raised ${r.digitOverflow}/${r.exponentOverflow}`}`);
}
if (digests.size > 1) {
  fail++;
  console.log("  digests differ, which means a runtime-dependent defect");
} else if (results.length > 1) {
  console.log(`  ${results[0].cases} results identical across every runtime`);
}
for (const [name, why] of missing) console.log(`  ${name} unavailable: ${why.slice(0, 60)}`);
if (results.length < 2) { console.log("  a comparison needs at least two runtimes"); fail++; }
process.exit(fail ? 1 : 0);
