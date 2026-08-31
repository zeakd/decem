# Invariants

Rules the product keeps. The gates (`pnpm check`) enforce them; changing one is a
deliberate act, not a drive-by edit. Where we deliberately differ from the specification
or from decimal.js: [`differences.md`](differences.md).

## Ten hard rules. Shipping blockers

1. **`add`, `sub`, `mul`, `sum` and integer `pow` are exact.** They are closed over
   decimals, so there is nothing to round and no precision parameter exists. Digits
   grow; the caller shortens them by asking. A library that rounds a product has
   quietly decided something the caller did not ask for. A settlement that
   splits a total N ways only balances if `base * N` is exact.

2. **Approximate operations require a precision, and omitting it is a compile error.**
   No global default, because a global is a decision made somewhere the caller cannot
   see. Java's `BigDecimal` raises at runtime; being a type error is the same rule
   enforced earlier. The guarantee is tiered by how predictable the cost is, not by
   quality. See *Accuracy tiers* below.

3. **The mantissa is a `BigInt`; decimal length is found by binary search over a
   power-of-ten table.** `toString().length` is forbidden: it costs 300–900× more at
   1,600 digits, and the length is needed on every rounding path.

4. **`NaN` and `Infinity` are not values here.** `1/0` throws. A NaN that appears a
   hundred lines from where it was created has erased its own origin; an exception
   carries it.

5. **The string form is cached on the value.** Values are immutable, so this is safe,
   and decimal output is where a `BigInt` mantissa is structurally weaker than a digit
   array, and caching removes the repeat cost.

6. **Rounding decisions never inspect individual digits.** Peeking at "the digits
   after the rounding position" is O(n) on a `BigInt`. The decision is made by
   rounding both ends of a certified interval and comparing:
   `round(y − ε, p) == round(y + ε, p)`.

7. **Limits are declared on two axes, and we raise before the engine does.**
   Digits (how long the mantissa is) come from the runtime's `BigInt` ceiling;
   magnitude (how far the point is) comes from the safe-integer range, `±9e15`.
   They are independent: a one-digit mantissa can still overflow the exponent.
   Engine out-of-memory messages differ per runtime and are hard to catch, so
   `DigitOverflow` and `ExponentOverflow` come from us. The probed digit ceiling is
   rounded down before it is declared, since a limit that moves between runs is not a
   contract.

8. **Equality compares values, not scales.** `2.0` equals `2.00`. Java's `BigDecimal`
   lets scale leak into `equals`, so `2.0` and `2.00` both live in a `HashSet`; that
   trap is closed here. Use `scaleOf` when the scale is what you mean.

9. **When rounding cannot be decided, we raise instead of guessing.** No finite guard
   bound exists for arbitrary-precision transcendentals, and the known bounds cover
   fixed formats only. The Ziv loop starts at `p + 3`, grows geometrically, and stops
   at `maxDigits` with `IndeterminateRounding`. decimal.js assumes a result is exact
   after fourteen nines and ships a documented case where that is wrong.

10. **Exponents follow the ideal-exponent rules of the General Decimal Arithmetic
    specification.** `1.5 × 2` is `3.0`, not `3`. Trailing zeros are not stripped
    behind the caller's back; `2.50` stays `2.50`. Consistency across operations is
    the contract, since stripping in one place silently breaks code that relies on another.

## Accuracy tiers

Every operation returns a correctly-rounded result or raises.

None returns a wrong value. The tiers say how predictable the cost of getting there is.

| Tier | Operations | Contract |
|---|---|---|
| 1 | `div` `sqrt` `cbrt` | Correctly rounded, and cannot raise, because an integer remainder decides in finitely many steps. |
| 2 | `exp` `ln` `log10` `pow` | Correctly rounded, or raises. Working precision is **independent of the input**. |
| 3 | `sin` `cos` `tan` | Correctly rounded, or raises. Working precision **grows with how close the input is to a multiple of π**. |

Tier 3 is not lower quality. Argument reduction for trigonometry subtracts multiples
of π, an irrational number, so an input near `kπ` cancels away significant digits, and
nothing bounds how close an input can be. Across 378 ordinary and deliberately
adversarial cases, and 1,890 constructed rounding boundaries reached through asin, acos
and atan, we have never observed a raise, and retries grow linearly with closeness,
about one per forty digits. Even so, "not observed" is not "cannot happen".

## Two operations, two names

`round(x, { digits })` fixes the number of significant digits and preserves magnitude.
`quantize(x, { scale })` fixes the exponent. Passing the wrong form to either is a type
error. Merging them under one name would hide a difference instead of removing a
duplicate; Java and Python split them too.

## Knowing whether a result was exact

