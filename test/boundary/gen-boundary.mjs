// Gate C: constructed rounding boundaries.
//
// Random inputs essentially never land on a tie, so these are built rather than found.
// An exact tie is constructed algebraically, and one ulp either side gives the cases just
// below and just above. Those three are where a rounding implementation can be wrong.
//
//   div    q is a (p+1)-digit integer ending in 5, so a = q*b puts a/b exactly on the tie
//          at p digits, and a = q*b -/+ 1 puts it just below or just above
//   sqrt   the same shape with x = s^2
//   cbrt   the same shape with x = s^3
//   quantize  the discarded part is exactly half a unit in the last place kept, so the
//          value is m*10^-(n+1) with m ending in 5. Signs are generated both ways,
//          because a rounding mode that is defined by direction rather than by
//          magnitude is where a sign is most easily dropped
//
// At a tie the seven rounding modes disagree with each other, which is what makes these
// the cases that separate implementations.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUNDINGS = ["half-even", "half-up", "half-down", "up", "down", "ceil", "floor"];
const PRECS = [7, 20, 34];
const SCALES = [0, 2, 7];        // none, money, and one that is not either

// Deterministic: built from rules, with no seed involved.
const bodies = (p) => [
  "1" + "0".repeat(p - 1),          // odd leading digit, which half-even distinguishes
  "2" + "0".repeat(p - 1),          // and the even one
  "1" + "2".repeat(p - 1),
  "9".repeat(p),                    // rounding up here adds a digit
  "1" + "0".repeat(p - 2) + "1",
];
const DIVISORS = ["7", "3", "1000003", "999999999999937"];

const cases = [];
let n = 0;
const id = (op) => `${op}-b${String(++n).padStart(5, "0")}`;

for (const p of PRECS) {
  for (const body of bodies(p)) {
    const q = BigInt(body + "5");                 // p+1 digits ending in 5, so a tie
    for (const bs of DIVISORS) {
      const b = BigInt(bs);
      for (const [tag, a] of [["tie", q * b], ["below", q * b - 1n], ["above", q * b + 1n]]) {
        for (const rounding of ROUNDINGS)
          cases.push({ id: id("div"), op: "div", args: [a.toString(), bs],
                       prec: { digits: p }, rounding, boundary: tag });
      }
    }
    const s = BigInt(body + "5");
    for (const [tag, x] of [["tie", s * s], ["below", s * s - 1n], ["above", s * s + 1n]]) {
      for (const rounding of ROUNDINGS)
        cases.push({ id: id("sqrt"), op: "sqrt", args: [x.toString()],
                     prec: { digits: p }, rounding, boundary: tag });
    }
    // cbrt takes the same construction with s^3.
    for (const [tag, x] of [["tie", s ** 3n], ["below", s ** 3n - 1n], ["above", s ** 3n + 1n]]) {
      for (const rounding of ROUNDINGS)
        cases.push({ id: id("cbrt"), op: "cbrt", args: [x.toString()],
                     prec: { digits: p }, rounding, boundary: tag });
    }
  }
}

// quantize pins the exponent instead of the digit count, so its ties are built on the
// scale axis. The body reuses the digit patterns above at a width that keeps the value
// small enough to read.
const dec = (m, e) => `${m}E${e}`;
for (const n of SCALES) {
  for (const body of bodies(5)) {
    const m = BigInt(body + "5");                  // ends in 5, so it sits on the tie
    for (const [tag, mant, exp] of [
      ["tie", m, -(n + 1)],
      ["below", m * 10n - 1n, -(n + 2)],
      ["above", m * 10n + 1n, -(n + 2)],
    ]) {
      for (const sign of [1n, -1n]) {
        for (const rounding of ROUNDINGS)
          cases.push({ id: id("quantize"), op: "quantize", args: [dec(sign * mant, exp)],
                       prec: { scale: n }, rounding, boundary: tag });
      }
    }
  }
}

writeFileSync(join(HERE, "cases.jsonl"), cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
const byOp = {};
for (const c of cases) byOp[c.op] = (byOp[c.op] ?? 0) + 1;
console.log(`  cases.jsonl  ${cases.length} cases  ${Object.entries(byOp).map(([k, v]) => `${k}(${v})`).join(" ")}`);
console.log(`  precisions ${PRECS.join(", ")} x ${bodies(7).length} bodies x tie/below/above x ${ROUNDINGS.length} modes`);
