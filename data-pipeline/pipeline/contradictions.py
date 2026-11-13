"""Contradiction Hunter (docs/05; docs/01 S8b). Todo: anomaly detection / clustering.
A: xu hướng ngược · C: "song sinh" trái ngược (k-NN) · B: dị thường ngược cùng tháng (DBSCAN).
Loại D (giữa các biến, cần Giovanni) là P2: chưa làm."""
import numpy as np
import pandas as pd


def monthly_z(s):
    """z(t) = (giá trị − TB cùng tháng các năm) / độ lệch chuẩn cùng tháng các năm; so nơi đó với chính nó."""
    g = s.groupby(s.index.month)
    std = g.transform("std").replace(0, np.nan)              # tháng không đổi qua các năm → z không xác định
    return (s - g.transform("mean")) / std


# ── Loại A ───────────────────────────────────────────────────────────────────

def scan_type_a(trends, variable, top_n=20, q=0.05):
    """trends: bảng từ trends.trends_table (region_id, variable, z, p_value_fdr).
    Điểm(i, j) = min(|z_i|, |z_j|) giữa một điểm tăng và một điểm giảm, cả hai q < 0.05.
    Top N cặp theo min chắc chắn nằm trong top N của mỗi phía → chỉ ghép hai danh sách ngắn."""
    t = trends[(trends["variable"] == variable) & (trends["p_value_fdr"] < q)]
    up = t[t["z"] > 0].nlargest(top_n, "z")[["region_id", "z"]]
    down = t[t["z"] < 0].nsmallest(top_n, "z")[["region_id", "z"]]
    pairs = up.merge(down, how="cross", suffixes=("_up", "_down"))
    pairs["score"] = np.minimum(pairs["z_up"].abs(), pairs["z_down"].abs())
    pairs["variable"] = variable
    return pairs.nlargest(top_n, "score").reset_index(drop=True)


# ── Loại A, bước 2: kiểm định khác biệt giữa HAI khu vực ─────────────────────

def _sen(y):
    """Sen's slope theo bước (tháng) của chuỗi y; NaN được bỏ qua."""
    t = np.flatnonzero(np.isfinite(y))
    i, j = np.triu_indices(len(t), k=1)
    return float(np.median((y[t[j]] - y[t[i]]) / (t[j] - t[i])))


