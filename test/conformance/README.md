# Conformance against the specification's own testcases

The General Decimal Arithmetic specification publishes test vectors. They are a better
adversarial corpus than anything generated here, because they are the cases the author of
the specification decided were worth writing down: the awkward exponents, the ties, the
spellings that look equal and are not.

They are also marked `Copyright (c) IBM Corporation. All rights reserved.`, with no grant
attached, so they are **not committed**. This directory holds the runner only.

```sh
pnpm check:conformance                       # finds the files through the local Python
DECTEST_DIR=/path/to/decimaltestdata pnpm check:conformance
```

CPython ships the files under `test/decimaltestdata`, which is where the runner looks
when it is not told otherwise. With no copy on the machine it says so and exits without
failing, because a check that cannot run has not passed.

## What it compares

`add`, `subtract` and `multiply` are exact here and rounded there, which is a declared
difference. The exact result is rounded to the file's precision before comparing, so the
subject is the arithmetic and the rounding rather than that difference.

Everything is compared as written rather than by value. The specification fixes the
exponent of a result as well as its magnitude, so `1.1 + 2.2` is `3.3` and not `3.30`,
and a division that comes out exact is reduced back toward its ideal exponent. A right
number with the wrong number of digits is a different answer for a decimal.

This was a value comparison at first, which is a weaker check than it looks: it accepts
any spelling. Tightening it surfaced one difference, the sign of a zero sum under `floor`,
which is declared in [`../../docs/differences.md`](../../docs/differences.md).

## What it does not compare, and why it says so out loud

Every case that is not compared is counted under a reason. The reasons are the honest
edges of this implementation rather than a filter tuned until the run is green:

| Reason | Cause |
|---|---|
| infinity or NaN | there is no such value here, by contract |
| exponent range of the file | the files test the edge of a range that is far narrower |
| rounding mode `05up` | round-for-reround, declared in `docs/differences.md` |
| operand beyond the width | exact addition of `1E+999999999` and `1` has a billion digits |

An unrecognised rounding mode is skipped rather than carried forward from the previous
directive. Silently reusing the last one made 157 cases look like arithmetic failures
when the only fault was in this runner.

## What it found

`ln` tested for an argument of one by looking at the mantissa, so `1.0` and `1.000` fell
through to the series. There they could not settle: the retry loop narrows an interval
until both ends round alike, and an interval around an exact zero straddles it however
narrow it gets. `ln(1.000)` climbed toward a ceiling of a hundred thousand digits instead
of returning. Neither the oracle gate nor the boundary gate had a case for it, because
both generate arguments rather than spellings.
