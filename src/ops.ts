import { isqrt, icbrt } from "./roots.ts";
import {
  make, pow10, digits, isNeg, guard, maxDigits, overCeiling,
  DivisionByZero, PrecisionRequired, DigitOverflow, DomainError, DenaryError,
  type Dec, type Precision, type DigitsPrecision, type ScalePrecision,
  type Rounding, type Rounded,
} from "./decimal.ts";

const MODES: ReadonlySet<string> = new Set([
  "half-even", "half-up", "half-down", "up", "down", "ceil", "floor",
]);

/** Decides whether to round up from the remainder and divisor. ceil and floor depend on the sign. */
function decideUp(r: bigint, den: bigint, q: bigint, mode: Rounding, neg: boolean): boolean {
  if (r === 0n) return false;
  const twice = r * 2n;
  switch (mode) {
    case "up":        return true;
    case "down":      return false;
    case "ceil":      return !neg;
    case "floor":     return neg;
    case "half-up":   return twice >= den;
    case "half-down": return twice > den;
    case "half-even": return twice > den || (twice === den && (q & 1n) === 1n);
  }
}

/** Drops the last `drop` digits of an unsigned magnitude and rounds. */
function roundMagnitude(m: bigint, drop: number, mode: Rounding, neg: boolean): bigint {
  const p = pow10(drop);
  const q = m / p;
  return decideUp(m % p, p, q, mode, neg) ? q + 1n : q;
}

type Resolved =
  | { kind: "digits"; n: number; mode: Rounding }
  | { kind: "scale";  n: number; mode: Rounding };

function resolve(p: Precision | undefined, where: string): Resolved {
  if (p === null || typeof p !== "object")
    throw new PrecisionRequired(`${where} needs either { digits } or { scale }`);
  const mode = (p.rounding ?? "half-even") as Rounding;
  if (!MODES.has(mode)) throw new PrecisionRequired(`unknown rounding mode: ${String(mode)}`, { op: where });
  const hasD = typeof p.digits === "number", hasS = typeof p.scale === "number";
  if (hasD === hasS)
    throw new PrecisionRequired(
      `${where} takes exactly one of digits or scale, got ${JSON.stringify(p)}`);
  if (hasD) {
    if (!Number.isInteger(p.digits) || p.digits! < 1)
      throw new PrecisionRequired(`${where}: digits must be an integer of at least 1`);
    return { kind: "digits", n: p.digits!, mode };
  }
  if (!Number.isInteger(p.scale))
    throw new PrecisionRequired(`${where}: scale must be an integer`);
  return { kind: "scale", n: p.scale!, mode };
}

// Exact operations. None of them takes a precision, because none of them rounds.
export const neg = (x: Dec): Dec => make(-x.mant, x.exp, x.mant === 0n && !x.negZero);
export const abs = (x: Dec): Dec => make(x.mant < 0n ? -x.mant : x.mant, x.exp, false);

export function add(a: Dec, b: Dec): Dec {
  const e = Math.min(a.exp, b.exp);
  const spread = Math.abs(a.exp - b.exp);
  const need = spread + Math.max(digits(a.mant), digits(b.mant));
  if (overCeiling(need))
    throw new DigitOverflow(`add: an exponent gap of ${spread} exceeds the ${maxDigits()} digit limit`,
      { op: "add", limit: maxDigits(), actual: need });
  const mant = guard(a.mant * pow10(a.exp - e) + b.mant * pow10(b.exp - e), "add");
  // A zero sum keeps a sign only when both operands had it (per the specification).
  return make(mant, e, mant === 0n && isNeg(a) && isNeg(b));
}
export const sub = (a: Dec, b: Dec): Dec => add(a, neg(b));

export function mul(a: Dec, b: Dec): Dec {
  const mant = guard(a.mant * b.mant, "mul");
  return make(mant, a.exp + b.exp, mant === 0n && isNeg(a) !== isNeg(b));
}

export function sum(xs: Iterable<Dec>): Dec {
  let acc: Dec | null = null;
  for (const x of xs) acc = acc === null ? x : add(acc, x);
  return acc ?? make(0n, 0);
}

