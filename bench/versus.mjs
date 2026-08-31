// The comparison run. Each target lives in its own file under peers/; this only drives
// them and prints, so that a mistake in how a library is called is a mistake in one file.
//
// Fairness is the hard part, and the parts that cannot be made fair are named rather than
// smoothed over:
//
//   Multiplication is not the same operation. decem's is exact and keeps every digit;
//   decimal.js rounds to its global precision. At equal inputs it is doing less work, and
//   the 400-digit row is where that gap is widest, so the ratio there is not a like for
//   like comparison and the report says so.
//
//   An operation a library does not have is absent, not approximated.
//
//   Versions are read from what is installed rather than written down, because a table
//   without them cannot answer "you measured an old release".
//
// Targets that only the benchmark needs are declared in bench/package.json, so installing
// the library does not pull in the libraries it is compared against. Run `npm install` in
// this directory to get them. A target that is not installed is reported as absent and the
// rest of the table still runs; the report refuses to write a partial table.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { measure, noisy } from "./protocol.mjs";
import { CASES } from "./peers/cases.mjs";

const require = createRequire(import.meta.url);

const TARGETS = ["./peers/decem.mjs", "./peers/decimal-js.mjs", "./peers/big-js.mjs"];

export async function run() {
  const targets = [], absent = [];
  for (const path of TARGETS) {
    let m;
    try { m = await import(path); }
    catch (e) {
      // Not installed rather than broken: say which and carry on, so the self-comparison
      // still runs on a machine that never asked for the other libraries.
      absent.push({ path, why: e.code === "ERR_MODULE_NOT_FOUND" ? "not installed" : e.message });
      continue;
    }
    const version = m.meta.pkg
      ? JSON.parse(readFileSync(require.resolve(`${m.meta.pkg}/package.json`), "utf8")).version
      : JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
    targets.push({ ...m.meta, version, ops: m.ops });
  }

  const rows = [];
  for (const c of CASES) {
    const cells = targets.map((t) => {
      const fn = t.ops[c.key];
      if (!fn) return { name: t.name, ns: null };
      const m = measure(fn, { iters: c.iters });
      return { name: t.name, ns: m.ns, noisy: noisy(m) };
    });
    rows.push({ ...c, cells });
  }
  return { targets: targets.map(({ ops, ...rest }) => rest), rows, absent };
}

const fmt = (v) =>
  v === null ? "n/a" : v < 10000 ? `${v.toFixed(0)} ns` : `${(v / 1000).toFixed(1)} us`;

export const ratio = (ours, theirs) =>
  theirs === null || ours === null ? null : theirs / ours;   // above one means we are faster

if (import.meta.url === `file://${process.argv[1]}`) {
  const { targets, rows, absent } = await run();
  console.log(targets.map((t) => `${t.name} ${t.version}`).join("   "));
  for (const a of absent)
    console.log(`${a.path.replace("./peers/", "")}  ${a.why}. Run npm install in bench/`);
  console.log("\n" + "operation".padEnd(26) + targets.map((t) => t.name.padStart(12)).join("") +
              "   vs decimal.js");
  for (const r of rows) {
    const rr = ratio(r.cells[0].ns, r.cells[1].ns);
    const verdict = rr === null ? "" : rr >= 1 ? `${rr.toFixed(1)}x faster` : `${(1 / rr).toFixed(1)}x slower`;
    console.log(r.label.padEnd(26) + r.cells.map((c) => fmt(c.ns).padStart(12)).join("") +
                "   " + verdict + (r.cells.some((c) => c.noisy) ? "  (noisy)" : ""));
  }
}
