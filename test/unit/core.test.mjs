// The surface gates A and B do not reach: input edges, errors, runtime limits.
// The oracle only judges arithmetic. These check the contract we wrote ourselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import * as d from "../../src/index.ts";
import { memo } from "../../src/memo.ts";

const s = d.toString, f = d.dec;

test("dec refuses a number, stopping the loss at the entrance", () => {
  assert.throws(() => f(0.1), d.DenaryError);
  assert.throws(() => f(1), d.DenaryError);          // integers too; an exception would not be a rule
});

test("dec accepts a string, a bigint, or an existing value", () => {
  assert.equal(s(f("123.45")), "123.45");
  assert.equal(s(f(12345n)), "12345");
  assert.equal(s(f(f("1.5"))), "1.5");
  assert.equal(s(f("  -0.007  ")), "-0.007");
  assert.equal(s(f("+1.5")), "1.5");
  assert.equal(s(f(".5")), "0.5");
  assert.equal(s(f("1.5E+2")), "1.5E+2");
  assert.equal(s(f("1.5e-3")), "0.0015");
});

test("dec raises on anything it cannot parse", () => {
  for (const bad of ["", "abc", "1.2.3", "--1", "1e", ".", "0x10", "1_000"])
    assert.throws(() => f(bad), d.InvalidLiteral, `"${bad}" was accepted`);
});

test("fromNumber: exact and shortest give different values, and both are defensible", () => {
  assert.equal(s(d.fromNumber(0.1, "shortest")), "0.1");
  assert.equal(s(d.fromNumber(0.1, "exact")), "0.1000000000000000055511151231257827021181583404541015625");
  assert.equal(s(d.fromNumber(0.5, "exact")), "0.5");           // powers of two are exact
  assert.equal(s(d.fromNumber(3, "exact")), "3");
  assert.equal(s(d.fromNumber(-0, "shortest")), "-0");
  assert.equal(s(d.fromNumber(-0, "exact")), "-0");   // the modes must agree about -0
  assert.throws(() => d.fromNumber(NaN, "exact"), d.DenaryError);
  assert.throws(() => d.fromNumber(Infinity, "exact"), d.DenaryError);
});

test("the dec tag removes the friction of quoting every literal", () => {
  assert.equal(s(d.dec`1250000`), "1250000");
  assert.equal(s(d.dec`-0.007`), "-0.007");
  assert.equal(s(d.dec`1.5E+2`), "1.5E+2");
  // Interpolation is refused at runtime too; the type side is gate E.
  assert.throws(() => d.dec(Object.assign(["1", "2"], { raw: ["1", "2"] })), d.InvalidLiteral);
});

test("fromInt takes counting values, and safe integers only", () => {
  assert.equal(s(d.fromInt(7)), "7");
  assert.equal(s(d.fromInt(-3)), "-3");
  assert.equal(s(d.fromInt(0)), "0");
  assert.throws(() => d.fromInt(1.5), d.InvalidLiteral);
  assert.throws(() => d.fromInt(NaN), d.InvalidLiteral);
  assert.throws(() => d.fromInt(2 ** 53), d.InvalidLiteral);   // outside the safe range
});

test("an approximate operation without a precision raises at runtime as well", () => {
  const [a, b] = [f("1"), f("3")];
  assert.throws(() => d.div(a, b), d.PrecisionRequired);
  assert.throws(() => d.div(a, b, {}), d.PrecisionRequired);
  assert.throws(() => d.div(a, b, { digits: 0 }), d.PrecisionRequired);
  // digits and scale are exclusive at runtime too; the type side is gate E.
  assert.throws(() => d.div(a, b, { digits: 10, scale: 2 }), d.PrecisionRequired);
  assert.throws(() => d.div(a, b, { digits: 20, rounding: "nearest" }), d.DenaryError);
});

