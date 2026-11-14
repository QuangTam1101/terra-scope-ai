"""CMP-01: oracle vs POST /compare for Sahel vs Wisconsin (MERRA-2 air temperature, 2001-01 to 2025-12).
Writes validation/results/compare_case.json. The bootstrap interval itself is not recomputed (seeded resampling)."""
import json
import math
import sys
from pathlib import Path

import numpy as np
import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import oracle  # noqa: E402

API = "http://127.0.0.1:8000/api/v1"
VAR, S, E = "merra2_air_temperature_2m", "2001-01", "2025-12"
A, B = (-17, 10, 30, 18), (-92.9, 42.5, -86.8, 47.1)


def main():
    body = {"variable_id": VAR, "region_a": {"type": "bbox", "bbox": list(A)}, "region_b": {"type": "bbox", "bbox": list(B)}, "start": S, "end": E}
    r1 = requests.post(API + "/compare", json=body, timeout=600).json()
    r2 = requests.post(API + "/compare", json=body, timeout=600).json()
    ea = oracle.regional_expected(VAR, A, S, E)
    eb = oracle.regional_expected(VAR, B, S, E)
    sa = oracle.region_series(VAR, A, S, E).values
    sb = oracle.region_series(VAR, B, S, E).values
    diff = (oracle.anomaly(sa) - oracle.anomaly(sb)).dropna().to_numpy()
    exp_slope = oracle.sen_slope(diff) * 120
    exp_p = oracle.hamed_rao(diff)["p"]
    d = r1["difference"]
    opp = ea["slope_per_decade"] * eb["slope_per_decade"] < 0
    want_verdict = ("opposite_significant" if d["significant"] else "opposite_not_significant") if opp else "same_direction"
    checks = [
        {"check": "A slope = oracle", "pass": math.isclose(r1["a"]["slope_per_decade"], ea["slope_per_decade"], rel_tol=1e-9), "expected": ea["slope_per_decade"], "actual": r1["a"]["slope_per_decade"]},
        {"check": "B slope = oracle", "pass": math.isclose(r1["b"]["slope_per_decade"], eb["slope_per_decade"], rel_tol=1e-9), "expected": eb["slope_per_decade"], "actual": r1["b"]["slope_per_decade"]},
        {"check": "A and B raw p = oracle", "pass": math.isclose(r1["a"]["p_value"], ea["p_value"], rel_tol=1e-7) and math.isclose(r1["b"]["p_value"], eb["p_value"], rel_tol=1e-7)},
        {"check": "decision rule: significant == (p < alpha and CI excludes 0)", "pass": d["significant"] == (d["p_value"] < 0.05 and (d["ci"][0] > 0 or d["ci"][1] < 0)), "actual": [d["p_value"], d["ci"], d["significant"]]},
        {"check": "verdict label consistent with signs and rule", "pass": r1["verdict"] == want_verdict, "expected": want_verdict, "actual": r1["verdict"]},
        {"check": "bootstrap result reproducible across two calls", "pass": r1["difference"] == r2["difference"], "actual": [r1["difference"]["p_value"], r2["difference"]["p_value"]]},
        {"check": "difference slope = oracle Sen slope of anomaly(A) - anomaly(B)", "pass": math.isclose(d["slope_diff_per_decade"], exp_slope, rel_tol=1e-9), "expected": exp_slope, "actual": d["slope_diff_per_decade"]},
        {"check": "difference p = oracle Hamed-Rao p on the difference series", "pass": math.isclose(d["p_value"], exp_p, rel_tol=1e-7), "expected": exp_p, "actual": d["p_value"]},
    ]
    rec = {"id": "CMP-01", "label": f"Sahel vs Wisconsin, MERRA-2 air temperature, {S} to {E}", "bbox_a": A, "bbox_b": B,
           "difference": d, "verdict": r1["verdict"], "checks": checks,
           "not_independently_verified": "The moving-block bootstrap interval was not recomputed by the oracle (seeded resampling); only determinism and the decision rule were checked.",
           "note_difference_estimator": f"slope_diff is the Sen slope of the monthly anomaly difference series (A minus B), not the difference of the two seasonal Sen slopes ({ea['slope_per_decade'] - eb['slope_per_decade']:.3f}).",
           "status": "PASS" if all(c["pass"] for c in checks) else "FAIL"}
    (HERE / "results" / "compare_case.json").write_text(json.dumps(rec, indent=1, default=str), encoding="utf-8")
    print(rec["status"], [(c["check"], c["pass"]) for c in checks])


if __name__ == "__main__":
    main()
