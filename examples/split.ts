// Splitting a total N ways so that the shares add back up to it.
//
// This is the case a global precision breaks. The base share is floored and the shortfall
// has to be an exact whole number, so that the remainder is a count and not an estimate.
// If `base * n` were rounded, the check at the end would be off by a unit and nothing in
// the code would say where.
//
// The mode is `floor` and not `down`. Floored division leaves a remainder in [0, n) for
// either sign; `down` truncates toward zero, so a refund gets a base that is too small in
// magnitude, a negative remainder, and a loop that hands out nothing. The bill balances
// under both, which is why the refund is run here too.
//
//   node --experimental-strip-types examples/split.ts
import { dec, fromInt, toString, add, sub, mul, sum, eq, lt, div, type Dec } from "denary";

const WON = { scale: 0, rounding: "floor" } as const;

function split(amount: Dec, n: number): Dec[] {
  const base = div(amount, fromInt(n), WON);          // approximate, so it names a scale
  const remainder = sub(amount, mul(base, fromInt(n)));   // exact, so this is a count
  const shares: Dec[] = [];
  for (let i = 0; i < n; i++)
    shares.push(lt(fromInt(i), remainder) ? add(base, dec`1`) : base);
  return shares;
}

for (const total of [dec`13596000`, dec`-13596000`]) {
  const shares = split(total, 7);
  shares.forEach((s, i) => console.log(`  share ${i + 1}  ${toString(s)}`));
  console.log(`\n  they sum to ${toString(sum(shares))}, ` +
    `${eq(sum(shares), total) ? "which is the total" : "which is NOT the total"}\n`);
}