test("division by zero raises instead of producing Infinity", () => {
  assert.throws(() => d.div(f("1"), f("0"), { digits: 20 }), d.DivisionByZero);
  assert.throws(() => d.div(f("0"), f("0"), { digits: 20 }), d.DivisionByZero);
  assert.throws(() => d.div(f("1"), f("-0"), { digits: 20 }), d.DivisionByZero);
});

test("trailing zeros are preserved rather than stripped behind the caller", () => {
  assert.equal(s(d.mul(f("1.5"), f("2"))), "3.0");
  assert.equal(s(d.add(f("1.10"), f("2.20"))), "3.30");
  assert.equal(s(d.mul(f("2.50"), f("4.00"))), "10.0000");
  assert.equal(s(f("0.00")), "0.00");
});

test("equality compares values, so scale does not leak into it", () => {
  assert.ok(d.eq(f("2.0"), f("2.00")));
  assert.ok(d.eq(f("-0"), f("0")));
  assert.ok(d.eq(f("1E+2"), f("100")));
  assert.equal(d.cmp(f("1E+2"), f("100")), 0);
  assert.notEqual(d.scaleOf(f("2.0")), d.scaleOf(f("2.00")));   // scaleOf is how you tell them apart
});

test("cmp answers across a huge exponent gap without expanding either side", () => {
  assert.equal(d.cmp(f("1E+9000000"), f("1E-9000000")), 1);
  assert.equal(d.cmp(f("-1E+9000000"), f("1E-9000000")), -1);
  assert.equal(d.cmp(f("0"), f("1E-9000000")), -1);
});

test("passing the digit ceiling raises rather than leaving it to the engine", () => {
  // A wide exponent gap makes an exact addition explode. It raises instead of truncating.
  assert.throws(() => d.add(f("1E+9000000000"), f("1")), d.DigitOverflow);
  assert.ok(d.maxDigits() > 300000, `maxDigits=${d.maxDigits()}`);
  // A one-digit mantissa can still grow its exponent, which the digit check misses.
  assert.equal(d.mul(f("1E+9000000000"), f("1E+9000000000")).exp, 18000000000);
});

test("the exponent raises once it would leave the safe integer range", () => {
  // Without this the exponent arithmetic loses precision and values go quietly wrong.
  assert.throws(() => d.mul(f("1E+9000000000000000"), f("1E+9000000000000000")),
                d.ExponentOverflow);
  assert.throws(() => f("1E+9000000000000001"), d.ExponentOverflow);
  assert.equal(s(d.mul(f("1E+4000000000000000"), f("1E+4000000000000000"))), "1E+8000000000000000");
});

test("pow with an integer exponent is exact and takes no precision", () => {
  assert.equal(s(d.pow(d.dec`1.5`, 2)), "2.25");
  assert.equal(s(d.pow(d.dec`2`, 10)), "1024");
  assert.equal(s(d.pow(d.dec`10`, 0)), "1");
  assert.equal(s(d.pow(d.dec`-2`, 3)), "-8");
  assert.equal(s(d.pow(d.dec`-2`, 2)), "4");
  assert.equal(s(d.pow(d.dec`1.10`, 3)), "1.331000");        // scale preserved
  // A negative exponent is a division and needs a precision, so it points at div.
  assert.throws(() => d.pow(d.dec`2`, -1), d.DenaryError);
  assert.throws(() => d.pow(d.dec`2`, 1.5), d.InvalidLiteral);
});

test("sqrt and cbrt are exact when they come out exact, proved by the remainder", () => {
  const p = { digits: 20 };
  assert.equal(s(d.sqrt(d.dec`4`, p)), "2");
  assert.equal(s(d.sqrt(d.dec`4.00`, p)), "2.0");            // ideal exponent
  assert.equal(s(d.sqrt(d.dec`0.0004`, p)), "0.02");
  assert.equal(s(d.sqrt(d.dec`0`, p)), "0");
  assert.equal(s(d.cbrt(d.dec`8`, p)), "2");
  assert.equal(s(d.cbrt(d.dec`8000000000`, p)), "2000");
  assert.throws(() => d.sqrt(d.dec`-1`, p), d.DenaryError);
  // A cube root of a negative number is still real.
  assert.equal(s(d.cbrt(d.dec`-8`, p)), "-2");
  // A non-zero remainder means the result was rounded.
  assert.equal(s(d.sqrt(d.dec`2`, { digits: 20 })), "1.4142135623730950488");
});

