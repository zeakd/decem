// Packaging checks only.
//
// Whether the values are right is settled by the other gates: the oracle comparison,
// the boundary corpus, the algebraic laws, the runtime matrix. Repeating any of that
// here would create a second place that can disagree with the first.
//
// A packaging failure breaks the release. A value failure breaks the product. They are
// different problems, so they are checked in different places.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../src/index.ts";
import { chain } from "../src/chain.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** What the README promises. Anything missing here makes the documentation false. */
const PROMISED = [
  "dec", "tryDec", "fromNumber", "fromInt",
  "toString", "toFixed", "toExponential", "toNumber", "toBigInt",
  "add", "sub", "mul", "sum", "neg", "abs", "pow",
  "cmp", "eq", "lt", "lte", "gt", "gte", "isZero", "isNeg", "isDec", "scaleOf",
  "round", "quantize", "div", "sqrt", "cbrt",
  "exp", "ln", "log10", "sin", "cos", "tan",
  "roundStatus", "quantizeStatus", "divStatus", "sqrtStatus",
  "maxDigits", "EXP_LIMIT",
  "DecemError", "InvalidLiteral", "DivisionByZero", "DigitOverflow",
  "ExponentOverflow", "PrecisionRequired", "NotAnInteger", "DomainError",
  "IndeterminateRounding",
];

test("the exported surface matches what the README promises", () => {
  for (const name of PROMISED)
    assert.ok(name in core, `missing: ${name}`);
  // Internals must not leak, because unexporting later is a breaking change.
  for (const leaked of ["make", "pow10", "roundAny", "powInt", "powT"])
    assert.ok(!(leaked in core), `internal name exported: ${leaked}`);
});

test("every name the README mentions exists", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const mentioned = [...readme.matchAll(/`([a-zA-Z][a-zA-Z0-9]*)\(/g)].map((m) => m[1]);
  const known = new Set([...PROMISED, "chain", "context", "quantize"]);
  for (const name of new Set(mentioned))
    assert.ok(known.has(name), `the README mentions a name that does not exist: ${name}`);
});

test("the chain entry point binds to the core", () => {
  const v = chain(core.dec`1.5`).mul(core.dec`2`).value;
  assert.equal(core.toString(v), "3.0");
});

test("a one-line calculation actually runs", () => {
  assert.equal(core.toString(core.mul(core.dec`1.5`, core.dec`2.5`)), "3.75");
  assert.equal(core.toString(core.div(core.dec`1`, core.dec`3`, { digits: 20 })),
               "0.33333333333333333333");
  assert.throws(() => core.div(core.dec`1`, core.dec`0`, { digits: 20 }), core.DivisionByZero);
});
