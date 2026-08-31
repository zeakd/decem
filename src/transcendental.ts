// Transcendental functions: exp, ln, log10, and pow with a decimal exponent.
//
// The shape is the one libmpdec and MPFR both use. Compute an approximation y with a
// certified error bound e, and accept it when round(y - e, p) equals round(y + e, p).
// Otherwise raise the working precision and try again. If that runs past the digit
// ceiling, raise IndeterminateRounding rather than guess.
//
// Nothing here inspects individual digits, which would be O(n) on a BigInt. No fixed
// guard bound exists for arbitrary precision, so the loop is the only honest answer.
import {
  make, pow10, digits, maxDigits, isNeg, ExponentOverflow, DivisionByZero, DomainError,
  DecemError, type Dec, type Precision,
  type DecemDetails,
} from "./decimal.ts";
import { expSeries, lnSeries, sinSeries, cosSeries, pi, ln2, ln10, mulS, divS } from "./series.ts";
import { roundAny as round } from "./ops.ts";
import { powInt } from "./roots.ts";
import { toString } from "./format.ts";

/** The retry loop ran past the digit ceiling, so no value is returned. */
export class IndeterminateRounding extends DecemError {
  constructor(message: string, details: DecemDetails = {}) {
    super("INDETERMINATE_ROUNDING", message, details);
  }
}

/** Whether a value is an integer: strip trailing zeros and see if the exponent reaches zero. */
function isIntegral(y: Dec): boolean {
  if (y.exp >= 0) return true;
  let m = y.mant < 0n ? -y.mant : y.mant, e = y.exp;
  while (e < 0 && m % 10n === 0n) { m /= 10n; e++; }
  return e >= 0;
}
function integerValue(y: Dec): number | null {
  let m = y.mant, e = y.exp;
  while (e < 0 && m % 10n === 0n) { m /= 10n; e++; }
  if (e < 0) return null;
  const v = m * pow10(e);
  return v > 9007199254740991n || v < -9007199254740991n ? null : Number(v);
}

/** An approximation mant*10^exp with an absolute error bound of err*10^exp. */
interface Approx { mant: bigint; exp: number; err: bigint }

/** Starting guard digits, following libmpdec's prec + 3. */
const START_GUARD = 3;
/**
 * How the precision grows. libmpdec adds a fixed amount; MPFR grows by about half the
 * current precision after the first failure. Since a BigInt is sub-quadratic, fewer and
 * larger attempts win, which spike/bench-ziv.mjs measures.
 */
const ZIV_LINEAR = 19;
/**
 * Internal guard digits. This is a speed knob, not a correctness knob: the retry loop
 * holds correctness on its own, and gates A and C both pass with the guard set to 3.
 * What the guard buys is the chance of finishing on the first attempt.
 *
 * Sixteen is not a compromise between two numbers. The analysed error is the series
 * term count, about three digits at p=400, plus the argument-reduction amplification of
 * roughly one more. Sixteen covers that twice over and leaves the rest to the loop.
 * Dropping from 40 to 16 made exp at 400 digits 5 to 13% faster with retries still at zero.
 */
// The environment variable is there for measurement only. It is read through a narrow
// cast so the core does not depend on Node types and still loads in a browser.
const envGuard = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.["DENARY_GUARD"];
export let GUARD = envGuard === undefined ? 16 : Number(envGuard);
export const setGuard = (n: number): void => { GUARD = n; };
export let ZIV_MODE: "linear" | "geometric" = "geometric";
export const setZivMode = (m: "linear" | "geometric"): void => { ZIV_MODE = m; };
/** Counters for measurement: how many retries happened and how far the precision went. */
export const zivStats = { rounds: 0, calls: 0, maxW: 0 };
export const resetZivStats = (): void => { zivStats.rounds = 0; zivStats.calls = 0; zivStats.maxW = 0; };
/**
 * Inflates the error bound so the retry path actually runs. A safety net that never
 * fires is a net of unknown strength. Values stay correct either way, since a larger
 * bound only makes the test more conservative. The default of 1n changes nothing.
 */
const envInflation = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.["DENARY_ERR_INFLATION"];
let ERR_INFLATION = envInflation === undefined ? 1n : BigInt(envInflation);
export const setErrInflation = (n: bigint): void => { ERR_INFLATION = n; };
/**
 * Lowers the ceiling so the raise can be reached without computing at a hundred thousand
 * digits first, which would measure patience rather than the failure path. Measurement
 * only, alongside setGuard and setErrInflation, and not part of the published surface.
 */