test("transcendentals skip the series where the answer is exact", () => {
  const P = { digits: 30 };
  assert.equal(s(d.exp(d.dec`0`, P)), "1");
  assert.equal(s(d.ln(d.dec`1`, P)), "0");
  assert.equal(s(d.log10(d.dec`1000`, P)), "3");
  assert.equal(s(d.log10(d.dec`0.001`, P)), "-3");
  assert.equal(s(d.pow(d.dec`2`, d.dec`10`, P)), "1024");        // integer exponent takes the exact path
  assert.equal(s(d.pow(d.dec`1.05`, d.dec`12`, P)), "1.795856326022129150390625");
});

test("transcendentals raise outside their domain", () => {
  const P = { digits: 20 };
  assert.throws(() => d.ln(d.dec`0`, P), d.DenaryError);
  assert.throws(() => d.ln(d.dec`-1`, P), d.DenaryError);
  assert.throws(() => d.log10(d.dec`-5`, P), d.DenaryError);
  assert.throws(() => d.pow(d.dec`-2`, d.dec`0.5`, P), d.DenaryError);
  assert.throws(() => d.pow(d.dec`0`, d.dec`0`, P), d.DenaryError);
  assert.throws(() => d.exp(d.dec`1e18`, P), d.ExponentOverflow);
});

test("exp(ln(x)) round trips, which is a check the oracle is not part of", () => {
  const P = { digits: 40 };
  const tol = d.dec`1e-35`;
  for (const v of ["2", "0.5", "123.456", "1.0000001"]) {
    const x = d.dec(v);
    const back = d.exp(d.ln(x, P), P);
    const rel = d.abs(d.div(d.sub(back, x), x, P));
    assert.ok(d.lt(rel, tol), `exp(ln(${v})) round trip relative error ${s(rel)}`);
  }
});

test("trigonometry is exact at zero and still returns on adversarial input", () => {
  const P = { digits: 34 };
  assert.equal(s(d.sin(d.dec`0`, P)), "0");
  assert.equal(s(d.cos(d.dec`0`, P)), "1");
  assert.equal(s(d.tan(d.dec`0`, P)), "0");
  // sin(1), as MPFR gives it.
  assert.equal(s(d.sin(d.dec`1`, P)), "0.8414709848078965066525023216302990");
  // Near pi the cancellation is severe, and the retry loop still closes it.
  const nearPi = d.dec`3.14159265358979323846264338327950288`;
  const v = d.sin(nearPi, P);
  assert.ok(d.lt(d.abs(v), d.dec`1e-30`), `sin near pi gave ${s(v)}`);
  // The identity sin^2 + cos^2 = 1, again without the oracle.
  const P2 = { digits: 50 };
  for (const x of ["1", "2.5", "-7", "100"]) {
    const a = d.sin(d.dec(x), P2), b = d.cos(d.dec(x), P2);
    const one = d.add(d.mul(a, a), d.mul(b, b));
    assert.ok(d.lt(d.abs(d.sub(one, d.dec`1`)), d.dec`1e-45`),
      `sin²+cos² = ${s(one)} (x=${x})`);
  }
});

