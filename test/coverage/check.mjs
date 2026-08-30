// Gate G: every operation declares which gates cover it.
//
// An export with no declaration fails. The aim is not to force coverage but to keep the
// holes visible: something that cannot be covered passes as soon as the reason is
// written down. What this prevents is unchecked operations quietly accumulating.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../../src/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const decl = JSON.parse(readFileSync(join(HERE, "declared.json"), "utf8"));

const SKIP = new Set(["EXP_LIMIT", "ZIV_MODE"]);
const isError = (v) => typeof v === "function" && /^class|Error/.test(String(v).slice(0, 40))
  && Object.getPrototypeOf(v) !== Function.prototype;

const exported = Object.keys(core).filter((k) => {
  if (SKIP.has(k)) return false;
  const v = core[k];
  if (typeof v !== "function") return false;
  return !(v.prototype instanceof Error || v === Error);      // error classes are not operations
});

const undeclared = exported.filter((k) => !(k in decl.ops));
const stale = Object.keys(decl.ops).filter((k) => !exported.includes(k));
const uncovered = Object.entries(decl.ops)
  .filter(([k, g]) => g.length === 0)
  .map(([k]) => k);
const unexplained = uncovered.filter((k) =>
  !Object.keys(decl.gaps).some((g) => g.split("/").includes(k) || g === k));

// A recorded reason is only as good as its accuracy, and a stale one is worse than a
// missing one because it closes the question. The *Status hole read "the oracle has no
// equivalent concept" long after the oracle had one. Where a reason names the gates it
// lacks, that claim is checked against what the operations actually declare.
const contradicted = [];
for (const [key, reason] of Object.entries(decl.gaps)) {
  const m = /^no gates? ([A-Z](?: or [A-Z])*)/.exec(reason);
  if (!m) continue;
  const claimed = m[1].split(" or ");
  for (const op of key.split("/")) {
    const have = decl.ops[op] ?? [];
    for (const g of claimed)
      if (have.includes(g)) contradicted.push(`${key} claims no gate ${g}, but ${op} declares it`);
  }
}

let fail = 0;
console.log(`Gate G (coverage declaration)  ${exported.length} exported operations`);
if (undeclared.length) { fail++; console.log(`  undeclared: ${undeclared.join(" ")}`); }
if (stale.length) { fail++; console.log(`  declared but absent: ${stale.join(" ")}`); }
if (unexplained.length) { fail++; console.log(`  no gates and no reason recorded: ${unexplained.join(" ")}`); }
if (contradicted.length) { fail++; contradicted.forEach((c) => console.log(`  stale reason: ${c}`)); }

// The holes are printed even when the gate passes.
const holes = Object.keys(decl.gaps).length;
const byGate = {};
for (const g of Object.values(decl.ops).flat()) byGate[g] = (byGate[g] ?? 0) + 1;
console.log(`  coverage by gate: ` + Object.entries(byGate).sort().map(([g, n]) => `${g}${n}`).join(" "));
console.log(`  ${holes} declared holes: ${Object.keys(decl.gaps).join(", ")}`);
if (!fail) console.log("  every exported operation is declared");
process.exit(fail ? 1 : 0);
