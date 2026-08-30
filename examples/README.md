# Examples

One question per file, in the order the questions come up.

| File | The question it answers |
|---|---|
| [`money.ts`](money.ts) | How do I build values and add them up without losing anything? |
| [`split.ts`](split.ts) | How do I divide a total so the parts add back up to it? |
| [`precision.ts`](precision.ts) | When do I have to say how precisely, and what are the two kinds? |
| [`chaining.ts`](chaining.ts) | What does the chaining surface look like? |

Each runs on its own:

```sh
node --experimental-strip-types examples/money.ts
```

`pnpm check:examples` runs all of them, and checks that each imports what it uses and
builds its constants the way the documents say to. An example nobody runs stops being one.
