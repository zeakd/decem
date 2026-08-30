#!/usr/bin/env python3
"""Checks the oracle itself. Without this, an unverified tool would be the reference.

Four things:
  1. Known values that cannot be got wrong: 1/3, log10(1000), sqrt(4).
  2. Self-consistency: the result at p digits equals the result at p+60 rounded to p.
     For a correctly-rounded oracle these must agree, which catches a bug without
     anyone knowing the right answer in advance.
  3. Round trips: exp(ln(x)) and sqrt(x)^2 land within an ulp.
  4. The Inexact flag actually reports whether rounding happened.
"""
import sys
from contextlib import contextmanager
from decimal import (Decimal, localcontext, Inexact, ROUND_HALF_EVEN,
                     MAX_EMAX, MIN_EMIN)

fails = []
def check(name, got, want):
    ok = str(got) == str(want)
    print(f"  {'✓' if ok else '✗'} {name:<44} {got}")
    if not ok:
        fails.append(f"{name}: got {got}, want {want}")

@contextmanager
def ctx_at(prec, rounding=ROUND_HALF_EVEN):
    with localcontext() as c:
        c.prec, c.Emax, c.Emin, c.rounding = prec, MAX_EMAX, MIN_EMIN, rounding
        c.clear_flags()
        yield c

print("1. known values")
with ctx_at(20) as c:
    check("1/3   @20", c.divide(Decimal(1), Decimal(3)), "0.33333333333333333333")
    check("1/2   @20", c.divide(Decimal(1), Decimal(2)), "0.5")
    check("log10(1000)", Decimal(1000).log10(context=c), "3")
    check("sqrt(4)", c.sqrt(Decimal(4)), "2")
    check("exp(0)", Decimal(0).exp(context=c), "1")
    check("ln(1)", Decimal(1).ln(context=c), "0")

print("\n2. self-consistency: p digits equals p+60 digits rounded to p")
CASES = [("div", "1", "7"), ("div", "355", "113"), ("sqrt", "2", None),
         ("sqrt", "1.0000000000000000000000001", None), ("exp", "1", None),
         ("exp", "23.4567", None), ("ln", "2", None), ("ln", "1.0000001", None),
         ("log10", "7", None), ("log10", "2.5", None)]
def compute(op, a, b, prec):
    with ctx_at(prec) as c:
        x = Decimal(a)
        if op == "div":   return c.divide(x, Decimal(b))
        if op == "sqrt":  return c.sqrt(x)
        if op == "exp":   return x.exp(context=c)
        if op == "ln":    return x.ln(context=c)
        if op == "log10": return x.log10(context=c)
for p in (7, 20, 34, 100):
    for op, a, b in CASES:
        lo = compute(op, a, b, p)
        with ctx_at(p) as c:                       # round the high-precision result back to p
            hi = +compute(op, a, b, p + 60)
        label = f"{op}({a}{',' + b if b else ''}) @{p}"
        if str(lo) != str(hi):
            print(f"  ✗ {label:<44} {lo}  vs  {hi}")
            fails.append(f"{label}: {lo} != {hi}")
print(f"  all {len(CASES) * 4} agree" if not fails else "")

print("\n3. round trips, within an ulp of the requested precision")
for x_s in ["2", "0.5", "123.456", "1.0000001"]:
    p = 40
    with ctx_at(p + 5) as c:
        x = Decimal(x_s)
        back = x.ln(context=c).exp(context=c)
        rel = abs((back - x) / x)
        ok = rel < Decimal(10) ** (-(p - 2))
        print(f"  {'ok ' if ok else 'BAD'} exp(ln({x_s}))  relative error {rel:.2e}")
        if not ok: fails.append(f"exp(ln({x_s})) round trip error {rel}")
    with ctx_at(p + 5) as c:
        r = c.sqrt(Decimal(x_s)); back = r * r
        rel = abs((back - Decimal(x_s)) / Decimal(x_s))
        ok = rel < Decimal(10) ** (-(p - 2))
        print(f"  {'ok ' if ok else 'BAD'} sqrt({x_s})^2   relative error {rel:.2e}")
        if not ok: fails.append(f"sqrt({x_s})^2 round trip error {rel}")

print("\n4. the Inexact flag")
for label, fn, want in [
    ("1/2 at 20 digits, should be exact",  lambda c: c.divide(Decimal(1), Decimal(2)), False),
    ("1/3 at 20 digits, should be inexact", lambda c: c.divide(Decimal(1), Decimal(3)), True),
    ("sqrt(4), should be exact",  lambda c: c.sqrt(Decimal(4)),               False),
    ("sqrt(2), should be inexact", lambda c: c.sqrt(Decimal(2)),               True),
]:
    with ctx_at(20) as c:
        fn(c); got = bool(c.flags[Inexact])
        ok = got == want
        print(f"  {'✓' if ok else '✗'} {label:<44} inexact={got}")
        if not ok: fails.append(f"{label}: inexact={got}, want={want}")

print()
if fails:
    print(f"oracle verification failed, {len(fails)} problems")
    for f in fails: print("   ", f)
    sys.exit(1)
print("oracle verified; it can be used as the reference")