let ZIV_CAP = 100000;
export const setZivCap = (n: number): void => { ZIV_CAP = n; };
const nextW = (w: number, round: number): number =>
  ZIV_MODE === "linear" ? w + ZIV_LINEAR : round === 0 ? w + ZIV_LINEAR : w + (w >> 1);

/** The retry loop, running until both ends of the interval round the same way. */
function ziv(
  p: Precision,
  prec: number,
  approx: (w: number) => Approx,
  what: string,
): Dec {
  // The runtime ceiling is asked for only if the loop ever climbs past the software one,
  // because the probe that answers it costs about 185 milliseconds.
  const cap = (): number => Math.min(maxDigits(), ZIV_CAP);
  let w = prec + START_GUARD;
  zivStats.calls++;
  for (let i = 0; ; i++) {
    if (i > 0) zivStats.rounds++;
    if (w > zivStats.maxW) zivStats.maxW = w;
    const a = approx(w);
    const e = a.err * ERR_INFLATION;
    const lo = make(a.mant - e, a.exp);
    const hi = make(a.mant + e, a.exp);
    const rl = round(lo, p);
    const rh = round(hi, p);
    if (toString(rl) === toString(rh)) return rl;
    w = nextW(w, i);
    if (w > ZIV_CAP || w > cap())
      throw new IndeterminateRounding(
        `${what}: rounding is still undecided at ${w} digits. ` +
        "No fixed guard bound exists for arbitrary precision, so no value is guessed.",
        { op: what, actual: w, limit: cap(), precision: prec });
  }
}

/** Converts a value to an integer at scale w, truncating by under one unit. */
function toScaled(x: Dec, w: number): bigint {
  const k = w + x.exp;
  return k >= 0 ? x.mant * pow10(k) : x.mant / pow10(-k);
}

// ── exp ──────────────────────────────────────────────────────────────
/**
 * exp(x) = 10^N × exp(r),  N = round(x/ln10),  |r| ≤ ln10/2 ≈ 1.15
 *
 * The exponent has to come off first. Without that step, exp(10^13) is held as a
 * fixed-point value with four trillion digits before the point, and the process runs
 * out of memory. N goes into the result's exponent field and the mantissa carries
 * only exp(r).
 */
function expApprox(x: Dec, w: number): Approx {
  const adj = x.exp + digits(x.mant) - 1;                   // |x| ≈ 10^adj
  if (adj > 17)
    throw new ExponentOverflow(`exp: an argument near 10^${adj} overflows the exponent limit`);

  // Find N first, close to x / ln10.
  const W0 = Math.max(w + 24, adj + 24);
  const XS = toScaled(x, W0);
  const L10 = ln10(W0).value;
  let N = (XS + (XS < 0n ? -L10 / 2n : L10 / 2n)) / L10;    // rounded division
  const nd = N === 0n ? 1 : digits(N);

  // Getting r = x - N*ln10 right needs ln10 to as many extra digits as N has.
  const W = w + nd + Math.ceil(Math.log10(w + nd + GUARD)) + GUARD;
  const l10 = ln10(W);
  const R = toScaled(x, W) - N * l10.value;

  // |r| is at most 1.15, so halving k times brings |t| below 0.5.
  const k = 2;
  let T = R;
  for (let i = 0; i < k; i++) T /= 2n;
  const s = expSeries(T, W);
  let V = s.value;
  for (let i = 0; i < k; i++) V = mulS(V, V, W);

  // Relative error is bounded by 2^k times the series error, the ln10 error scaled by
  // N, and the truncation from folding. The ln10 term is the constant's own reported
  // error rather than a written down figure, because the real one grows with the width.
  const rel = (1n << BigInt(k)) *
    (BigInt(s.errUnits + k + 4) + (N < 0n ? -N : N) * BigInt(l10.errUnits + 1));
  const err = (rel * V) / pow10(W) + 2n;
  return { mant: V, exp: -W + Number(N), err };
}

