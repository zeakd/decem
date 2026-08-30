// Gate J: the memory budgets in budgets.mjs, enforced by the engine.
//
// Each case runs in a child with the heap capped at its budget. The child either prints
// the answer or dies of an allocation failure, and an allocation failure is not catchable,
// so the exit code is the whole result. There is no interval to widen and no measurement
// to repeat, which is the difference between this and gate F.
//
// The budget is a limit this repository declares, in the same sense as the digit ceiling:
// a number chosen above what the work needs, so that crossing it means something changed
// rather than that the machine was busy.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES } from "./budgets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = JSON.stringify(new URL("../../src/index.ts", import.meta.url).href);

let failed = 0;
console.log(`Gate J (memory budgets)  ${CASES.length} cases`);
for (const c of CASES) {
  let got, died = null;
  try {
    got = execFileSync(process.execPath,
      ["--experimental-strip-types", `--max-old-space-size=${c.budget}`, "-e",
       `const d = await import(${SRC}); console.log(String(${c.code}));`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], cwd: HERE }).trim();
  } catch (e) {
    // The last line of a crash is the runtime's version banner, so the first line that
    // names an error is reported instead. A budget failure that says "Node.js v22" tells
    // whoever reads it nothing about what went over.
    const err = String(e.stderr);
    const named = err.split("\n").find((l) => /Error/.test(l));
    died = /heap limit|out of memory/i.test(err)
      ? `over its ${c.budget}MB budget`
      : `exited ${e.status}: ${(named ?? err.trim().split("\n").pop() ?? "").trim()}`;
  }
  if (died !== null) { console.log(`  ${c.name.padEnd(22)} ${died}`); failed++; }
  else if (got !== c.answer) {
    console.log(`  ${c.name.padEnd(22)} answered ${got}, expected ${c.answer}`);
    failed++;
  }
}
if (failed > 0) {
  console.log(`\n${failed} of ${CASES.length} over budget or wrong`);
  process.exit(1);
}
console.log(`  every case inside its budget, ${Math.max(...CASES.map((c) => c.budget))}MB the largest`);
