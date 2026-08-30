// One target, one file, so a call written wrongly is visible in one place rather than
// interleaved with the others.
import Decimal from "decimal.js";
import { A, B, WIDE, DIGITS, LITERAL } from "./cases.mjs";

// 6 is ROUND_HALF_EVEN. The library takes its precision from a global rather than from
// the call, which is the difference this comparison exists to show, so it is set to match.
Decimal.set({ precision: DIGITS, rounding: Decimal.ROUND_HALF_EVEN });

const a = new Decimal(A), b = new Decimal(B), wide = new Decimal(WIDE);
const one5 = new Decimal("1.5");

export const meta = {
  name: "decimal.js",
  pkg: "decimal.js",
  notes: "rounds every operation to a global precision, including multiplication",
};

export const ops = {
  parse: () => new Decimal(LITERAL),
  toString: () => a.plus(b).toString(),
  add: () => a.plus(b),
  mul: () => a.times(b),
  div: () => a.div(b),
  cmp: () => a.cmp(b),
  sqrt: () => a.sqrt(),
  exp: () => one5.exp(),
  ln: () => a.ln(),
  addWide: () => wide.plus(wide),
  mulWide: () => wide.times(wide),
};
