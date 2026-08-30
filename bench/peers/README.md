# Comparison targets

One library, one file. A row in the table is produced by calling each library from its own
file here, so a call written wrongly is a mistake in one place and a pull request against
that file is the fix.

```
cases.mjs        what is measured, why those cases, and which losses are on record
denary.mjs       the subject, in the same shape as any target
decimal-js.mjs   one target
big-js.mjs       one target
```

## Where the targets are declared

A library the benchmark alone needs is a dependency of the benchmark, not of denary, so
it is declared in [`../package.json`](../package.json) and installed separately:

```sh
npm install --prefix bench      # the full matrix
```

Installing denary itself pulls none of them. Without them the self-comparison still runs
and says which targets are missing; the report refuses to write a partial table, because a
table with a column missing is a different claim rather than a smaller one.

Gate H compares results against `decimal.js` too, and it used to be a devDependency of
denary for that reason, which put the library being replaced in the manifest of the
library replacing it. Its answers are committed now, the same way the oracle's are, so the
gate reads them and needs nothing installed. Both users of the peer are here.

## The failure modes this shape is built against

Comparison benchmarks published by the author of one of the entrants are biased by
construction, and the usual advice is to involve the other projects. A single maintainer
cannot do that directly, so the next best thing is to make the measuring code small enough
to audit and separate enough to correct one piece at a time.

- **A stale version.** Versions are read from what is installed, not written into prose, so
  the table cannot claim a comparison it did not make.
- **An unfair call.** Each target is called from its own file, and an operation a library
  does not have is `null` rather than something nearby.
- **A flattering selection.** The case list says why each case is there, including the one
  denary loses. A row we lose without a reason on file stops the report from generating.
- **One machine.** Every figure comes from one processor. Results from another are worth
  more to us than any number in the table.

## Adding a target

Export `meta` with a `name` and the package to read a version from, and `ops` with the
same keys as `CASES`. Absent operations are `null`. Nothing else is required.

## When to regenerate

The document records one run, so regenerating changes every figure and produces a diff
each time. Regenerate when the shape changes or the record has gone stale: a case added or
removed, a row changing side, a target updated, a different machine. Not after every run,
because a diff that says nothing trains people to skip reading them.

`pnpm check:report` reads the file and does not measure, which is why it can sit in the
check chain: it asks whether the cases and the losses still match, and a figure moving is
not an answer to that.
