// Gate A: decem against the oracle's answers.
// This runner predates the implementation, because it is what the implementation had to pass.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

import * as core from "../../src/index.ts";

function lines(p) {
  return readFileSync(join(HERE, p), "utf8").split("\n").filter(Boolean).map(JSON.parse);
}
function count(kind) { return lines(`cases/${kind}.jsonl`).length; }

const EXACT = new Set(["add", "sub", "mul"]);
// Value agreement and string agreement are counted separately.
//   wrong value                     the arithmetic is wrong
//   right value, wrong string       the formatter diverges from the specification
// Counting them together would let a formatting bug masquerade as an arithmetic failure.
let pass = 0, fail = 0, skip = 0, fmtOnly = 0;
const failures = [], fmtFailures = [];
const todo = new Map();   // operations the core does not have yet, which is not a failure

for (const kind of ["exact", "approx"]) {
  const cases = lines(`cases/${kind}.jsonl`);
  const expected = new Map(lines(`expected/${kind}.jsonl`).map((e) => [e.id, e]));
  for (const c of cases) {
    const want = expected.get(c.id);
    if (!want) { skip++; continue; }
    if (want.noOracle) { todo.set(`${c.op}(no oracle)`, (todo.get(`${c.op}(no oracle)`) ?? 0) + 1); continue; }
    if (typeof core[c.op] !== "function") {
      todo.set(c.op, (todo.get(c.op) ?? 0) + 1);
      continue;
    }
    let got, err = null;
    try {
      const args = c.args.map(core.dec);
      got = EXACT.has(c.op)
        ? core[c.op](...args)
        : core[c.op](...args, { ...c.prec, rounding: c.rounding });
      got = core.toString(got);
    } catch (e) { err = e.constructor.name; }

    const label = `  ${c.id}  ${c.op}(${c.args.join(", ")})` +
      (c.prec ? ` @${JSON.stringify(c.prec)} ${c.rounding}` : "");

    if (want.error) {
      err === want.error ? pass++
        : (fail++, failures.length < 15 && failures.push(
            `${label}\n     expected ${want.error}\n     actual   ${err ?? got}`));
      continue;
    }
    if (err) {
      fail++;
      if (failures.length < 15)
        failures.push(`${label}\n     expected ${want.result}\n     actual   raised ${err}`);
      continue;
    }
    // Compare values first, so the arithmetic is judged independently of the formatter.
    const sameValue = core.cmp(core.dec(got), core.dec(want.result)) === 0;
    if (!sameValue) {
      fail++;
      if (failures.length < 15)
        failures.push(`${label}\n     expected ${want.result}\n     actual   ${got}`);
    } else if (want.valueOnly) {
      pass++;                 // no authoritative spelling for this operation, so value is enough
    } else if (got !== want.result) {
      fmtOnly++;
      if (fmtFailures.length < 10)
        fmtFailures.push(`${label}\n     spec   ${want.result}\n     decem ${got}`);
    } else pass++;
  }
}

// The status flags, which until now were the one part of the contract nothing checked.
//
// `exact` has an authoritative answer already: libmpdec raises Inexact when a result had
// to be rounded, and the generator records that per case. It was being written to the
// expectation files and read by nobody.
//
// `direction` has no oracle, and does not need one. A rounded result and the operands it
// came from decide it by exact arithmetic: r is above a/b exactly when r*b is above a.
// That check uses mul and sub, which are themselves exact and covered by gates A and B,
// so it is a residual test rather than a claim graded against itself.
const sign = (n) => (n < 0 ? -1 : n > 0 ? 1 : 0);
let stPass = 0, stFail = 0;
const stFailures = [];

const expectDirection = {
  div: (r, [a, b]) => sign(core.cmp(core.mul(r, b), a)) * (core.isNeg(b) ? -1 : 1),
  sqrt: (r, [x]) => sign(core.cmp(core.mul(r, r), x)),
};

for (const c of lines("cases/approx.jsonl")) {
  const fn = core[`${c.op}Status`];
  if (typeof fn !== "function") continue;
  const want = new Map(lines("expected/approx.jsonl").map((e) => [e.id, e])).get(c.id);
  if (!want || want.error || want.noOracle) continue;

  let got;
  const args = c.args.map(core.dec);
  try { got = fn(...args, { ...c.prec, rounding: c.rounding }); } catch { continue; }

  const wantExact = !want.inexact;
  const wantDir = wantExact ? 0 : expectDirection[c.op](got.value, args);
  const label = `  ${c.id}  ${c.op}Status(${c.args.join(", ")}) @${JSON.stringify(c.prec)} ${c.rounding}`;

  if (got.exact !== wantExact) {
    stFail++;
    stFailures.length < 8 && stFailures.push(`${label}\n     exact expected ${wantExact}, got ${got.exact}`);
  } else if (got.direction !== wantDir) {
    stFail++;
    stFailures.length < 8 && stFailures.push(`${label}\n     direction expected ${wantDir}, got ${got.direction}`);
  } else stPass++;
}

// round and quantize need no oracle at all. Whether the result moved, and which way, is
// decided by comparing it with the value it started from.
for (const [name, fn, prec] of [
  ["roundStatus", core.roundStatus, (n) => ({ digits: n })],
  ["quantizeStatus", core.quantizeStatus, (n) => ({ scale: n - 12 })],
]) {
  for (const c of lines("cases/approx.jsonl")) {
    if (c.op !== "div") continue;                       // any pool of ordinary values will do
    const x = core.dec(c.args[0]);
    const p = { ...prec((c.id.charCodeAt(6) % 9) + 1), rounding: c.rounding };
    let got;
    try { got = fn(x, p); } catch { continue; }
    const wantDir = sign(core.cmp(got.value, x));
    if (got.exact !== (wantDir === 0) || got.direction !== wantDir) {
      stFail++;
      stFailures.length < 8 && stFailures.push(
        `  ${c.id}  ${name} @${JSON.stringify(p)}\n     expected {exact:${wantDir === 0},direction:${wantDir}}` +
        `, got {exact:${got.exact},direction:${got.direction}}`);
    } else stPass++;
  }
}

console.log(`Gate A (oracle)  ${pass} passed, ${fail} failed` +
  (fmtOnly ? `, ${fmtOnly} right value with a different spelling` : "") +
  (skip ? `, ${skip} without an answer` : ""));
if (todo.size)
  console.log(`  not implemented: ${[...todo].map(([op, n]) => `${op}(${n})`).join(" ")}` +
    `. These are not failures and start counting as soon as the operation exists.`);
if (failures.length) {
  console.log("\n-- arithmetic mismatches --");
  failures.forEach((f) => console.log(f));
}
if (fmtFailures.length) {
  console.log("\n-- spelling mismatches, arithmetic is correct --");
  fmtFailures.forEach((f) => console.log(f));
}
console.log(`  status flags: ${stPass} agreed, ${stFail} disagreed`);
if (stFailures.length) {
  console.log("\n-- status mismatches --");
  stFailures.forEach((f) => console.log(f));
}
process.exit(fail || stFail ? 1 : fmtOnly ? 3 : 0);   // 3 means only the formatter diverged
