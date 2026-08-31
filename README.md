# decem

**A modern decimal library for TypeScript, built on `BigInt`.**

The decimal libraries in wide use were designed before the language had one. decimal.js is
from 2014, four years earlier, and a `number[]` in base 1e7 was the right answer then. It
ships an `.mjs` today, but behind it is the same array, the same global precision, and
type declarations kept by hand beside the code.

The representation is what dates a decimal library. decem starts from a `BigInt` mantissa,
which makes exact multiplication affordable, and the rest follows from that.

The types carry the contract. Leaving out a precision does not compile, and neither does
passing a `number`, which has already lost the digits you came here for. The declarations
are generated from the source, and one of the gates runs the same 776 results on Node, Bun,
Deno and Chrome and requires all four to agree byte for byte.

## The part you feel first

There is no global precision. decimal.js and big.js each keep one number, set once
somewhere, that decides how much of your result survives. Change it in a test file and
your invoice totals move. Here is what it costs at its default of 20:

```ts
// decimal.js
new Decimal("5652600335.41").plus("-0.00000000000000006435").toString();
// "5652600335.41"                   the second number is gone

// decem
toString(add(dec`5652600335.41`, dec`-0.00000000000000006435`));
// "5652600335.40999999999999993565"
```

Nothing warned. The addend was rounded away to fit a precision nobody named, and what came
back is a plausible number, which is the worst kind of wrong.

Addition and multiplication are exact. They take no precision at all, and everything that
does round asks you how precisely, on the line where you asked for it, so the decision is
never somewhere else.

```sh
npm install decem
```

## Where it pays off

Split a bill seven ways and hand out the remainder. Everyone gets the same share except
for the few won left over, and the check only balances if `base × n` is exact:

```ts
import { dec, fromInt, mul, sub, add, sum, lt, div, eq } from "decem";
// A file that does several kinds of arithmetic can take the whole surface as a namespace
// instead: `import * as dn from "decem"`. The two bundle to the same bytes, so it is a
// choice per file rather than a cost.

const WON = { scale: 0, rounding: "floor" } as const;   // floor, not down: it has to hold for a refund too
const total = dec`13596000`;
const n = 7;

const base = div(total, fromInt(n), WON);             // 1942285
const remainder = sub(total, mul(base, fromInt(n)));  // 5, exactly

const shares = [];
for (let i = 0; i < n; i++)
  shares.push(lt(fromInt(i), remainder) ? add(base, dec`1`) : base);

eq(sum(shares), total);   // true, and it is true because mul did not round
```

That last line is the whole library. A library that rounds products leaves it off by a
unit, and the code that caused it looks fine.

## Getting a value in

```ts
dec`19.99`                    // written here in the source
dec(row.price)                // a string or a bigint that arrived at run time
fromInt(n)                    // a count or an index
fromNumber(v, "shortest")     // a float64, with the assumption said out loud
tryDec(field)                 // the same parse, answering null instead of raising
```

`tryDec` is the door for anything a stranger sent. Raising is the rule elsewhere, but a
field a person typed fails as a matter of course, and wrapping every form in `try` turns an
error into control flow. It answers `null` for anything unparseable, and the compiler will
not let that past unchecked. It does accept surrounding whitespace: it answers "is this a
number", not "is this a tidy field".

The two prefixes mark where precision is at stake. `dec` builds a value out of decimal text
and loses nothing, in either syntax. `fromInt` and `fromNumber` cross from JavaScript's own
number types, so one refuses anything but a safe integer and the other will not move until
you say which reading of the float you meant.

`dec` does not accept a `number`. By the time `0.1` reaches any function it is already
`0.1000000000000000055511151231257827`, and a constructor cannot tell which of the two you
meant. Other libraries pick one and say nothing. `fromNumber` makes you pick, and
`"shortest"` is the answer they would have given, which makes it the door for a float you
computed. For one a client sent, you do not know what they typed, so there is no assumption
of yours to state; take the string instead, or reject the field.

Going out, anything that asks for text gets the value and anything that asks for a number
raises and names the function to use:

```ts
`${price}`                    // "19.99", and so do String, toString, join and JSON
price * 2                     // does not compile, and raises: use mul
price < other                 // raises: use lt
```

The operators are not being taken away. They were never working:

```ts
new Decimal(9) < new Decimal(10);   // false
```

An object cannot make `<` compare numbers. It can only make it look as though it did, by
handing the operator a string and comparing that.

So the choice is not between an operator and a function call. It is between finding out on
the line that wrote it and finding out from an invoice.