test("the output functions raise when a value would be cut", () => {
  const x = d.dec`1234.5678`;
  assert.equal(d.toFixed(x, 6), "1234.567800");
  assert.equal(d.toFixed(d.dec`5`, 0), "5");
  assert.equal(d.toFixed(d.dec`-0.5`, 1), "-0.5");
  // Too few digits raises, so the caller picks a rounding mode first.
  assert.throws(() => d.toFixed(x, 2), d.DenaryError);
  assert.equal(d.toExponential(x, 7), "1.2345678E+3");
  assert.throws(() => d.toExponential(x, 3), d.DenaryError);
  assert.equal(d.toNumber(x), 1234.5678);
  assert.equal(d.toBigInt(d.dec`1200`), 1200n);
  assert.equal(d.toBigInt(d.dec`1.200E+3`), 1200n);
  assert.throws(() => d.toBigInt(x), d.NotAnInteger);
});

test("the exact path in pow still honours the requested precision", () => {
  // The exact path computes exactly and then rounds to what was asked. A contract
  // that changes with the path is not a contract.
  assert.equal(s(d.pow(d.dec`1.05`, d.dec`12`, { digits: 5 })), "1.7959");
  assert.equal(s(d.pow(d.dec`1.05`, d.dec`12`, { digits: 25 })), "1.795856326022129150390625");
  // A number exponent is the exact operation, with no precision slot, so digits grow.
  assert.equal(s(d.pow(d.dec`1.05`, 12)), "1.795856326022129150390625");
});

test("round and quantize are different operations", () => {
  // round counts significant digits and keeps magnitude; quantize pins the exponent.
  assert.equal(s(d.round(d.dec`1234.5`, { digits: 3 })), "1.23E+3");
  assert.equal(s(d.quantize(d.dec`1234.5`, { scale: 2 })), "1234.50");
  // Neither accepts the other form; the type side is gate E.
  assert.throws(() => d.round(d.dec`1`, { scale: 2 }), d.PrecisionRequired);
  assert.throws(() => d.quantize(d.dec`1`, { digits: 2 }), d.PrecisionRequired);
});

test("the status forms let you ask whether a result was exact", () => {
  const P = { digits: 20 };
  for (const [a, b, exact] of [["1", "2", true], ["10", "4", true], ["1", "3", false]]) {
    const r = d.divStatus(d.dec(a), d.dec(b), P);
    assert.equal(r.exact, exact, `divStatus(${a},${b})`);
    assert.equal(r.direction === 0, exact);
  }
  assert.equal(d.sqrtStatus(d.dec`4`, P).exact, true);
  assert.equal(d.sqrtStatus(d.dec`2`, P).exact, false);
  assert.equal(d.sqrtStatus(d.dec`2`, P).direction, -1);   // rounded down, below the true root
  assert.equal(d.roundStatus(d.dec`2.5`, { digits: 1 }).direction, -1);
  assert.equal(d.roundStatus(d.dec`2`, { digits: 1 }).exact, true);
  assert.equal(d.quantizeStatus(d.dec`1.5`, { scale: 4 }).exact, true);
});

test("errors carry a code and details, so nobody branches on message text", () => {
  // The message is for a person and the code is for a program. Branching on wording
  // freezes it, and rewording then breaks somebody's code.
  const grab = (fn) => { try { fn(); return null; } catch (e) { return e; } };
  const e1 = grab(() => d.div(d.dec`1`, d.dec`0`, { digits: 20 }));
  assert.equal(e1.code, "DIVISION_BY_ZERO");
  assert.equal(e1.details.op, "div");
  assert.equal(grab(() => d.ln(d.dec`0`, { digits: 20 })).code, "DOMAIN");
  assert.equal(grab(() => d.dec(0.1)).code, "INVALID_LITERAL");
  assert.equal(grab(() => d.toBigInt(d.dec`1.5`)).code, "NOT_AN_INTEGER");
  const e2 = grab(() => d.mul(d.dec`1E+9000000000000000`, d.dec`1E+9000000000000000`));
  assert.equal(e2.code, "EXPONENT_OVERFLOW");
  assert.equal(e2.details.limit, d.EXP_LIMIT);
  const e3 = grab(() => d.add(d.dec`1E+9000000000`, d.dec`1`));
  assert.equal(e3.code, "DIGIT_OVERFLOW");
  assert.ok(e3.details.actual > e3.details.limit);
  // Everything descends from DenaryError, so one catch can cover them all.
  for (const e of [e1, e2, e3]) assert.ok(e instanceof d.DenaryError);
});

