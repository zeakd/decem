// What gets measured: a money-sized workload at 34 digits and a high-precision one at 400.
import * as d from "../src/index.ts";

const f = d.dec;
const small = f("123456.789");
const small2 = f("987.654321");
const big = f("1." + "1234567890".repeat(40));       // about 400 digits
const big2 = f("9." + "8765432109".repeat(40));
const P34 = { digits: 34 };
const P400 = { digits: 400 };
const MONEY = { scale: 2, rounding: "half-even" };

export const CASES = [
  ["parse/34",     () => f("123456.7890123456789012345678901234"), 20000],
  // A cache hit and a real conversion are measured separately. Together, the 0.1ns of a
  // cache hit would be quoted as the cost of toString.
  ["toString/cached", () => d.toString(small), 50000],
  ["toString/fresh",  () => d.toString(d.add(small, small2)), 20000],
  ["add/34",       () => d.add(small, small2), 50000],
  ["mul/34",       () => d.mul(small, small2), 50000],
  ["div/34",       () => d.div(small, small2, P34), 20000],
  ["div/money",    () => d.div(small, small2, MONEY), 20000],
  ["round/34",     () => d.round(big, P34), 20000],
  ["cmp/34",       () => d.cmp(small, small2), 100000],
  ["sqrt/34",      () => d.sqrt(small, P34), 5000],
  ["exp/34",       () => d.exp(f("1.5"), P34), 2000],
  ["ln/34",        () => d.ln(f("123.456"), P34), 2000],
  ["pow/int",      () => d.pow(small, 12), 10000],
  ["add/400",      () => d.add(big, big2), 20000],
  ["mul/400",      () => d.mul(big, big2), 10000],
  ["div/400",      () => d.div(big, big2, P400), 2000],
  ["sqrt/400",     () => d.sqrt(big, P400), 500],
  ["exp/400",      () => d.exp(f("1.5"), P400), 200],
];
