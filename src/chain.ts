import {
  add, sub, mul, neg, abs, div, round, quantize, cmp,
  type Dec, type Precision, type DigitsPrecision, type ScalePrecision,
} from "./index.ts";

/**
 * Opt-in chaining, kept out of the core so that bundles stay small. Hanging every
 * operation off a prototype means somebody who only rounds to five digits still ships
 * all of it, which is decimal.js issue 162. Importing this is what pulls it in.
 *
 * The exact and approximate split is unchanged: mul takes no precision, div requires one.
 */
export interface Chain {
  add(y: Dec): Chain;
  sub(y: Dec): Chain;
  mul(y: Dec): Chain;
  neg(): Chain;
  abs(): Chain;
  div(y: Dec, p: Precision): Chain;
  round(p: DigitsPrecision): Chain;
  quantize(p: ScalePrecision): Chain;
  cmp(y: Dec): -1 | 0 | 1;
  readonly value: Dec;
}

export function chain(x: Dec): Chain {
  return {
    add: (y) => chain(add(x, y)),
    sub: (y) => chain(sub(x, y)),
    mul: (y) => chain(mul(x, y)),
    neg: () => chain(neg(x)),
    abs: () => chain(abs(x)),
    div: (y, p) => chain(div(x, y, p)),
    round: (p) => chain(round(x, p)),
    quantize: (p) => chain(quantize(x, p)),
    cmp: (y) => cmp(x, y),
    get value() { return x; },
  };
}
