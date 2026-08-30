#!/usr/bin/env python3
"""Answers for the boundary cases, reusing the logic in test/oracle/oracle.py."""
import json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "oracle"))
from oracle import run_approx, run_quantize  # noqa: E402

HERE = pathlib.Path(__file__).parent
out = []
sources = ["cases.jsonl"]
tp = HERE / "cases-transcendental.jsonl"
if tp.exists():
    sources.append(tp.name)
for line in "\n".join((HERE / f).read_text() for f in sources).splitlines():
    if not line.strip():
        continue
    c = json.loads(line)
    if "scale" in c["prec"]:
        result, inexact, value_only = run_quantize(
            c["args"][0], c["prec"]["scale"], c["rounding"])
    else:
        result, inexact, value_only = run_approx(
            c["op"], c["args"], c["prec"]["digits"], c["rounding"])
    rec = {"id": c["id"], "result": result, "inexact": inexact}
    if value_only:
        rec["valueOnly"] = True
    out.append(rec)
(HERE / "expected.jsonl").write_text(
    "\n".join(json.dumps(o, ensure_ascii=False) for o in out) + "\n")
print(f"  expected.jsonl  {len(out)} cases")
