"""Offline production asset gate. Load only trusted, owner-provided joblib files.

No network calls or environment/credential output. Never trains or modifies data.
"""
import json
import sys
from pathlib import Path

from forecast_artifacts import verify_models

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "data-pipeline"))


def main():
    # Fail before importing a model loader when any artifact is missing or corrupted.
    try:
        verify_models(ROOT / "data-pipeline/models")
    except (OSError, ValueError) as error:
        print(json.dumps({"ready": False, "category": "ArtifactIntegrityError",
                          "detail": str(error)}))
        return 1
    import xarray as xr
    from pipeline import forecast, indices

    failures = []
    for variable in forecast.AUX:
        path = ROOT / "data-pipeline/processed_data/grid" / f"cube_{variable}.nc"
        try:
            with xr.open_dataset(path) as ds:
                ds[variable].isel(time=0, lat=0, lon=0).load()
                print(json.dumps({"cube": path.name, "bytes": path.stat().st_size,
                                  "dimensions": dict(ds.sizes)}))
        except Exception as error:
            failures.append({"asset": path.name, "category": type(error).__name__})
        for variant in ("full", "outlook"):
            try:
                model = forecast.load_model(variable, variant)
                if model is None:
                    raise ValueError("Empty model")
                del model
            except Exception as error:
                failures.append({"asset": forecast.model_path(variable, variant).name,
                                 "category": type(error).__name__})
    if not indices.CSV.is_file():
        failures.append({"asset": "climate_indices.csv", "category": "Missing"})
    for name in ("metrics.json", "metrics_outlook.json", "reality_check.json"):
        try:
            json.loads((forecast.MODEL_DIR / name).read_text(encoding="utf-8"))
        except Exception as error:
            failures.append({"asset": name, "category": type(error).__name__})
    print(json.dumps({"ready": not failures, "failures": failures}))
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