// Comparison looks at values only, so scale never leaks into equality.
export function cmp(a: Dec, b: Dec): -1 | 0 | 1 {
  if (a.mant === 0n && b.mant === 0n) return 0;            // -0 == 0
  const sa: -1 | 1 = a.mant < 0n ? -1 : 1;
  const sb: -1 | 1 = b.mant < 0n ? -1 : 1;
  if (a.mant === 0n) return sb === 1 ? -1 : 1;
  if (b.mant === 0n) return sa;
  if (sa !== sb) return sa < sb ? -1 : 1;
  // Separate by magnitude first, so an exponent gap of 9e15 never reaches pow10.
  const adjA = a.exp + digits(a.mant) - 1;
  const adjB = b.exp + digits(b.mant) - 1;
  if (adjA !== adjB) return ((adjA < adjB ? -1 : 1) * sa) as -1 | 1;
  const e = Math.min(a.exp, b.exp);
  const x = a.mant * pow10(a.exp - e);
  const y = b.mant * pow10(b.exp - e);
  return x < y ? -1 : x > y ? 1 : 0;
}
export const eq  = (a: Dec, b: Dec): boolean => cmp(a, b) === 0;
export const lt  = (a: Dec, b: Dec): boolean => cmp(a, b) <  0;
export const lte = (a: Dec, b: Dec): boolean => cmp(a, b) <= 0;
export const gt  = (a: Dec, b: Dec): boolean => cmp(a, b) >  0;
export const gte = (a: Dec, b: Dec): boolean => cmp(a, b) >= 0;

// Approximate operations. Every one of them requires a precision.
function toDigits(x: Dec, prec: number, mode: Rounding): Dec {
  const neg = isNeg(x);
  let m = x.mant < 0n ? -x.mant : x.mant;
  let exp = x.exp;
  const d = digits(m);
  if (d > prec) {
    const drop = d - prec;
    m = roundMagnitude(m, drop, mode, neg);
    exp += drop;
    if (digits(m) > prec) { m /= 10n; exp += 1; }          // 999 rounding up to 1000
  }
  return make(neg ? -m : m, exp, m === 0n && neg);
}

/** Moves to a target exponent. Lengthening is exact; only shortening rounds. */
function toExp(x: Dec, targetExp: number, mode: Rounding): Dec {
  if (x.exp === targetExp) return x;
  if (x.exp > targetExp)
    return make(guard(x.mant * pow10(x.exp - targetExp), "round"), targetExp, x.negZero);
  const neg = isNeg(x);
  const m = x.mant < 0n ? -x.mant : x.mant;
  const q = roundMagnitude(m, targetExp - x.exp, mode, neg);
  return make(neg ? -q : q, targetExp, q === 0n && neg);
}

/**
 * Rounds to a count of significant digits, preserving magnitude: 1234.5 at three
 * digits is 1230.
 *
 * Kept separate from `quantize` because the two set different things, one the digit
 * count and the other the exponent. Using one name for both would be hiding a
 * difference rather than removing a duplicate. Java and Python separate them too.
 */
export function round(x: Dec, p: DigitsPrecision): Dec {
  const r = resolve(p, "round");
  if (r.kind !== "digits")
    throw new PrecisionRequired("round takes { digits }; use quantize for decimal places");
  return toDigits(x, r.n, r.mode);
}

/** Pins the exponent to a number of decimal places: 1234.5 at scale 2 is 1234.50. */
export function quantize(x: Dec, p: ScalePrecision): Dec {
  const r = resolve(p, "quantize");
  if (r.kind !== "scale")
    throw new PrecisionRequired("quantize takes { scale }; use round for significant digits");
  return toExp(x, -r.n, r.mode);
}

/** Internal, for the operations that accept either precision form. */
function roundAny(x: Dec, p: Precision): Dec {
  const r = resolve(p, "round");
  return r.kind === "digits" ? toDigits(x, r.n, r.mode) : toExp(x, -r.n, r.mode);
}

export function div(a: Dec, b: Dec, p: Precision): Dec {
  const r = resolve(p, "div");
  if (b.mant === 0n) throw new DivisionByZero("division by zero", { op: "div" });
  const ideal = a.exp - b.exp;
  const neg = isNeg(a) !== isNeg(b);
  if (a.mant === 0n) return make(0n, r.kind === "scale" ? -r.n : ideal, neg);

  const am = a.mant < 0n ? -a.mant : a.mant;
  const bm = b.mant < 0n ? -b.mant : b.mant;

  if (r.kind === "scale") {
    // Pin the result exponent to -n and divide into it, so no digit counting is needed.
    const k = ideal + r.n;
    const num = k >= 0 ? am * pow10(k) : am;
    const den = k >= 0 ? bm : bm * pow10(-k);
    const q = num / den;
    const up = decideUp(num % den, den, q, r.mode, neg);
    const m = guard(up ? q + 1n : q, "div");
    return make(neg ? -m : m, -r.n, m === 0n && neg);
  }

  const shift = Math.max(r.n + 2 - (digits(am) - digits(bm)), 0);
  const scaled = am * pow10(shift);
  let q = scaled / bm;
  const rem = scaled % bm;
  let exp = ideal - shift;

  if (rem === 0n) {
    // The division came out exact, so trailing zeros are stripped back toward the
    // ideal exponent.
    while (exp < ideal && q !== 0n && q % 10n === 0n) { q /= 10n; exp += 1; }
    if (digits(q) <= r.n) return make(neg ? -q : q, exp, q === 0n && neg);
  } else if (q % 10n === 0n) {
    q += 1n;   // sticky: record in the last guard digit that something was cut
  }
  return toDigits(make(neg ? -q : q, exp, neg), r.n, r.mode);
}