`+` cannot be settled by refusing, because it cannot tell text from arithmetic: `price + 1`
and `"paid " + price` arrive identically. Raising would stop the mistake and also the log
line, inside code you may not own, and a diagnostic should not be able to end a request.
Answering plainly would turn `price + 1` into `"19.991"`, a wrong number wearing the shape
of a right one. So it answers with the value inside a marker:

```ts
"paid " + price               // "paid [decimal 19.99]"
price + 1                     // "[decimal 19.99]1"
```

The log keeps the number, and the arithmetic cannot pass for arithmetic.

To a wire, a column or a person, use `toPlainString`. `toString` is the specification's
`to-scientific-string`, which is what the value is and not how you want it written, so
`dec\`1e3\`` prints as `1E+3` and a client that parses the body as text gets that. Arithmetic
does not launder it either: an exponent is carried through, so a client that sent `1e3` gets
`3E+3` back out of a multiplication and `toJSON` puts that in the body. Correct, and not what
you wanted:

```ts
toString(dec`1e3`)            // "1E+3"
toPlainString(dec`1e3`)       // "1000", never an exponent, nothing rounded
toFixed(price, 2)             // "19.99", and raises rather than cut a digit
```

`toFixed` asserts, it does not round. If the value has more places than you asked for it
raises and names `quantize`, so the rounding stays a decision you made.

Both edges are set out in [`docs/values.md`](docs/values.md), with what the type checker
catches before any of it runs.

## Exact and approximate are different, so the types are different

`add`, `sub`, `mul`, `sum` and integer `pow` are closed over decimals, so there is nothing
in them to round. The parameter does not exist. Everything else requires one, and forgetting
it is not a default you inherit but a program that will not build:

```ts
div(dec`1`, dec`3`)                    // compile error: precision is required
div(dec`1`, dec`3`, { digits: 20 })    // 0.33333333333333333333
div(dec`10`, dec`3`, { scale: 2 })     // 3.33
```

```ts
type Precision =
  | { digits: number; rounding?: Rounding }   // significant digits, for science
  | { scale:  number; rounding?: Rounding }   // decimal places, for money
```

The two forms are mutually exclusive and supplying both is a type error. Rounding on its
own is two operations, so it has two names: `round(x, { digits })` keeps the magnitude and
`quantize(x, { scale })` pins the exponent.

Default rounding is `half-even`, as in IEEE 754 and in accounting.

## What you get, and what you get told

Every operation returns a correctly-rounded result or raises. None returns a wrong value.

What the tiers differ in is how predictable the cost of that is:

| Tier | Operations | Contract |
|---|---|---|
| 1 | `div` `sqrt` `cbrt` | Correctly rounded. Cannot raise, since an integer remainder decides in finitely many steps. |
| 2 | `exp` `ln` `log10` `pow` | Correctly rounded, or raises. Working precision does not depend on the input. |
| 3 | `sin` `cos` `tan` | Correctly rounded, or raises. Working precision grows with how close the input is to a multiple of pi. |

Tier 3 is not lower quality. Trigonometric reduction subtracts multiples of pi, so an input
near `k*pi` cancels away significant digits, and nothing bounds how close an input can be.
Across 378 ordinary and deliberately adversarial cases, and 1,890 boundaries built through
the inverse functions, nothing has ever raised. "Never observed" is weaker than "cannot
happen", so it is not promised.

Correct rounding is half the job. The algebraic operations also say whether rounding
happened, as MPFR returns a ternary value:

```ts
divStatus(dec`1`, dec`2`, { digits: 20 })   // { value: 0.5,   exact: true,  direction:  0 }
divStatus(dec`1`, dec`3`, { digits: 20 })   // { value: 0.333…, exact: false, direction: -1 }
```

Limits are declared instead of discovered. The digit ceiling comes from the runtime's
`BigInt` capacity and the magnitude ceiling from the safe-integer range, and both raise
before the engine runs out of memory. They are independent: a one-digit mantissa can
still overflow the exponent.

## Compared with decimal.js

Four lines of decimal.js. Nothing raises.

```ts
new Decimal("9999999999.99").times("1.000000000001");   // 10000000000
new Decimal(0.1 + 0.2).eq(new Decimal("0.3"));          // false
new Decimal("19.985").toFixed(2);                       // "19.99"
new Decimal(1).div(0);                                  // Infinity
```

None of it was decided where you can see it. A global set how much of the product survives,
and the answer is a round integer that is not one. Another global picked half-up for the
money. The constructor took the float as it arrived, already 0.30000000000000004. The
division had no answer and returned one anyway, and `Infinity` travels far from the operand
that made it.

