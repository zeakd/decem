// Records what decimal.js answers, so that gate H does not need it installed.
//
// This is the same arrangement as the oracle: the answers are committed, the gate reads
// them, and regenerating is a separate act whose diff shows when the peer changed. It
// keeps a library out of the dependencies of the library it is compared against, and it
// lets the gate run from a clean clone with nothing third-party fetched.
//
//   npm install --prefix bench      # the comparison targets live there
//   node test/peers/gen-peer.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Resolved from the comparison install rather than from the library's own, because the
// library does not depend on the thing it replaces.
const PEER_ROOT = new URL("../../bench/node_modules/decimal.js/", import.meta.url);
const { default: Decimal } = await import(new URL("decimal.mjs", PEER_ROOT).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(readFileSync(new URL("package.json", PEER_ROOT), "utf8")).version;

const lines = (p) =>
  readFileSync(join(HERE, "../oracle", p), "utf8").split("\n").filter(Boolean).map(JSON.parse);

const RM = { "half-even": 6, "half-up": 4, "half-down": 5, up: 0, down: 1, ceil: 2, floor: 3 };
const EXACT = new Set(["add", "sub", "mul"]);
// The library takes its precision from a global, and 20 is what somebody gets without
// changing anything, which is the configuration the differences are declared against.
const DEFAULT_PRECISION = 20;

function compute(c) {
  // The exponential-notation thresholds are left alone. Pushed to an extreme, exp(1e13)
  // becomes a four-trillion-digit string.
  Decimal.set({ precision: DEFAULT_PRECISION, rounding: 4 });
  try {
    const [a, b] = c.args.map((x) => new Decimal(x));
    if (EXACT.has(c.op))
      return { value: { add: () => a.plus(b), sub: () => a.minus(b), mul: () => a.times(b) }[c.op]().toString() };
    Decimal.set({ precision: c.prec.digits ?? DEFAULT_PRECISION, rounding: RM[c.rounding] ?? 6 });
    const one = new Decimal(c.args[0]);
    const v = {
      div: () => one.div(b), sqrt: () => one.sqrt(), cbrt: () => one.cbrt(),
      exp: () => one.exp(), ln: () => one.ln(), log10: () => one.log(10),
      sin: () => one.sin(), cos: () => one.cos(), tan: () => one.tan(),
    }[c.op]?.();
    return v === undefined ? { skip: true } : { value: v.toString() };
  } catch (e) { return { threw: e.constructor.name }; }
}

// The documents make claims about the peer too, and those are third-party behaviour like
// any other, so they are recorded here rather than computed while a test runs.
// An entry carrying `js` is written as the expression the document shows, because what an
// operator does to one of these values is the peer's behaviour too and does not come back
// as a Decimal. compute() cannot express it and guessing it in prose is how a document
// starts saying something the library stopped doing.
const DOCUMENTED = [
  { id: "readme-opening", op: "add",
    args: ["5652600335.41", "-0.00000000000000006435"], prec: {}, rounding: "half-up" },
  { id: "readme-mul", op: "mul",
    args: ["9999999999.99", "1.000000000001"], prec: {}, rounding: "half-even" },
  { id: "readme-div-zero", op: "div", args: ["1", "0"], prec: { digits: 20 }, rounding: "half-even" },
  { id: "readme-eq", js: () => new Decimal(0.1 + 0.2).eq(new Decimal("0.3")) },
  { id: "readme-tofixed", js: () => new Decimal("19.985").toFixed(2) },
  { id: "readme-lt", js: () => new Decimal(9) < new Decimal(10) },
];


const cases = [...lines("cases/exact.jsonl"), ...lines("cases/approx.jsonl"), ...DOCUMENTED];
const out = [JSON.stringify({ peer: "decimal.js", version, cases: cases.length })];
for (const c of cases) {
  // An entry carrying `js` gets the configuration a caller has without changing anything,
  // because that is what a document showing the library's own behaviour has to claim. It
  // is set here rather than assumed: the case before this one leaves the globals wherever
  // it needed them, and the first draft of this loop recorded a half-even answer for a
  // line the README quotes as half-up, which is the very thing the section is about.
  if (c.js) Decimal.set({ precision: DEFAULT_PRECISION, rounding: 4 });
  out.push(JSON.stringify({ id: c.id, ...(c.js ? { value: String(c.js()) } : compute(c)) }));
}

writeFileSync(join(HERE, "expected/decimal-js.jsonl"), out.join("\n") + "\n");
console.log(`  expected/decimal-js.jsonl  ${cases.length} cases from decimal.js ${version}`);
