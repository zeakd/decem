// Gate E: the type contract.
//
// No runtime test reaches this. The claim is that certain mistakes are stopped at compile
// time, so the compiler is what has to grade it.
//
// The expect-error directive is self-checking: if the line below one does not error, the
// directive itself becomes the error. A passing file therefore means both halves hold,
// that what should be refused is refused and what should compile still compiles.
import * as d from "denary";

const a = d.dec`1`;
const b = d.dec`3`;

// What must not compile.
// @ts-expect-error div requires a precision, and unlike Java this is caught at compile time
d.div(a, b);

// @ts-expect-error round requires one too
d.round(a);

// @ts-expect-error round takes digits only; decimal places go to quantize
d.round(a, { scale: 2 });

// @ts-expect-error quantize takes scale only; significant digits go to round
d.quantize(a, { digits: 2 });

// @ts-expect-error a context object existed once and was removed after measurement
d.context({ digits: 20 });

// @ts-expect-error a number has already lost precision, so fromNumber has to be explicit
d.dec(0.1);

// @ts-expect-error integers are refused as well, because an exception would not be a rule
d.dec(1);

// @ts-expect-error the mode carries the assumption, so it has no default to inherit
d.fromNumber(0.1);

// @ts-expect-error a shape with the right fields is not a value; only make produces one
d.add({ mant: 5n, exp: 0, negZero: false }, d.dec`1`);

// @ts-expect-error and neither is a shape with a fractional exponent, which used to fail
// deep inside the arithmetic instead of here
d.mul(d.dec`1`, { mant: 5n, exp: 1.5, negZero: false });

d.tryDec("1.5");
d.isDec(d.dec`1`);

// @ts-expect-error digits and scale are mutually exclusive
d.div(a, b, { digits: 10, scale: 2 });

// @ts-expect-error mul is exact and has no precision parameter
d.mul(a, b, { digits: 20 });

// @ts-expect-error the same holds for add
d.add(a, b, { digits: 20 });

// @ts-expect-error the rounding mode is a string union, so neither a typo nor a magic number passes
d.div(a, b, { digits: 10, rounding: "nearest" });

// @ts-expect-error the numeric mode decimal.js uses
d.div(a, b, { digits: 10, rounding: 4 });

// @ts-expect-error a precision cannot stand in for the second operand
d.div(a, { digits: 10 });

// @ts-expect-error an arbitrary object shaped like a value is still not one
d.add(a, { mant: 1, exp: 0, negZero: false });

// @ts-expect-error the dec tag refuses interpolation, which would be a side door for a number
d.dec`${1}`;

// @ts-expect-error fromInt is for counting values; fractions go through from
d.fromInt("3");

// @ts-expect-error sqrt is approximate and requires a precision
d.sqrt(a);

// @ts-expect-error so is cbrt
d.cbrt(a);

// @ts-expect-error pow with an integer exponent is exact and takes no precision
d.pow(a, 2, { digits: 20 });

// @ts-expect-error a decimal exponent makes it approximate, so a precision is needed
d.pow(a, b);

// @ts-expect-error exp requires one
d.exp(a);

// @ts-expect-error and so does ln
d.ln(a);

// @ts-expect-error trigonometry is approximate too
d.sin(a);

// @ts-expect-error internals are not exported
d.make(1n, 0);

// What must compile. An error here would mean the contract is too tight.
d.div(a, b, { digits: 20 });
d.div(a, b, { digits: 20, rounding: "half-even" });
d.div(a, b, { scale: 2 });
d.div(a, b, { scale: 2, rounding: "floor" });
d.round(a, { digits: 5 });
d.quantize(a, { scale: 0, rounding: "ceil" });
const _r: d.Rounded = d.divStatus(a, b, { digits: 20 });
const _ex: boolean = _r.exact;
const _dir: -1 | 0 | 1 = _r.direction;
void [_r, _ex, _dir];

try { d.div(a, b, { digits: 1 }); } catch (e) {
  if (e instanceof d.DenaryError) {
    const _c: d.DenaryCode = e.code;
    const _d: d.DenaryDetails = e.details;
    void [_c, _d];
  }
}
d.mul(a, b);
d.add(a, b);
d.sum([a, b]);
d.dec`0.1`;
d.dec(1n);
d.dec(a);
// The parentheses are for a value that arrived; the backticks are for a literal. One name,
// because it is one operation, and the syntax already says which.
declare const arrived: string;
d.dec(arrived);
d.fromNumber(0.1, "exact");
d.fromNumber(0.1, "shortest");
d.dec`1250000`;
d.dec`-0.007`;
d.fromInt(7);
d.sqrt(a, { digits: 20 });
d.cbrt(a, { scale: 4 });
d.pow(a, 12);
d.pow(a, b, { digits: 30 });
d.exp(a, { digits: 30 });
d.ln(a, { scale: 10 });
d.log10(a, { digits: 30 });
d.sin(a, { digits: 30 });
d.cos(a, { scale: 10 });
d.tan(a, { digits: 30, rounding: "floor" });
d.toFixed(a, 2);
const _plain: string = d.toPlainString(a);
void _plain;
d.toExponential(a, 5);
const _n: number = d.toNumber(a);
const _b: bigint = d.toBigInt(a);
void [_n, _b];

// Return types stay narrow.
const _cmp: -1 | 0 | 1 = d.cmp(a, b);
const _eq: boolean = d.eq(a, b);
const _s: string = d.toString(a);
const _dec: d.Dec = d.mul(a, b);
void [_cmp, _eq, _s, _dec];

// The operators, which docs/values.md claims the compiler stops and nothing was checking.
//
// `a < b` is the exception and is pinned rather than expected to fail: TypeScript permits
// a relational operator between two operands of the same type, so it compiles and raises
// on first execution instead. The README says exactly that, and a compiler that started
// refusing it would make the sentence false with nothing to notice.
void (a < b);

// @ts-expect-error the arithmetic operators are refused
void (a * 2);
// @ts-expect-error including the one that would produce "19.991"
void (a + 1);
// @ts-expect-error and the assignment that would smuggle a decimal into a number
const _asNumber: number = a;
void _asNumber;
// @ts-expect-error a decimal compared against a number is refused, unlike two decimals
void (a < 20);
