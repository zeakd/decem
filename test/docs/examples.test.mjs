// The examples in the documents, run.
//
// Every figure printed in a README is a claim, and nothing was checking them. The API
// changed four times in one day, and each change could have left a document saying
// something the library no longer does, with no test to notice.
//
// Each case asserts twice: that the library returns the value, and that the document still
// says so. Changing the behaviour without the document fails on the first; editing the
// document without the behaviour fails on the second. A claim is only single-sourced if
// both directions are checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as d from "../../src/index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS = ["README.md", "docs/values.md"]
  .map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");

const EXAMPLES = readdirSync(join(ROOT, "examples")).filter((f) => f.endsWith(".ts")).sort();

const { dec, fromInt, fromNumber, tryDec, quantize, mul, sub, add, sum, lt, div, eq,
        toString: str, divStatus, isZero } = d;

// What the peer answers is recorded with its version in test/peers, so a document that
// quotes decimal.js reads the number rather than installing the library to compute it again.
const PEER = readFileSync(join(ROOT, "test/peers/expected/decimal-js.jsonl"), "utf8")
  .split("\n").filter(Boolean).map(JSON.parse);
const peer = (id) => PEER.find((r) => r.id === id).value;

/** Asserts the value, then asserts a document still claims it. */
const claims = (label, actual, printed) => {
  assert.equal(String(actual), printed, label);
  assert.ok(DOCS.includes(printed), `${label}: no document says ${JSON.stringify(printed)}`);
};

test("the opening example still opens", () => {
  claims(`decimal.js ${PEER[0].version} loses the addend`, peer("readme-opening"), "5652600335.41");
  claims("decem keeps it",
    str(add(dec`5652600335.41`, dec`-0.00000000000000006435`)), "5652600335.40999999999999993565");
});

// The comparison section shows both libraries side by side, so both halves are claims. The
// peer's half is read from the recording and ours is computed, and the section has to still
// print each of them.
test("the comparison examples are what both libraries do", () => {
  claims("the peer rounds to a round integer", peer("readme-mul"), "10000000000");
  claims("ours keeps what was there", str(mul(dec`9999999999.99`, dec`1.000000000001`)),
    "9999999999.99999999999999");
  claims("the peer rounds half-up on the way out", peer("readme-tofixed"), "19.99");
  claims("ours is asked, and answers half-even", str(quantize(dec`19.985`, { scale: 2 })), "19.98");
  claims("the peer divides by zero", peer("readme-div-zero"), "Infinity");
  assert.throws(() => div(dec`1`, dec`0`, { digits: 20 }), d.DivisionByZero);

  // Two of the peer's answers are a word rather than a number, so the document is matched
  // on the whole line: "false" on its own would be found in any sentence.
  assert.equal(peer("readme-eq"), "false");
  assert.match(DOCS, /new Decimal\(0\.1 \+ 0\.2\)\.eq\(new Decimal\("0\.3"\)\);\s*\/\/ false/);
  assert.equal(peer("readme-lt"), "false");
  assert.match(DOCS, /new Decimal\(9\) < new Decimal\(10\);\s*\/\/ false/);
  assert.throws(() => dec`9` < dec`10`, TypeError);
  assert.throws(() => dec`19.99` * 2, TypeError);

  // The marker is the one answer that is neither the value nor a raise, so it is claimed
  // here as well as described in the prose.
  claims("the marker keeps the log alive", "paid " + dec`19.99`, "paid [decimal 19.99]");
  claims("and cannot pass for arithmetic", dec`19.99` + 1, "[decimal 19.99]1");
});

test("the settlement example balances", () => {
  const WON = { scale: 0, rounding: "down" };
  const total = dec`13596000`, n = 7;
  const base = div(total, fromInt(n), WON);
  const remainder = sub(total, mul(base, fromInt(n)));
  claims("base", str(base), "1942285");
  assert.equal(str(remainder), "5");
  const shares = Array.from({ length: n }, (_, i) =>
    lt(fromInt(i), remainder) ? add(base, dec`1`) : base);
  assert.equal(eq(sum(shares), total), true);
});

test("the precision examples give what they print", () => {
  claims("digits", str(div(dec`1`, dec`3`, { digits: 20 })), "0.33333333333333333333");
  claims("scale", str(div(dec`10`, dec`3`, { scale: 2 })), "3.33");
});

