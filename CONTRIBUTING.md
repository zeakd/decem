# Contributing

Issues are welcome, especially small reproducible reports: the inputs, the precision and
rounding you asked for, what you got, and what you expected.

There is no formal pull request policy yet. Saying so is better than leaving it
implied. Discuss a substantial change in an issue first, and keep any proposed pull
request focused until a policy exists.

## What a good correctness report looks like

If you believe a result is wrong, the fastest path is a case we can drop into the oracle:

```
op: div
args: ["1", "3"]
precision: { digits: 20 }
rounding: half-even
got: ...
expected: ...
```

We will add it to `test/oracle/cases/` and let the oracle adjudicate. Note that the
oracle decides, not denary and not your other library. See
[`docs/differences.md`](docs/differences.md) for why decimal.js cannot serve as one.

## Development setup

```sh
mise install        # node, bun, deno, uv, at the versions the gates were measured on
pnpm install
pnpm check          # every gate
```

The gates are defined in [`mise.toml`](mise.toml), one task each, and `pnpm check` calls
them. They run in parallel, apart from the performance gate, which measures wall time and
gets the machine to itself. `mise tasks` lists them with what each one checks.

That install does not pull the libraries denary is compared against for speed. They are
declared in [`bench/package.json`](bench/package.json), fetched only if you want the full
comparison:

```sh
npm install --prefix bench
pnpm bench:versus
```

Without them the comparison still runs on denary alone and names the targets it could not
find.

Gate H compares behaviour against `decimal.js`, not speed. Its answers are committed like
the oracle's, so it needs nothing installed either, and `mise run peers:regen` after the
comparison install rewrites them so that the diff shows exactly what a new release of the
peer changed.

The tool versions are pinned in [`mise.toml`](mise.toml). Gate D compares four runtimes
byte for byte and declares the digit ceiling of each, which only means something if they
are the runtimes the declaration was measured against:

```sh
mise install        # node, bun, deno, uv
```

Without it the gates use whatever is on the path, and gate D says which runtimes it could
not find, instead of quietly comparing fewer.

Gates A, C and H compare against oracles that are not JavaScript. The expected values are
committed, so the gates run without Python. You only need it to regenerate them or to add
cases, and `uv` resolves the interpreter and `gmpy2` on demand:

```sh
pnpm oracle:regen
```

`gmpy2` links against the system MPFR and GMP (`brew install mpfr gmp`, or
`libmpfr-dev libgmp-dev`). Without it those cases are marked `noOracle` and the gate
**says it is skipping them** instead of passing quietly.

Gate D's browser axis needs a local Chrome and is skipped with a message if absent.
Gate F (performance) needs a quiet machine: `pnpm check:bench`.

## Adding an operation

Declare which gates cover it in `test/coverage/declared.json`, or gate G fails. If a gate
cannot cover it, record the hole and the reason in the same file. The point is that blind
spots stay visible, not that there are none.
