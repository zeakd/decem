// One workload, run unchanged by Node, Bun, Deno and the browser.
//
// node:crypto is avoided because the browser does not have it and SubtleCrypto is async,
// which would mean two versions of this file. What is needed is not cryptographic
// strength but that a single differing digit changes the result, so FNV-1a is enough.
export function digestOf(lines) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const s = lines.join("\n");
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
    h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"));
}

/** A deterministic workload that exercises every family of operations once. */
export function runWorkload(d) {
  const f = d.dec;
  const lines = [];
  const P = [{ digits: 7 }, { digits: 20 }, { digits: 34 },
             { scale: 2, rounding: "half-even" }, { digits: 50, rounding: "floor" }];
  const XS = ["1", "2", "0.1", "123.456", "-7.25", "1e-20", "9999999999999999999", "0.000001"];
  for (const a of XS) {
    for (const b of XS) {
      lines.push(d.toString(d.add(f(a), f(b))));
      lines.push(d.toString(d.mul(f(a), f(b))));
      for (const p of P) {
        try { lines.push(d.toString(d.div(f(a), f(b), p))); }
        catch (e) { lines.push(`!${e.constructor.name}`); }
      }
    }
    for (const p of P)
      for (const [name, fn] of [["sqrt", d.sqrt], ["cbrt", d.cbrt], ["exp", d.exp],
                                ["ln", d.ln], ["log10", d.log10],
                                ["sin", d.sin], ["cos", d.cos], ["tan", d.tan]]) {
        try { lines.push(`${name}:${d.toString(fn(f(a), p))}`); }
        catch (e) { lines.push(`${name}!${e.constructor.name}`); }
      }
    lines.push(d.toString(d.pow(f(a), 7)));
  }
  return lines;
}

/** Both limit axes. Only the digit ceiling varies between runtimes. */
export function limitsOf(d) {
  let digitOverflow = null, exponentOverflow = null;
  try { d.add(d.dec`1E+9000000000`, d.dec`1`); }
  catch (e) { digitOverflow = e.constructor.name; }
  try { d.mul(d.dec`1E+9000000000000000`, d.dec`1E+9000000000000000`); }
  catch (e) { exponentOverflow = e.constructor.name; }
  return { maxDigits: d.maxDigits(), digitOverflow, exponentOverflow, expLimit: d.EXP_LIMIT };
}
