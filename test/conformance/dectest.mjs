// Conformance against the specification's own testcases.
//
// The General Decimal Arithmetic specification ships test vectors, and they are a better
// adversarial corpus than anything generated here: they are the cases the author of the
// specification thought were worth writing down. They are also marked "All rights
// reserved", so they are not committed. This runner reads them from wherever they already
// exist on the machine, and says plainly when it cannot find them rather than passing.
//
//   node test/conformance/dectest.mjs [directory]
//   DECTEST_DIR=/path/to/decimaltestdata node test/conformance/dectest.mjs
//
// With no argument it asks the local Python for its test data directory, since CPython
// ships these files.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import * as d from "../../src/index.ts";

function locate() {
  const given = process.argv[2] ?? process.env["DECTEST_DIR"];
  if (given) return given;
  try {
    const base = execSync(
      `python3 -c "import test, os; print(os.path.dirname(test.__file__))"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const dir = join(base, "decimaltestdata");
    if (existsSync(dir)) return dir;
  } catch { /* no python, which is not an error here */ }
  return null;
}

const DIR = locate();
if (!DIR || !existsSync(DIR)) {
  console.log("Conformance (General Decimal Arithmetic testcases)  not run");
  console.log("  The test files are not on this machine and are not redistributable.");
  console.log("  Point at a copy with DECTEST_DIR, or install CPython, which ships them.");
  process.exit(0);
}

const ROUNDING = { half_up: "half-up", half_even: "half-even", half_down: "half-down",
                   up: "up", down: "down", ceiling: "ceil", floor: "floor" };
// add, subtract and multiply are exact here and rounded there, which is a declared
// difference. The exact result is rounded to the file's precision so the comparison is
// about the arithmetic and the rounding rather than about that difference.
const EXACT = { add: d.add, subtract: d.sub, multiply: d.mul };
const APPROX = { divide: d.div, squareroot: d.sqrt, exp: d.exp, ln: d.ln, log10: d.log10 };

// A diagnostic NaN carries a payload, so the name is not the whole token: NaN26 and
// -NaN123456789 are the same kind of value as NaN and there is nothing here to compare
// them with.
const special = (s) => /^[-+]?(inf(inity)?|s?nan\d*)$/i.test(s) || s.includes("#");
// Conditions that describe a boundary this implementation does not have: its exponent
// range is far wider, so a case that exists to test the edge of the narrow one is not
// about the arithmetic.
const RANGE = /Overflow|Underflow|Subnormal|Clamped|Insufficient_storage/i;

function tokens(line) {
  const out = [];
  let cur = "", q = null;
  for (const ch of line) {
    if (q) { if (ch === q) { out.push(cur); cur = ""; q = null; } else cur += ch; continue; }
    if (ch === "'" || ch === '"') { q = ch; continue; }
    if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ""; } continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

let pass = 0, fail = 0, spellingOnly = 0, declared = 0;
const spellFailures = [];
const skipped = new Map();
const failures = [];
const seenOps = new Map();
const skip = (why) => skipped.set(why, (skipped.get(why) ?? 0) + 1);

// Only the files for operations that exist here. The rest parse fine and contribute
// nothing but a skip count, and reading them hides how much was actually compared.
const WANTED = new Set(["add", "subtract", "multiply", "divide", "squareroot",
                        "exp", "ln", "log10", "compare", "quantize", "rounding"]);
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".decTest") && WANTED.has(f.slice(0, -8)))
  .filter((f) => !process.env["DECTEST_ONLY"] || f.startsWith(process.env["DECTEST_ONLY"]))
  .sort();
const started = new Map();
for (const file of files) {
  let prec = 9, rounding = "half-even", unknownRounding = null;
  const before = pass + fail;
  if (process.env["DECTEST_VERBOSE"]) process.stdout.write(`  ${file} ... `);
  for (const raw of readFileSync(join(DIR, file), "utf8").split("\n")) {
    // The carriage return has to go before the comment does. These files are CRLF, and a
    // JavaScript `.` does not match \r while `$` does not sit in front of one, so
    // /--.*$/ silently matches nothing and every trailing comment survives. It left 171
    // test lines carrying their comment into the conditions field, where a word like
    // "Overflow" in a comment reads as the case being about the exponent range.
    const line = raw.replace(/\r/g, "").replace(/--.*$/, "").trim();
    if (!line) continue;
    if (!line.includes("->")) {
      const m = /^(\w+)\s*:\s*(\S+)/.exec(line);
      if (!m) continue;
      const k = m[1].toLowerCase();
      if (k === "precision") prec = Number(m[2]);
      // An unknown mode must not fall back to the previous one. 05up is a real mode in
      // the specification and not one of ours, and quietly carrying "down" forward made
      // every case under it look like an arithmetic mismatch.
      if (k === "rounding") {
        const name = m[2].toLowerCase();
        rounding = ROUNDING[name] ?? null;
        unknownRounding = rounding === null ? name : null;
      }
      continue;
    }
    const [lhs, rhs] = line.split("->");
    const left = tokens(lhs), right = tokens(rhs);
    const [, op, ...args] = left;
    const want = right[0];
    const conditions = right.slice(1).join(" ");
    seenOps.set(op, (seenOps.get(op) ?? 0) + 1);

    // quantize names its target by example: the second operand's exponent is the scale.
    // power and apply are here rather than skipped: both exist, and reporting them as not
    // implemented labelled a gap in this runner as a gap in the library.
    const fn = EXACT[op] ?? APPROX[op] ??
      ({ compare: d.cmp, quantize: d.quantize, power: d.pow, apply: d.round })[op] ?? null;
    if (!fn) { skip(`operation not implemented: ${op}`); continue; }
    if (unknownRounding) { skip(`rounding mode not implemented: ${unknownRounding}`); continue; }
    if (args.some(special) || special(want)) { skip("infinity or NaN, which this has no value for"); continue; }
    if (RANGE.test(conditions)) { skip("exponent range of the file, which is far narrower"); continue; }
    // A few files raise the working precision into the hundreds for a handful of cases.
    // Those cost seconds each in a transcendental and add nothing the boundary gate has
    // not already built deliberately.
    if (prec > 120 && APPROX[op]) { skip("precision above the width this is useful at"); continue; }
    if (/Invalid_operation|Division_by_zero/i.test(conditions) || /^[A-Z]/.test(want)) {
      skip("error case, compared elsewhere"); continue;
    }

    const p = { digits: prec, rounding };
    let got, err = null;
    try {
      const xs = args.map((a) => d.dec(a));
      // Exact addition of operands whose exponents are far apart produces a mantissa as
      // wide as the gap between them, and the files reach 10^999999999 on purpose. Those
      // cases are about the narrow exponent range of the specification, not about the
      // arithmetic, so they are counted rather than computed.
      if (xs.some((x) => Math.abs(x.exp) > 4000 || d.digits(x.mant < 0n ? -x.mant : x.mant) > 2000)) {
        skip("operand beyond the width this comparison is useful at"); continue;
      }
      if (EXACT[op] && Math.abs(xs[0].exp - xs[1].exp) > 4000) {
        skip("exponent gap that an exact result would have to span"); continue;
      }
      if (op === "exp" && xs[0].exp + d.digits(xs[0].mant < 0n ? -xs[0].mant : xs[0].mant) > 7) {
        skip("exp of an argument whose result has millions of digits"); continue;
      }
      if (op === "compare") got = String(d.cmp(xs[0], xs[1]));
      else if (op === "quantize") got = d.toString(d.quantize(xs[0], { scale: -xs[1].exp, rounding }));
      // apply is the specification's name for rounding a value to the context.
      else if (op === "apply") got = d.toString(d.round(xs[0], p));
      // power takes an integer exponent through the exact path and rounds after, and
      // anything else through the transcendental one.
      else if (op === "power") {
        const e = xs[1];
        const n = e.exp === 0 && Number.isSafeInteger(Number(e.mant)) ? Number(e.mant) : null;
        got = d.toString(n !== null && n >= 0 ? d.round(d.pow(xs[0], n), p) : d.pow(xs[0], e, p));
      }
      else if (EXACT[op]) got = d.toString(d.round(fn(xs[0], xs[1]), p));
      else got = d.toString(fn(...xs, p));
    } catch (e) { err = e.constructor.name; }

    if (err) { fail++; failures.length < 12 && failures.push(`  ${left[0]}  ${op}(${args.join(", ")}) @${prec} ${rounding}\n     expected ${want}\n     raised   ${err}`); continue; }
    // Compared as written, not by value. The specification fixes the exponent of a
    // result as well as its magnitude: 1.1 + 2.2 is 3.3 and not 3.30, and a division
    // that comes out exact is reduced back toward its ideal exponent. Comparing values
    // alone would accept a right number with the wrong number of digits, which for a
    // decimal is a different answer.
    //
    // Value and spelling are counted apart, so a formatting fault cannot be read as an
    // arithmetic one.
    const spelled = op === "compare" ? String(Number(want)) : d.toString(d.dec(want));
    const same = got === spelled;
    const valueOk = op === "compare" ? same : d.cmp(d.dec(got), d.dec(want)) === 0;
    // A zero sum under floor is -0 in the specification, because the rule belongs to a
    // rounded addition and rounding toward negative infinity claims the sign. Addition
    // here is exact and takes no mode, so there is nowhere for that to act. Declared in
    // docs/differences.md rather than counted as a fault each run.
    if (!same && valueOk && rounding === "floor" && d.isZero(d.dec(got)) &&
        want.replace(/^-/, "") === got) {
      declared++; continue;
    }
    if (!same && valueOk) {
      spellingOnly++;
      spellFailures.length < 12 && spellFailures.push(
        `  ${left[0]}  ${op}(${args.join(", ")}) @${prec} ${rounding}\n     spec   ${spelled}\n     decem ${got}`);
      continue;
    }
    if (same) pass++;
    else { fail++; failures.length < 12 && failures.push(`  ${left[0]}  ${op}(${args.join(", ")}) @${prec} ${rounding}\n     expected ${want}\n     actual   ${got}`); }
  }
  started.set(file, pass + fail - before);
  if (process.env["DECTEST_VERBOSE"]) process.stdout.write(`${pass + fail - before} compared\n`);
}

console.log(`Conformance (General Decimal Arithmetic testcases)  ${pass} passed, ${fail} failed` +
  (spellingOnly ? `, ${spellingOnly} right value with a different spelling` : "") +
  (declared ? `, ${declared} declared difference` : ""));
console.log(`  read from ${DIR}`);
const total = [...skipped.values()].reduce((a, b) => a + b, 0);
console.log(`  ${total} not applicable:`);
for (const [why, n] of [...skipped].sort((a, b) => b[1] - a[1]).slice(0, 8))
  console.log(`      ${String(n).padStart(6)}  ${why}`);
if (failures.length) { console.log("\n-- mismatches --"); failures.forEach((f) => console.log(f)); }
if (spellFailures.length) {
  console.log("\n-- spelling mismatches, the value is right --");
  spellFailures.forEach((f) => console.log(f));
}
process.exit(fail ? 1 : spellingOnly ? 3 : 0);   // 3 means only the exponent diverged