test("sum is exact and order independent", () => {
  const xs = ["0.1", "0.2", "0.3", "-0.6"].map(f);
  assert.ok(d.eq(d.sum(xs), f("0")));
  assert.ok(d.eq(d.sum(xs), d.sum([...xs].reverse())));
  assert.equal(s(d.sum([])), "0");
  assert.equal(s(d.sum([f("1.5")])), "1.5");
});

test("scale precision pins decimal places, which is what money needs", () => {
  const money = { scale: 2, rounding: "half-even" };
  assert.equal(s(d.div(f("10"), f("3"), money)), "3.33");
  assert.equal(s(d.div(f("100"), f("3"), money)), "33.33");
  assert.equal(s(d.div(f("2"), f("3"), money)), "0.67");
  assert.equal(s(d.div(f("-2"), f("3"), money)), "-0.67");
  assert.equal(s(d.div(f("1"), f("8"), money)), "0.12");           // 0.125 goes to 0.12 under half-even
  assert.equal(s(d.quantize(f("2.345"), { scale: 2 })), "2.34");       // half-even
  assert.equal(s(d.quantize(f("2.355"), { scale: 2 })), "2.36");
  assert.equal(s(d.quantize(f("1.5"), { scale: 4 })), "1.5000");       // lengthening is exact
  assert.equal(s(d.quantize(f("1234"), { scale: -2, rounding: "half-even" })), "1.2E+3");
});

test("an exact division returns to the ideal exponent", () => {
  const p = { digits: 20 };
  assert.equal(s(d.div(f("1"), f("2"), p)), "0.5");
  assert.equal(s(d.div(f("10"), f("2"), p)), "5");
  assert.equal(s(d.div(f("1"), f("4"), p)), "0.25");
});

// A declared failure mode that never executes is a promise, not a behaviour. Neither
// ordinary nor adversarial input has ever reached this path, so it is reached on purpose:
// the error bound is inflated until the interval cannot close, and the ceiling is lowered
// so the climb ends in seconds. Both hooks exist for measurement and are not exported
// from the package.
test("the retry loop raises instead of guessing when rounding stays undecided", async () => {
  const z = await import("../../src/transcendental.ts");
  // The inflation is counted in units of the last place at the working width, so it has
  // to out-run the ceiling: at 10^40 the loop simply climbs past it and settles at 63.
  z.setErrInflation(10n ** 400n);
  z.setZivCap(300);
  try {
    for (const [name, call] of [
      ["exp", () => d.exp(f("1.5"), { digits: 20 })],
      ["ln", () => d.ln(f("2.5"), { digits: 20 })],
      ["sin", () => d.sin(f("0.7"), { digits: 20 })],
    ]) {
      assert.throws(call, d.IndeterminateRounding, `${name} should have raised`);
      try { call(); } catch (e) {
        assert.match(e.message, /undecided at \d+ digits/);
        assert.equal(e.details.op, name);
        assert.equal(e.details.limit, 300);
        assert.ok(e.details.actual > 300, "the reported width is the one that passed the cap");
      }
    }
    // The values are still correct once the bound is honest again, so the net is a net
    // rather than a wall.
    z.setErrInflation(1n);
    assert.equal(s(d.exp(f("1"), { digits: 20 })), "2.7182818284590452354");
  } finally {
    z.setErrInflation(1n);
    z.setZivCap(100000);
  }
});