Guaranteeing correct rounding is half of it, because a guarantee that is never reported still
leaves the caller unsure. `divStatus`, `sqrtStatus`, `roundStatus` and `quantizeStatus`
return `{ value, exact, direction }`, in the spirit of MPFR's ternary value and Python's
`Inexact` signal. The transcendental functions have no status form: apart from special
values that short-circuit, their results are essentially never exact, and a flag that is
always `false` is not information.

## Standards position

- IEEE 754-2008/2019 place `exp`, `log` and `sin` among *recommended* operations, but
  implementing one as a conforming operation requires correct rounding. Tiers 1 and 2
  meet that.
- The General Decimal Arithmetic specification permits up to 1 ulp of error for `exp`
  and `ln`. That allowance is not used.
- The specification fixes `sqrt` to round-half-even. decem honours the caller's mode
  instead: the remainder-based proof holds for every mode, and silently ignoring a
  field inside a required argument is worse than exceeding the specification.

## The gates

| | Gate | What it checks | Command |
|---|---|---|---|
| A | Oracle | 2,631 cases against Python `decimal` (libmpdec) and MPFR | `check:oracle` |
| B | Algebraic laws | associativity, distributivity and commutativity, exactly, byte for byte | `check:laws` |
| C | Boundary hunt | 5,355 *constructed* rounding ties | `check:boundary` |
| D | Runtime matrix | byte-identical results on Node, Bun, Deno, Chrome | `check:runtime` |
| E | Type contract | the promised compile errors must actually occur | `check:contract` |
| F | Performance | regression against a per-runtime baseline | `check:bench` |
| G | Coverage declaration | every exported operation declares which gates cover it | `check:coverage` |
| H | Three-way comparison | us vs decimal.js vs the oracle; undeclared differences fail | `check:peers` |
| I | Error bound | the transcendental corpus is identical with the bound inflated | `check:bounds` |
| J | Memory budget | sizes between the corpora and the ceiling, each inside a declared heap | `check:memory` |

## One check that is not a gate

The specification that defines correct rounding also publishes test vectors, and they are
a sharper corpus than generated cases: they are what the author of the specification
thought was worth writing down. `pnpm check:conformance` runs 8,956 of them: 8,944 agree
exactly, and the other twelve are one declared difference.

They are compared as written, not by value. The specification fixes the exponent
of a result as well as its magnitude, so `1.1 + 2.2` is `3.3` and not `3.30`, and a right
number with the wrong number of digits is a different answer for a decimal. Comparing by
value alone would have accepted that, and did until the comparison was tightened.

It is not part of `pnpm check`. The files are marked all rights reserved and cannot be
committed here, so it reads them from wherever they already exist, says so when it cannot
find them, and exits without claiming to have passed. Everything it declines to
compare is counted under a reason, listed in
[`test/conformance/README.md`](../test/conformance/README.md).

It found a defect the gates could not. `ln` recognised an argument of one by inspecting
the mantissa, so `1.0` and `1.000` were not recognised and went to the series, which
cannot settle on an exact zero. The gates generate arguments; the specification's cases
also vary the spelling.

Gate I checks the one claim the others rest on. A transcendental is correctly rounded
because the retry loop stops when both ends of an interval round alike, and the interval
comes from an error the implementation declares for itself. A declared error smaller than
the real one stops the loop early and returns a confidently wrong digit, on inputs that no
random case reaches. Inflating the bound only makes the loop more conservative, so a true
upper bound gives the same answers at any inflation, and an answer that moves proves the
smaller one was load-bearing.

Cutting `exp`'s bound to a tenth passes gate A untouched and is caught here. Cutting it in
half is caught by nothing, because no answer in the corpus actually moves.

That is the honest limit. This shows a bound is not load-bearing, not that it is correct,
and the second needs a proof, not a test.

**We do not write our own oracle.** Checking an implementation against itself makes the
same mistake twice. The reference is Python's `decimal` module, which guarantees correct
rounding for the operations it covers, and MPFR for the rest. Their answers are committed
alongside the cases. That is what lets the gates run from a clean clone with no Python,
and what makes a change in either library show up as a diff instead of quietly redefining
what counts as correct.

Gate H needs the same argument made once more.

decimal.js is not an oracle: it is the thing being replaced and it guarantees nothing about
rounding. So when the two of us disagree, the oracle is what decides which is wrong, and a
difference is either the peer's error, ours, or a design choice declared in
[`differences.md`](differences.md).

**When you add a gate, write down what it does not check.** A gate without a coverage
statement can be green and still not be a verdict. That is what gate G forces, and
`test/coverage/declared.json` records the holes with their reasons.

Gate C is the one that earns its keep. Random inputs essentially never land on a
rounding tie, so passing gate A does not demonstrate correct rounding. When
`half-even` was deliberately broken into `half-up`, gate A missed it across all 2,631
cases and gate C caught 45, every one of them on a tie. Details and the defect-injection
results: [`../test/boundary/README.md`](../test/boundary/README.md).