test("the status example reports what it prints", () => {
  const exact = divStatus(dec`1`, dec`2`, { digits: 20 });
  const inexact = divStatus(dec`1`, dec`3`, { digits: 20 });
  assert.equal(str(exact.value), "0.5");
  assert.deepEqual([exact.exact, exact.direction], [true, 0]);
  assert.deepEqual([inexact.exact, inexact.direction], [false, -1]);
});

test("the two modes print what the document prints", () => {
  claims("shortest", str(fromNumber(0.1, "shortest")), "0.1");
  claims("exact", str(fromNumber(0.1, "exact")),
    "0.1000000000000000055511151231257827021181583404541015625");
});

test("the ways out give what the document shows", () => {
  const price = dec`19.99`, other = dec`20`;
  claims("template", `${price}`, "19.99");
  assert.equal(String(price), "19.99");
  assert.equal(str(price), "19.99");
  claims("json", JSON.stringify({ price }), '{"price":"19.99"}');
  assert.equal([price].join(), "19.99");
  claims("concatenation", "price=" + price, "price=[decimal 19.99]");
  claims("addition", price + 1, "[decimal 19.99]1");
  for (const [label, fn] of [["mul", () => price * 2], ["lt", () => price < other],
                             ["toNumber", () => Number(price)]])
    assert.throws(fn, TypeError, `${label} should raise`);
  assert.equal(Boolean(dec`0`), true);      // the one that cannot raise
  assert.equal(isZero(dec`0`), true);
});

test("the boundary example round-trips", () => {
  const price = dec`19.99`;
  assert.equal(str(dec(str(price))), "19.99");
  assert.equal(tryDec("1,234"), null);
  assert.throws(() => fromInt(2 ** 53), d.DecemError);
});

// An import list is a claim too: it says these are the names the example needs. An unused
// one sends the reader looking for where it is used, and two of them were sitting in these
// files doing nothing until somebody read them and asked.
test("every example imports what it uses and uses what it imports", () => {
  const sources = [DOCS, ...EXAMPLES.map((f) => readFileSync(join(ROOT, "examples", f), "utf8"))];
  const exported = new Set([...Object.keys(d), "chain"]);
  let checked = 0;
  for (const src of sources) {
    for (const [, list, body] of src.matchAll(
      /import \{([^}]+)\} from "(?:decem|\.\.\/src\/index\.ts)";([\s\S]*?)(?:\n```|$)/g)) {
      checked++;
      const named = list.split(",").map((x) => x.trim())
        .filter((x) => x && !x.startsWith("type "))
        .map((x) => x.split(/\s+as\s+/).pop().trim());
      for (const name of named) {
        assert.ok(exported.has(name) || name === "d", `${name} is imported and is not exported`);
        assert.match(body, new RegExp(`(^|[^\\w.])${name}\\s*[(\`]`, "m"),
          `${name} is imported and never used`);
      }
    }
  }
  assert.ok(checked >= 3, `only ${checked} import lists were examined`);
});

