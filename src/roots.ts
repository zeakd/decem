import {
  make, pow10, digits, isNeg, guard,
  DomainError, InvalidLiteral, type Dec,
} from "./decimal.ts";

/**
 * Integer square root, returning floor(sqrt(n)) together with the remainder.
 *
 * The remainder is what proves the rounding. When it is zero the root is exact, and
 * when it is not, the true root lies strictly between s and s+1. That alone settles
 * which way to round, with no digit inspection and no heuristic.
 */
export function isqrt(n: bigint): { s: bigint; r: bigint } {
  if (n < 0n) throw new DomainError("isqrt of a negative number", { op: "isqrt" });
  if (n < 2n) return { s: n, r: 0n };
  // Seed from the decimal length, which avoids toString.
  let x = pow10(Math.ceil(digits(n) / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) break;
    x = y;
  }
  return { s: x, r: n - x * x };
}

/** Integer cube root by Newton iteration, with the same remainder contract. */
export function icbrt(n: bigint): { s: bigint; r: bigint } {
  const neg = n < 0n;
  if (neg) n = -n;
  if (n < 2n) return { s: neg ? -n : n, r: 0n };
  let x = pow10(Math.ceil(digits(n) / 3) + 1);
  for (;;) {
    const y = (2n * x + n / (x * x)) / 3n;
    if (y >= x) break;
    x = y;
  }
  while ((x + 1n) ** 3n <= n) x++;          // Newton can stop one short here
  const r = n - x ** 3n;
  return { s: neg ? -x : x, r: neg ? -r : r };
}

/**
 * Exact exponentiation by an integer, so there is no precision parameter.
 *
 * A negative exponent is a division and needs one, so it is refused here and written
 * out instead: div(dec`1`, pow(x, n), p).
 */
export function powInt(x: Dec, n: number): Dec {
  if (!Number.isSafeInteger(n))
    throw new InvalidLiteral(`pow: the exponent must be a safe integer, got ${n}`,
      { op: "pow", actual: n });
  if (n < 0)
    throw new DomainError(
      "pow: a negative exponent is a division and needs a precision. " +
      `Write div(dec\`1\`, pow(x, ${-n}), p) instead.`);
  if (n === 0) return make(1n, 0);
  let base = x;
  let acc: Dec | null = null;
  let e = n;
  while (e > 0) {
    if (e & 1) acc = acc === null ? base : mulExact(acc, base);
    e >>= 1;
    if (e > 0) base = mulExact(base, base);
  }
  return acc!;
}

function mulExact(a: Dec, b: Dec): Dec {
  const mant = guard(a.mant * b.mant, "pow");
  return make(mant, a.exp + b.exp, mant === 0n && isNeg(a) !== isNeg(b));
}