// Thin wrappers, and thin is exactly why nothing ran them: a flipped comparison reads as
// correct. Each is checked on both sides of the boundary and on the boundary itself,
// which is where a wrong operator differs from a right one.
test("the comparison operators agree with cmp on every side", () => {
  const cases = [["1", "2", -1], ["2", "1", 1], ["2", "2", 0],
                 ["-0", "0", 0],            // numerically equal despite the stored sign
                 ["1.0", "1.00", 0],        // trailing zeros are scale, not value
                 ["-3", "-3.0", 0], ["-3", "-2", -1]];
  for (const [x, y, want] of cases) {
    const a = f(x), b = f(y);
    assert.equal(d.cmp(a, b), want, `cmp(${x}, ${y})`);
    assert.equal(d.eq(a, b), want === 0, `eq(${x}, ${y})`);
    assert.equal(d.lt(a, b), want < 0, `lt(${x}, ${y})`);
    assert.equal(d.lte(a, b), want <= 0, `lte(${x}, ${y})`);
    assert.equal(d.gt(a, b), want > 0, `gt(${x}, ${y})`);
    assert.equal(d.gte(a, b), want >= 0, `gte(${x}, ${y})`);
  }
});

// isNeg answers about the sign, not about the magnitude, which is the distinction that
// divStatus depends on to report a direction. Zero is the case where the two part ways.
test("isNeg reads the sign, including the one zero carries", () => {
  for (const [v, want] of [["-3", true], ["3", false], ["-0.5", true],
                           ["0", false], ["-0", true]])
    assert.equal(d.isNeg(f(v)), want, `isNeg(${v})`);
  assert.equal(d.isZero(f("-0")), true);           // signed, and still zero
  assert.equal(d.eq(f("-0"), f("0")), true);       // sign is carried, not compared
  // The pairing that matters: same value, opposite operand signs, same direction.
  const a = d.divStatus(f("1"), f("-3"), { digits: 5, rounding: "ceil" });
  const b = d.divStatus(f("-1"), f("3"), { digits: 5, rounding: "ceil" });
  assert.equal(s(a.value), s(b.value));
  assert.equal(a.direction, b.direction);
});

// A value is not its mantissa. ln tested for one by looking at the mantissa alone, so
// every spelling but the shortest fell through to the series, where it could not settle:
// the retry loop narrows an interval until both ends round alike, and an interval around
// an exact zero straddles it however narrow it gets. The call did not return a wrong
// answer, it climbed toward a ceiling of a hundred thousand digits.
test("ln recognises one in every spelling, since the series cannot settle on zero", () => {
  for (const one of ["1", "1.0", "1.000", "1E+0", "0.1E+1", "100E-2"])
    assert.equal(s(d.ln(f(one), { digits: 9 })), "0", `ln(${one})`);
  // Neighbours must still take the ordinary path rather than being swallowed by it.
  assert.equal(s(d.ln(f("10"), { digits: 9 })), "2.30258509");
  assert.equal(s(d.ln(f("0.1"), { digits: 9 })), "-2.30258509");
  assert.equal(s(d.ln(f("1.0000000001"), { digits: 9 })), "1.00000000E-10");
});

// Leaving the library used to be the one place a wrong answer was silent: interpolating
// a value gave "[object Object]" and that reaches a log, a screen or a column with no
// complaint. The string hint answers; every other hint raises, the way BigInt does.
test("a value survives leaving the library, or says why it cannot", () => {
  const x = d.dec`19.99`;
  assert.equal(`${x}`, "19.99");
  assert.equal(String(x), "19.99");
  assert.equal(JSON.stringify({ price: x }), '{"price":"19.99"}');
  assert.equal(x.toString(), "19.99");
  // Concatenation answers rather than raising, because a diagnostic line must not be able
  // to end a request and it runs inside code the caller does not own. It answers inside a
  // marker, so that `price + 1` cannot pass for arithmetic: "19.991" is the kind of wrong
  // answer this library exists to remove, and "[decimal 19.99]1" is not mistakable.
  assert.equal("price=" + x, "price=[decimal 19.99]");
  assert.equal(x + 1, "[decimal 19.99]1");
  assert.match(String(x + 1), /19\.99/);          // the value is still readable in a log
  // The number hint raises, and it carries the comparison operators, which the type
  // checker allows through. The message has to name lt: advising a conversion would hand
  // back the precision loss this library exists to prevent.
  assert.throws(() => x < d.dec`20`, (e) => e instanceof TypeError && /\blt\b/.test(e.message));
  assert.throws(() => x * 2, TypeError);
  assert.throws(() => Number(x), TypeError);
  assert.throws(() => -x, TypeError);
  assert.equal(`${d.dec`-0`}`, "-0");              // the sign survives the trip
  assert.equal(`${d.dec`1.5E+30`}`, "1.5E+30");    // and so does the specification's spelling
});

