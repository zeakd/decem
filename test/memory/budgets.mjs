// Gate J: what each operation is allowed to cost in memory.
//
// A budget is a declared limit rather than a measurement. The case runs in a child with
// the heap capped at its budget and either finishes or dies, so there is no interval, no
// quartile and nothing to remeasure. Gate F cannot see this axis at all: 856MB and 15ms
// read the same to a timer, which is how a quadratic table lived in pow10 until an eight
// byte literal ended a process with it.
//
// The sizes sit in the gap between what the corpora exercise, 34 and 400 digits, and the
// ceiling this library declares, above three hundred million. Nothing ran in that gap.
//
// Every case here runs inside 24MB, which is the floor of the ladder these were measured
// against, so they all carry the same budget rather than a differentiated one that would
// only look precise. 64MB is chosen for the margin: an engine that needs a little more to
// start must not fail the build, and the table this gate exists to catch wanted 856MB for
// the first case, thirteen times over.
export const CASES = [
  { name: "digits/60k",         budget: 64,  answer: "60001",
    code: 'd.digits(10n ** 60000n)' },
  { name: "add/gap-100k",       budget: 64,  answer: "100001",
    code: 'd.digits(d.add(d.dec`1e100000`, d.dec`1`).mant)' },
  { name: "mul/100k-by-100k",   budget: 64,  answer: "100000",
    code: 'd.digits(d.mul(d.dec`1e99999`, d.dec`1e99999`).mant) + 99999' },
  { name: "quantize/1e999999",  budget: 64,  answer: "1000000",
    code: 'd.digits(d.quantize(d.dec`1e999999`, { scale: 0 }).mant)' },
  { name: "toBigInt/1e200000",  budget: 64,  answer: "200001",
    code: 'd.toBigInt(d.dec`1e200000`).toString().length' },
  { name: "toFixed/1e300000",   budget: 64,  answer: "300001",
    code: 'd.toFixed(d.dec`1e300000`, 0).length' },
  { name: "div/2000-digits",    budget: 64,  answer: "2000",
    code: 'd.digits(d.div(d.dec`1`, d.dec`7`, { digits: 2000 }).mant)' },
  { name: "sqrt/2000-digits",   budget: 64,  answer: "2000",
    code: 'd.digits(d.sqrt(d.dec`2`, { digits: 2000 }).mant)' },
  { name: "exp/1000-digits",    budget: 64,  answer: "1000",
    code: 'd.digits(d.exp(d.dec`1.5`, { digits: 1000 }).mant)' },
  { name: "ln/1000-digits",     budget: 64,  answer: "1000",
    code: 'd.digits(d.ln(d.dec`3`, { digits: 1000 }).mant)' },
  // The comparison refuses to align the two operands, separating them by adjusted exponent
  // instead, and a comment in ops.ts is the only thing that said so. Nine thousand million
  // million is a legal exponent, so removing that step asks pow10 for a power no runtime
  // will build, and the process ends rather than answering.
  { name: "toPlainString/1e300000", budget: 64, answer: "300001",
    code: 'd.toPlainString(d.dec("1e300000")).length' },
  { name: "cmp/gap-9e15",       budget: 64,  answer: "1",
    code: 'd.cmp(d.dec("1e9000000000000000"), d.dec("1"))' },
  { name: "sin/500-digits",     budget: 64,  answer: "500",
    code: 'd.digits(d.sin(d.dec`1.2`, { digits: 500 }).mant)' },
];
