import { make, isDec, InvalidLiteral, type Dec, type Literal } from "./decimal.ts";

const LITERAL =
  /^([+-])?(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$|^([+-])?\.(\d+)(?:[eE]([+-]?\d+))?$/;

/**
 * Makes a value, from a literal written here or from something that arrived at run time.
 *
 *   dec`19.99`        written in the source, and interpolation is refused
 *   dec(row.price)    a string, a bigint, or an existing value
 *
 * One name, because it is one operation. The backticks and the parentheses already say
 * where the text came from, so a second name would only repeat the syntax.
 *
 * `number` is absent from what the parentheses accept, on purpose. The literal 0.1 is
 * already 0.1000000000000000055511151231257827 by the time it reaches any function, so
 * accepting it here would launder a loss that already happened. Use `fromNumber` when
 * that value is what you actually want, or `fromInt` for a count.
 */
export function dec(s: TemplateStringsArray): Dec;
export function dec(v: Literal): Dec;
export function dec(x: Literal | TemplateStringsArray): Dec {
  if (isTag(x)) {
    // Interpolation is refused. Allowing dec`${a}` would open a side door for a number to
    // arrive as text, and combining values is what the arithmetic is for.
    if (x.length !== 1)
      throw new InvalidLiteral("dec`` does not take interpolation; combine values with arithmetic");
    return parse(x[0]!);
  }
  return parse(x);
}

/** A tag call arrives as the strings array, which carries `raw`. A value never does. */
const isTag = (x: unknown): x is TemplateStringsArray =>
  Array.isArray(x) && Object.prototype.hasOwnProperty.call(x, "raw");

function parse(v: Literal): Dec {
  if (isDec(v)) return v;
  if (typeof v === "bigint") return make(v, 0);
  if (typeof v === "number")
    throw new InvalidLiteral(
      "dec() does not accept a number, because a number has already lost precision. " +
      "Write the literal as dec`...`, or use fromNumber() for the float64 value itself.",
      { op: "dec", operands: [String(v)] });
  if (typeof v !== "string") throw new InvalidLiteral(`dec(${typeof v})`);

  const m = LITERAL.exec(v.trim());
  if (!m) throw new InvalidLiteral(`cannot parse ${JSON.stringify(v)}`, { op: "dec", operands: [v] });

  const [, s1, int, frac, e1, s2, frac2, e2] = m;
  const sign = (s1 ?? s2) === "-";
  const digitsStr = int !== undefined ? int + (frac ?? "") : frac2!;
  const fracLen = int !== undefined ? (frac ?? "").length : frac2!.length;
  const mant = BigInt(digitsStr);
  return make(sign ? -mant : mant, Number(e1 ?? e2 ?? 0) - fracLen, sign && mant === 0n);
}

/**
 * The same parse, answering with null instead of raising.
 *
 * Raising is the rule here, and this is the one place it reads wrong: validating what a
 * person typed is an expected path, not an exceptional one, and making every form use a
 * try block turns an error into control flow. Everything else still raises.
 *
 * The null is not advisory. Under `strict` the result is `Dec | null` and the compiler
 * refuses to pass it anywhere until it has been checked.
 */
export function tryDec(v: Literal): Dec | null {
  try { return parse(v); } catch { return null; }
}

/**
 * For counting values: a length, an index, a number of periods. These are naturally
 * JavaScript numbers, and writing ``dec(BigInt(i))`` every time is friction with no
 * safety gained, since a safe integer loses nothing.
 *
 * Anything that is not a safe integer raises. This narrows the rule to where it
 * applies instead of relaxing it.
 */
export function fromInt(n: number): Dec {
  if (!Number.isSafeInteger(n))
    throw new InvalidLiteral(`fromInt(${n}) takes safe integers only; use dec\`...\` for a fraction`);
  return make(BigInt(n), 0);
}

/**
 * Converts a number, in one of two modes that are both defensible. The mode has no
 * default, for the same reason that an approximate operation has no default precision:
 * a value that arrives as a float64 carries an assumption, and the point of this
 * function is that the assumption is written at the call site.
 *
 *   "exact"     the value the float64 actually holds (0.1 becomes 0.1000000000000000055511...)
 *   "shortest"  the value JavaScript prints (0.1 stays 0.1)
 */
export function fromNumber(v: number, mode: "exact" | "shortest"): Dec {
  if (typeof v !== "number") throw new InvalidLiteral(`fromNumber(${typeof v})`);
  if (!Number.isFinite(v)) throw new InvalidLiteral(`not finite: ${v}`, { op: "fromNumber", operands: [String(v)] });
  if (mode === "shortest") return parse(Object.is(v, -0) ? "-0" : String(v));
  // Object.is separates -0 from 0, which BigInt does not carry. Without this the two
  // modes disagree about a value they both represent.
  if (Number.isInteger(v)) return make(BigInt(v), 0, Object.is(v, -0));

  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, v);
  const bits = buf.getBigUint64(0);
  const sign = bits >> 63n === 1n;
  const be = Number((bits >> 52n) & 0x7ffn);
  const fracBits = bits & 0xfffffffffffffn;
  let m = be === 0 ? fracBits : fracBits | (1n << 52n);
  let e2 = be === 0 ? -1074 : be - 1075;
  // Strip factors of two first. Without this the result carries trailing zeros and
  // is not the minimal representation.
  while (e2 < 0 && (m & 1n) === 0n) { m >>= 1n; e2++; }
  const d = e2 >= 0 ? make(m << BigInt(e2), 0) : make(m * 5n ** BigInt(-e2), e2);
  return sign ? make(-d.mant, d.exp, d.mant === 0n) : d;
}
