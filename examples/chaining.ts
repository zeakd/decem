// The chaining surface, which is a separate import.
//
// It is not the default, because hanging every operation off a prototype would put the
// transcendental functions in the bundle of somebody who only rounds to two places. The
// rules do not change inside a chain: `mul` takes no precision because it cannot lose
// anything, and `div` requires one.
//
//   node --experimental-strip-types examples/chaining.ts
import { dec, fromInt, toString } from "decem";
import { chain } from "decem/chain";

const WON = { scale: 0, rounding: "floor" } as const;

const supply = dec`12360000`;
const rate = dec`0.1`;
const usd = dec`1387.50`;

// Read it as one sentence: take the supply, add a tenth of it, split it seven ways.
const perPerson = chain(supply)
  .mul(rate)                       // exact, so there is nothing to round
  .quantize(WON)                   // the tax, in whole units
  .add(supply)                     // the taxed total
  .div(fromInt(7), WON)            // approximate, so it says how precisely
  .value;

console.log(`each person owes ${toString(perPerson)}`);
console.log(`  which is ${toString(chain(perPerson).div(usd, { scale: 2, rounding: "half-even" }).value)} USD`);

// The same thing without the chain. Both are one import away, and neither is a wrapper
// around the other: `chain` calls the same functions.
