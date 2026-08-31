# Gate A: oracle comparison

We do not write our own oracle. Checking an implementation against itself makes the same
mistake twice, so the reference is Python's `decimal` module (libmpdec), which guarantees
correct rounding for `+ - * / sqrt exp ln log10`, and MPFR for everything libmpdec does
not cover.

## The flow

```
gen-cases.mjs      cases/*.jsonl       deterministic generation, fixed seed
oracle.py          expected/*.jsonl    the answers, computed by libmpdec and MPFR
verify-oracle.py                       checks the oracle itself, before anything trusts it
compare.mjs                            decem against the committed answers
```

## Running it

The answers are committed, so **the gate itself needs no Python**. Python is only for
regenerating them or adding cases.

`uv` resolves the interpreter and `gmpy2` on demand and caches them, so there is no
environment to create or keep in step. It is pinned in [`mise.toml`](../../mise.toml).

```sh
uv run --with gmpy2 python test/oracle/verify-oracle.py   # is the oracle trustworthy? first
node                       test/oracle/gen-cases.mjs      # regenerate cases, same seed
uv run --with gmpy2 python test/oracle/oracle.py          # recompute answers
node                       test/oracle/compare.mjs        # run the gate
```

`gmpy2` links against the system MPFR and GMP (`brew install mpfr gmp`, or
`libmpfr-dev libgmp-dev`). Without it those cases are marked `noOracle` and the gate
reports that it is skipping them, rather than passing in silence.

## Why the cases and answers are committed

The gate then runs from a clean clone with no Python, which is what makes the claims
checkable by someone who is not us. It also means a change in libmpdec or MPFR shows up
as a diff in `expected/` instead of silently redefining what counts as correct.

That only works if generation is deterministic. Using `Math.random` would change the
cases on every regeneration, and a diff could no longer distinguish a changed oracle from
a changed corpus.

## The oracle does not pick its precision by formula

For the MPFR paths, the precision is raised until the answer stops moving: compute at P
and at 2P, round both to the requested digits, and accept only when they agree.

A formula was tried first and came up short twice, both times caught by gate C, and both
times the oracle rather than decem turned out to be wrong.

- `cbrt` at a constructed tie: 30 cases, because `exp(ln(x)/3)` cannot resolve a
  boundary. That path now goes to MPFR directly.
- `exp` at a boundary built through its inverse: 6 cases, where the deviation sat at the
  101st digit and the oracle was working to 97.

An oracle that cannot detect its own shortfall is not a reference. When the loop runs out,
the case is recorded as `noOracle: undecidable` rather than given an answer.

## What verify-oracle checks

1. **Known values** that cannot be got wrong: `1/3`, `log10(1000)`, `sqrt(4)`, `exp(0)`.
2. **Self-consistency**: the result at p digits equals the result computed at p+60 and
   then rounded to p. For a correctly-rounded oracle these must agree, and this catches
   an oracle bug without anyone knowing the right answer in advance.
3. **Round trips**: `exp(ln(x))` and `sqrt(x)^2` land within an ulp.
4. **The Inexact flag** actually reports whether rounding occurred.

## What this gate does not check

- **Rounding boundaries.** Random cases essentially never land on a tie, so passing here
  says little about rounding. That is gate C's job.
- **`scale` precision.** The corpus covers `digits` only.
