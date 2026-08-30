# Declared differences

Every point where denary's result or contract differs from the General Decimal
Arithmetic specification or from decimal.js, with the reason.

**This ledger is machine-checked.** Gate H compares against decimal.js over the same
2,631 cases, from answers recorded with its version, and fails on any difference not declared in
[`../test/peers/rules.mjs`](../test/peers/rules.mjs). It is a contract, not prose.

When we and decimal.js disagree, the oracle decides which of us is wrong. decimal.js is
the thing being replaced and guarantees nothing about rounding, so it cannot be the judge. A difference is the peer's error, ours, or a declared design choice.

## Against the specification

| Point | Specification | denary | Why |
|---|---|---|---|
| `sqrt` rounding mode | always half-even | **honours the caller's mode** | The remainder-based proof holds for every mode. Requiring a precision argument and then ignoring a field inside it is worse than exceeding the specification. A superset. |
| `05up` rounding | round-for-reround, one of the specification's eight modes | **absent**, seven are provided | It exists to let an intermediate be rounded again later without a double rounding error, which is a need this does not create: an exact operation does not round at all, and an approximate one is rounded once, at the precision the caller named. 170 of the specification's testcases use it and are reported as not applicable rather than skipped quietly. |
| `NaN`, `Infinity` | in the value domain | **absent; operations raise** | A NaN found far from its origin has erased it. |
| `exp`, `ln` accuracy | correct rounding recommended, **up to 1 ulp permitted** | **correctly rounded** | The allowance is not used. |
| undecidable rounding | not specified | **`IndeterminateRounding`** | No practical guard bound exists for arbitrary precision. A value we cannot justify is worse than no value. |
| `toPlainString` | not in the specification, which defines `to-scientific-string` and `to-engineering-string` and stops | **provided**, spelled as Java's `BigDecimal` spells it | `to-scientific-string` is what the value is; the plain form is what a response body, a `NUMERIC` parameter and a receipt want, and `1e3` printing as `1E+3` reaches all three. Nothing is lost or rounded, so this adds a spelling rather than a behaviour. |
| `cbrt` | not in the specification | provided | No ideal-exponent rule exists for it, so gate A compares `cbrt` **by value only** and says so. |
| sign of a zero sum under `floor` | `1 + -1` is **`-0`** when rounding toward negative infinity | **`0`** | The rule belongs to a rounded addition, and addition here is exact and takes no rounding mode (hard rule 1). There is nowhere for the mode to act. Rounding itself keeps the sign: `quantize(-0.4, {scale: 0})` is `-0` in every mode. |
| trigonometry | `sin` etc. not defined for decimal | provided, tier 3 | No arbitrary-precision decimal library offers correctly-rounded trigonometry. Python, Java, Rust and Go have no API at all, and decimal.js gives no guarantee. The oracle is MPFR. |

## Against decimal.js

| Point | decimal.js | denary | Why |
|---|---|---|---|
| multiplication | rounded to the global `precision` | **exact** | Closed over decimals; there is nothing to round (hard rule 1). |
| precision for `div` | global configuration | **required argument, compile-time** | A global is a decision made where the caller cannot see it (hard rule 2). |
| `x / 0` | `Infinity` | **raises `DivisionByZero`** | Hard rule 4. |
| equality | by value; the constructor discards scale, so there is nothing else it could be | **by value, and the scale survives**, so `2.0` equals `2.00` and each still prints as written | The row here used to say decimal.js was scale-sensitive. It is not: `new Decimal("2.0").equals("2.00")` is `true`. The trap being described is Java's `BigDecimal.equals` (hard rule 8), which decimal.js avoids by throwing the scale away and this avoids by not letting scale into the comparison. |
| trailing zeros | the constructor normalises the coefficient, so `2.5 * 4` is `10` | **the exponent the specification gives**, so `2.5 * 4` is `10.0` and `1.10 + 2.90` is `4.00` | A scale is a statement about how precisely something is known, and an amount quoted to the cent is not the same claim as one quoted to the unit. Gate H puts 424 of the corpus here. It used to score them as agreement, because the comparison asks `cmp` and `cmp` is by value on purpose. |
| output format | `toExpNeg` / `toExpPos` settings, and a lowercase `e` | **specification `to-scientific-string`, fixed**, with a capital `E` | If the specification is the semantic authority, the output format comes from it too. Gate H puts 428 of the corpus here, separately from the 424 above, because the two have different causes and only one of them is about what the value is. |
| digit ceiling | `MAX_DIGITS = 1e9`, unreachable | **derived from the runtime and declared** | At O(n²) one multiplication at 1e9 digits takes roughly twenty years. An unreachable limit is not a contract (hard rule 7). |
| exponent ceiling | `EXP_LIMIT = 9e15`, then `Infinity` | **raises `ExponentOverflow`** | Hard rules 4 and 7. |
| rounding surface | `toDP` / `toSD`, mode from a global | **`round` / `quantize`, mode as an argument** | Two operations, two names; the mode travels with the call. |
| "was it exact?" | not answerable | **`*Status` returns `exact` and `direction`** | A guarantee that is never reported still leaves the caller unsure. |
| a value in a numeric context | a plain object gives `"[object Object]"` | **raises**, or answers inside a marker | `price * 2`, `price < other` and `Number(price)` raise and name the function to use. `+` cannot say whether the other side is text, so raising there would end a log line inside code the caller does not own, and answering plainly would make `price + 1` into `"19.991"`. It answers `"[decimal 19.99]"` instead: the log keeps the number and the mistake cannot pass for arithmetic. A template, `String`, `toString`, `join` and `JSON` all give the bare value. |
| `a < b` | **`false` for `9 < 10`**, comparing as text | **raises `TypeError`**, naming `lt` | The operators cannot be made to work, and answering as text answers wrongly. |
| aliases | 43 pairs (`plus`/`add`, `times`/`mul`, …) | **one name each** | `grep add` should narrow. |
| `log[1048576](4503599627370502)` | **returns a wrong value** (documented in its own source) | correctly rounded, or raises | Rounding is not guessed. |

## Evidence

Gate H's own output, on a case from the corpus:

```
5652600335.41 + (-0.00000000000000006435)
  denary      5652600335.40999999999999993565   ← matches the oracle
  decimal.js  5652600335.41                     ← the addend vanished
```

Across the corpus: 1,818 agreements, 813 differences all covered by the declared rule
that exact operations are not rounded, and zero undeclared differences.

## Not yet settled

- Trigonometric boundary behaviour is compared against MPFR but has no constructed
  boundary corpus (gate C cannot construct one through π reduction).
- `scale`-precision boundaries are not constructed.
