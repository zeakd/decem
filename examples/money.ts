// The everyday path: build values, calculate exactly, round once at the end.
//
//   node --experimental-strip-types examples/money.ts
import { dec, toString, add, mul, sum, quantize } from "denary";

const WON = { scale: 0, rounding: "floor" } as const;
const VAT = dec`0.1`;

// A constant written here is `dec`. A value that arrived from somewhere, like a row from
// a database, goes through `from`, which refuses a `number` because a number has already
// lost the digits this library exists to keep.
const ROW = { unit: "1250000", qty: "3" };
const lineTotal = mul(dec(ROW.unit), dec(ROW.qty));

// None of these take a precision, because none of them can lose anything. That is the
// whole difference from a library with a global setting: there is nothing to configure
// and nothing to forget.
const subtotal = sum([lineTotal, dec`980000`, dec`1750000`]);
const tax = mul(subtotal, VAT);
const total = add(subtotal, tax);

console.log(`subtotal  ${toString(subtotal)}`);
console.log(`tax       ${toString(tax)}      exact, so it still has a fraction`);
console.log(`total     ${toString(total)}`);

// Rounding is a decision, so it is written down where it is made rather than inherited.
console.log(`\nin whole units  ${toString(quantize(total, WON))}`);
