/**
 * The way out. This is deliberately not symmetric with `dec`, which refuses a number:
 * losing precision on the way out is something the caller asked for, and the function
 * names say which loss they cause.
 */
import {
  digits, pow10, toString, overCeiling, maxDigits,
  NotAnInteger, PrecisionRequired, DigitOverflow, type Dec,
} from "./decimal.ts";

// Re-exported so the entry point keeps one place for the ways a value is written out,
// even though the shortest one now lives with the value itself.
export { toString };

/**
 * Exactly n digits after the point. Raises when that would require rounding, so the
 * caller chooses a rounding mode instead of receiving one silently.
 */
export function toFixed(x: Dec, n: number): string {
  if (!Number.isInteger(n) || n < 0)
    throw new PrecisionRequired(`toFixed: n must be a non-negative integer, got ${n}`, { op: "toFixed", actual: n });
  if (-x.exp > n)
    throw new PrecisionRequired(
      `toFixed(${n}): the value has ${-x.exp} digits and would be cut. ` +
      `Decide the rounding first with quantize(x, { scale: ${n} }).`,
      { op: "toFixed", actual: -x.exp, limit: n });
  // The written form can outgrow what the runtime can hold, and the two ways it does are
  // both reachable from a legal value: `1e9000000000000000` needs that many digits before
  // the point, and asking for nine thousand million million places needs them after it.
  // Left alone, one is a RangeError from BigInt and the other from the string, neither of
  // which carries a code or descends from DecemError, and the ceiling this library
  // declares would be discovered rather than declared on the way out.
  const wide = Math.max(n + x.exp, 0) + digits(x.mant);
  if (overCeiling(wide) || overCeiling(n))
    throw new DigitOverflow(
      `toFixed: writing this value at ${n} places needs ${Math.max(wide, n)} digits, ` +
      `but this runtime allows ${maxDigits()}`,
      { op: "toFixed", limit: maxDigits(), actual: Math.max(wide, n) });
  const scaled = x.mant * pow10(n + x.exp);
  const neg = scaled < 0n || x.negZero;
  const abs = (scaled < 0n ? -scaled : scaled).toString().padStart(n + 1, "0");
  const body = n === 0 ? abs : `${abs.slice(0, -n)}.${abs.slice(-n)}`;
  return neg ? `-${body}` : body;
}

/** Exponential form, with n digits after the point. */
export function toExponential(x: Dec, n: number): string {
  if (!Number.isInteger(n) || n < 0)
    throw new PrecisionRequired("toExponential: n must be a non-negative integer", { op: "toExponential", actual: n });
  const neg = x.mant < 0n || x.negZero;
  const m = x.mant < 0n ? -x.mant : x.mant;
  const d = digits(m);
  if (d > n + 1)
    throw new PrecisionRequired(
      `toExponential(${n}): the value has ${d} significant digits and would be cut. ` +
      `Round it first with round(x, { digits: ${n + 1} }).`,
      { op: "toExponential", actual: d, limit: n + 1 });
  const coef = m.toString().padEnd(n + 1, "0");
  const adjusted = x.exp + d - 1;
  const body = (n === 0 ? coef : `${coef[0]}.${coef.slice(1)}`) +
    "E" + (adjusted >= 0 ? "+" : "-") + Math.abs(adjusted);
  return neg ? `-${body}` : body;
}

/** To float64, which loses precision. The name does not say so, so this comment does. */
export function toNumber(x: Dec): number {
  return Number(toString(x));
}

/**
 * Integers only. Anything else raises, because quietly truncating is the opposite of
 * what this library exists to do.
 */
export function toBigInt(x: Dec): bigint {
  if (x.exp >= 0) return x.mant * pow10(x.exp);
  const p = pow10(-x.exp);
  if (x.mant % p !== 0n)
    throw new NotAnInteger(`toBigInt: ${toString(x)} is not an integer; round or truncate it first`,
      { op: "toBigInt", operands: [toString(x)] });
  return x.mant / p;
}

/**
 * The value written out in full, with no exponent, ever.
 *
 * `toString` is the specification's `to-scientific-string`, so `1e3` prints as `1E+3`.
 * That form is correct and is the wrong thing to put in a response body, a `NUMERIC` bind
 * parameter, a CSV or a receipt, where the reader is a client that will treat it as text
 * or a person who will read it as a number.
 *
 * This is not a specification conversion. The specification defines `to-scientific-string`
 * and `to-engineering-string` and stops there, and Python's `decimal` exposes exactly those
 * two. `toPlainString` is Java's `BigDecimal`, added on top for the same reason it is added
 * here: the plain form is what a boundary wants and the scientific form is what the value
 * is. It is spelled the way the library that invented it spells it.
 *
 * Nothing is lost and nothing is rounded. The scale is untouched, so `2.5 * 4` stays
 * `10.0`, and it is the same value `toString` would print, in the other form.
 */
export function toPlainString(x: Dec): string {
  return toFixed(x, Math.max(-x.exp, 0));
}
