import { memo } from "./memo.ts";

// A value is mant x 10^exp, where a zero mantissa may additionally carry a sign.
//
// The BigInt carries the sign, which is what lets add and mul be plain arithmetic.
// Zero is the exception, since 0n has no sign of its own, so negZero exists for
// that case only. make() is the one place that enforces it.

/**
 * A value carries a brand that only `make` can produce, so an object with the right
 * fields is not a value. Hand-assembled shapes used to pass, and one with a fractional
 * exponent failed deep inside the arithmetic rather than at the door. The brand costs
 * nothing at run time.
 */
declare const brand: unique symbol;

export interface Dec {
  readonly [brand]: true;
  readonly mant: bigint;
  readonly exp: number;
  readonly negZero: boolean;
  /** @internal Cached string form. Safe because values are immutable. */
  _s?: string;
  /** The specification's spelling, so that a value survives a template or a log. */
  toString(): string;
  toJSON(): string;
}

/** What `dec` accepts. The absence of `number` is the contract: 0.1 has already lost precision. */
export type Literal = string | bigint | Dec;

export type Rounding =
  | "half-even" | "half-up" | "half-down"
  | "up" | "down" | "ceil" | "floor";

/** Significant digits, which is how science states precision. */
export interface DigitsPrecision { digits: number; scale?: never; rounding?: Rounding }
/** Decimal places, which is how money states it. */
export interface ScalePrecision { scale: number; digits?: never; rounding?: Rounding }

/**
 * What an approximate operation requires. The two forms are mutually exclusive and
 * supplying both is a type error. Collapsing them into one shape would leave one of
 * the two audiences permanently awkward.
 *
 * Operations that accept either form, such as `div`, take this union. Operations that
 * are genuinely different from each other, such as `round` and `quantize`, take the
 * separated types.
 */
export type Precision = DigitsPrecision | ScalePrecision;

/**
 * A rounded result together with what happened to it. Same idea as MPFR's ternary
 * value and Python's Inexact signal: a guarantee that is never reported still leaves
 * the caller unsure.
 *
 * `direction` is 0 when the result is exact, +1 when it was rounded up, -1 when down.
 */
export interface Rounded { value: Dec; exact: boolean; direction: -1 | 0 | 1 }

/**
 * Error codes. The message is for a person and the code is for a program. Branching on
 * message text freezes the wording, and rewording then breaks somebody's code.
 */
export type DecemCode =
  | "INVALID_LITERAL" | "DIVISION_BY_ZERO" | "DIGIT_OVERFLOW" | "EXPONENT_OVERFLOW"
  | "PRECISION_REQUIRED" | "NOT_AN_INTEGER" | "DOMAIN" | "INDETERMINATE_ROUNDING";

/** Facts attached to an error, so a log or a report can reconstruct what happened. */
export interface DecemDetails {
  op?: string;
  operands?: readonly string[];
  limit?: number;
  actual?: number;
  precision?: number;
}