// ── ln ───────────────────────────────────────────────────────────────
function lnApprox(x: Dec, w: number): Approx {
  const W = w + Math.max(12, GUARD >> 1);
  // x = f × 10^K, f ∈ [1, 10)
  const K = x.exp + digits(x.mant) - 1;
  const F = toScaled(make(x.mant, x.exp - K), W);            // f at scale W
  // Fold f into [1, 2), setting aside one ln2 for each halving.
  let f = F;
  let j = 0;
  const two = 2n * pow10(W);
  while (f >= two) { f /= 2n; j++; }
  const Y = divS(f - pow10(W), f + pow10(W), W);             // (f−1)/(f+1) ∈ [0, 1/3)
  const s = lnSeries(Y, W);
  const c2 = ln2(W), c10 = ln10(W);
  const V = s.value + BigInt(j) * c2.value + BigInt(K) * c10.value;
  // Add the error of ln2 and ln10 themselves, once per time they were used, taken from
  // the constants rather than assumed.
  const err = BigInt(s.errUnits + 4) +
    BigInt(j) * BigInt(c2.errUnits) + BigInt(Math.abs(K)) * BigInt(c10.errUnits) + 4n;
  return { mant: V, exp: -W, err };
}

// Public surface.
/** Where the loop starts. A scale precision does not reveal the result size in advance,
 * so it starts generously and lets the loop settle it. */
const startPrec = (p: Precision): number =>
  typeof p.digits === "number" ? p.digits : (p.scale as number) + 20;

const run = (x: Dec, p: Precision, f: (x: Dec, w: number) => Approx, what: string): Dec =>
  ziv(p, startPrec(p), (w) => f(x, w), what);

export function exp(x: Dec, p: Precision): Dec {
  if (x.mant === 0n) return round(make(1n, 0), p);
  return run(x, p, expApprox, "exp");
}

export function ln(x: Dec, p: Precision): Dec {
  if (x.mant <= 0n) throw new DomainError("ln requires a positive argument", { op: "ln" });
  // One, in any spelling. A value is not its mantissa: 1.000 is the same number as 1,
  // and testing the mantissa alone missed every spelling but the shortest.
  //
  // This path is the answer rather than a shortcut. The retry loop narrows an interval
  // until both ends round alike, and an interval around an exact zero straddles it no
  // matter how narrow it gets, so the loop climbs to the ceiling instead of settling.
  // The same normalisation guards the power of ten in log10 below.
  {
    let m = x.mant, z = 0;
    while (m % 10n === 0n && m !== 0n) { m /= 10n; z++; }
    if (m === 1n && x.exp + z === 0) return round(make(0n, 0), p);
  }
  return run(x, p, lnApprox, "ln");
}

/**
 * x^y for a decimal y, computed as exp(y * ln x).
 *
 * Composing the two stacks their errors. The error in ln is multiplied by y and then
 * survives exp as a relative error, since exp(a + d) is exp(a)(1 + d + ...). So ln is
 * computed to as many extra digits as |y| has, and its error is added to exp's before
 * the loop sees it. A composed result whose bound is hand-waved is not a guarantee.
 */
function powApprox(x: Dec, y: Dec, w: number): Approx {
  const dy = Math.max(y.exp + digits(y.mant), 1);           // integer digits of |y|
  const wl = w + dy + 24;
  const L = lnApprox(x, wl);
  // A is y * ln(x). The mantissa product is exact.
  const A = make(y.mant * L.mant, y.exp + L.exp);
  const E = expApprox(A, w);
  // A's error, |y| times ln's, passes through exp as a relative error.
  const ay = y.mant < 0n ? -y.mant : y.mant;
  const deltaUnits = ay * L.err;                             // at scale y.exp + L.exp
  const shift = -(y.exp + L.exp) + E.exp;                    // converted to E's scale
  const extra = shift >= 0 ? deltaUnits / pow10(shift) : deltaUnits * pow10(-shift);
  return { mant: E.mant, exp: E.exp, err: E.err + (extra * E.mant) / pow10(-E.exp) + 2n };
}

export function powT(x: Dec, y: Dec, p: Precision): Dec {
  if (x.mant < 0n) throw new DomainError("pow: a negative base with a decimal exponent has no real result", { op: "pow" });
  if (x.mant === 0n) {
    if (y.mant === 0n) throw new DomainError("pow: 0^0 is undefined", { op: "pow" });
    if (isNeg(y)) throw new DivisionByZero("pow: zero to a negative power", { op: "pow" });
    return round(make(0n, 0), p);
  }
  if (y.mant === 0n) return round(make(1n, 0), p);
  // An integer exponent has an exact path, and running the series instead would throw
  // away an exact answer. The requested precision is still applied: requiring a
  // precision and then ignoring it on one path would break the rule from the inside.
  // Rounding an exact intermediate keeps the result correctly rounded.
  if (y.exp >= 0 || isIntegral(y)) {
    const n = integerValue(y);
    if (n !== null && n >= 0 && Number.isSafeInteger(n)) return round(powInt(x, n), p);
  }
  return ziv(p, startPrec(p), (w) => powApprox(x, y, w), "pow");
}