The tell is in the library itself. It ships `Decimal.clone()` so code can escape settings it
did not choose: a second class, to get out from under the first one's globals.

Here the same four have nowhere else to be decided:

```ts
mul(dec`9999999999.99`, dec`1.000000000001`);   // 9999999999.99999999999999
dec(0.1 + 0.2);                                 // does not compile: dec takes no number
quantize(dec`19.985`, { scale: 2 });            // 19.98, half-even, and it is written here
div(dec`1`, dec`0`, { digits: 20 });            // raises DivisionByZero
```

There is no global to set, because nothing reads one. A product does not round, so it has
no precision to take. A rounding mode is a word in the call that uses it, and a question
with no answer gets no value.

### The contract is in the type system, not in the documentation

```ts
div(a, b);                               // does not compile: a precision is required
div(a, b, { digits: 10, scale: 2 });     // does not compile: the two are exclusive
div(a, b, { digits: 10, rounding: 4 });  // does not compile: the mode is a word
dec(0.1);                                // does not compile: a number has lost precision
mul(a, b, { digits: 20 });               // does not compile: mul does not round
price * 2;                               // does not compile
```

decimal.js cannot express any of it, and not because its declarations are poor. A global has
no parameter to require, an integer `4` has no wrong value to reject, and a library whose
precision lives in a mutable field cannot put that field in a function signature. The shape
decides. Thirty of these refusals are a gate here, and the build fails if the compiler ever
accepts one.

`a < b` between two decimals is the case the compiler does not reach. TypeScript refuses a
relational operator on a type carrying `symbol`, and intersecting the value type with
`symbol` does refuse it. It also refuses `${price}`, with a message saying the conversion
will fail at run time, which for this value it does not. We measured the trade: four
operators caught a few seconds earlier, against a compiler saying something untrue about a
value that works. So `a < b` raises on first execution, naming `lt`.

### The rest

| | decimal.js | decem |
|---|---|---|
| Mantissa | `number[]` in base 1e7 | `BigInt` |
| Surface | 102 prototype methods, 43 of them aliased pairs | 47 functions |
| Configuration | 8 globals | none |
| Types | hand-maintained `.d.ts` | generated from the source |

None of this is a disagreement with its author. decimal.js was written four years before
`BigInt` existed, when a base-1e7 digit array was the right answer and exact multiplication
was not affordable, which is why a global precision had to exist at all and why every row
above follows from that one constraint.

Comparison is the row decem loses. On the others they are level on addition and decem is
ahead on parsing, multiplication, division and the transcendentals, with the figures
generated from a run in [`docs/benchmarks.md`](docs/benchmarks.md), which also says why none
of it is the reason to switch.

Every behavioural difference, with the reason for each and a gate that fails the build on
an undeclared one: [`docs/differences.md`](docs/differences.md).

## Verification

The contract above is checked, not asserted. `pnpm check` runs ten gates over this
repository, among them 2,631 cases against Python's `decimal` module and MPFR, and
5,355 constructed rounding ties. The expected values are committed, so all of it runs
from a clean clone without Python.

We do not write our own oracle. An implementation checked against itself agrees with
itself, which is what you would expect, and it makes the same mistake twice without ever
reporting one.

What each gate checks, and what it deliberately does not:
[`docs/invariants.md`](docs/invariants.md).

## Not goals

Drop-in compatibility with decimal.js. Currency and unit types, which belong a layer up, as
TC39's proposal splits `Decimal` from `Amount`. More than about 3.2e5 digits on
JavaScriptCore, where GMP is the right tool.

When TC39's `Decimal` lands it will be Decimal128: 34 digits, fixed. That covers a lot of
work. decem is for when 34 is not enough, or when you want the exactness contract above
instead of a floating format.

## Documents

- `decem/chain`, an opt-in chaining surface kept out of the core so a program that only
  rounds does not ship it: `chain(x).add(y).div(z, p).value`
- [`examples/`](examples/), one question per file, each of them a program that runs
- [`docs/values.md`](docs/values.md), how a value gets in and what happens when it leaves
- [`docs/invariants.md`](docs/invariants.md), the rules the product keeps
- [`docs/differences.md`](docs/differences.md), machine-checked behavioural differences
- [`docs/benchmarks.md`](docs/benchmarks.md), the numbers including the losses
- [`CONTRIBUTING.md`](CONTRIBUTING.md), what a useful correctness report looks like

## Status

Pre-release. The API is not frozen.

MIT
