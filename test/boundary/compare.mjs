// Gate C: does denary diverge from the oracle at a rounding boundary?
//
// Passing gate A does not demonstrate correct rounding, because random cases essentially
// never land on a tie. This is where that is settled.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const lines = (f) =>
  readFileSync(join(HERE, f), "utf8").split("\n").filter(Boolean).map(JSON.parse);

const { existsSync } = await import("node:fs");
const tPath = join(HERE, "cases-transcendental.jsonl");
const cases = [...lines("cases.jsonl"),
               ...(existsSync(tPath) ? lines("cases-transcendental.jsonl") : [])];
const expected = new Map(lines("expected.jsonl").map((e) => [e.id, e]));

let pass = 0, fail = 0;
const todo = new Map();
const failures = [];
const byPos = {};

for (const c of cases) {
  const want = expected.get(c.id);
  if (!want) continue;
  const fn = core[c.op];
  if (typeof fn !== "function") { todo.set(c.op, (todo.get(c.op) ?? 0) + 1); continue; }
  let got, err = null;
  try {
    got = core.toString(fn(...c.args.map(core.dec), { ...c.prec, rounding: c.rounding }));
  } catch (e) { err = e.constructor.name; }

  const ok = !err && (want.valueOnly
    ? core.cmp(core.dec(got), core.dec(want.result)) === 0
    : got === want.result);
  const slot = (byPos[c.boundary] ??= [0, 0]);
  if (ok) { pass++; slot[0]++; }
  else {
    fail++; slot[1]++;
    if (failures.length < 12)
      failures.push(`  ${c.id} [${c.boundary}] ${c.op}(${c.args.join(", ")}) ` +
        `@${JSON.stringify(c.prec)} ${c.rounding}\n     expected ${want.result}\n     actual   ${err ?? got}`);
  }
}

console.log(`Gate C (constructed boundaries)  ${pass} passed, ${fail} failed`);
console.log("  " + Object.entries(byPos).sort()
  .map(([k, [p, f]]) => `${k} ${p}/${p + f}`).join("  "));
if (todo.size)
  console.log(`  not implemented: ${[...todo].map(([o, n]) => `${o}(${n})`).join(" ")}`);
if (failures.length) { console.log(); failures.forEach((f) => console.log(f)); }
process.exit(fail ? 1 : 0);
