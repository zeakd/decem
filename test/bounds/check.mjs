// Gate I: no answer depends on the error bound being as small as it is declared.
//
// Correct rounding for a transcendental rests on one claim that nothing else checks. The
// retry loop stops when both ends of an interval round alike, and the interval is built
// from an error the implementation declares for itself. A declared error smaller than the
// real one stops the loop early and returns a confidently wrong digit.
//
// The claim is testable without knowing the real error. Inflating the bound only makes the
// loop more conservative, so a bound that is a true upper bound gives the same answers at
// any inflation. An answer that moves proves the smaller bound was load-bearing, and a
// load-bearing bound is one the implementation cannot justify.
//
// This computes the transcendental corpus at several inflations and compares digests. The
// first version of this gate asked whether the gates still passed, which is the wrong
// question: with a bound cut to a tenth, inflating by ten restores it and the run goes
// green while the uninflated answers are wrong. Injecting that defect is what showed it.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../../src/index.ts";
import { setErrInflation } from "../../src/transcendental.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const lines = (p) =>
  readFileSync(join(HERE, p), "utf8").split("\n").filter(Boolean).map(JSON.parse);

// Only the operations that go through the retry loop have a bound to be wrong about.
const ZIV = new Set(["exp", "ln", "log10", "sin", "cos", "tan"]);
const cases = [...lines("../oracle/cases/approx.jsonl"),
               ...lines("../boundary/cases-transcendental.jsonl")]
  .filter((c) => ZIV.has(c.op));

const FACTORS = [1n, 10n, 1000n, 100000n];

function digest(factor) {
  setErrInflation(factor);
  const h = createHash("sha256");
  let raised = 0;
  for (const c of cases) {
    let line;
    try {
      const args = c.args.map(core.dec);
      line = core.toString(core[c.op](...args, { ...c.prec, rounding: c.rounding }));
    } catch (e) { line = `!${e.constructor.name}`; raised++; }
    h.update(`${c.id}=${line}\n`);
  }
  return [h.digest("hex").slice(0, 16), raised];
}

const results = FACTORS.map((f) => [f, ...digest(f)]);
setErrInflation(1n);

const base = results[0][1];
let fail = 0;
console.log(`Gate I (error bound)  ${cases.length} transcendental cases at ${FACTORS.length} inflations`);
for (const [factor, d, raised] of results) {
  const same = d === base;
  if (!same) fail++;
  console.log(`  x${String(factor).padEnd(8)} digest ${d}  ${same ? "identical" : "MOVED"}` +
    (raised ? `  ${raised} raised` : ""));
}
if (fail)
  console.log("\n  An answer moved when the bound was widened, so the declared bound is\n" +
              "  smaller than the real error and the loop was stopping too early.");
else
  console.log("  no answer depends on the bound being as small as it is declared");
process.exit(fail ? 1 : 0);
