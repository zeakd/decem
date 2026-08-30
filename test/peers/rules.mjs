// Declared design differences. A difference not listed here fails gate H.
// Adding a rule is allowed; the point is that adding one makes you write the reason.
//
// A rule marked `spelling` is for the case where the two agree on the value and disagree
// on how it is written. Those used to be counted as agreement and never printed, because
// the comparison asks `cmp` and `cmp` is by value on purpose. Eight hundred and fifty two
// of the corpus are in that state, and one of the two reasons for it had no entry in the
// ledger at all.
import * as d from "../../src/index.ts";

const scale = (s) => { try { return d.scaleOf(d.dec(s)); } catch { return NaN; } };

export const RULES = [
  {
    id: "exact-ops-not-rounded",
    why: "add, sub and mul are exact here, while decimal.js rounds them to its global precision",
    match: (c, ours, peer) =>
      ["add", "sub", "mul"].includes(c.op) && !ours.threw && !peer.threw,
  },
  {
    id: "division-by-zero",
    why: "denary raises DivisionByZero where decimal.js returns Infinity",
    match: (c, ours) => ours.threw === "DivisionByZero",
  },
  {
    id: "domain-errors-raise",
    why: "for ln(0), sqrt of a negative and the like, denary raises where decimal.js returns NaN or -Infinity",
    match: (c, ours) => ours.threw === "DenaryError" || ours.threw === "ExponentOverflow",
  },
  {
    id: "ideal-exponent-kept",
    spelling: true,
    why: "an exact result keeps the scale the specification gives it, so 2.5 * 4 is 10.0 and " +
      "1.10 + 2.90 is 4.00; decimal.js normalises the coefficient and answers 10 and 4",
    match: (c, ours, peer) => scale(ours.value) !== scale(peer.value),
  },
  {
    id: "output-format-fixed",
    spelling: true,
    why: "denary prints the specification's to-scientific-string, so the switch to exponential " +
      "form is fixed and the exponent letter is capital E; decimal.js has toExpPos and toExpNeg " +
      "and writes a lowercase e",
    match: () => true,
  },
];