// The limit of the above, pinned so that it is a known edge rather than a surprise.
// Copying the fields and dropping the prototype keeps the value and loses the spelling,
// and no hook on the value can prevent it: the clone drops symbol keys whatever they are.
test("a copy without the prototype keeps the value and loses the spelling", () => {
  const x = d.dec`19.99`;
  for (const copy of [{ ...x }, Object.assign({}, x), structuredClone(x)]) {
    assert.equal(`${copy}`, "[object Object]");
    assert.equal(d.isDec(copy), false);
  }
  // Which is why a boundary is crossed as a string.
  assert.equal(s(f(JSON.parse(JSON.stringify({ p: x })).p)), "19.99");
});

// An object with the right fields is not a value. This one used to pass, and one with a
// fractional exponent failed deep inside the arithmetic rather than at the door.
test("only values made here count as values", () => {
  assert.equal(d.isDec(d.dec`1`), true);
  assert.equal(d.isDec({ mant: 5n, exp: 0, negZero: false }), false);
  assert.equal(d.isDec(null), false);
  assert.equal(d.isDec("1"), false);
  assert.throws(() => f({ mant: 5n, exp: 0 }), d.DenaryError);
});

// Raising is the rule, and validating what a person typed is the one place it reads
// wrong: an expected path should not need a try block.
test("tryDec answers with null where dec raises", () => {
  assert.equal(s(d.tryDec("1.5")), "1.5");
  assert.equal(s(d.tryDec(12n)), "12");
  assert.equal(d.tryDec("1,234"), null);
  assert.equal(d.tryDec(""), null);
  assert.equal(d.tryDec("abc"), null);
  assert.throws(() => f("1,234"), d.InvalidLiteral);   // dec still raises
});
// The runtime's digit ceiling is found by probing, which allocates BigInts up to the limit
// and costs about 185 milliseconds. It is cached, so it only ever happened once, on
// whichever operation came first: a multiplication advertised at 35 nanoseconds took 185
// milliseconds cold. The benchmarks never saw it because they warm up.
//
// Nothing with a small mantissa can be near that ceiling, so the question is only asked
// when the answer could change the outcome. This has to run in a fresh process, since the
// answer is cached the moment anything asks.
// The plain form, which is the one a boundary wants. It is the same value toString gives
// and never the exponential spelling, and it neither rounds nor drops a trailing zero.
test("toPlainString writes the value out with no exponent, ever", () => {
  for (const [given, plain] of [
    ["1e3", "1000"], ["1e20", "100000000000000000000"],
    ["1e-30", "0." + "0".repeat(29) + "1"],
    ["0", "0"], ["-0", "-0"], ["2.5", "2.5"], ["-1234.5600", "-1234.5600"],
  ]) assert.equal(d.toPlainString(f(given)), plain, given);

  // The scale survives, so an exact product still says how precisely it is known.
  assert.equal(d.toPlainString(d.mul(d.dec`2.5`, d.dec`4`)), "10.0");
  assert.equal(s(d.mul(d.dec`2.5`, d.dec`4`)), "10.0");

  // Same value as toString in every case, differing only in how it is written.
  for (const g of ["1e3", "1e-30", "-1234.5600", "0.1"])
    assert.equal(d.eq(f(d.toPlainString(f(g))), f(g)), true, g);
});

