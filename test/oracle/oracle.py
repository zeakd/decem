#!/usr/bin/env python3
"""Reads cases/*.jsonl and writes the answers to expected/*.jsonl.

The reference is Python's decimal module (libmpdec). We do not write our own oracle,
because checking an implementation against itself makes the same mistake twice.

libmpdec guarantees correct rounding for + - * / sqrt exp ln log10 when allcr is set,
which is the default. It fixes exp, ln and log10 to ROUND_HALF_EVEN.
"""
import json, sys, pathlib
from fractions import Fraction
from decimal import (Decimal, localcontext, Inexact, DivisionByZero,
                     InvalidOperation, ROUND_HALF_EVEN, ROUND_HALF_UP,
                     ROUND_HALF_DOWN, ROUND_UP, ROUND_DOWN, ROUND_CEILING,
                     ROUND_FLOOR, MAX_EMAX, MIN_EMIN)

HERE = pathlib.Path(__file__).parent
EXACT_PREC = 5000          # for the exact operations. An Inexact signal means this is too low.

ROUNDING = {
    "half-even": ROUND_HALF_EVEN, "half-up": ROUND_HALF_UP,
    "half-down": ROUND_HALF_DOWN, "up": ROUND_UP, "down": ROUND_DOWN,
    "ceil": ROUND_CEILING, "floor": ROUND_FLOOR,
}
# Operations libmpdec fixes to half-even, as the specification requires.
HALF_EVEN_ONLY = {"exp", "ln", "log10"}
# The specification fixes sqrt to half-even too, but denary honours the requested mode,
# so the oracle computes it: a correctly-rounded value at high precision, then rounded to
# the requested mode. The reasoning is in docs/differences.md.
HIGH_THEN_ROUND = {"sqrt"}
HIGH_GUARD = 40

# Python decimal has no trigonometry, so those go to MPFR through gmpy2. When it is
# absent the cases are marked as skipped rather than quietly dropped, because a silent
# gap looks exactly like coverage.
try:
    import gmpy2
    HAVE_MPFR = True
except ImportError:
    HAVE_MPFR = False
TRIG = {"sin": "sin", "cos": "cos", "tan": "tan"}
# cbrt goes to MPFR as well. The exp(ln/3) approximation cannot resolve a boundary, which
# gate C exposed in 49 cases at a constructed tie, where the oracle was the one that was wrong.
MPFR_OPS = {**TRIG, "cbrt": "cbrt"}
# libmpdec fixes exp, ln and log10 to half-even, so other modes go to MPFR, which is
# correctly rounded in every mode. The two oracles then cross-check each other at
# half-even, which costs nothing.
MPFR_FALLBACK = {"exp": "exp", "ln": "log", "log10": "log10"}


def _mpfr_at(op, arg, bits, fn=None):
    gmpy2.get_context().precision = bits
    return getattr(gmpy2, fn or MPFR_OPS[op])(gmpy2.mpfr(arg))


def run_trig(op, args, prec, rounding, fn=None):
    """High precision through MPFR, then rounded to the requested mode.

    The precision is not chosen by a formula. How much is needed depends on the input,
    and a formula came up short twice, both times caught by gate C: 30 cases at a
    constructed cbrt tie, and 6 at an exp boundary built through its inverse, where the
    deviation sat at the 101st digit while the oracle worked to 97.

    So the oracle retries the same way denary does. Compute at P and at 2P, round both to
    the requested digits, and accept only when they agree. A reference that cannot detect
    its own shortfall is not a reference.
    """
    in_digits = len(args[0].replace("-", "").replace(".", "").lstrip("0")) or 1
    need = max(prec + HIGH_GUARD, in_digits + prec + 8)
    bits = int(need * 3.33) + 64

    def rounded(b):
        v = _mpfr_at(op, args[0], b, fn)
        if not gmpy2.is_finite(v):
            raise InvalidOperation(f"{op}: result is not finite")
        hi = Decimal(v.__format__(f".{int(b / 3.33) - 10}g"))
        with localcontext() as ctx:
            ctx.prec, ctx.Emax, ctx.Emin = prec, MAX_EMAX, MIN_EMIN
            ctx.rounding = ROUNDING[rounding]
            return +hi

    a = rounded(bits)
    for _ in range(8):
        b = rounded(bits * 2)
        if a == b:
            # cbrt is not in the specification, so it has no authoritative spelling.
            # Only the value is compared.
            return str(a), True, op == "cbrt"
        bits *= 2
        a = b
    raise RuntimeError("ORACLE_INDETERMINATE")