// The examples are programs, and a program nobody runs stops being one. Both are run here
// rather than read, and the line that matters is asserted rather than the whole output.
test("every example runs, and the one that reconciles does", () => {
  const run = (f) => execFileSync(process.execPath,
    ["--experimental-strip-types", join(ROOT, "examples", f)],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  for (const f of EXAMPLES) assert.ok(run(f).trim().length > 0, `${f} printed nothing`);

  // The split has to balance for a refund as well as a bill, and the mode is the only
  // thing that decides it. `down` truncates toward zero, so a negative total gets a base
  // too small in magnitude and a negative remainder, and the loop that hands out the extra
  // units never runs. Both signs balanced under the README's version and only one of them
  // under the example's, which is how the two came to disagree without anything noticing.
  const split = run("split.ts");
  assert.doesNotMatch(split, /NOT the total/);
  assert.equal((split.match(/which is the total/g) ?? []).length, 2,
    "split.ts must show a bill and a refund, and both must balance");

  // And the mode is the same wherever the constant has the same name, because a reader
  // copies a constant out of whichever example they opened first.
  const modes = new Set(EXAMPLES.flatMap((f) =>
    [...readFileSync(join(ROOT, "examples", f), "utf8")
      .matchAll(/const WON = \{[^}]*rounding: "([a-z-]+)"/g)].map((m) => m[1])));
  assert.deepEqual([...modes], ["floor"], `examples disagree about WON: ${[...modes]}`);
});

// The index is a promise about what is in the directory, and a file added without a row
// is a file nobody will find.
test("the index lists every example and nothing else", () => {
  const index = readFileSync(join(ROOT, "examples", "README.md"), "utf8");
  const listed = [...index.matchAll(/\]\((\w+\.ts)\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(listed)].sort(), [...EXAMPLES].sort());
});

// The guidance says a constant written in the source is `dec`, and `from` is for a value
// that arrived at run time. The example built to show how the API feels used `dec`0.1``
// for every constant, which is the one file that should not, and nothing noticed because
// it runs and gives the right answer either way.
//
// A string literal handed to `from` is the mechanical shape of that mistake. A variable is
// not, so `dec(row.price)` passes.
test("the examples build constants the way the documents say to", () => {
  for (const f of EXAMPLES) {
    const src = readFileSync(join(ROOT, "examples", f), "utf8");
    const literal = [...src.matchAll(/(^|[^\w.])dec\(\s*["'][^"']*["']\s*\)/gm)];
    assert.equal(literal.length, 0,
      `${f} passes a literal to dec in parentheses: ${literal.map((m) => m[0].trim()).join(", ")}. ` +
      "A constant written here is dec`...`, and fromInt for a count.");
  }
  // And the documents teach the same split, so the sentence has to still be there.
  assert.match(DOCS, /dec`[^`]+`\s+\/\/ written here in the source/);
  assert.match(DOCS, /dec\(row\.price\)\s+\/\/ a string or a bigint/);
});

// Two things drifted in the prose today, and both are the same shape: a figure typed into
// a sentence next to a figure that is produced.
//
// The README said the two libraries were level on comparison when it is the row decem
// loses, and quoted four speed ratios that had all moved. A ratio belongs in the generated
// table and nowhere else, so the hand-written documents may not carry one.
test("the prose does not carry a benchmark ratio", () => {
  for (const f of ["README.md", "docs/invariants.md", "docs/differences.md", "docs/values.md",
                   "CONTRIBUTING.md"]) {
    const hits = [...readFileSync(join(ROOT, f), "utf8")
      .matchAll(/[0-9]+(?:\.[0-9]+)?x\s+(?:faster|slower)/g)].map((m) => m[0]);
    assert.deepEqual(hits, [],
      `${f} quotes ${hits.join(", ")}. Those move between runs; link docs/benchmarks.md instead.`);
  }
});

// And a corpus size is a claim about a file that is right there.
test("the case counts in the documents match the corpora", () => {
  const count = (p) => readFileSync(join(ROOT, p), "utf8").split("\n").filter(Boolean).length;
  const oracle = count("test/oracle/cases/exact.jsonl") + count("test/oracle/cases/approx.jsonl");
  const boundary = count("test/boundary/cases.jsonl") + count("test/boundary/cases-transcendental.jsonl");
  const group = (n) => n.toLocaleString("en-US");
  const text = ["README.md", "docs/invariants.md", "docs/differences.md"]
    .map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
  for (const [what, n] of [["oracle", oracle], ["boundary", boundary]]) {
    const wrong = [...text.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+) (?:cases|constructed)/g)]
      .map((m) => m[1]);
    assert.ok(wrong.includes(group(n)),
      `no document states the ${what} corpus size of ${group(n)}; they say ${[...new Set(wrong)].join(", ")}`);
  }
});

// The README says the runtime matrix compares 776 results across four runtimes. That
// number is produced by a function in this repository, and a sentence that quotes it is a
// claim like any other. A first draft of that sentence said every gate runs on all four,
// which is true of one of them.
test("the runtime matrix figure in the README is the one the workload produces", async () => {
  const { runWorkload } = await import("../runtime/workload.mjs");
  const n = runWorkload(d).length;
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.match(readme, new RegExp(`\\b${n} results on Node, Bun,`),
    `the workload produces ${n} results and the README does not say so`);
});