export class DecemError extends Error {
  readonly code: DecemCode;
  readonly details: DecemDetails;
  constructor(code: DecemCode, message: string, details: DecemDetails = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

const sub = (code: DecemCode) =>
  class extends DecemError {
    constructor(message: string, details: DecemDetails = {}) { super(code, message, details); }
  };

export class InvalidLiteral    extends sub("INVALID_LITERAL") {}
export class DivisionByZero    extends sub("DIVISION_BY_ZERO") {}
export class DigitOverflow     extends sub("DIGIT_OVERFLOW") {}
export class ExponentOverflow  extends sub("EXPONENT_OVERFLOW") {}
export class PrecisionRequired extends sub("PRECISION_REQUIRED") {}
export class NotAnInteger      extends sub("NOT_AN_INTEGER") {}
/** Outside the domain: ln(0), sqrt of a negative, 0^0, and so on. */
export class DomainError       extends sub("DOMAIN") {}

/**
 * Powers of ten. Digit counting binary searches these, and every rounding path counts
 * digits, so a hit has to be cheap.
 *
 * The table used to be filled from its current length up to whatever index was asked for.
 * That stores k values averaging k/2 digits, which is quadratic: counting the digits of a
 * sixty thousand digit number left 856MB resident, and `1e999999`, eight bytes of input,
 * reached the point where the process died of an allocation failure. No caller can catch
 * that, and sixty thousand digits is five thousand times below the ceiling this library
 * says it raises at, so the limit was neither declared nor discovered. It was fatal.
 *
 * A single power costs nothing like that, since it holds one value instead of k of them:
 * `10n ** 999999n` is 15ms and 5MB. So the dense table stays for the range every ordinary
 * call lives in, and anything above it is computed once and kept by index alone.
 */
const P10_DENSE = 1024;
const P10: bigint[] = [1n];
/**
 * Above the dense range, keyed rather than filled. The series ask for the same working
 * width on every term, so the entry has to survive; the count is capped because a
 * long-lived process should not accumulate one large power per width it ever used.
 */
const P10_SPARSE_LIMIT = 64;
const pow10Large = memo(P10_SPARSE_LIMIT, (k: number): bigint => 10n ** BigInt(k));

/**
 * A hit is an array index and nothing else, which is what keeps `add` fast: everything
 * that can miss lives in `pow10Grow`, so this stays small enough for the engine to inline
 * into its callers. Holding the fill loop here cost 12% on add and 27% on the toString
 * path that runs one, which gate F caught.
 */
export function pow10(k: number): bigint {
  const hit = P10[k];
  return hit === undefined ? pow10Grow(k) : hit;
}

function pow10Grow(k: number): bigint {
  if (k < 0) throw new RangeError(`pow10(${k})`);
  if (k <= P10_DENSE) {
    while (P10.length <= k) P10.push(P10[P10.length - 1]! * 10n);
    return P10[k]!;
  }
  return pow10Large(k);
}

/**
 * Decimal length. Never `toString().length`, which costs 300 to 900 times more at
 * 1,600 digits and is needed on every rounding path.
 */
export function digits(n: bigint): number {
  if (n < 0n) n = -n;
  if (n === 0n) return 1;
  let lo = 1, hi = 1;
  while (n >= pow10(hi)) { lo = hi; hi *= 2; }
  while (lo < hi) { const m = (lo + hi) >> 1; n < pow10(m) ? (hi = m) : (lo = m + 1); }
  return lo;
}

/**
 * The digit ceiling, derived from the runtime's BigInt limit.
 *
 * Probing drifts with memory pressure. The same V8 reported 323,228,496 digits under
 * Node and 323,228,477 in a browser tab, and a limit that moves between runs is not a
 * contract. The probed value is therefore cut by 0.1% and floored to a thousand. This
 * is the point where decem raises, so a conservative number is always safe.
 */
let MAX_DIGITS: number | null = null;
export function maxDigits(): number {
  if (MAX_DIGITS !== null) return MAX_DIGITS;
  const ok = (bits: number): boolean => {
    try { return typeof (1n << BigInt(bits)) === "bigint"; } catch { return false; }
  };
  let lo = 1, hi = 1 << 30;
  while (lo + 1 < hi) { const m = (lo + hi) >> 1; ok(m) ? (lo = m) : (hi = m); }
  const probed = Math.floor((lo * Math.LN2) / Math.LN10);
  return (MAX_DIGITS = Math.floor((probed * 0.999) / 1000) * 1000);
}

/**
 * The magnitude ceiling, which is a separate axis from digits. A one-digit mantissa
 * can still overflow the exponent. Past 9e15 the exponent arithmetic loses integer
 * precision and values go quietly wrong.
 *
 * The check itself stays valid at the boundary: 9e15 + 9e15 is 1.8e16, an even integer
 * below 2^54, so the sum is still represented exactly.
 */
export const EXP_LIMIT = 9e15;

/**
 * The specification's `to-scientific-string`. If the General Decimal Arithmetic
 * specification is the semantic authority here, the printed form comes from it too,
 * which is why there is no equivalent of decimal.js's toExpNeg and toExpPos settings.
 *
 * The result is cached on the value. Values are immutable, so that is safe, and
 * decimal output is the one place a BigInt mantissa is slower than a digit array.
 */
export function toString(x: Dec): string {
  if (x._s !== undefined) return x._s;
  const neg = x.mant < 0n || x.negZero;
  const coef = (x.mant < 0n ? -x.mant : x.mant).toString();
  const n = coef.length;
  const adjusted = x.exp + n - 1;
  let s: string;
  if (x.exp <= 0 && adjusted >= -6) {
    if (x.exp === 0) s = coef;
    else if (n > -x.exp) s = coef.slice(0, x.exp) + "." + coef.slice(x.exp);
    else s = "0." + "0".repeat(-x.exp - n) + coef;
  } else {
    s = coef[0]! + (n > 1 ? "." + coef.slice(1) : "");
    s += "E" + (adjusted >= 0 ? "+" : "-") + Math.abs(adjusted);
  }
  return (x._s = neg ? "-" + s : s);
}

/**
 * A value that survives leaving the library.
 *
 * Interpolating a plain object gives "[object Object]", and that reaches a log, a user
 * interface or a column without any complaint. Silence is the failure this library
 * exists to remove, so it is not tolerated on the way out either.
 *
 * The string hint answers; every other hint raises. `x + 1` is not addition here and
 * quietly producing "[object Object]1" would be worse than stopping.
 */
class DecValue {
  _s?: string;
  mant: bigint;
  exp: number;
  negZero: boolean;
  constructor(mant: bigint, exp: number, negZero: boolean) {
    this.mant = mant;
    this.exp = exp;
    this.negZero = negZero;
  }
  toString(): string { return toString(this as unknown as Dec); }
  toJSON(): string { return toString(this as unknown as Dec); }
  [Symbol.toPrimitive](hint: string): string {
    // Three hints, three answers.
    //
    // A string hint knows what it wants, so it gets the value: templates, String, join
    // and sort all read correctly. A number hint knows too, and there is no number to
    // give, so it raises and names the function to use.
    //
    // The default hint is the hard one. It is what `+` and `==` send, and `+` cannot say
    // whether the other side is text or a number, because the answer here is what decides
    // that: `price + 1` and `"log " + price` arrive identically. Raising stopped the
    // mistake and also stopped the log line, inside code the caller does not own, and a
    // diagnostic should not be able to end a request. Answering with the value keeps the
    // log and turns `price + 1` into "19.991", which is the failure this library exists
    // to remove: a wrong number that looks like a right one.
    //
    // So it answers with the value inside a marker. The log still carries the number, and
    // `price + 1` becomes "[decimal 19.99]1", which nothing mistakes for arithmetic. The
    // cost is that the older concatenation idiom prints the marker; a template, String,
    // toString and JSON all give the bare value.
    if (hint === "string") return toString(this as unknown as Dec);
    if (hint !== "number") return `[decimal ${toString(this as unknown as Dec)}]`;
    // A TypeError rather than a DecemError, because the question is a type question
    // rather than a value one.
    //
    // This is stricter than BigInt, which was checked rather than assumed. BigInt raises
    // for `1n + 1` and for `+1n`, but those come from the `+` operator's own rules, and
    // its toPrimitive answers the default hint, so `1n + ""` gives "1". Only the hint is
    // visible here, so the two cases cannot be told apart. Answering the default hint
    // would make `price + 1` produce "19.991", which is worse than stopping: it looks
    // like a number. The cost is that `"" + price` raises inside code the caller may not
    // own, and every idiom that goes through String, a template, inspect, join, sort or
    // JSON still works.
    //
    // The message names the operation to reach for, and it differs by hint because the
    // advice does. `a < b` arrives here as a number hint, and telling someone to convert
    // with toNumber would hand them the precision loss this library exists to prevent.
    // What they want is lt.
    throw new TypeError(
      "a decimal is not a number: compare with lt, lte, gt, gte or cmp, calculate with " +
      "add, sub, mul or div, and convert only with toNumber or toBigInt");
  }
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return toString(this as unknown as Dec);
  }
}

export function make(mant: bigint, exp: number, negZero = false): Dec {
  if (!(Math.abs(exp) <= EXP_LIMIT))
    throw new ExponentOverflow(`exponent ${exp} exceeds the limit of +/-${EXP_LIMIT}`,
      { limit: EXP_LIMIT, actual: exp });
  return new DecValue(mant, exp, mant === 0n ? negZero : false) as unknown as Dec;
}

/** Whether a value came from here, which is what the brand promises at compile time. */
export const isDec = (v: unknown): v is Dec => v instanceof DecValue;

export const isNeg   = (x: Dec): boolean => x.mant < 0n || x.negZero;
export const isZero  = (x: Dec): boolean => x.mant === 0n;
export const scaleOf = (x: Dec): number => -x.exp;

/** Raises instead of truncating when a result would outgrow the digit ceiling. */
/**
 * Asking the runtime for its ceiling costs about 185 milliseconds, because the probe
 * allocates BigInts up to the limit to find it. It is asked once and cached, but the
 * first operation in a process paid for it, so a multiplication that takes 35 nanoseconds
 * warm took 185 milliseconds cold. The benchmarks never saw it, because they warm up.
 *
 * A small mantissa cannot be near any ceiling, so the question is only asked when the
 * answer could change the outcome. `maxDigits` returns a multiple of a thousand and the
 * lowest measured on any runtime is three hundred and fifteen thousand, so a thousand
 * digits is a floor no real ceiling sits under. Most programs never reach it and never
 * pay for the probe at all.
 */
const NEVER_NEAR_THE_CEILING = 1000;

/** Whether a digit count is over the runtime's ceiling, asking only when it could be. */
export const overCeiling = (n: number): boolean =>
  n > NEVER_NEAR_THE_CEILING && n > maxDigits();

export function guard(mant: bigint, where: string): bigint {
  if (mant === 0n) return mant;
  const n = digits(mant);
  if (overCeiling(n))
    throw new DigitOverflow(`${where}: ${n} digits, but this runtime allows ${maxDigits()}`,
      { op: where, limit: maxDigits(), actual: n });
  return mant;
}
