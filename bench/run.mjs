// Gate F: performance regression against the committed baseline.
//
// A case fails at 25% slower. A noisy measurement, meaning an interquartile range above
// 15% of the median, is excluded from judgement so that jitter does not read as a change.
//
// The IQR alone is not enough. It measures variation within a run, not drift between
// runs, so sustained load produces a stably slow measurement with an IQR near zero that
// looks exactly like a regression. Addition once appeared 1.31x slower that way. A
// detected regression is therefore measured a second time and only fails if it repeats.
//
// --update rewrites the baseline, and is meant to be run deliberately.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { measure, noisy, IQR_THRESHOLD } from "./protocol.mjs";
import { CASES } from "./cases.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = join(HERE, "baseline.jsonl");
const REGRESSION = 1.25;
const update = process.argv.includes("--update");
const rt = typeof Bun !== "undefined" ? "bun" : typeof Deno !== "undefined" ? "deno" : "node";

const prev = new Map();
if (existsSync(BASE))
  for (const l of readFileSync(BASE, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(l);
    prev.set(`${r.runtime}\t${r.name}`, r);
  }

const rows = [];
let fail = 0, noisyN = 0, retried = 0;
let belowFloor = 0;
console.log(`Gate F (performance)  runtime ${rt}`);
console.log("case".padEnd(14) + "ns/op".padStart(12) + "  iqr".padStart(7) + "   vs baseline");
for (const [name, fn, iters] of CASES) {
  const m = measure(fn, { iters });
  const key = `${rt}\t${name}`;
  const p = prev.get(key);
  // Subtracting the empty loop can take a case below zero when it is faster than the
  // measurement itself, and the protocol clamps that to zero. A zero is not a fast result,
  // it is the absence of one, and dividing by it made the cached string read report an
  // infinite regression. It is excluded the same way a noisy case is.
  const unmeasurable = m.ns === 0 || (p && p.ns === 0);
  const ratio = p && !unmeasurable ? m.ns / p.ns : null;
  const isNoisy = noisy(m);
  if (isNoisy) noisyN++;
  if (unmeasurable) belowFloor++;
  let verdict = unmeasurable ? "below the timer's resolution, excluded" : "no baseline";
  if (ratio !== null) {
    if (isNoisy) verdict = `${ratio.toFixed(2)}x (noisy, excluded)`;
    else if (ratio > REGRESSION) {
      // Measure once more. A load spike rarely lands twice in the same place.
      const again = measure(fn, { iters });
      const r2 = again.ns / p.ns;
      if (r2 > REGRESSION) { verdict = `${ratio.toFixed(2)}x then ${r2.toFixed(2)}x, regression confirmed`; fail++; }
      else { verdict = `${ratio.toFixed(2)}x then ${r2.toFixed(2)}x, gone on remeasure`; retried++; }
    }
    else verdict = `${ratio.toFixed(2)}x`;
  }
  console.log(name.padEnd(14) + m.ns.toFixed(1).padStart(12) +
    (m.iqrRatio * 100).toFixed(0).padStart(6) + "%   " + verdict);
  rows.push({ runtime: rt, name, ns: Number(m.ns.toFixed(3)), iters,
              iqrRatio: Number(m.iqrRatio.toFixed(4)), coldNs: Number(m.coldNs.toFixed(0)) });
}

if (update) {
  const keep = [...prev.values()].filter((r) => r.runtime !== rt);
  writeFileSync(BASE, [...keep, ...rows].map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`\nbaseline updated, ${rows.length} cases for ${rt}`);
} else if (!prev.size) {
  console.log(`\nno baseline yet; create one with 'node bench/run.mjs --update'`);
}
if (belowFloor) console.log(`${belowFloor} case${belowFloor === 1 ? "" : "s"} too fast to measure and excluded, which is a fact about the clock rather than the code`);
if (retried) console.log(`${retried} apparent regressions vanished on remeasure, which is drift the IQR cannot see`);
if (noisyN) console.log(`${noisyN} noisy measurements excluded (IQR above ${IQR_THRESHOLD * 100}%)`);
console.log(fail ? `\n${fail} regressions` : "\nno regressions");
process.exit(fail ? 1 : 0);
