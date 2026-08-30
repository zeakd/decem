// Fixed-scale integer arithmetic, which is where the series run.
//
// A value v is held as an integer V close to v * 10^w. Every multiply and divide
// truncates by less than one unit, so the error can be counted rather than estimated,
// and that count is what the Ziv test needs as a certified bound.
//
// Running the series on Dec values instead would make every step demand a precision
// argument, and the error accounting would scatter across all of them.
import { pow10, DomainError } from "./decimal.ts";
import { memo } from "./memo.ts";

/** Product at scale w. Truncation error is under one unit. */
export const mulS = (a: bigint, b: bigint, w: number): bigint => (a * b) / pow10(w);
/** Quotient at scale w. Both arguments must already be scaled; a raw integer skews the result. */
export const divS = (a: bigint, b: bigint, w: number): bigint => (a * pow10(w)) / b;
/** Lifts a raw integer to scale w, which is the mistake divS invites. */
export const lift = (n: bigint, w: number): bigint => n * pow10(w);

export interface Series { value: bigint; errUnits: number }

/**
 * exp(t) for |t| < 1, with T holding t at scale w.
 * Each term truncates twice, so the error stays under 2n+1 units for n terms.
 */
export function expSeries(T: bigint, w: number): Series {
  const one = pow10(w);
  if (T >= one || T <= -one)
    throw new DomainError("expSeries needs |t| < 1; the argument was not reduced");
  let term = one;
  let sum = one;
  let n = 1n;
  let count = 0;
  while (term !== 0n) {
    term = mulS(term, T, w) / n;
    sum += term;
    n += 1n;
    count++;
    if (count > 100000) throw new Error("expSeries failed to converge");
  }
  return { value: sum, errUnits: 2 * count + 1 };
}

/**
 * ln(f) as 2*atanh(y) with y = (f-1)/(f+1), where Y holds y at scale w.
 * Convergence improves as |y| shrinks, and the caller reduces the argument to |y| <= 1/3.
 */
export function lnSeries(Y: bigint, w: number): Series {
  const one = pow10(w);
  if (Y >= one / 2n || Y <= -one / 2n)
    throw new DomainError("lnSeries needs |y| < 0.5; the argument was not reduced");
  const y2 = mulS(Y, Y, w);
  let p = Y;
  let sum = Y;
  let n = 1n;
  let count = 0;
  for (;;) {
    p = mulS(p, y2, w);
    n += 2n;
    const t = p / n;
    if (t === 0n) break;
    sum += t;
    count++;
    if (count > 100000) throw new Error("lnSeries failed to converge");
  }
  return { value: 2n * sum, errUnits: 4 * count + 4 };
}

/**
 * ln(2), cached. With y = 1/3 the terms fall by a factor of nine.
 *
 * The error travels with the value. These constants are used a number of times that
 * depends on the argument, so a caller that has to guess their accuracy guesses wrong
 * as soon as the working width grows: the real error here rises with w, while a written
 * down constant does not.
 */
/**
 * How many widths of a constant are worth keeping. The retry loop asks for a few per call
 * and a program tends to reuse its precisions, so a small number holds the working set;
 * the bound is here because a long-lived process must not collect one constant per width
 * it ever touched. An entry is linear in the width, unlike the table that made this rule.
 */
const CONSTANT_WIDTHS = 32;

export const ln2: (w: number) => Series = memo(CONSTANT_WIDTHS, (w) => {
  const Y = pow10(w) / 3n;                         // one third, at scale w
  const s = lnSeries(Y, w);
  return { value: s.value, errUnits: s.errUnits + 1 };   // +1 for truncating 1/3
});

/** ln(10) via ln(1.25) + 3*ln(2), since 10 is 1.25 * 2^3. Here y = 1/9, so it converges faster. */
export const ln10: (w: number) => Series = memo(CONSTANT_WIDTHS, (w) => {
  const Y = pow10(w) / 9n;                         // (1.25-1)/(1.25+1) = 1/9
  const a = lnSeries(Y, w);
  const b = ln2(w);
  return { value: a.value + 3n * b.value, errUnits: a.errUnits + 3 * b.errUnits + 1 };
});

/**
 * atan(1/n) at scale w. Larger n converges faster, with terms falling by 1/n^2.
 * This is the ingredient for a Machin-style formula.
 */
export function atanInv(n: bigint, w: number): Series {
  const one = pow10(w);
  const n2 = n * n;
  let term = one / n;                       // 1/n
  let sum = term;
  let k = 1n;
  let count = 0;
  let sign = -1n;
  for (;;) {
    term /= n2;
    if (term === 0n) break;
    k += 2n;
    const t = term / k;
    if (t === 0n) break;
    sum += sign * t;
    sign = -sign;
    count++;
    if (count > 100000) throw new DomainError("atanInv failed to converge");
  }
  return { value: sum, errUnits: 3 * count + 3 };
}

/**
 * Pi, by Machin's formula: pi/4 = 4*atan(1/5) - atan(1/239).
 *
 * Trigonometric argument reduction needs it, and the closer x sits to a multiple of
 * pi the more digits of it are required, so the cache is keyed by precision.
 */
export const pi: (w: number) => Series = memo(CONSTANT_WIDTHS, (w) => {
  const a = atanInv(5n, w);
  const b = atanInv(239n, w);
  return { value: 4n * (4n * a.value - b.value), errUnits: 4 * (4 * a.errUnits + b.errUnits) + 4 };
});

/** sin(t) for |t| <= pi/2, with T at scale w. Two truncations per term. */
export function sinSeries(T: bigint, w: number): Series {
  const t2 = mulS(T, T, w);
  let term = T;
  let sum = T;
  let k = 1n;
  let count = 0;
  let sign = -1n;
  for (;;) {
    term = mulS(term, t2, w) / ((k + 1n) * (k + 2n));
    if (term === 0n) break;
    k += 2n;
    sum += sign * term;
    sign = -sign;
    count++;
    if (count > 100000) throw new DomainError("sinSeries failed to converge");
  }
  return { value: sum, errUnits: 3 * count + 3 };
}

/** cos(t) for |t| <= pi/2. */
export function cosSeries(T: bigint, w: number): Series {
  const one = pow10(w);
  const t2 = mulS(T, T, w);
  let term = one;
  let sum = one;
  let k = 0n;
  let count = 0;
  let sign = -1n;
  for (;;) {
    term = mulS(term, t2, w) / ((k + 1n) * (k + 2n));
    if (term === 0n) break;
    k += 2n;
    sum += sign * term;
    sign = -sign;
    count++;
    if (count > 100000) throw new DomainError("cosSeries failed to converge");
  }
  return { value: sum, errUnits: 3 * count + 3 };
}
