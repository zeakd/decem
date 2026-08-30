// Case generation, deterministic under a fixed seed.
//
// Math.random is avoided because cases that change on every regeneration make the diff in
// expected/ meaningless: nothing would distinguish a changed oracle from a changed corpus.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = 0x5EED_1234;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

/** One decimal literal: a number of significant digits, plus an exponent. */
function decimal({ maxDigits = 25, maxExp = 30, sign = "any" } = {}) {
  const n = int(1, maxDigits);
  let d = String(int(1, 9));
  for (let i = 1; i < n; i++) d += String(int(0, 9));
  const exp = int(-maxExp, maxExp);
  const neg = sign === "pos" ? false : sign === "neg" ? true : rnd() < 0.5;
  // Written out with the point moved rather than in exponential form, so no parsing
  // difference between us and the oracle enters the corpus.
  return (neg ? "-" : "") + shift(d, exp);
}
function shift(digits, exp) {
  if (exp >= 0) return digits + "0".repeat(exp);
  if (digits.length > -exp) return digits.slice(0, exp) + "." + digits.slice(exp);
  return "0." + "0".repeat(-exp - digits.length) + digits;
}

const PRECISIONS = [{ digits: 1 }, { digits: 7 }, { digits: 20 }, { digits: 34 }, { digits: 100 }];
const ROUNDINGS  = ["half-even", "half-up", "half-down", "up", "down", "ceil", "floor"];

const cases = { exact: [], approx: [] };
let id = 0;
const nextId = (op) => `${op}-${String(++id).padStart(5, "0")}`;

// Exact operations. These take no precision, and the oracle must not report Inexact.
for (const op of ["add", "sub", "mul"]) {
  for (let i = 0; i < 300; i++) {
    cases.exact.push({ id: nextId(op), op, args: [decimal(), decimal()] });
  }
  // Pairs with a wide exponent gap, exercising the alignment path.
  for (let i = 0; i < 50; i++) {
    cases.exact.push({ id: nextId(op), op,
      args: [decimal({ maxExp: 200 }), decimal({ maxExp: 200 })] });
  }
}
// Hand-picked: zero, signs, and digit growth.
for (const [a, b] of [["0","0"],["0","-0"],["1","-1"],["0.1","0.2"],["1.5","2.5"],
                      ["9".repeat(30), "1"], ["1e-30".replace("e-30",""), "0"]]) {
  for (const op of ["add", "sub", "mul"]) cases.exact.push({ id: nextId(op), op, args: [a, b] });
}

// Approximate operations, which require a precision.
for (let i = 0; i < 400; i++) {
  const p = PRECISIONS[int(0, PRECISIONS.length - 1)];
  const rounding = ROUNDINGS[int(0, ROUNDINGS.length - 1)];
  cases.approx.push({ id: nextId("div"), op: "div",
    args: [decimal(), decimal().replace(/^-?0(\.0+)?$/, "7")], prec: p, rounding });
}
for (let i = 0; i < 200; i++) {
  const p = PRECISIONS[int(0, PRECISIONS.length - 1)];
  const rounding = ROUNDINGS[int(0, ROUNDINGS.length - 1)];
  cases.approx.push({ id: nextId("sqrt"), op: "sqrt",
    args: [decimal({ sign: "pos" })], prec: p, rounding });
}
for (let i = 0; i < 150; i++) {
  const p = PRECISIONS[int(0, PRECISIONS.length - 1)];
  const rounding = ROUNDINGS[int(0, ROUNDINGS.length - 1)];
  cases.approx.push({ id: nextId("cbrt"), op: "cbrt",
    args: [decimal({ sign: "pos" })], prec: p, rounding });
}
// Trigonometry, where the oracle is MPFR. Arguments span small, large, and near pi.
for (const op of ["sin", "cos", "tan"]) {
  for (let i = 0; i < 120; i++) {
    const p = PRECISIONS[int(0, PRECISIONS.length - 1)];
    const rounding = ROUNDINGS[int(0, ROUNDINGS.length - 1)];
    cases.approx.push({ id: nextId(op), op,
      args: [decimal({ maxDigits: 18, maxExp: 4 })], prec: p, rounding });
  }
}
// Python decimal fixes exp, ln and log10 to half-even, so no other mode is generated here.
for (let i = 0; i < 150; i++) {
  const p = PRECISIONS[int(0, PRECISIONS.length - 1)];
  cases.approx.push({ id: nextId("exp"), op: "exp",
    args: [decimal({ maxDigits: 12, maxExp: 2 })], prec: p, rounding: "half-even" });
}
for (const op of ["ln", "log10"]) {
  for (let i = 0; i < 150; i++) {
    const p = PRECISIONS[int(0, PRECISIONS.length - 1)];
    cases.approx.push({ id: nextId(op), op,
      args: [decimal({ sign: "pos" })], prec: p, rounding: "half-even" });
  }
}

mkdirSync(join(HERE, "cases"), { recursive: true });
for (const [name, list] of Object.entries(cases)) {
  const path = join(HERE, "cases", `${name}.jsonl`);
  writeFileSync(path, list.map((c) => JSON.stringify(c)).join("\n") + "\n");
  console.log(`  cases/${name}.jsonl  ${list.length} cases`);
}
console.log(`seed 0x${SEED.toString(16)}; the same seed gives the same cases`);
