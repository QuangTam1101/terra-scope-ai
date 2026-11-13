"""Hợp đồng chung giữa các adapter (docs/02 §1–2). Todo: Data Adapter Interface + common schema."""
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import pandas as pd

PIPELINE_VERSION = "0.1.0"


@dataclass(frozen=True)
class Region:
    region_id: str                              # "mekong_delta" hoặc "g_10.0_105.0" (điểm lưới)
    bbox: tuple[float, float, float, float]     # (W, S, E, N), độ, EPSG:4326
    geom_type: str = "polygon"                  # "polygon" (trung bình vùng) | "point" (1 pixel)


@dataclass(frozen=True)
class FetchRequest:
    source: str          # "appeears" | "giovanni"
    dataset: str         # "MOD13A3.061" | "GPM_3IMERGM.07"
    variables: tuple     # layer AppEEARS hoặc ID biến Giovanni
    regions: tuple       # tuple[Region, ...]
    start: str           # "2001-01-01"
    end: str             # "2024-12-31"


class SourceAdapter(Protocol):
    source: str
    def fetch(self, reqs: list[FetchRequest], raw_dir: Path) -> Path: ...
    def normalize(self, reqs: list[FetchRequest], raw: Path) -> pd.DataFrame: ...


def request_id(req: FetchRequest) -> str:
    """Cùng tham số → cùng id → cùng thư mục raw → không gọi API lần hai."""
    key = json.dumps({"source": req.source, "dataset": req.dataset, "variables": list(req.variables),
                      "regions": [(r.region_id, r.bbox, r.geom_type) for r in req.regions],
                      "start": req.start, "end": req.end}, sort_keys=True)
    return hashlib.sha1(key.encode()).hexdigest()[:12]


REQUIRED = ["region_id", "geom_type", "variable", "time", "value", "unit", "source", "dataset",
            "source_variable", "agg", "n_valid", "valid_frac", "qa_policy", "request_ref",
            "pipeline_version"]


def validate(df: pd.DataFrame, variables_cfg: dict) -> pd.DataFrame:
    """Lưới an toàn cuối: mọi đầu ra adapter phải qua hàm này. variables_cfg: {var: {unit, valid_range}}."""
    missing = set(REQUIRED) - set(df.columns)
    assert not missing, f"Thiếu cột: {missing}"
    assert df["source"].isin(["appeears", "giovanni"]).all(), "source lạ"
    assert not df.duplicated(["region_id", "variable", "time"]).any(), "Trùng (vùng, biến, tháng)"
    t = pd.to_datetime(df["time"])
    assert (t.dt.day == 1).all(), "time phải là ngày đầu tháng"
    weak = df["valid_frac"].notna() & (df["valid_frac"] < 0.3)
    assert df.loc[weak, "value"].isna().all(), "Tháng valid_frac < 0.3 phải là NaN"
    for var, g in df.groupby("variable"):
        cfg = variables_cfg[var]
        assert (g["unit"] == cfg["unit"]).all(), f"{var}: sai đơn vị"
        lo, hi = cfg["valid_range"]
        v = g["value"].dropna()
        bad = v[(v < lo) | (v > hi)]
        assert bad.empty, f"{var}: {len(bad)} giá trị ngoài [{lo}, {hi}], ví dụ {bad.iloc[0]}"
    return df


def rows(region: Region, variable: str, monthly: pd.DataFrame, **meta) -> pd.DataFrame:
    """monthly: index = đầu tháng, cột value (+ n_valid, valid_frac nếu có) → các dòng đúng schema."""
    out = pd.DataFrame({"region_id": region.region_id, "geom_type": region.geom_type, "variable": variable,
                        "time": monthly.index, "value": monthly["value"].to_numpy(),
                        "n_valid": monthly.get("n_valid", pd.Series(pd.NA, index=monthly.index)).to_numpy(),
                        "valid_frac": monthly.get("valid_frac", pd.Series(float("nan"), index=monthly.index))
                        .to_numpy(dtype="float64"),
                        "pipeline_version": PIPELINE_VERSION})
    for k, v in meta.items():
        out[k] = v
    out.loc[out["valid_frac"] < 0.3, "value"] = float("nan")
    return out[REQUIRED]