// Writing a value out can outgrow the runtime, and the way out has to declare that like
// every other ceiling here. Both of these used to be a bare RangeError, which carries no
// code and is not a DenaryError, so a caller catching DenaryError missed them.
test("writing a value out raises the declared error rather than the engine's", () => {
  assert.throws(() => d.toFixed(f("1e9000000000000000"), 0), d.DigitOverflow);
  assert.throws(() => d.toFixed(d.dec`1`, 9e15), d.DigitOverflow);
  assert.throws(() => d.toPlainString(f("1e9000000000000000")), d.DenaryError);
});

// The caches are bounded now, and a bound nothing exercises is a number in a comment.
//
// The eviction has to be the oldest rather than the whole map, because a constant costs a
// series to rebuild and emptying everything to make room for one would trade an allocation
// failure for a stall. The two are told apart here: after one entry over the bound, a
// wholesale clear leaves only the newest, and dropping the oldest leaves the rest.
test("memo holds its bound and gives up the oldest to keep it", () => {
  let computed = 0;
  const twice = memo(3, (k) => { computed++; return k * 2; });

  assert.equal(twice(1), 2);
  assert.equal(twice(1), 2);
  assert.equal(computed, 1, "a hit does not recompute");

  twice(2); twice(3);
  assert.equal(computed, 3);
  twice(1); twice(2); twice(3);
  assert.equal(computed, 3, "three fit, and reading them does not evict");

  twice(4);
  assert.equal(computed, 4);
  twice(2); twice(3); twice(4);
  assert.equal(computed, 4, "the three newest survived, so the map was not emptied");
  twice(1);
  assert.equal(computed, 5, "and the one that went is the oldest");
});

// The constants travel with their error, so a stale entry would be wrong rather than slow.
test("a memoised constant is the same value it computed the first time", () => {
  const P = { digits: 60 };
  const first = d.toString(d.ln(d.dec`3`, P));
  for (let i = 0; i < 40; i++) d.exp(d.dec`1.5`, { digits: 20 + i });   // past the bound
  assert.equal(d.toString(d.ln(d.dec`3`, P)), first);
});

// The ceiling is meant to be declared rather than discovered, and on one path it was
// neither. pow10 filled its table from its current length up to whatever index was asked
// for, which stores k values averaging k/2 digits and so costs the square of the index.
// Counting the digits of a sixty thousand digit number left 856MB resident, and the eight
// bytes "1e999999" reached an allocation failure that no try block can catch. Sixty
// thousand digits is five thousand times below the ceiling that was supposed to stop it.
//
// The cap on the heap is what makes this a test rather than a timing. Both answers need a
// couple of hundred megabytes; the old table needed tens of gigabytes to reach the same
// two numbers, so it dies and the child's exit code carries that.
test("a large exponent is answered rather than fatal", () => {
  const { execFileSync } = require("node:child_process");
  const src = JSON.stringify(new URL("../../src/index.ts", import.meta.url).href);
  const out = execFileSync(process.execPath,
    ["--experimental-strip-types", "--max-old-space-size=512", "-e", `
      const d = await import(${src});
      console.log(d.digits(10n ** 60000n));
      console.log(d.digits(d.quantize(d.dec("1e999999"), { scale: 0 }).mant));
    `], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.deepEqual(out.trim().split("\n").map(Number), [60001, 1000000]);
});

test("the first operation does not stop to measure the runtime", () => {
  const { execFileSync } = require("node:child_process");
  const out = execFileSync(process.execPath, ["--experimental-strip-types", "-e", `
    const t0 = process.hrtime.bigint();
    const d = await import(${JSON.stringify(new URL("../../src/index.ts", import.meta.url).href)});
    d.add(d.dec\`1.5\`, d.dec\`2.5\`);
    console.log(Number(process.hrtime.bigint() - t0) / 1e6);
  `], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const ms = Number(out.trim());
  assert.ok(ms < 120, `import and first add took ${ms}ms, which means the probe ran`);
});
