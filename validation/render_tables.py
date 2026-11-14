"""Prints Markdown tables from the executed results (used to build SCIENTIFIC_VALIDATION_RESULTS.md)."""
import json
from pathlib import Path
RES = Path(__file__).resolve().parent / "results"
def f(x, d=4):
    if x is None: return "n/a"
    if isinstance(x, bool): return str(x)
    if isinstance(x, (int,)): return str(x)
    if isinstance(x, float):
        return f"{x:.2e}" if (x != 0 and abs(x) < 1e-3) else f"{x:.{d}f}"
    return str(x)
rows = json.loads((RES / "backend_cases.json").read_text(encoding="utf-8"))
print("| ID | Case | Variable | Box (W,S,E,N) | Period | Oracle slope/dec | API slope/dec | Oracle p | API p | HR p | n | Verdict | Max value delta | Status |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
for r in rows:
    e, a = r.get("expected") or {}, r.get("actual_backend") or {}
    vd = max([c["delta"] for c in r["checks"] if c["check"] == "all monthly values" and c.get("delta") is not None] or [None], key=lambda v: v or 0)
    verdict = r["expected_behaviour"] if r["expected_behaviour"] != "ok" else ("significant" if e.get("significant") else "not significant")
    print(f"| {r['id']} | {r['label']} | {r['variable_id']} | {', '.join(str(v) for v in r['bbox'])} | {r['start']} to {r['end']} | "
          f"{f(e.get('slope_per_decade'))} | {f(a.get('slope_per_decade'))} | {f(e.get('p_value'))} | {f(a.get('p_value'))} | "
          f"{f(e.get('p_value_hr'))} | {f(e.get('n_months'))} | {verdict} | {f(vd)} | {r['status']} |")
print()
print("Max deltas over all regional cases:")
agg = {}
for r in rows:
    for c in r["checks"]:
        if isinstance(c.get("delta"), (int, float)):
            agg[c["check"]] = max(agg.get(c["check"], 0), abs(c["delta"]))
for k, v in agg.items(): print(f"- {k}: {v:.3g}")
print()
for g in json.loads((RES / "grid_cases.json").read_text(encoding="utf-8")):
    print(f"### {g['id']} {g['variable_id']} {g['start']} to {g['end']}: {g['status']}")
    for c in g["checks"]:
        print(f"- {c['check']}: expected {c.get('expected','')} actual {c.get('actual','')} delta {c.get('delta','')} -> {'PASS' if c['pass'] else 'FAIL'}")
    print(f"- tie correction: {g['methodology_tie_correction']}")
c = json.loads((RES / "compare_case.json").read_text(encoding="utf-8"))
print(f"### {c['id']} {c['label']}: {c['status']}")
for k in c["checks"]: print(f"- {k['check']}: expected {k.get('expected','')} actual {k.get('actual','')} -> {'PASS' if k['pass'] else 'FAIL'}")
print(json.dumps(json.loads((RES / 'synthetic_extra.json').read_text(encoding='utf-8')), indent=1))
ui = json.loads((RES / "ui_pdf_cases.json").read_text(encoding="utf-8"))
for s in ui["scenarios"]:
    print(f"### {s['id']} ({s['maps_to']}) {s['variable_id']} {s['ui_place_input']} bbox {s['bbox']}: {s['status']}")
    for k in s["checks"]: print(f"- {k['check']}: expected {k.get('expected','')} actual {k.get('actual','')} -> {'PASS' if k['pass'] else 'FAIL'}")
print("### PDF", ui["report"]["status"], ui["report"]["pages"])
for k in ui["report"]["checks"]: print(f"- {k['check']}: {k.get('actual','')} -> {'PASS' if k['pass'] else 'FAIL'}")