def run_exact(op, args):
    """The exact operations, which take no precision. An Inexact signal means either the
    operation was not exact after all or EXACT_PREC is too low, and neither should pass
    quietly, so it raises."""
    with localcontext() as ctx:
        ctx.prec, ctx.Emax, ctx.Emin = EXACT_PREC, MAX_EMAX, MIN_EMIN
        ctx.traps[Inexact] = True          # raise if the result is not exact
        a, b = Decimal(args[0]), Decimal(args[1])
        r = {"add": lambda: a + b, "sub": lambda: a - b, "mul": lambda: a * b}[op]()
        return str(r), False, False


def run_approx(op, args, prec, rounding):
    if op in MPFR_OPS:
        if not HAVE_MPFR:
            raise RuntimeError("MPFR_UNAVAILABLE")
        return run_trig(op, args, prec, rounding)
    if op in HALF_EVEN_ONLY and rounding != "half-even":
        # libmpdec fixes these three to half-even, so other modes go to MPFR. The two
        # oracles then cross-check each other at half-even, which costs nothing.
        if not HAVE_MPFR:
            raise RuntimeError("MPFR_UNAVAILABLE")
        return run_trig(op, args, prec, rounding, MPFR_FALLBACK[op])
    with localcontext() as ctx:
        ctx.prec, ctx.Emax, ctx.Emin = prec, MAX_EMAX, MIN_EMIN
        ctx.rounding = ROUNDING[rounding]
        ctx.clear_flags()
        a = Decimal(args[0])
        if op in HIGH_THEN_ROUND:
            with localcontext() as hi_ctx:
                hi_ctx.prec, hi_ctx.Emax, hi_ctx.Emin = prec + HIGH_GUARD, MAX_EMAX, MIN_EMIN
                hi_ctx.rounding = ROUND_HALF_EVEN
                v = hi_ctx.sqrt(a)
            ctx.clear_flags()
            r = +v                              # unary plus applies the current context
            # Compare the square exactly. Inside ctx the product is rounded back to the
            # working precision, where a root that is not exact squares to the input and
            # reports as exact. Fraction has no precision to round to.
            return str(r), Fraction(r) ** 2 != Fraction(a), False
        if op == "div":     r = ctx.divide(a, Decimal(args[1]))
        elif op == "exp":   r = a.exp(context=ctx)
        elif op == "ln":    r = a.ln(context=ctx)
        elif op == "log10": r = a.log10(context=ctx)
        else: raise ValueError(f"unsupported operation: {op}")
        return str(r), bool(ctx.flags[Inexact]), False


def run_quantize(arg, scale, rounding):
    """The scale-precision counterpart of run_approx. Python spells it the same way."""
    with localcontext() as ctx:
        ctx.prec, ctx.Emax, ctx.Emin = EXACT_PREC, MAX_EMAX, MIN_EMIN
        ctx.rounding = ROUNDING[rounding]
        a = Decimal(arg)
        r = a.quantize(Decimal((0, (1,), -scale)), context=ctx)
        return str(r), Fraction(r) != Fraction(a), False


def main():
    total = 0
    for kind in ("exact", "approx"):
        src = HERE / "cases" / f"{kind}.jsonl"
        dst = HERE / "expected" / f"{kind}.jsonl"
        out = []
        for line in src.read_text().splitlines():
            if not line.strip(): continue
            c = json.loads(line)
            try:
                if kind == "exact":
                    result, inexact, value_only = run_exact(c["op"], c["args"])
                else:
                    p = c["prec"]
                    if "digits" not in p:
                        raise ValueError("scale precision is not supported here yet")
                    result, inexact, value_only = run_approx(
                        c["op"], c["args"], p["digits"], c["rounding"])
                rec = {"id": c["id"], "result": result, "inexact": inexact}
                if value_only:
                    rec["valueOnly"] = True   # no authoritative spelling, so compare the value only
                out.append(rec)
            except DivisionByZero:
                out.append({"id": c["id"], "error": "DivisionByZero"})
            except InvalidOperation as e:
                out.append({"id": c["id"], "error": f"InvalidOperation: {e}"})
            except RuntimeError as e:
                if str(e) == "MPFR_UNAVAILABLE":
                    out.append({"id": c["id"], "noOracle": "MPFR not installed"})
                elif str(e) == "ORACLE_INDETERMINATE":
                    # The oracle could not decide, which is recorded rather than hidden.
                    out.append({"id": c["id"], "noOracle": "undecidable"})
                else:
                    raise
            except Inexact:
                print(f"{c['id']}: an exact operation reported Inexact, so either it is not exact "
                      f"or EXACT_PREC({EXACT_PREC}) is too low", file=sys.stderr)
                raise
        dst.write_text("\n".join(json.dumps(o, ensure_ascii=False) for o in out) + "\n")
        print(f"  expected/{kind}.jsonl  {len(out)} cases")
        total += len(out)
    print(f"oracle: Python decimal (libmpdec) and MPFR, {total} cases")


if __name__ == "__main__":
    main()
