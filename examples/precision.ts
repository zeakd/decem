// Where a precision is required, what the two kinds mean, and how to ask whether the
// answer was rounded.
//
//   node --experimental-strip-types examples/precision.ts
import { dec, toString, mul, div, round, quantize, divStatus } from "denary";

// Exact operations take no precision. There is no argument to pass because there is
// nothing to decide.
console.log(`1.5 x 2.5            ${toString(mul(dec`1.5`, dec`2.5`))}`);

// Approximate ones require it, and leaving it out does not compile.
//   div(dec`1`, dec`3`)                 // error: Expected 3 arguments, but got 2
console.log(`1 / 3 at 20 digits   ${toString(div(dec`1`, dec`3`, { digits: 20 }))}`);
console.log(`10 / 3 at 2 places   ${toString(div(dec`10`, dec`3`, { scale: 2 }))}`);

// Two kinds, because science counts significant digits and money counts decimal places.
// They are separate functions rather than a flag, and each rejects the other's shape.
console.log(`\nround to 3 digits    ${toString(round(dec`1234.5678`, { digits: 3 }))}`);
console.log(`quantize to 2 places ${toString(quantize(dec`1234.5678`, { scale: 2 }))}`);
console.log(`quantize keeps scale ${toString(quantize(dec`1.5`, { scale: 3 }))}   the zeros are the point`);

// And whether rounding happened at all, which is a question most libraries cannot answer.
for (const [a, b] of [["1", "4"], ["1", "3"]]) {
  // The operands are variables here, so they go through `from` rather than `dec`.
  const r = divStatus(dec(a), dec(b), { digits: 10 });
  console.log(`\n${a} / ${b}  ${toString(r.value)}`);
  console.log(`     exact ${r.exact}, direction ${r.direction}`);
}