export function log10(x: Dec, p: Precision): Dec {
  if (x.mant <= 0n) throw new DomainError("log10 requires a positive argument", { op: "log10" });
  // A power of ten is exact and needs no series. Strip trailing zeros from the
  // mantissa and check whether what remains is one.
  {
    let m = x.mant, z = 0;
    while (m % 10n === 0n && m !== 0n) { m /= 10n; z++; }
    if (m === 1n) return round(make(BigInt(x.exp + z), 0), p);
  }
  return ziv(p, startPrec(p), (w) => {
    const W = w + 16;
    const a = lnApprox(x, W);
    const shift = -a.exp - W;                       // bring a down to scale W
    const A = a.mant / pow10(shift);
    const c10 = ln10(W);
    const V = divS(A, c10.value, W);
    // Dividing by ln10 carries that constant's error into the result in proportion to
    // the result itself: log10 of 10^100 is a hundred, so the constant is effectively
    // used a hundred times. A fixed allowance holds for small arguments and silently
    // fails for large ones, which is what a constructed boundary near 10^10 showed.
    const mag = (V < 0n ? -V : V) / pow10(W) + 1n;
    return { mant: V, exp: -W, err: a.err / pow10(shift) + mag * BigInt(c10.errUnits) + 4n };
  }, "log10");
}

// Trigonometry, and why it sits in a lower tier.
//
// Reducing x to x - k*pi cancels significant digits as x approaches a multiple of pi,
// and nothing bounds how close an input can be. The working precision therefore depends
// on the input in a way that cannot be capped in advance.
//
// exp and ln avoid this because their reduction subtracts powers of two and ten, which
// are known exactly.

/** Folds x into [-pi/2, pi/2] and reports the fold count, whose parity carries the sign. */
function reduceByPi(x: Dec, W: number): { R: bigint; k: bigint; errPi: bigint } {
  const P = pi(W);
  const XS = toScaled(x, W);
  const half = P.value / 2n;
  // k = round(x/π)
  const k = (XS + (XS < 0n ? -half : half)) / P.value;
  const R = XS - k * P.value;
  const ak = k < 0n ? -k : k;
  return { R, k, errPi: ak * BigInt(P.errUnits) + 4n };
}

function trigApprox(x: Dec, w: number, kind: "sin" | "cos"): Approx {
  const adj = x.exp + digits(x.mant) - 1;
  // A larger |x| needs more digits of pi, since the reduction consumes them.
  const W = w + Math.max(adj, 0) + Math.max(24, GUARD - 16);
  const { R, k, errPi } = reduceByPi(x, W);
  const odd = (k & 1n) === 1n;
  const s = kind === "sin" ? sinSeries(R, W) : cosSeries(R, W);
  const V = odd ? -s.value : s.value;
  return { mant: V, exp: -W, err: errPi + BigInt(s.errUnits) + 4n };
}

export function sin(x: Dec, p: Precision): Dec {
  if (x.mant === 0n) return round(make(0n, 0), p);
  return ziv(p, startPrec(p), (w) => trigApprox(x, w, "sin"), "sin");
}

export function cos(x: Dec, p: Precision): Dec {
  if (x.mant === 0n) return round(make(1n, 0), p);
  return ziv(p, startPrec(p), (w) => trigApprox(x, w, "cos"), "cos");
}

export function tan(x: Dec, p: Precision): Dec {
  if (x.mant === 0n) return round(make(0n, 0), p);
  return ziv(p, startPrec(p), (w) => {
    const adj = x.exp + digits(x.mant) - 1;
    const W = w + Math.max(adj, 0) + 32;
    const { R, errPi } = reduceByPi(x, W);
    const sn = sinSeries(R, W);
    const cs = cosSeries(R, W);
    if (cs.value === 0n) throw new DomainError("tan is too close to a pole to decide", { op: "tan" });
    const V = divS(sn.value, cs.value, W);
    // The error grows with |tan|, which is to say as cos approaches zero.
    const acs = cs.value < 0n ? -cs.value : cs.value;
    const av = V < 0n ? -V : V;
    const err = ((errPi + BigInt(sn.errUnits + cs.errUnits) + 8n) * (pow10(W) + av)) / acs + 2n;
    return { mant: V, exp: -W, err };
  }, "tan");
}