export { roundAny };

/**
 * Square root, correctly rounded.
 *
 * The justification is arithmetic rather than heuristic. The integer square root
 * returns a remainder, and a zero remainder means the root is exact while a non-zero
 * one puts the true root strictly between s and s+1. With guard digits in place and a
 * sticky bit recording that more follows, even an exact tie lands on the right side.
 */
export function sqrt(x: Dec, p: Precision): Dec {
  const r = resolve(p, "sqrt");
  if (isNeg(x) && x.mant !== 0n)
    throw new DomainError("sqrt of a negative number has no real result", { op: "sqrt" });
  const prec = r.kind === "digits" ? r.n : Math.max(r.n + 1, 1);
  if (x.mant === 0n) return make(0n, r.kind === "scale" ? -r.n : x.exp >> 1, x.negZero);

  // Choose shift so that (x.exp - shift) is even and s ends up with prec+2 digits or more.
  let shift = Math.max(2 * (prec + 2) - digits(x.mant), 0);
  if ((x.exp - shift) % 2 !== 0) shift += 1;
  const N = guard(x.mant * pow10(shift), "sqrt");
  let { s, r: rem } = isqrt(N);
  const exp = (x.exp - shift) / 2;
  const ideal = Math.floor(x.exp / 2);

  if (rem === 0n) {
    let q = s, e = exp;
    while (e < ideal && q !== 0n && q % 10n === 0n) { q /= 10n; e += 1; }
    const out = make(q, e);
    return roundAny(out, p);
  }
  if (s % 10n === 0n) s += 1n;      // sticky: the true root is above s
  return roundAny(make(s, exp), p);
}

/** Cube root, resting on the same remainder argument as sqrt. */
export function cbrt(x: Dec, p: Precision): Dec {
  const r = resolve(p, "cbrt");
  const prec = r.kind === "digits" ? r.n : Math.max(r.n + 1, 1);
  if (x.mant === 0n) return make(0n, r.kind === "scale" ? -r.n : Math.trunc(x.exp / 3), x.negZero);

  let shift = Math.max(3 * (prec + 2) - digits(x.mant), 0);
  while ((x.exp - shift) % 3 !== 0) shift += 1;
  const N = guard(x.mant * pow10(shift), "cbrt");
  let { s, r: rem } = icbrt(N);
  const exp = (x.exp - shift) / 3;

  if (rem === 0n) {
    const ideal = Math.trunc(x.exp / 3);
    let q = s, e = exp;
    while (e < ideal && q !== 0n && q % 10n === 0n) { q /= 10n; e += 1; }
    return roundAny(make(q, e), p);
  }
  const neg = s < 0n;
  let m = neg ? -s : s;
  if (m % 10n === 0n) m += 1n;      // sticky
  return roundAny(make(neg ? -m : m, exp), p);
}

// Results carrying their own status.
//
// Same idea as MPFR's ternary value and Python's Inexact signal: guaranteeing correct
// rounding without reporting it still leaves the caller unsure whether a value is exact.
//
// Only the algebraic operations have one, since those are decided by a remainder.
// Apart from special values that short-circuit, a transcendental result is essentially
// never exact, and a flag that always reads false is not information.

function statusOf(x: Dec, out: Dec): Rounded {
  const c = cmp(out, x);
  return { value: out, exact: c === 0, direction: c === 0 ? 0 : c > 0 ? 1 : -1 };
}

/** As `round`, but reporting whether rounding happened and in which direction. */
export const roundStatus = (x: Dec, p: DigitsPrecision): Rounded =>
  statusOf(x, round(x, p));

/** The status form of `quantize`. */
export const quantizeStatus = (x: Dec, p: ScalePrecision): Rounded =>
  statusOf(x, quantize(x, p));

/** The status form of `div`. A zero remainder means the quotient is exact. */
export function divStatus(a: Dec, b: Dec, p: Precision): Rounded {
  const out = div(a, b, p);
  // Multiply back and compare. Multiplication is exact, so the check is exact too.
  // Dividing by a negative reverses the order, so the quotient is above a/b exactly
  // when out*b lands below a. Without that flip the sign is reported backwards for
  // every negative divisor, while the value itself stays correct.
  const c = cmp(mul(out, b), a) * (isNeg(b) ? -1 : 1);
  return { value: out, exact: c === 0, direction: c === 0 ? 0 : c > 0 ? 1 : -1 };
}

/** The status form of `sqrt`, decided by squaring the result back. */
export function sqrtStatus(x: Dec, p: Precision): Rounded {
  const out = sqrt(x, p);
  const c = cmp(mul(out, out), x);
  return { value: out, exact: c === 0, direction: c === 0 ? 0 : c > 0 ? 1 : -1 };
}
