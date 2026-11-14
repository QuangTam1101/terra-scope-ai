"""Merges every executed validation result into scientific_validation_results.json (repository root).
Only executed tests are included; nothing is filled in by hand."""
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
RES = HERE / "results"
ROOT = HERE.parent
CAT = {"imerg_precip": ("GPM_3IMERGM v07", "Precipitation"), "merra2_air_temperature_2m": ("M2IMNXASM v5.12.4", "Air temperature (2 m)"),
       "gldas_air_temperature": ("GLDAS_NOAH025_M v2.1", "Air temperature over land"),
       "gldas_soil_moisture_0_10cm": ("GLDAS_NOAH025_M v2.1", "Soil moisture (0-10 cm)"),
       "gldas_evapotranspiration": ("GLDAS_NOAH025_M v2.1", "Evapotranspiration")}


def main():
    try:
        version = requests.get("http://127.0.0.1:8000/api/v1/health", timeout=10).json().get("version")
    except Exception:
        version = None
    method = {"backend_version": version, "regional": "Seasonal Mann-Kendall (pymannkendall 1.4.3 seasonal_test, period 12) on monthly values; "
              "seasonal Sen slope x10 per decade; verdict raw p < alpha (0.05); Hamed-Rao on anomalies diagnostic; OLS anomaly 95% CI",
              "grid": "vectorised Seasonal MK without tie correction + seasonal Sen; BH-FDR over all valid cells", "data": "0.5 degree processed grid (GRID_V2)"}
    out = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "method_version": method, "cases": []}
    for r in json.loads((RES / "backend_cases.json").read_text(encoding="utf-8")):
        prod, var = CAT[r["variable_id"]]
        out["cases"].append({
            "test_id": r["id"], "kind": "regional (oracle vs API)", "label": r["label"], "dataset": prod, "variable": var, "variable_id": r["variable_id"],
            "region": r["region"], "bbox_WSEN": r["bbox"], "interval": [r["start"], r["end"]],
            "expected_behaviour": r["expected_behaviour"], "expected_oracle": r.get("expected"), "actual_backend": r.get("actual_backend"),
            "checks": r["checks"], "status": r["status"], "root_cause_category": None if r["status"] == "PASS" else "unclassified",
            "notes": r.get("oracle_note")})
    for g in json.loads((RES / "grid_cases.json").read_text(encoding="utf-8")):
        prod, var = CAT[g["variable_id"]]
        out["cases"].append({"test_id": g["id"], "kind": "grid, full family (oracle vs /trends/grid)", "dataset": prod, "variable": var,
                             "bbox_WSEN": [-180, -90, 180, 90], "interval": [g["start"], g["end"]], "cells": g["cells"],
                             "significant_cells_api": g["significant_cells_api"], "checks": g["checks"],
                             "methodology_tie_correction": g["methodology_tie_correction"], "status": g["status"]})
    c = json.loads((RES / "compare_case.json").read_text(encoding="utf-8"))
    out["cases"].append({"test_id": c["id"], "kind": "region comparison (deterministic parts)", "label": c["label"], "dataset": "M2IMNXASM v5.12.4",
                         "bbox_A": c["bbox_a"], "bbox_B": c["bbox_b"], "interval": ["2001-01", "2025-12"], "actual_backend": c["difference"],
                         "checks": c["checks"], "status": c["status"], "limitations": [c["not_independently_verified"], c["note_difference_estimator"]]})
    junit = ET.parse(RES / "synthetic_junit.xml").getroot()
    extra = json.loads((RES / "synthetic_extra.json").read_text(encoding="utf-8"))
    for tc in junit.iter("testcase"):
        name = tc.get("name")
        failed = tc.find("failure") is not None or tc.find("error") is not None
        rec = {"test_id": re.match(r"test_(SY\d+)", name).group(1), "kind": "synthetic (production functions vs oracle)", "name": name,
               "status": "FAIL" if failed else "PASS", "seconds": float(tc.get("time"))}
        if rec["test_id"] == "SY12":
            rec["measured"] = extra["SY12_type_I_error_AR1_phi0.8"]
            rec["status"] = "INCONCLUSIVE" if not failed else "FAIL"
            rec["notes"] = "Recorded measurement, not a pass/fail on the code: false-positive rate of the decision rule under strong autocorrelation."
        out["cases"].append(rec)
    ui = json.loads((RES / "ui_pdf_cases.json").read_text(encoding="utf-8"))
    run = json.loads((ROOT / "web" / "e2e" / "out" / "scientific" / "ui_run.json").read_text(encoding="utf-8"))
    raw = {s["id"]: s for s in run["scenarios"]}
    for s in ui["scenarios"]:
        prod, var = CAT[s["variable_id"]]
        rs = raw[s["id"]]
        out["cases"].append({"test_id": s["id"], "kind": "browser + PDF (Explorer and Scientist)", "maps_to": s["maps_to"], "dataset": prod, "variable": var,
                             "ui_place_input": s["ui_place_input"], "first_search_hit": s.get("first_search_hit"), "bbox_WSEN": s["bbox"],
                             "interval": [s["start"], s["end"]], "expected_oracle": s["expected"], "actual_backend": s["actual_backend"],
                             "actual_frontend": {"explorer_excerpt": rs["explorer_text"][:400], "scientist_excerpt": rs["scientist_text"][:400],
                                                 "requests_after_mode_switch": rs["requests_after_mode_switch"]},
                             "actual_pdfs": {"explorer": run["pdfs"]["explorer"], "scientist": run["pdfs"]["scientist"]},
                             "screenshots": [f"web/e2e/out/scientific/{s['id']}-explorer.png", f"web/e2e/out/scientific/{s['id']}-scientist.png"],
                             "checks": s["checks"], "status": s["status"]})
    rep = ui["report"]
    out["cases"].append({"test_id": "PDF-01", "kind": "PDF content and layout", "pages": rep["pages"], "page_images": rep["page_pngs"],
                         "checks": rep["checks"], "status": rep["status"]})
    for tid, what, why in [
            ("NR-01", "Gemini Detective answers", "Spec forbids using Gemini to verify statistics; live Gemini tests skipped (no key on this run)."),
            ("NR-02", "Independent recomputation of the moving-block bootstrap interval", "Seeded resampling; only determinism and the decision rule were checked (CMP-01)."),
            ("NR-03", "Arbitrary box drawn by dragging on the map in the browser", "Harness used place search and coordinates; arbitrary boxes covered through the API."),
            ("NR-04", "Forecast model validation", "Separate task, not part of this suite.")]:
        out["cases"].append({"test_id": tid, "kind": "designed, not executed", "name": what, "status": "NOT RUN", "notes": why})
    counts = {}
    for k in out["cases"]:
        counts[k["status"]] = counts.get(k["status"], 0) + 1
    out["summary"] = {"designed": len(out["cases"]), "executed": sum(1 for k in out["cases"] if k["status"] != "NOT RUN"), "by_status": counts}
    (ROOT / "scientific_validation_results.json").write_text(json.dumps(out, indent=1, ensure_ascii=False, default=str), encoding="utf-8")
    print(out["summary"])


if __name__ == "__main__":
    main()
