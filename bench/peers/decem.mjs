// The subject. Kept in the same shape as every target so the runner has no special case.
import * as d from "../../src/index.ts";
import { A, B, WIDE, DIGITS, LITERAL } from "./cases.mjs";

const P = { digits: DIGITS };
const a = d.dec(A), b = d.dec(B), wide = d.dec(WIDE), one5 = d.dec`1.5`;

export const meta = { name: "decem", pkg: null, notes: "the subject" };

export const ops = {
  parse: () => d.dec(LITERAL),
  // A value caches its own spelling, so a fresh one is built each time. Measuring the
  // cache would be measuring a property read.
  toString: () => d.toString(d.add(a, b)),
  add: () => d.add(a, b),
  mul: () => d.mul(a, b),
  div: () => d.div(a, b, P),
  cmp: () => d.cmp(a, b),
  sqrt: () => d.sqrt(a, P),
  exp: () => d.exp(one5, P),
  ln: () => d.ln(a, P),
  addWide: () => d.add(wide, wide),
  mulWide: () => d.mul(wide, wide),
};