def pair_difference_test(a, b, n_boot=1000, block=12, seed=0):
    """Xu hướng của A và B có KHÁC NHAU thật không? a, b: chuỗi tháng cùng biến, cùng trục thời gian.
    Làm trên hiệu D(t) = anomaly_A(t) − anomaly_B(t):
      - H0 "hai xu hướng bằng nhau" ⇔ D không có xu hướng → Hamed-Rao MK trên D (đã hiệu chỉnh tự tương quan).
      - slope_diff = Sen's slope của D (đơn vị / thập kỷ) = xu hướng A trừ xu hướng B.
      - CI 95%: moving-block bootstrap phần dư của D (khối 12 tháng giữ tự tương quan và nhịp năm).
    Dùng hiệu D nên biến động chung của hai nơi (vd. ENSO tác động cả hai) bị triệt tiêu: chặt hơn so hai p riêng.
    Kèm kiểm tra ổn định: dấu xu hướng mỗi nơi giữ nguyên ở hai nửa giai đoạn."""
    import pymannkendall as mk
    from .trends import anomaly

    d = (anomaly(a) - anomaly(b)).to_numpy(dtype="float64")
    slope = _sen(d)                                           # / tháng
    p = mk.hamed_rao_modification_test(d).p

    t = np.arange(len(d))
    ok = np.isfinite(d)
    resid = d - (np.nanmedian(d[ok] - slope * t[ok]) + slope * t)
    rng = np.random.default_rng(seed)
    n_blocks = -(-len(d) // block)
    boots = np.empty(n_boot)
    for k in range(n_boot):                                   # ponytail: vòng Python, ~1 s/cặp; đủ cho top-N cặp
        starts = rng.integers(0, len(d) - block + 1, n_blocks)
        r = np.concatenate([resid[s:s + block] for s in starts])[:len(d)]
        boots[k] = _sen(slope * t + r)
    lo, hi = np.nanpercentile(boots, [2.5, 97.5])

    half = len(d) // 2
    signs = [np.sign(_sen(anomaly(s).to_numpy(dtype="float64")[sl])) for s in (a, b)
             for sl in (slice(0, half), slice(half, None))]
    stable = signs[0] == signs[1] and signs[2] == signs[3] and signs[0] != signs[2]

    per_decade = 120                                          # tháng → thập kỷ
    return {"slope_diff_per_decade": slope * per_decade, "ci95_low": lo * per_decade,
            "ci95_high": hi * per_decade, "p_diff": float(p), "stable_halves": bool(stable)}


def find_opposite_trends(obs, trends, variable, q=0.05, top_n=20, n_boot=1000):
    """Contradiction Hunter, loại A đầy đủ: TỰ TÌM cặp khu vực có xu hướng ngược nhau và kiểm định độ tin cậy.
    1. Ứng viên: khu vực có xu hướng significant sau FDR (trends.p_value_fdr < q), một bên tăng, một bên giảm.
    2. Ghép cặp tăng × giảm (scan_type_a, giới hạn top_n mỗi phía để quét nhiều vùng không bùng nổ số cặp).
    3. Mỗi cặp: pair_difference_test trên chuỗi tháng thật (obs).
    4. FDR trên p_diff của mọi cặp đã kiểm định → q_diff.
    5. reliable = q_diff < q VÀ CI 95% không chứa 0 VÀ dấu ổn định ở hai nửa giai đoạn."""
    from .trends import bh_fdr

    pairs = scan_type_a(trends, variable, top_n=top_n, q=q)
    o = obs[obs["variable"] == variable]
    wide = o.pivot_table(index=pd.to_datetime(o["time"]), columns="region_id", values="value").asfreq("MS")
    rows = []
    for _, pr in pairs.iterrows():
        res = pair_difference_test(wide[pr["region_id_up"]], wide[pr["region_id_down"]], n_boot=n_boot)
        rows.append({"variable": variable, "region_up": pr["region_id_up"], "region_down": pr["region_id_down"],
                     "z_up": pr["z_up"], "z_down": pr["z_down"], **res})
    cols = ["variable", "region_up", "region_down", "z_up", "z_down", "slope_diff_per_decade",
            "ci95_low", "ci95_high", "p_diff", "stable_halves", "q_diff", "reliable"]
    out = pd.DataFrame(rows, columns=cols[:-2])
    out["q_diff"] = bh_fdr(out["p_diff"]) if len(out) else []
    out["reliable"] = (out["q_diff"] < q) & (out["ci95_low"] > 0) & out["stable_halves"]
    return out.sort_values(["reliable", "slope_diff_per_decade"], ascending=False, ignore_index=True)


def hunt_global(cube, variable, unit, start=None, end=None, q=0.05, min_cells=4, top_n=20, n_boot=1000):
    """Contradiction Hunter TOÀN CẦU (docs/05 loại A, mục 4): khu vực không cho trước mà tự tìm ra.
    cube 1° → xu hướng từng ô (grid_trend, FDR) → gom ô significant cùng chiều, liền kề thành điểm nóng
    (hotspot_regions) → chuỗi TB mỗi điểm nóng → find_opposite_trends (kiểm định khác biệt từng cặp).
    Trả (bảng cặp, bảng điểm nóng có bbox để vẽ lên bản đồ)."""
    from .grid import grid_trend, hotspot_obs, hotspot_regions
    from .trends import trends_table

    c = cube.sel(time=slice(start, end))
    labels, table = hotspot_regions(grid_trend(c), q=q, min_cells=min_cells)
    if table.empty:
        return pd.DataFrame(), table
    obs = hotspot_obs(c, labels, table, variable, unit)
    return find_opposite_trends(obs, trends_table(obs), variable, q=q, top_n=top_n, n_boot=n_boot), table


# ── Loại C ───────────────────────────────────────────────────────────────────

def twins_type_c(features, trends, variable, k=10, q=0.05, lc_col="LC_Type1"):
    """features: index = region_id, các cột đặc trưng số + cột lớp phủ `lc_col`.
    Chuẩn hoá z-score từng cột, k-NN trong CÙNG lớp phủ, giữ cặp ngược dấu xu hướng (cả hai q < 0.05).
    Điểm = độ_tương_đồng × min(|z_i|, |z_j|), độ_tương_đồng = 1 / (1 + khoảng cách)."""
    from sklearn.neighbors import NearestNeighbors
    from sklearn.preprocessing import StandardScaler
    cols = [c for c in features.columns if c != lc_col]
    X = pd.DataFrame(StandardScaler().fit_transform(features[cols]), index=features.index, columns=cols)
    t = trends[trends["variable"] == variable].set_index("region_id")
    sig = t[t["p_value_fdr"] < q]["z"]
    found = {}
    for _, ids in features.groupby(lc_col).groups.items():
        if len(ids) < 2:
            continue
        nn = NearestNeighbors(n_neighbors=min(k + 1, len(ids))).fit(X.loc[ids])
        dist, idx = nn.kneighbors(X.loc[ids])
        for a, (drow, irow) in enumerate(zip(dist, idx)):
            i = ids[a]
            for d, b in zip(drow[1:], irow[1:]):                # [0] là chính nó
                j = ids[b]
                if i in sig and j in sig and np.sign(sig[i]) != np.sign(sig[j]):
                    key = tuple(sorted((i, j)))
                    sim = 1.0 / (1.0 + d)
                    found[key] = {"region_a": key[0], "region_b": key[1], "similarity": sim,
                                  "score": sim * min(abs(sig[i]), abs(sig[j]))}
    cols_out = ["region_a", "region_b", "similarity", "score"]
    return pd.DataFrame(list(found.values()), columns=cols_out).sort_values("score", ascending=False,
                                                                           ignore_index=True)


# ── Loại B (P2) ──────────────────────────────────────────────────────────────

def anomaly_events_type_b(z_month, z_thr=2.0, eps_km=300, min_samples=3, top_n=20):
    """z_month: DataFrame (region_id, lat, lon, z) của MỘT biến trong MỘT tháng.
    Gộp điểm z > +2 và z < −2 thành cụm không gian (DBSCAN, khoảng cách haversine), rồi ghép cụm dương
    với cụm âm. Không có p-value theo cặp (xem cảnh báo định lượng trong 05): chỉ là top sự kiện nổi bật."""
    from sklearn.cluster import DBSCAN
    clusters = []
    for sign, part in (("+", z_month[z_month["z"] > z_thr]), ("-", z_month[z_month["z"] < -z_thr])):
        if len(part) < min_samples:
            continue
        lab = DBSCAN(eps=eps_km / 6371.0, min_samples=min_samples, metric="haversine").fit_predict(
            np.radians(part[["lat", "lon"]].to_numpy()))
        for c in set(lab) - {-1}:                               # -1 = điểm lẻ, không thành sự kiện
            m = part[lab == c]
            clusters.append({"sign": sign, "n_points": len(m), "mean_z": m["z"].mean(),
                             "lat": m["lat"].mean(), "lon": m["lon"].mean(), "regions": list(m["region_id"])})
    cl = pd.DataFrame(clusters, columns=["sign", "n_points", "mean_z", "lat", "lon", "regions"])
    ev = cl[cl["sign"] == "+"].merge(cl[cl["sign"] == "-"], how="cross", suffixes=("_pos", "_neg"))
    ev["score"] = ev["mean_z_pos"].abs() + ev["mean_z_neg"].abs()
    ev["n_points"] = ev[["n_points_pos", "n_points_neg"]].min(axis=1)
    return ev.sort_values(["score", "n_points"], ascending=False, ignore_index=True).head(top_n)


# ── Kiểm định hoán vị (lớp 2 trong 05) ───────────────────────────────────────

def permute_years(cube, rng):
    """cube: mảng (điểm, năm, 12 tháng). Xáo thứ tự NĂM, giữ tháng; MỌI điểm dùng CÙNG một hoán vị."""
    return cube[:, rng.permutation(cube.shape[1]), :]


def sen_slope_per_year(annual):
    """annual: (điểm, năm) trung bình năm (NaN cho phép). Sen's slope = trung vị độ dốc mọi cặp năm."""
    n = annual.shape[1]
    i, j = np.triu_indices(n, k=1)
    slopes = (annual[:, j] - annual[:, i]) / (j - i)
    return np.nanmedian(slopes, axis=1)
