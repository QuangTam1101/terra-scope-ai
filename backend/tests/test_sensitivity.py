"""POST /trends/sensitivity ("Would more years help?") trên cube giả của conftest (2001-01 … 2020-12)."""
import numpy as np
import pandas as pd
import pytest

from app import service

WEST = [100.0, 5.0, 104.0, 10.0]       # mưa tăng +20 / thập kỷ: rõ ràng có ý nghĩa
MIXED = [100.0, 5.0, 110.0, 10.0]      # nửa tây tăng, nửa đông giảm: xu hướng ~0


def _post(client, path, bbox, start="2001-01", end="2020-12"):
    r = client.post(f"/api/v1/{path}", json={"variable_id": "imerg_precip", "region": {"type": "bbox", "bbox": bbox},
                                             "start": start, "end": end})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.parametrize("start, first", [("2001-01", "2001-01"), ("2001-06", "2001-06")])
def test_last_point_equals_trends(client, start, first):
    sens = _post(client, "trends/sensitivity", WEST, start=start)
    full = _post(client, "trends", WEST, start=start)
    last = sens["points"][-1]
    assert last["start"] == first and last["end"] == "2020-12"
    assert last["slope_per_decade"] == full["slope_per_decade"]
    assert last["p_value"] == full["p_value"] and last["significant"] == full["significant"] is True
    assert sens["years_needed"]["estimate"] is None                 # đã có ý nghĩa
    assert sens["units"] == full["units"] and sens["alpha"] == 0.05


def test_points_one_per_start_year_with_ten_years(client):
    pts = _post(client, "trends/sensitivity", WEST)["points"]
    assert [p["start"] for p in pts] == [f"{y}-01" for y in range(2011, 2000, -1)]   # 2011 … 2001
    assert [p["years"] for p in pts] == [float(y) for y in range(10, 21)]
    assert all(p["p_value"] is not None for p in pts)


def test_weak_trend_gets_no_misleading_number(client):
    body = _post(client, "trends/sensitivity", MIXED)
    assert body["points"][-1]["significant"] is False
    yn = body["years_needed"]                  # chưa qua kiểm định mà ước lượng vô nghĩa: không đưa số (trước đây "1 năm nữa")
    assert yn["estimate"] is None and "already long enough" in yn["basis"]
    assert "rough estimate" in yn["caveat"].lower()


def test_years_needed_monotonic_in_noise():
    idx = pd.date_range("2001-01-01", "2020-12-01", freq="MS")
    k = np.arange(len(idx))
    base = 0.01 * k + 30 * np.sin(2 * np.pi * k / 12)
    z = np.random.default_rng(0).normal(size=len(idx) // 2)
    z = np.concatenate([z, z[::-1]])            # nhiễu đối xứng: không đổi độ dốc OLS, chỉ đổi độ nhiễu
    est = [service._years_needed(pd.Series(base + sd * z, index=idx), None, 0.05)["estimate"]
           for sd in (8, 10, 12, 14)]
    assert all(e > 0 for e in est) and est == sorted(est) and est[0] < est[-1]
    assert "autocorrelation" in service._years_needed(pd.Series(base + 10 * z, index=idx), None, 0.05)["basis"]
    # Ít nhiễu: độ dốc OLS bảo chuỗi đã đủ dài (Mann-Kendall vẫn có thể chưa qua): không đưa "1 năm nữa".
    assert service._years_needed(pd.Series(base + 2 * z, index=idx), None, 0.05)["estimate"] is None
    # Nhiều nhiễu: cần lâu hơn cả 20 năm hiện có: không đưa số.
    assert service._years_needed(pd.Series(base + 40 * z, index=idx), None, 0.05)["estimate"] is None
    assert service._years_needed(pd.Series(base, index=idx), True, 0.05)["estimate"] is None


def test_same_errors_as_trends(client):
    r = client.post("/api/v1/trends/sensitivity", json={"variable_id": "imerg_precip", "start": "2001-01",
                                                        "end": "2030-12", "region": {"type": "bbox", "bbox": WEST}})
    assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_TIME_RANGE"
