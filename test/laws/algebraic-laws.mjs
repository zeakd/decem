// Gate B: algebraic laws.
//
// Because the operations are exact, laws that fail in float64 hold here, and they can be
// checked by equality rather than by tolerance. This is what exactness looks like from
// the outside.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

import * as d from "../../src/index.ts";

// Reuses the oracle corpus rather than generating its own numbers, so it stays deterministic.
const pool = readFileSync(join(HERE, "../oracle/cases/exact.jsonl"), "utf8")
  .split("\n").filter(Boolean).map(JSON.parse)
  .flatMap((c) => c.args).map(d.dec);

const eq = (x, y) => d.cmp(x, y) === 0;      // by value, since scale is not part of equality
const s  = (x) => d.toString(x);

let pass = 0, fail = 0;
const failures = [];
function law(name, fn) {
  for (let i = 0; i + 2 < pool.length; i += 3) {
    const [a, b, c] = [pool[i], pool[i + 1], pool[i + 2]];
    let ok, detail = "";
    try { [ok, detail] = fn(a, b, c); } catch (e) { ok = false; detail = e.message; }
    if (ok) pass++;
    else {
      fail++;
      if (failures.length < 10)
        failures.push(`  ${name}\n     a=${s(a)}  b=${s(b)}  c=${s(c)}\n     ${detail}`);
    }
  }
}

const ZERO = d.dec`0`, ONE = d.dec`1`;

law("commutative a+b == b+a",        (a, b) => [eq(d.add(a, b), d.add(b, a)), `${s(d.add(a,b))} vs ${s(d.add(b,a))}`]);
law("commutative a*b == b*a",        (a, b) => [eq(d.mul(a, b), d.mul(b, a)), `${s(d.mul(a,b))} vs ${s(d.mul(b,a))}`]);
law("associative (a+b)+c == a+(b+c)", (a, b, c) => {
  const l = d.add(d.add(a, b), c), r = d.add(a, d.add(b, c));
  return [eq(l, r), `${s(l)} vs ${s(r)}`];
});
law("associative (a*b)*c == a*(b*c)", (a, b, c) => {
  const l = d.mul(d.mul(a, b), c), r = d.mul(a, d.mul(b, c));
  return [eq(l, r), `${s(l)} vs ${s(r)}`];
});
law("distributive a*(b+c) == a*b+a*c", (a, b, c) => {
  const l = d.mul(a, d.add(b, c)), r = d.add(d.mul(a, b), d.mul(a, c));
  return [eq(l, r), `${s(l)} vs ${s(r)}`];
});
law("identity a+0 == a",          (a) => [eq(d.add(a, ZERO), a), s(d.add(a, ZERO))]);
law("identity a*1 == a",          (a) => [eq(d.mul(a, ONE), a), s(d.mul(a, ONE))]);
law("inverse a+(-a) == 0",       (a) => [eq(d.add(a, d.neg(a)), ZERO), s(d.add(a, d.neg(a)))]);
law("definition a-b == a+(-b)",     (a, b) => {
  const l = d.sub(a, b), r = d.add(a, d.neg(b));
  return [eq(l, r), `${s(l)} vs ${s(r)}`];
});
law("sum is order independent",        (a, b, c) => {
  const l = d.sum([a, b, c]), r = d.sum([c, a, b]);
  return [eq(l, r), `${s(l)} vs ${s(r)}`];
});

// Equality compares values, not scales.
for (const [x, y] of [["2.0","2.00"],["0","0.000"],["1e2".replace("e2",""),"1"],["-0","0"]]) {
  const ok = d.eq(d.dec(x), d.dec(y));
  ok ? pass++ : (fail++, failures.push(`  eq("${x}", "${y}") returned false`));
}

// Round trip: div(mul(a,b), b, p) should equal a rounded to p digits.
for (let i = 0; i + 1 < Math.min(pool.length, 600); i += 2) {
  const [a, b] = [pool[i], pool[i + 1]];
  if (d.isZero(b)) continue;
  const p = { digits: 60, rounding: "half-even" };
  const back = d.div(d.mul(a, b), b, p);
  const want = d.round(a, p);
  eq(back, want) ? pass++
    : (fail++, failures.length < 10 &&
       failures.push(`  round trip div(mul(a,b),b)\n     a=${s(a)} b=${s(b)}\n     ${s(back)} vs ${s(want)}`));
}

console.log(`Gate B (algebraic laws)  ${pass} passed, ${fail} failed`);
if (failures.length) { console.log(); failures.forEach((f) => console.log(f)); }
process.exit(fail ? 1 : 0);
