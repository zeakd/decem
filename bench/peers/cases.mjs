// The cases the comparison runs, declared once so that every target answers the same
// questions in the same order.
//
// Why these and not others. Each is an operation the libraries genuinely share, at a size
// somebody actually uses. `compare` is here because decem loses it, and a table that only
// holds the wins is an advertisement rather than a measurement. The 400-digit rows are
// here because the representation is the reason this library exists and that is where the
// choice shows.
export const A = "123456.789";
export const B = "987.654321";
export const WIDE = "1." + "1234567890".repeat(40);
export const DIGITS = 34;
export const LITERAL = "123456.7890123456789012345678901234";

export const CASES = [
  { key: "parse", label: "parse a 34-digit literal", iters: 20000 },
  { key: "toString", label: "to string", iters: 20000 },
  { key: "add", label: "add", iters: 50000 },
  { key: "mul", label: "multiply", iters: 50000 },
  { key: "div", label: "divide, 34 digits", iters: 10000 },
  { key: "cmp", label: "compare", iters: 100000 },
  { key: "sqrt", label: "sqrt, 34 digits", iters: 3000 },
  { key: "exp", label: "exp, 34 digits", iters: 1000 },
  { key: "ln", label: "ln, 34 digits", iters: 1000 },
  { key: "addWide", label: "add, 400 digits", iters: 10000 },
  { key: "mulWide", label: "multiply, 400 digits", iters: 5000 },
];

// A row decem loses needs a reason recorded here, and the report fails to generate
// without one. A losing row is a fact about the design; an unexplained one is a fact
// nobody looked at.
export const DECLARED_LOSSES = {
  cmp: "Both peers keep digits in a form that can be scanned directly, while decem has " +
       "to align two exponents before it can compare. It is the cheapest operation in the " +
       "table, so there is nothing else in the row to amortise that against.",
};

// Below this the two sides are treated as even rather than as a win or a loss, because
// the difference is inside what the same machine returns between runs.
export const EVEN_BAND = 0.05;
