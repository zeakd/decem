// One target, one file.
import Big from "big.js";
import { A, B, DIGITS, LITERAL } from "./cases.mjs";

Big.DP = DIGITS;
Big.RM = Big.roundHalfEven;

const a = new Big(A), b = new Big(B);

export const meta = {
  name: "big.js",
  pkg: "big.js",
  notes: "no transcendentals, and rounds only division and square root",
};

// An absent operation is null rather than an approximation of it. Substituting something
// nearby would put a number in a column that does not mean what the column says.
export const ops = {
  parse: () => new Big(LITERAL),
  toString: () => a.plus(b).toString(),
  add: () => a.plus(b),
  mul: () => a.times(b),
  div: () => a.div(b),
  cmp: () => a.cmp(b),
  sqrt: () => a.sqrt(),
  exp: null,
  ln: null,
  addWide: null,
  mulWide: null,
};
