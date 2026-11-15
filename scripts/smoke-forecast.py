"""Offline real-artifact smoke test through the complete FastAPI HTTP contracts.

Uses TestClient or loopback HTTP, real NASA cubes and checksum-verified release
models; no training, Gemini, or external network calls. Run separately from unit tests.
"""
import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

from forecast_artifacts import MANIFEST_SHA256, verify_models

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--repo-root", type=Path, default=ROOT, help="Root when scripts are mounted separately into a container")
    parser.add_argument("--base-url", choices=["http://127.0.0.1:8000"], help="Test the running production server over loopback HTTP")
    args = parser.parse_args()
    root = args.repo_root.resolve()
    sys.path.insert(0, str(root))
    verify_models(root / "data-pipeline/models")
    os.environ.update(LLM_PROVIDER="template", GEMINI_API_KEY="", WARM_UP="0")
    rows = []
    def checked(response, expected=200):
        assert response.status_code == expected, f"HTTP {response.status_code}, expected {expected}"
        return response.json()

    if args.base_url:
        import httpx
        transport = httpx.Client(base_url=args.base_url, timeout=120, trust_env=False)
        # Keep the probe small: do not import a second scientific application in
        # the same cgroup when measuring the production server's memory needs.
        variable_ids = ("imerg_precip", "gldas_soil_moisture_0_10cm", "gldas_air_temperature",
                        "gldas_evapotranspiration", "merra2_air_temperature_2m")
    else:
        from fastapi.testclient import TestClient
        from backend.app.main import app
        from backend.app.catalog import VARIABLES
        from pipeline.forecast import AUX
        transport = TestClient(app)
        variable_ids = tuple(v.id for v in VARIABLES.values() if v.pipeline_id in AUX)
    with transport as client:
        checked(client.get("/api/v1/health"))
        checked(client.get("/api/v1/variables"))
        assert client.get("/docs").status_code == 200
        for variable_id in variable_ids:
            for mode, months in (("outlook", 18), ("satellite", 12)):
                started = time.perf_counter()
                status = checked(client.get("/api/v1/forecast/status", params={"variable_id": variable_id, "mode": mode}))
                year, month = map(int, status["origin"].split("-"))
                first = f"{year + month // 12:04d}-{month % 12 + 1:02d}"
                request = {"variable_id": variable_id, "mode": mode, "start": first, "months": months,
                           "region": {"type": "preset", "id": "mekong_delta"}}
                result = checked(client.post("/api/v1/forecast", json=request))
                assert len(result["points"]) == months
                for point in result["points"]:
                    assert all(point[k] is not None and math.isfinite(point[k]) for k in ("forecast", "lower", "upper", "climatology"))
                    assert point["lower"] <= point["forecast"] <= point["upper"]
                    assert all(0 <= point[k] <= 1 for k in ("p_below", "p_near", "p_above"))
                    assert abs(sum(point[k] for k in ("p_below", "p_near", "p_above")) - 1) <= 0.002
                assert result["interval"] == 0.8
                assert result["backtest"] and result["analogs"] and result["data_inputs"]
                assert result["explanation"]["contributions"] and result["explanation"]["conditions"]
                assert result["explanation"]["scientific"]["model"]["mode"] == mode
                regional_seconds = time.perf_counter() - started
                target = result["points"][2]["t"]
                started = time.perf_counter()
                grid = checked(client.get("/api/v1/forecast/map", params={"variable_id": variable_id, "mode": mode, "month": target}))
                assert grid["cells"] and grid["t"] == target and grid["lead_months"] == 3
                assert all(math.isfinite(c["z_forecast"]) and 0 <= c["p_above"] <= 1 and 0 <= c["p_below"] <= 1
                           and c["p_below"] + c["p_above"] <= 1.002 for c in grid["cells"])
                row = {"variable": variable_id, "mode": mode, "origin": status["origin"], "months": months,
                       "regional_seconds": round(regional_seconds, 3), "map_seconds": round(time.perf_counter()-started, 3),
                       "map_cells": len(grid["cells"]), "first_forecast": result["points"][0]["forecast"],
                       "status": "passed"}
                rows.append(row)
                print(json.dumps(row), flush=True)
        # Match UI defaults, including the current-month Outlook start.
        for mode in ("outlook", "satellite"):
            default = checked(client.post("/api/v1/forecast", json={"variable_id": "imerg_precip", "mode": mode,
                              "months": 13 if mode == "outlook" else 12, "region": {"type": "preset", "id": "mekong_delta"}}))
            assert default["points"]
            checked(client.get("/api/v1/forecast/map", params={"variable_id": "imerg_precip", "mode": mode}))
        reality = checked(client.get("/api/v1/forecast/reality-check"))
        assert reality["regions"] and reality["source"]
        checked(client.post("/api/v1/forecast", json={"variable_id": "imerg_precip", "months": 99,
                     "region": {"type": "preset", "id": "mekong_delta"}}), 422)
        checked(client.get("/api/v1/forecast/status", params={"variable_id": "unknown"}), 404)
        checked(client.get("/api/v1/forecast/map", params={"variable_id": "imerg_precip", "month": "2099-01"}), 400)
        checked(client.post("/api/v1/forecast", json={"variable_id": "gldas_soil_moisture_0_10cm", "months": 1,
                     "region": {"type": "bbox", "bbox": [-141, -31, -139, -29]}}), 422)
        trend = checked(client.post("/api/v1/trends", json={"variable_id": "imerg_precip", "start": "2001-01", "end": "2024-12",
                        "region": {"type": "preset", "id": "mekong_delta"}}))
        assert trend["n"] == 288 and not trend["significant"]
        assert abs(trend["slope_per_decade"] - 3.163604736328125) < 1e-10
        assert abs(trend["p_value"] - 0.11031644898805326) < 1e-10
        for variable_id in ("imerg_precip", "gldas_soil_moisture_0_10cm", "merra2_air_temperature_2m"):
            period = {"variable_id": variable_id, "start": "2001-01", "end": "2024-12"}
            series = checked(client.post("/api/v1/series", json={**period, "region": {"type": "preset", "id": "mekong_delta"}}))
            assert len(series["points"]) == 288
            checked(client.post("/api/v1/trends", json={**period, "region": {"type": "preset", "id": "mekong_delta"}}))
            params = {**period, "bbox": "104,9,107,12"}
            for path in ("/api/v1/trends/grid", "/api/v1/values/grid"):
                grid = checked(client.get(path, params=params))
                assert grid["cells"]
                warm = client.get(path, params=params)
                assert warm.status_code == 200 and warm.headers.get("etag")
        # Exercise the persistent writable cache directory rather than only memory reuse.
        cache = checked(client.get("/api/v1/grids/status", params={**params, "kind": "trend"}))
        assert cache["cached"] is True
    report = {"status": "passed", "transport": "loopback HTTP" if args.base_url else "FastAPI TestClient (in-process HTTP)", "manifest_sha256": MANIFEST_SHA256,
              "real_artifacts": True, "cases": rows, "ui_defaults": "passed", "reality_check": "passed",
              "error_contracts": "passed", "nasa_trend_reference": "unchanged", "nasa_analytics_and_disk_cache": "passed", "live_gemini_called": False}
    if args.output:
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "passed", "cases": len(rows)}), flush=True)


if __name__ == "__main__":
    main()
