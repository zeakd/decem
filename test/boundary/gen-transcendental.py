#!/usr/bin/env python3
"""The transcendental axis of gate C, built rather than searched for.

This was once written down as impossible on the grounds that exp and ln are not
algebraic. Their inverses do the construction:

    y = a (p+1)-digit integer ending in 5, the value meant to be a tie at p digits
    x = ln(y)     makes exp(x)   land near y
    x = exp(y)    makes ln(x)    land near y
    x = 10**y     makes log10(x) land near y
    x = asin(y)   makes sin(x)   land near y, and acos and atan the same way

Trigonometry was written down here as out of reach, on the grounds that reduction by pi
defeats the construction. It does not. An inverse sine lands inside (-pi/2, pi/2), where
there is nothing to reduce, so the tie is reached the same way as for exp. Both signs are
generated, because ceil and floor are defined by direction rather than by magnitude.

x has to be truncated to finitely many digits, so the result is not exactly on the tie
but very near it, which turns out to separate implementations better. When defects were
injected, the sticky-bit failure appeared only on the side just above.

MPFR builds the cases here. The answers are computed separately by oracle-boundary.py.
"""
import json, pathlib, gmpy2
from gmpy2 import mpfr

HERE = pathlib.Path(__file__).parent
ROUNDINGS = ["half-even", "half-up", "half-down", "up", "down", "ceil", "floor"]
PRECS = [7, 20, 34]


def bodies(p):
    return ["1" + "0" * (p - 1), "2" + "0" * (p - 1), "1" + "2" * (p - 1),
            "9" * p, "1" + "0" * (p - 2) + "1"]


def digits_of(v, n):
    """An mpfr as n significant decimal digits. gmpy2's .Ne format is broken, so .Ng is used."""
    return v.__format__(f".{n}g")


cases, n = [], 0
for p in PRECS:
    gmpy2.get_context().precision = int((p + 80) * 3.33) + 128
    for body in bodies(p):
        y = mpfr(body + "5") / mpfr(10) ** (len(body))      # normalised to 0.xxxx5
        # Each entry is the inverse that puts the operation's result near y.
        built = [
            ("exp", gmpy2.log(y)),          # exp(ln(y)) = y
            ("ln", gmpy2.exp(y)),           # ln(exp(y)) = y
            ("log10", mpfr(10) ** y),       # log10(10**y) = y
        ]
        # y sits in [1, 10), which is outside the domain of asin and acos, so the trig
        # targets are shifted one decimal place down. A shift of ten moves the exponent
        # and leaves the digits alone, so the target still ends in 5 at position p+1.
        for sign in (1, -1):
            t = y * sign / 10
            built += [("sin", gmpy2.asin(t)), ("cos", gmpy2.acos(t)), ("tan", gmpy2.atan(t))]
        for op, x in built:
            if not gmpy2.is_finite(x) or x <= 0 and op == "ln":
                continue
            for extra in (0, 5, 20):        # truncation depth controls the distance to the tie
                s = digits_of(x, p + 20 + extra)
                for rounding in ROUNDINGS:
                    n += 1
                    cases.append({"id": f"{op}-t{n:05d}", "op": op, "args": [s],
                                  "prec": {"digits": p}, "rounding": rounding,
                                  "boundary": f"inverse+{extra}"})

out = HERE / "cases-transcendental.jsonl"
out.write_text("\n".join(json.dumps(c) for c in cases) + "\n")
by = {}
for c in cases:
    by[c["op"]] = by.get(c["op"], 0) + 1
print(f"  cases-transcendental.jsonl  {len(cases)} cases  " +
      " ".join(f"{k}({v})" for k, v in sorted(by.items())))
print("  built through inverses: log, exp, a power of ten, and the inverse trigonometric functions")
