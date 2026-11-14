"""Dự báo khí hậu 1–12 tháng tới (docs/05 §7), chạy hoàn toàn trên CPU (Mac).

Kiến trúc (v2):
  * Mô hình TOÀN CỤC cho mỗi biến, học chung từ nhiều ô lưới 1°; dự báo z-score (anomaly chuẩn hoá theo khí hậu của
    chính ô đó) tại t+h, h = 1..12 (h là một đặc trưng).
  * Đặc trưng đa nguồn:
      - chính biến đó: 12 tháng gần nhất, TB trượt, mùa, vị trí;
      - BỐI CẢNH KHÔNG GIAN: anomaly TB trong cửa sổ 5×5 ô quanh ô đang dự báo;
      - LIÊN BIẾN: anomaly mưa, ẩm đất, nhiệt độ đất, bốc hơi, nhiệt độ 2 m tại cùng ô;
      - 9 chỉ số khí hậu công khai NOAA: Niño 1+2/3/4/3.4, SOI, IOD, PDO, NAO, QBO (pipeline/indices.py) + nhiệt độ toàn cầu.
  * Ba đầu ra từ cùng đặc trưng:
      1. điểm: ridge theo horizon + GBM hồi quy phân vị học phần dư → trung vị;
      2. khoảng 80%: hồi quy phân vị + conformal (CQR) theo horizon;
      3. XÁC SUẤT TERCILE (dưới / gần / trên mức bình thường theo mùa): GBM phân loại, hiệu chỉnh nhiệt độ (τ) theo horizon.
  * CO VỀ KHÍ HẬU khi không có skill: hệ số λ(horizon, đới vĩ độ) hồi quy y ~ dự báo trên tập hiệu chỉnh, kẹp ∈ [0, 1];
    λ = 0 nghĩa là "dự báo = mức bình thường theo mùa". Xác suất tercile cũng co về 1/3 khi τ → 0.
  * Giải thích bằng NĂM TƯƠNG TỰ: tìm các năm có trạng thái ENSO/IOD/PDO/SOI giống hiện tại, đưa kết quả thật của những năm đó.
  * Backtest trung thực: tách theo thời gian (train < cal < test) VÀ theo không gian (ô train ≠ ô cal/test), khí hậu và ngưỡng
    tercile chỉ tính trên giai đoạn train. So với baseline: khí hậu, seasonal naive, persistence tắt dần, khí hậu + xu hướng,
    và CHỈ ridge (để thấy phần GBM đóng góp bao nhiêu). Báo cáo skill ≤ 0 thẳng thắn.
  * Skill thống kê, không khẳng định nhân quả."""
from __future__ import annotations

import math
import threading
import warnings
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xarray as xr  # noqa: F401  (kiểu dữ liệu đầu vào)
from scipy.ndimage import uniform_filter
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
QUANTILES = (0.1, 0.5, 0.9)
ALPHA = 0.2                       # khoảng 80%
MAX_H = 12
EVAL_H = (1, 3, 6, 12)                                  # alias của VARIANTS["full"]["eval_h"]
NLAG = 12
TREF = 10.0                       # năm tham chiếu (tính từ 2001-01) cho đặc trưng xu hướng tuyến tính của mô hình Outlook
VARIANTS = {   # full: dùng cả quan sát vệ tinh gần nhất; outlook: chỉ dùng chỉ số khí hậu + xu hướng → dự báo được xa hơn khi cube lỗi thời
    "full": {"hmax": 12, "eval_h": (1, 3, 6, 12), "omin": NLAG - 1},
    "outlook": {"hmax": 18, "eval_h": (3, 6, 12, 18), "omin": 0},
}
TREND_FIXED = {"t2m": 1.0, "tair_land": 1.0}   # nóng lên là quan sát vật lý đã xác nhận → dùng nguyên xu hướng, không hiệu chỉnh trên cửa sổ ngắn
ZCLIP = 5.0
SIGNAL_P = 0.45                   # xác suất tối thiểu của tercile nổi trội để báo "above"/"below"
AUX = ("precip", "soil_moisture", "tair_land", "evap_gldas", "t2m")
# Sàn độ lệch chuẩn tuyệt đối, tránh z nổ ở sa mạc (mưa ≈ 0 quanh năm).
SD_FLOOR = {"precip": 2.0, "t2m": 0.1, "tair_land": 0.1, "soil_moisture": 0.003, "evap_gldas": 0.02}
CTX_FEATURES = ["enso0", "enso3", "enso6", "ensod", "n12_3", "n3_3", "n4_3", "dmi3", "pdo3", "nao3", "soi3", "qbo0", "glob12"]
FEATURES = ([f"lag{k}" for k in range(NLAG)]
            + ["m3", "m6", "m12", "s12", "tm_sin", "tm_cos", "h", "lat", "abslat", "lon_sin", "lon_cos",
               "mu_t", "sd_t", "tzlo", "tzhi"] + CTX_FEATURES + ["nb0", "nb3"]
            + [f"x_{v}{k}" for v in AUX for k in (0, 3)])
LINCOLS = [FEATURES.index(f) for f in [f"lag{k}" for k in range(NLAG)]
           + ["enso0", "enso3", "enso6", "dmi3", "pdo3", "nao3", "soi3", "glob12"]]
GROUPS = {
    "Recent local anomalies": [f"lag{k}" for k in range(NLAG)] + ["m3", "m6", "m12", "s12"],
    "ENSO and Pacific (Niño, SOI, PDO)": ["enso0", "enso3", "enso6", "ensod", "n12_3", "n3_3", "n4_3", "soi3", "pdo3"],
    "Indian & Atlantic oceans, QBO (IOD, NAO, QBO)": ["dmi3", "nao3", "qbo0"],
    "Long-term warming": ["glob12"],
    "Neighbouring areas": ["nb0", "nb3"],
    "Other climate variables at the location": [f"x_{v}{k}" for v in AUX for k in (0, 3)],
    "Seasonality & climatology": ["tm_sin", "tm_cos", "mu_t", "sd_t", "tzlo", "tzhi"],
    "Location": ["lat", "abslat", "lon_sin", "lon_cos"],
    "Lead time": ["h"],
}
NOT_EXPLAINED = {"Seasonality & climatology", "Location", "Lead time"}
OUTLOOK_ZERO = [f"lag{k}" for k in range(NLAG)] + ["m3", "m6", "m12", "s12", "nb0", "nb3", "nao3", "qbo0"] + [f"x_{v}{k}" for v in AUX for k in (0, 3)]
OUTLOOK_ACTIVE = {"ENSO and Pacific (Niño, SOI, PDO)", "Indian & Atlantic oceans, QBO (IOD, NAO, QBO)", "Long-term warming"}
OUTLOOK_INDICES = ["nino34", "nino3", "nino4", "nino12", "soi", "pdo"]   # tháng cuối cùng có ĐỦ các chỉ số này = origin của Outlook


# ---------------------------------------------------------------- dữ liệu → z-score
def _times(cube):
    return pd.DatetimeIndex(cube["time"].values)


def _flat(cube):
    """(time, lat, lon) → mảng (T, N) + toạ độ phẳng của N ô."""
    T = cube.sizes["time"]
    la, lo = np.meshgrid(cube["lat"].values, cube["lon"].values, indexing="ij")
    return cube.transpose("time", "lat", "lon").values.reshape(T, -1).astype("float64"), la.ravel(), lo.ravel()


def _same_grid(a, b):
    return (a.sizes["lat"] == b.sizes["lat"] and a.sizes["lon"] == b.sizes["lon"] and a.sizes["time"] == b.sizes["time"]
            and np.allclose(a["lat"].values, b["lat"].values) and np.allclose(a["lon"].values, b["lon"].values))


def climatology(X, times, upto, floor):
    """Trung bình / độ lệch chuẩn theo tháng, CHỈ từ các tháng ≤ upto (không rò rỉ). Trả (12, N)."""
    mon = times.month.to_numpy()
    ok = np.asarray(times <= upto)
    mu = np.full((12, X.shape[1]), np.nan)
    sd = np.full_like(mu, np.nan)
    with warnings.catch_warnings():            # ô toàn NaN (biển với biến đất liền) → cảnh báo vô hại
        warnings.simplefilter("ignore", RuntimeWarning)
        for m in range(1, 13):
            sel = ok & (mon == m)
            mu[m - 1] = np.nanmean(X[sel], 0)
            sd[m - 1] = np.nanstd(X[sel], 0, ddof=1)
    return mu, np.maximum(sd, floor)


def tercile_z(X, times, upto, mu, sd):
    """Ngưỡng tercile (33,3% / 66,7%) của từng ô và tháng, tính trên giai đoạn train, đổi sang z. Trả (12, N, 2)."""
    mon = times.month.to_numpy()
    ok = np.asarray(times <= upto)
    out = np.full((12, X.shape[1], 2), np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        for m in range(1, 13):
            q = np.nanpercentile(X[ok & (mon == m)], [100 / 3, 200 / 3], axis=0)
            out[m - 1] = ((q - mu[m - 1]) / sd[m - 1]).T
    return np.clip(out, -ZCLIP, ZCLIP)


def to_z(X, times, mu, sd):
    mon = times.month.to_numpy() - 1
    return np.clip((X - mu[mon]) / sd[mon], -ZCLIP, ZCLIP)


def trend_fit(Z, times, upto):
    """Hồi quy tuyến tính z ~ thời gian (năm) mỗi ô trên giai đoạn train; chỉ dùng cho baseline 'khí hậu + xu hướng'."""
    ok = np.asarray(times <= upto)
    t = (np.arange(len(times)) / 12.0)[ok]
    z = Z[ok]
    tc = t - t.mean()
    b = (tc[:, None] * (z - np.nanmean(z, 0))).sum(0) / (tc ** 2).sum()
    a = np.nanmean(z, 0) - b * t.mean()
    return a, b


def climate_context(t2m, upto):
    """Các chuỗi dẫn đầu theo tháng: 9 chỉ số NOAA (pipeline/indices.py) + nhiệt độ toàn cầu MERRA-2 (anomaly so với khí hậu ≤ upto).
    Thiếu file chỉ số → các chỉ số = 0 (Niño 3.4 tự tính từ t2m nếu cube đủ lớn)."""
    from . import indices
    idx = _times(t2m)
    clim = t2m.sel(time=slice(None, upto)).groupby("time.month").mean("time")
    an = t2m.groupby("time.month") - clim
    glob = an.weighted(np.cos(np.deg2rad(an["lat"]))).mean(("lat", "lon")).values
    cols = ["nino12", "nino3", "nino4", "nino34", "dmi", "pdo", "nao", "soi", "qbo"]
    try:
        ind = indices.load(idx)
    except Exception:
        ind = pd.DataFrame(0.0, index=idx, columns=cols)
        if an.sizes["lat"] > 10:
            ind["nino34"] = an.sel(lat=slice(-5, 5), lon=slice(-170, -120)).mean(("lat", "lon")).values - glob
    for c in cols:
        if c not in ind:
            ind[c] = 0.0
    ind = ind.fillna(0.0)
    ind["glob"] = glob
    return ind


def _rolling(a, k):
    return pd.Series(np.asarray(a, dtype=float)).rolling(k, min_periods=1).mean().to_numpy()


def _ctx_arrays(ctx):
    n = ctx["nino34"].to_numpy()
    return {"enso0": n, "enso3": _rolling(n, 3), "enso6": _rolling(n, 6),
            "ensod": n - np.concatenate([np.full(3, n[0]), n[:-3]]),
            "n12_3": _rolling(ctx["nino12"], 3), "n3_3": _rolling(ctx["nino3"], 3), "n4_3": _rolling(ctx["nino4"], 3),
            "dmi3": _rolling(ctx["dmi"], 3), "pdo3": _rolling(ctx["pdo"], 3), "nao3": _rolling(ctx["nao"], 3),
            "soi3": _rolling(ctx["soi"], 3), "qbo0": ctx["qbo"].to_numpy(), "glob12": _rolling(ctx["glob"], 12)}


def _roll3(Z):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        s1, s2 = np.vstack([Z[:1], Z[:-1]]), np.vstack([Z[:1], Z[:1], Z[:-2]])
        return np.nanmean(np.stack([Z, s1, s2]), 0)


def _smooth(Z, shape, size=5):
    """TB cửa sổ size×size ô (bỏ qua NaN), mỗi tháng. Z (T, N) có NaN ở ô không hợp lệ."""
    T = Z.shape[0]
    cube = Z.reshape(T, *shape)
    ok = np.isfinite(cube)
    num = uniform_filter(np.where(ok, cube, 0.0), size=(1, size, size), mode="nearest")
    den = uniform_filter(ok.astype("float32"), size=(1, size, size), mode="nearest")
    return np.where(den > 1e-6, num / np.maximum(den, 1e-6), np.nan).reshape(T, -1).astype("float32")


def build_state(variable, cubes, params):
    """Mọi mảng (T, N) cần cho đặc trưng, từ dict cubes (phải có `variable`) và tham số khí hậu `params` (đã chốt lúc train)."""
    own = cubes[variable]
    times = _times(own)
    X, la, lo = _flat(own)
    mu, sd = params["clim"][variable]
    Zn = to_z(X, times, mu, sd).astype("float32")                       # có NaN ngoài vùng hợp lệ
    shape = (own.sizes["lat"], own.sizes["lon"])
    S = {"times": times, "shape": shape, "Z": np.nan_to_num(Zn), "month0": times.month.to_numpy() - 1,
         "lat": la, "lon": lo, "mu": mu, "sd": sd, "tz": params["tz"], "ctx": _ctx_arrays(params["ctxdf"]),
         "nb0": _smooth(Zn, shape)}
    S["nb3"] = _roll3(S["nb0"])
    S["slope_raw"], S["tcenter"] = params.get("slope_raw"), params.get("tcenter", TREF)
    S["x0"], S["x3"] = {}, {}
    for v in AUX:
        cu = cubes.get(v)
        if cu is not None and v in params["clim"] and _same_grid(cu, own):
            Xa, _, _ = _flat(cu)
            Za = to_z(Xa, times, *params["clim"][v]).astype("float32")
            S["x0"][v], S["x3"][v] = Za, _roll3(Za)
    return S


def features(S, o, c, h, variant="full"):
    """Ma trận đặc trưng cho các bộ (origin o, ô c, horizon h). variant="outlook": các cột phụ thuộc quan sát địa phương
    (lag, TB trượt, láng giềng, biến phụ, NAO, QBO) = 0; cột glob12 đổi thành xu hướng tuyến tính theo thời gian / sd (ridge ngoại suy)."""
    n = len(o)
    tm = (S["month0"][o] + h) % 12
    ang = 2 * np.pi * tm / 12
    lat, lon = S["lat"][c], np.deg2rad(S["lon"][c])
    zero = np.zeros((n, 1), dtype="float32")
    if variant == "outlook":
        lags, stats = np.zeros((n, NLAG), dtype="float32"), [zero] * 4
    else:
        Z = S["Z"]
        lags = np.stack([Z[o - k, c] for k in range(NLAG)], 1)
        stats = [lags[:, :3].mean(1, keepdims=True), lags[:, :6].mean(1, keepdims=True), lags.mean(1, keepdims=True), lags.std(1, keepdims=True)]
    cols = [lags] + stats + [np.sin(ang)[:, None], np.cos(ang)[:, None], h[:, None].astype(float), lat[:, None], np.abs(lat)[:, None],
                             np.sin(lon)[:, None], np.cos(lon)[:, None], S["mu"][tm, c][:, None], S["sd"][tm, c][:, None],
                             S["tz"][tm, c, 0][:, None], S["tz"][tm, c, 1][:, None]]
    for k in CTX_FEATURES:
        if variant == "outlook" and k in ("nao3", "qbo0"):
            cols.append(zero)
        elif variant == "outlook" and k == "glob12":
            cols.append((S["slope_raw"][c] * ((o + h) / 12.0 - S["tcenter"]) / S["sd"][tm, c])[:, None])
        else:
            cols.append(S["ctx"][k][o][:, None])
    if variant == "outlook":
        cols += [zero] * (2 + 2 * len(AUX))
    else:
        cols += [S["nb0"][o, c][:, None], S["nb3"][o, c][:, None]]
        for v in AUX:
            cols += [S["x0"][v][o, c][:, None], S["x3"][v][o, c][:, None]] if v in S["x0"] else [zero, zero]
    return np.hstack(cols).astype("float32")


# ---------------------------------------------------------------- mô hình
def _fit_ridge(X, y, hmax=MAX_H, lam=30.0):
    """Lớp tuyến tính (AR + chỉ số khí hậu), một hồi quy ridge riêng cho mỗi horizon h. Trả (W (13,k), B (13,))."""
    h = X[:, FEATURES.index("h")].astype(int)
    W, B = np.zeros((hmax + 1, len(LINCOLS))), np.zeros(hmax + 1)
    for k in range(1, hmax + 1):
        A, t = X[h == k][:, LINCOLS].astype("float64"), y[h == k]
        m, ym = A.mean(0), t.mean()
        W[k] = np.linalg.solve((A - m).T @ (A - m) + lam * np.eye(A.shape[1]), (A - m).T @ (t - ym))
        B[k] = ym - m @ W[k]
    return W, B


def _lin(ridge, X):
    h = X[:, FEATURES.index("h")].astype(int)
    return (X[:, LINCOLS] * ridge[0][h]).sum(1) + ridge[1][h]


def _gbm(loss, X, y, seed, iters, q=None):
    return HistGradientBoostingRegressor(loss=loss, quantile=q, max_iter=iters, learning_rate=0.06, max_leaf_nodes=31,
                                         min_samples_leaf=200, l2_regularization=1.0, random_state=seed).fit(X, y)


def _band(lat):
    a = np.abs(lat)
    return np.where(a < 23.5, 0, np.where(a < 55, 1, 2))


BAND_NAMES = ("tropics", "midlatitudes", "polar")


def _classes(y, tzlo, tzhi):
    return np.where(y < tzlo, 0, np.where(y > tzhi, 2, 1))


def _sharpen(p, tau):
    q = np.power(np.clip(p, 1e-6, 1), tau[:, None])
    return q / q.sum(1, keepdims=True)


def _raw(model, X):
    """Đầu ra thô (chưa co, chưa conformal): lin, q10/q50/q90 của phần dư, xác suất tercile chưa hiệu chỉnh."""
    lin = _lin(model["ridge"], X)
    q = np.sort(np.column_stack([m.predict(X) for m in model["models"]]), 1)
    p = model["clf"].predict_proba(np.hstack([X, lin[:, None].astype("float32")]))
    return lin, q, p


GI = FEATURES.index("glob12")


def _trend_part(model, X):
    """Outlook: thành phần xu hướng nóng lên (z) đã nhân hệ số hiệu chỉnh κ; full: 0 (đã có glob12 như đặc trưng thường)."""
    return model.get("kappa", 1.0) * X[:, GI] if model.get("variant") == "outlook" else 0.0


def _finish(model, X, lin, q, p):
    h = X[:, FEATURES.index("h")].astype(int)
    lam = model["lam"][h, _band(X[:, FEATURES.index("lat")])]
    mid = _trend_part(model, X) + lam * (lin + q[:, 1])
    e = model["corr"][h]
    return mid - (q[:, 1] - q[:, 0]) - e, mid, mid + (q[:, 2] - q[:, 1]) + e, _sharpen(p, model["tau"][h])


def predict_z(model, X):
    """Đầu ra cuối (z-space): lo, mid, hi (đã co về khí hậu + conformal) và xác suất tercile đã hiệu chỉnh (n, 3)."""
    return _finish(model, X, *_raw(model, X))


def _pairs(rng, T_lo, T_hi, n, h_choices, omin=NLAG - 1):
    """n cặp (origin, h) với T_lo < o + h ≤ T_hi (chỉ số tháng đích), o ≥ omin."""
    h = rng.choice(h_choices, n)
    o = rng.integers(omin, T_hi, n)
    keep = (o + h > T_lo) & (o + h <= T_hi)
    return o[keep], h[keep]


def _logloss(p, y):
    return -float(np.mean(np.log(np.clip(p[np.arange(len(y)), y], 1e-6, 1))))


def fit(variable, cubes, train_end, cal_end, variant="full", n_train=500_000, n_cal=240_000, n_test_cells=3000, seed=0,
        iters=250, clf_iters=150, all_cells=False, verbose=True):
    """Huấn luyện + hiệu chỉnh + (nếu còn dữ liệu sau cal_end) backtest. Trả (model dict, metrics dict).
    Mốc: tháng đích ≤ train_end huấn luyện; (train_end, cal_end] hiệu chỉnh (λ, τ, conformal); > cal_end kiểm tra.
    variant="outlook": chỉ dùng chỉ số khí hậu + xu hướng, horizon tới 18 tháng (dùng khi quan sát vệ tinh đã cũ).
    all_cells=True (bản production): huấn luyện và hiệu chỉnh trên MỌI ô hợp lệ (giai đoạn đã tách theo thời gian)."""
    cfg = VARIANTS[variant]
    hmax, omin = cfg["hmax"], cfg["omin"]
    rng = np.random.default_rng(seed)
    own = cubes[variable]
    times = _times(own)
    X, la, lo = _flat(own)
    valid = np.where(np.isfinite(X).all(0))[0]
    T = len(times)
    tr_end = int(np.searchsorted(times, pd.Timestamp(train_end), side="right")) - 1
    ca_end = int(np.searchsorted(times, pd.Timestamp(cal_end), side="right")) - 1
    up = pd.Timestamp(train_end)
    mu, sd = climatology(X, times, up, SD_FLOOR[variable])
    clim = {variable: (mu, sd)}
    for v in AUX:                                              # khí hậu của các biến phụ (cùng lưới), chỉ từ giai đoạn train
        if v != variable and v in cubes and _same_grid(cubes[v], own):
            Xa, _, _ = _flat(cubes[v])
            clim[v] = climatology(Xa, times, up, SD_FLOOR[v])
    a, b = trend_fit(np.nan_to_num(to_z(X, times, mu, sd)), times, up)
    params = {"clim": clim, "tz": tercile_z(X, times, up, mu, sd), "ctxdf": climate_context(cubes.get("t2m", own), up)}
    if variant == "outlook":                                   # xu hướng tuyến tính theo ô (°C/năm), làm mượt 5×5 và trộn 50% với TB toàn cầu
        ok = np.asarray(times <= up)
        tyr = np.arange(T)[ok] / 12.0
        tc = tyr - tyr.mean()
        A = np.nan_to_num((X - mu[times.month.to_numpy() - 1])[ok])
        b_cell = (tc[:, None] * A).sum(0) / (tc ** 2).sum()
        pooled = float(b_cell[valid].mean())
        sm = _smooth(np.where(np.isfinite(X[0]), b_cell, np.nan)[None, :], (own.sizes["lat"], own.sizes["lon"]))[0]
        params["slope_raw"] = np.where(np.isfinite(sm), 0.5 * pooled + 0.5 * sm, pooled).astype("float32")
        params["tcenter"] = float(tyr.mean())
    S = build_state(variable, cubes, params)

    perm = rng.permutation(valid)
    train_cells, held = (valid, valid) if all_cells else (perm[: len(perm) // 2], perm[len(perm) // 2:])
    hs = np.arange(1, hmax + 1)

    o, h = _pairs(rng, -1, tr_end, n_train * 2, hs, omin)
    o, h = o[:n_train], h[:n_train]
    c = rng.choice(train_cells, len(o))
    Xtr, ytr = features(S, o, c, h, variant), S["Z"][o + h, c]
    if variant == "outlook":
        ytr = ytr - Xtr[:, GI]                                  # ridge + GBM chỉ học phần dư sau khi trừ xu hướng nóng lên
    if verbose:
        print(f"[{variable}/{variant}] train rows {len(o):,} ({len(train_cells):,} ô)", flush=True)
    ridge = _fit_ridge(Xtr, ytr, hmax)
    lin = _lin(ridge, Xtr)
    models = [_gbm("quantile", Xtr, ytr - lin, seed, iters, q) for q in QUANTILES]
    ytc = _classes(ytr + (Xtr[:, GI] if variant == "outlook" else 0.0), Xtr[:, FEATURES.index("tzlo")], Xtr[:, FEATURES.index("tzhi")])
    clf = HistGradientBoostingClassifier(max_iter=clf_iters, learning_rate=0.06, max_leaf_nodes=31, min_samples_leaf=200,
                                         l2_regularization=1.0, random_state=seed).fit(
        np.hstack([Xtr, lin[:, None].astype("float32")]), ytc)
    model = {"variable": variable, "variant": variant, "hmax": hmax, "ridge": ridge, "models": models, "clf": clf,
             "lam": np.ones((hmax + 1, 3)), "tau": np.ones(hmax + 1), "corr": np.zeros(hmax + 1), "params": params, "a": a, "b": b,
             "train_end": str(train_end), "cal_end": str(cal_end), "lat": la, "lon": lo, "valid": valid,
             "time_end": str(times[-1].date()), "shape": S["shape"], "n_features": len(FEATURES), "all_cells": all_cells,
             "aux_used": sorted(S["x0"]) if variant == "full" else []}

    # --- hiệu chỉnh: nửa A cho λ và τ, nửa B cho conformal (không dùng chung dữ liệu)
    oc, hc = _pairs(rng, tr_end, ca_end, n_cal * 2, hs, omin)
    oc, hc = oc[:n_cal], hc[:n_cal]
    cc = rng.choice(held, len(oc))
    Xc, yc = features(S, oc, cc, hc, variant), S["Z"][oc + hc, cc]
    lin_c, q_c, p_c = _raw(model, Xc)
    half = rng.random(len(oc)) < 0.5
    if variant == "outlook":                                    # κ: bao nhiêu phần của xu hướng nóng lên ngoại suy được xác nhận trên giai đoạn hiệu chỉnh
        trz = Xc[half, GI]
        model["kappa"] = TREND_FIXED.get(variable, float(np.clip((yc[half] * trz).sum() / max((trz ** 2).sum(), 1e-9), 0, 1.2)))
        yc_res = yc - model["kappa"] * Xc[:, GI]
    else:
        yc_res = yc
    band_c = _band(la[cc])
    grid = np.linspace(0, 1.5, 31)
    for k in hs:
        for bd in range(3):
            m = half & (hc == k) & (band_c == bd)
            pred = lin_c[m] + q_c[m, 1]
            model["lam"][k, bd] = float(np.clip((yc_res[m] * pred).sum() / max((pred ** 2).sum(), 1e-9), 0, 1)) if m.sum() > 50 else 0.0
        m = half & (hc == k)
        yk = _classes(yc[m], Xc[m, FEATURES.index("tzlo")], Xc[m, FEATURES.index("tzhi")])
        ll = [_logloss(_sharpen(p_c[m], np.full(m.sum(), t)), yk) for t in grid]
        model["tau"][k] = float(grid[int(np.argmin(ll))])
    lo_b, _, hi_b, _ = _finish(model, Xc, lin_c, q_c, p_c)             # corr = 0 lúc này → điểm số thuần
    score = np.maximum(lo_b - yc, yc - hi_b)
    for k in hs:
        s = score[(~half) & (hc == k)]
        model["corr"][k] = float(np.quantile(s, min(1.0, math.ceil((len(s) + 1) * (1 - ALPHA)) / len(s)))) if len(s) else 0.0

    ev = cfg["eval_h"]
    metrics = {"variable": variable, "variant": variant, "train_end": str(train_end), "cal_end": str(cal_end), "aux_used": model["aux_used"],
               "conformal_correction_z": {int(k): round(float(model["corr"][k]), 3) for k in hs},
               "lambda_shrink": {BAND_NAMES[bd]: {int(k): round(float(model["lam"][k, bd]), 3) for k in ev} for bd in range(3)},
               "tau_probability": {int(k): round(float(model["tau"][k]), 2) for k in hs}, "trend_kappa": round(float(model.get("kappa", 1.0)), 3)}
    if ca_end < T - 1:
        metrics.update(_backtest(model, S, times, held, ca_end, rng, n_test_cells, variant))
    return model, metrics


# ---------------------------------------------------------------- backtest
def _rps(p, cls):
    cum = np.cumsum(p, 1)[:, :2]
    obs = np.cumsum(np.eye(3)[cls], 1)[:, :2]
    return ((cum - obs) ** 2).sum(1)


def _score(y, p, mse0):
    err = y - p
    mse = float(np.mean(err ** 2))
    pc, yc = p - p.mean(), y - y.mean()
    acc = float((pc * yc).sum() / math.sqrt(max((pc ** 2).sum() * (yc ** 2).sum(), 1e-12)))
    return {"rmse_z": math.sqrt(mse), "mae_z": float(np.mean(np.abs(err))), "skill_vs_clim": 1 - mse / max(mse0, 1e-12), "acc": acc}


def _round(x, nd=4):
    if isinstance(x, dict):
        return {k: _round(v, nd) for k, v in x.items()}
    return round(float(x), nd) if isinstance(x, (float, np.floating)) else x


def _backtest(model, S, times, held, ca_end, rng, n_cells, variant="full"):
    cfg = VARIANTS[variant]
    T = len(times)
    Z, tr_end = S["Z"], int(np.searchsorted(times, pd.Timestamp(model["train_end"]), side="right")) - 1
    cells = rng.choice(held, min(n_cells, len(held)), replace=False)
    out = {"test_period": [str(times[ca_end + 1].date()), str(times[-1].date())], "n_test_cells": int(len(cells)),
           "by_horizon": {}, "by_latband": {}, "reliability_h3": {}}
    band_cell = _band(S["lat"][cells])
    rows = {}
    ev = cfg["eval_h"]

    def rpss(prob, cls):
        return 1 - float(np.mean(_rps(prob, cls)) / np.mean(_rps(np.full((len(cls), 3), 1 / 3), cls)))

    for h in ev:
        tgt = np.arange(max(ca_end + 1, cfg["omin"] + h), T)
        o, ti = np.repeat(tgt - h, len(cells)), np.tile(np.arange(len(cells)), len(tgt))
        c = cells[ti]
        Xe, y = features(S, o, c, np.full(len(o), h), variant), Z[o + h, c]
        lin, q, p_raw = _raw(model, Xe)
        lo, mid, hi, prob = _finish(model, Xe, lin, q, p_raw)
        cls = _classes(y, Xe[:, FEATURES.index("tzlo")], Xe[:, FEATURES.index("tzhi")])
        e = model["corr"][h]
        base = {"clim": np.zeros_like(y), "clim_trend": model["a"][c] + model["b"][c] * (o + h) / 12.0, "ridge_only": lin + _trend_part(model, Xe)}
        if variant == "outlook":
            base["warming_trend_only"] = model["kappa"] * Xe[:, GI]
        if variant == "full":                                   # các baseline dùng quan sát tại origin → chỉ công bằng với bản full
            z = Z[: tr_end + 1][:, cells]
            rho = (z[:-h] * z[h:]).sum(0) / np.maximum((z[:-h] ** 2).sum(0), 1e-9)
            base["seasonal_naive"], base["damped_persistence"] = Z[o + h - 12, c], rho[ti] * Z[o, c]
        mse0 = float(np.mean(y ** 2))
        row = {"n": int(len(y)), "model": _score(y, mid, mse0)}
        row["model"].update({
            "coverage_raw": float(np.mean((y >= lo + e) & (y <= hi - e))),
            "coverage_conformal": float(np.mean((y >= lo) & (y <= hi))), "width_conformal": float(np.mean(hi - lo)),
            "rpss": rpss(prob, cls), "rpss_uncalibrated": rpss(p_raw, cls), "tercile_accuracy": float(np.mean(prob.argmax(1) == cls)),
            "bss_below": 1 - float(np.mean((prob[:, 0] - (cls == 0)) ** 2) / np.mean((1 / 3 - (cls == 0)) ** 2)),
            "bss_above": 1 - float(np.mean((prob[:, 2] - (cls == 2)) ** 2) / np.mean((1 / 3 - (cls == 2)) ** 2))})
        for k, pr in base.items():
            row[k] = _score(y, pr, mse0)
        out["by_horizon"][int(h)] = _round(row)
        bnd = band_cell[ti]
        for bi, bn in enumerate(BAND_NAMES):
            m = bnd == bi
            if m.any():
                out["by_latband"].setdefault(bn, {})[int(h)] = _round({
                    "model_skill": 1 - float(np.mean((y[m] - mid[m]) ** 2)) / max(float(np.mean(y[m] ** 2)), 1e-9),
                    "rpss": rpss(prob[m], cls[m])})
        if h == ev[1]:
            edges = [0, 0.2, 0.3, 0.4, 0.5, 1.01]
            out["reliability_h"] = int(h)
            for name, ci in (("above", 2), ("below", 0)):
                pb = np.digitize(prob[:, ci], edges) - 1
                out["reliability_h3"][name] = [{"p_pred": round(float(prob[pb == b_, ci].mean()), 3),
                                                "freq_obs": round(float((cls[pb == b_] == ci).mean()), 3), "n": int((pb == b_).sum())}
                                               for b_ in range(len(edges) - 1) if (pb == b_).sum() > 200]
            rows = {"X": Xe, "y": y}
    out["importance"] = _importance(model, rows, rng) if rows else {}
    return out


def _importance(model, rows, rng, n=40_000):
    """Hoán vị theo NHÓM đặc trưng trên dự báo điểm (ridge + trung vị GBM): MAE tăng bao nhiêu % khi xáo nhóm đó."""
    idx = rng.choice(len(rows["y"]), min(n, len(rows["y"])), replace=False)
    X, y = rows["X"][idx], rows["y"][idx]

    def mae(Xx):
        return float(np.mean(np.abs(y - predict_z(model, Xx)[1])))
    base = mae(X)
    out = {}
    for name, cols in GROUPS.items():
        ci = [FEATURES.index(f) for f in cols]
        Xp = X.copy()
        Xp[:, ci] = X[rng.permutation(len(X))][:, ci]
        out[name] = round(100 * (mae(Xp) / base - 1), 2)
    return out


# ---------------------------------------------------------------- suy luận
def save_model(model, path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path, compress=3)


def model_path(variable, variant="full", model_dir=None):
    return Path(model_dir or MODEL_DIR) / (f"forecast_{variable}.joblib" if variant == "full" else f"forecast_{variable}_{variant}.joblib")


@lru_cache(maxsize=8)
def load_model(variable, variant="full", model_dir=None):
    p = model_path(variable, variant, model_dir)
    if not p.exists():
        raise FileNotFoundError(f"Chưa có mô hình dự báo {variant} cho {variable} ({p}). Chạy train_forecast.py trước.")
    m = joblib.load(p)
    m.setdefault("variant", variant)                         # mô hình huấn luyện trước khi có Outlook chưa lưu 2 khóa này
    m.setdefault("hmax", VARIANTS[variant]["hmax"])
    return m


def _signal(prob):
    """Tercile nổi trội: 'above' / 'below' nếu xác suất ≥ SIGNAL_P và lớn hơn tercile đối diện, ngược lại 'none'."""
    pb, pa = prob[..., 0], prob[..., 2]
    return np.where((pa >= SIGNAL_P) & (pa > pb), "above", np.where((pb >= SIGNAL_P) & (pb > pa), "below", "none"))


_STATE: dict = {}
_STATE_LOCK = threading.Lock()


def _state(model, cubes):
    """Dựng trạng thái (T, N) tốn vài giây → nhớ lại một bản cho lần gọi kế tiếp cùng cube (web gọi nhiều lần).
    Có khoá: web gửi dự báo + bản đồ cùng lúc, không được dựng trùng nhiều lần."""
    key = (model["variable"], model["train_end"], tuple(sorted((k, id(v)) for k, v in cubes.items())))
    with _STATE_LOCK:
        if key not in _STATE:
            _STATE.clear()
            _STATE[key] = build_state(model["variable"], cubes, model["params"])
        return _STATE[key]


def latest_origin():
    """Tháng cuối cùng có ĐỦ các chỉ số ENSO/SOI/PDO của NOAA (origin của mô hình Outlook)."""
    from . import indices
    d = indices.load()
    return d[OUTLOOK_INDICES].dropna().index.max()


def _months_between(a, b):
    return (b.year - a.year) * 12 + b.month - a.month


def outlook_state(model, S, origin):
    """Trạng thái cho mô hình Outlook: trục thời gian kéo dài tới origin + hmax; chỉ số NOAA đọc lại từ file mới nhất."""
    from . import indices
    t0 = S["times"][0]
    ext = pd.date_range(t0, pd.Timestamp(origin) + pd.DateOffset(months=model["hmax"] + 1), freq="MS")
    ind = indices.load(ext).ffill(limit=3).fillna(0.0)
    ind["glob"] = 0.0
    Sx = dict(S)
    Sx.update({"month0": ext.month.to_numpy() - 1, "ctx": _ctx_arrays(ind), "times_ext": ext, "ctxdf_ext": ind})
    return Sx


def predict_cells(model, cubes, cells, horizons, origin=None, keep_x=False):
    """Dự báo cho các ô `cells` (chỉ số phẳng) tại các horizon. Trả dict mảng (len(horizons), len(cells))."""
    S = _state(model, cubes)
    variant = model.get("variant", "full")
    if variant == "outlook":
        origin = pd.Timestamp(origin) if origin is not None else latest_origin()
        Sx = outlook_state(model, S, origin)
        times = Sx["times_ext"]
        o0 = int(times.get_loc(origin))
    else:
        Sx, times = S, S["times"]
        o0 = (len(times) - 1) if origin is None else int(times.get_loc(pd.Timestamp(origin)))
    zl, zm, zh, pr, xs = [], [], [], [], []
    for h in horizons:
        Xf = features(Sx, np.full(len(cells), o0), cells, np.full(len(cells), h), variant)
        lo, mid, hi, prob = predict_z(model, Xf)
        zl.append(lo), zm.append(mid), zh.append(hi), pr.append(prob)
        if keep_x:
            xs.append(Xf)
    tm = (times[o0].month - 1 + np.asarray(horizons)) % 12
    mu, sd = S["mu"][tm][:, cells], S["sd"][tm][:, cells]
    out = {"zlo": np.array(zl), "zmid": np.array(zm), "zhi": np.array(zh), "prob": np.array(pr), "mu": mu, "sd": sd,
           "tz_lo": S["tz"][tm][:, cells, 0], "tz_hi": S["tz"][tm][:, cells, 1]}
    out["lo"], out["mid"], out["hi"] = mu + out["zlo"] * sd, mu + out["zmid"] * sd, mu + out["zhi"] * sd
    out["times"] = [(times[o0] + pd.DateOffset(months=int(h))).strftime("%Y-%m") for h in horizons]
    out.update({"origin": str(times[o0].date()), "S": S, "Sx": Sx, "o0": o0, "Xf": xs})
    return out


def conditions(origin):
    """Trạng thái hiện tại của các tín hiệu khí hậu lớn (TB 3 tháng tới `origin`), kèm nhãn pha dễ hiểu."""
    from . import indices
    d = indices.load()
    w = d.loc[pd.Timestamp(origin) - pd.DateOffset(months=2): pd.Timestamp(origin)]
    out = []

    def add(key, label, unit, phase_fn, desc):
        s = w[key].dropna()
        if s.empty:
            return
        v = float(s.mean())
        out.append({"key": key, "label": label, "value": round(v, 2), "unit": unit, "as_of": str(s.index[-1].date())[:7],
                    "phase": phase_fn(v), "description": desc})
    add("nino34", "El Niño / La Niña (Niño 3.4)", "°C",
        lambda v: ("Strong " if abs(v) >= 1.5 else "Moderate " if abs(v) >= 1.0 else "Weak " if abs(v) >= 0.5 else "") + ("El Niño" if v >= 0.5 else "La Niña" if v <= -0.5 else "Neutral"),
        "Temperature of the central tropical Pacific compared with normal. El Niño shifts rain belts around the world.")
    add("dmi", "Indian Ocean Dipole (IOD)", "°C", lambda v: "Positive IOD" if v >= 0.4 else "Negative IOD" if v <= -0.4 else "Neutral",
        "Temperature difference between the western and eastern Indian Ocean. It affects rainfall in East Africa, India and Australia.")
    add("pdo", "Pacific Decadal Oscillation (PDO)", "index", lambda v: "Warm phase" if v >= 0.5 else "Cool phase" if v <= -0.5 else "Neutral",
        "A slow pattern of North Pacific sea temperature that shifts weather over years to decades.")
    add("soi", "Southern Oscillation Index (SOI)", "index", lambda v: "El Niño-like" if v <= -1 else "La Niña-like" if v >= 1 else "Neutral",
        "Air-pressure difference across the Pacific. Strongly negative values go with El Niño.")
    return out


def contributions(model, X, wgt):
    """Giải thích cục bộ: với mỗi nhóm thông tin, đặt nhóm đó về 'bình thường' (0) rồi xem dự báo thay đổi bao nhiêu.
    Trả danh sách (nhóm, Δ anomaly z, Δ xác suất above, Δ xác suất below), sắp theo mức ảnh hưởng."""
    variant = model.get("variant", "full")

    def agg(Xx):
        lo, mid, hi, p = predict_z(model, Xx)
        w = wgt / wgt.sum()
        return float((mid * w).sum()), float((p[:, 2] * w).sum()), float((p[:, 0] * w).sum())
    base = agg(X)
    res = []
    for name, cols in GROUPS.items():
        if name in NOT_EXPLAINED or (variant == "outlook" and name not in OUTLOOK_ACTIVE):
            continue
        Xn = X.copy()
        Xn[:, [FEATURES.index(f) for f in cols]] = 0.0
        a = agg(Xn)
        res.append({"group": name, "effect_z": round(base[0] - a[0], 3), "effect_p_above": round(base[1] - a[1], 3),
                    "effect_p_below": round(base[2] - a[2], 3)})
    return sorted(res, key=lambda r: -(abs(r["effect_p_above"]) + abs(r["effect_p_below"]))), base


def analogs(model, S, Sx, cells, o0, h, k=5):
    """Năm tương tự: các origin cùng tháng lịch trong quá khứ có Niño 3.4, SOI, PDO, IOD gần giống hiện tại nhất,
    kèm kết quả thật (anomaly z TB vùng) sau h tháng. Chỉ dùng origin trong giai đoạn có quan sát (o + h ≤ cuối cube)."""
    ctx = Sx.get("ctxdf_ext")
    if ctx is None:
        ctx = model["params"]["ctxdf"]
    F = pd.DataFrame({c: _rolling(ctx[c].to_numpy(), 3) for c in ("nino34", "soi", "pdo", "dmi")}, index=ctx.index)
    Tc = S["Z"].shape[0]
    Fz = ((F - F.iloc[:Tc].mean()) / F.iloc[:Tc].std().replace(0, 1)).to_numpy()
    zreg = S["Z"][:, cells].mean(1)
    m0 = Sx["month0"]
    cand = [t for t in range(NLAG - 1, Tc - h) if t != o0 and m0[t] == m0[o0]]
    if not cand:
        return []
    d = np.sqrt(((Fz[cand] - Fz[o0]) ** 2).sum(1))
    times = S["times"]
    return [{"origin": str(times[cand[i]].date())[:7], "target": str(times[cand[i] + h].date())[:7],
             "distance": round(float(d[i]), 2), "z_outcome": round(float(zreg[cand[i] + h]), 2),
             "state": {c: round(float(F[c].iloc[cand[i]]), 2) for c in F.columns}} for i in np.argsort(d)[:k]]


def forecast_region(variable, cubes, bbox, horizons=range(1, MAX_H + 1), origin=None, model=None, analog_h=None, targets=None,
                    variant="full"):
    """Dự báo trung bình vùng (trọng số cos vĩ độ): giá trị + khoảng 80% + xác suất tercile + tín hiệu + giải thích.
    `targets` (danh sách 'YYYY-MM') thay cho `horizons`: horizon tính từ origin. Khoảng và xác suất của vùng = trung bình
    của các ô (tương quan hoàn hảo) → BẢO THỦ, rộng/yếu hơn thật."""
    model = model or load_model(variable, variant)
    w, s, e, n = bbox
    la, lo = model["lat"], model["lon"]
    cells = np.where((la >= s) & (la <= n) & (lo >= w) & (lo <= e) & np.isin(np.arange(len(la)), model["valid"]))[0]
    if not len(cells):
        raise ValueError("Vùng không chứa ô lưới hợp lệ nào cho biến này (ví dụ biển với biến chỉ có đất liền).")
    if model.get("variant") == "outlook":
        origin = pd.Timestamp(origin) if origin is not None else latest_origin()
    if targets is not None:
        base = pd.Timestamp(origin) if origin is not None else _state(model, cubes)["times"][-1]
        horizons = [_months_between(base, pd.Timestamp(t + "-01")) for t in targets]
    hz = list(horizons)
    if any(h < 1 or h > model["hmax"] for h in hz):
        raise ValueError(f"Horizon phải nằm trong 1..{model['hmax']} tháng kể từ origin.")
    p = predict_cells(model, cubes, cells, hz, origin, keep_x=True)
    wgt = np.cos(np.deg2rad(la[cells]))
    avg = lambda a: (a * wgt).sum(1) / wgt.sum()
    prob = (p["prob"] * wgt[None, :, None]).sum(1) / wgt.sum()
    tilt = np.abs(prob[:, 2] - prob[:, 0])
    star = int(np.argmax(tilt))
    contrib, _ = contributions(model, p["Xf"][star], wgt)
    an = analogs(model, p["S"], p["Sx"], cells, p["o0"], hz[star])
    org = pd.Timestamp(p["origin"])
    return {"variable": variable, "variant": model.get("variant", "full"), "bbox": list(bbox), "origin": p["origin"],
            "n_cells": int(len(cells)), "horizons": hz, "time": p["times"], "forecast": avg(p["mid"]).tolist(),
            "lower": avg(p["lo"]).tolist(), "upper": avg(p["hi"]).tolist(), "z_forecast": avg(p["zmid"]).tolist(),
            "climatology": avg(p["mu"]).tolist(), "tercile_lower": avg(p["mu"] + p["tz_lo"] * p["sd"]).tolist(),
            "tercile_upper": avg(p["mu"] + p["tz_hi"] * p["sd"]).tolist(), "p_below": prob[:, 0].tolist(), "p_near": prob[:, 1].tolist(),
            "p_above": prob[:, 2].tolist(), "signal": _signal(prob).tolist(), "analogs": an, "analog_horizon": hz[star],
            "headline_index": star, "contributions": contrib, "conditions": conditions(org), "interval": 1 - ALPHA,
            "train_end": model["train_end"], "aux_used": model.get("aux_used", []),
            "center_lat": float((s + n) / 2), "band": BAND_NAMES[int(_band(np.array([(s + n) / 2]))[0])]}


def forecast_map(variable, cubes, horizon, origin=None, model=None, variant="full"):
    """Bản đồ triển vọng toàn cầu tại một horizon: mỗi ô [lat, lon, z_trung_vị, signal, p_dưới, p_trên]."""
    model = model or load_model(variable, variant)
    cells = model["valid"]
    if model.get("variant") == "outlook":
        origin = pd.Timestamp(origin) if origin is not None else latest_origin()
    p = predict_cells(model, cubes, cells, [horizon], origin)
    z, prob = p["zmid"][0], p["prob"][0]
    return {"variable": variable, "origin": p["origin"], "time": p["times"][0], "horizon": horizon,
            "columns": ["lat", "lon", "z_forecast", "signal", "p_below", "p_above"],
            "cells": [[float(model["lat"][c]), float(model["lon"][c]), round(float(a), 3), str(s), round(float(b), 3), round(float(d), 3)]
                      for c, a, s, b, d in zip(cells, z, _signal(prob), prob[:, 0], prob[:, 2])], "interval": 1 - ALPHA}


# ---------------------------------------------------------------- dự báo từ quan sát MỚI (NASA POWER), không cần cube
def _live_context(model, ext):
    """Chỉ số NOAA kéo dài tới `ext` + nhiệt độ toàn cầu: MERRA-2 trong giai đoạn cube, NASA GISTEMP (trừ khí hậu cùng kỳ) sau đó."""
    from . import live
    d = live.indices_extended(ext)
    base = model["params"]["ctxdf"]
    glob = pd.Series(np.nan, index=ext)
    common = base.index.intersection(ext)
    glob.loc[common] = base["glob"].reindex(common).to_numpy()
    after = ext[ext > base.index[-1]]
    if len(after):
        try:
            g = live.gistemp_global()
            gb = g.loc[: f"{int(model['train_end'][:4])}-12-31"]
            gb = gb.groupby(gb.index.month).mean()
            for t in after:
                if t in g.index:
                    glob.loc[t] = g[t] - gb[t.month]
        except Exception:
            pass                                             # không có GISTEMP → giữ giá trị gần nhất
    d["glob"] = glob.ffill().fillna(0.0).to_numpy()
    return d


def live_state(model, cells, zframes, ext):
    """Trạng thái cho mô hình Satellite từ chuỗi z của NASA POWER (mỗi ô một DataFrame `power_z`); không cần nạp cube."""
    from . import live
    var = model["variable"]
    T = len(ext)

    def stack(col):
        return np.column_stack([zf[col].reindex(ext).to_numpy() for zf in zframes]).astype("float32")
    own = stack(live.VAR_COL[var])
    ctxdf = _live_context(model, ext)
    mu, sd = model["params"]["clim"][var]
    S = {"times": ext, "Z": np.nan_to_num(own), "month0": ext.month.to_numpy() - 1, "lat": model["lat"][cells], "lon": model["lon"][cells],
         "mu": mu[:, cells], "sd": sd[:, cells], "tz": model["params"]["tz"][:, cells, :], "ctx": _ctx_arrays(ctxdf), "ctxdf_ext": ctxdf,
         "nb0": np.nan_to_num(own), "nb3": np.nan_to_num(_roll3(own)), "x0": {}, "x3": {}, "slope_raw": None, "tcenter": TREF}
    for v in model.get("aux_used", []):
        arr = stack(live.VAR_COL[v])
        S["x0"][v], S["x3"][v] = np.nan_to_num(arr), np.nan_to_num(_roll3(arr))
    return S


def _live_cols(model):
    from . import live
    return sorted({live.VAR_COL[v] for v in [model["variable"]] + list(model.get("aux_used", []))})


def _cell_of(model, lat, lon):
    from . import live
    la, lo = live.cell_center(lat, lon)
    d = (model["lat"] - la) ** 2 + (model["lon"] - lo) ** 2
    c = int(np.argmin(d))
    if d[c] > 1e-6 or c not in set(model["valid"].tolist()):
        raise ValueError("No data for this variable at this location (for example the sea for a land-only variable).")
    return c, la, lo


def analogs_live(z, ctxdf, ext, o0, h, k=5):
    """Năm tương tự theo chuỗi z quan sát (POWER): origin cùng tháng lịch có Niño 3.4, SOI, PDO, IOD gần giống nhất, kèm kết quả thật sau h tháng."""
    F = pd.DataFrame({c: _rolling(ctxdf[c].to_numpy(), 3) for c in ("nino34", "soi", "pdo", "dmi")}, index=ctxdf.index)
    Tobs = int(np.isfinite(z).sum() and np.max(np.where(np.isfinite(z))[0]) + 1)
    Fz = ((F - F.iloc[:Tobs].mean()) / F.iloc[:Tobs].std().replace(0, 1)).to_numpy()
    m0 = ext.month.to_numpy() - 1
    cand = [t for t in range(NLAG - 1, Tobs - h) if t != o0 and m0[t] == m0[o0] and np.isfinite(z[t + h])]
    if not cand:
        return []
    d = np.sqrt(((Fz[cand] - Fz[o0]) ** 2).sum(1))
    return [{"origin": str(ext[cand[i]].date())[:7], "target": str(ext[cand[i] + h].date())[:7], "distance": round(float(d[i]), 2),
             "z_outcome": round(float(z[cand[i] + h]), 2), "state": {c: round(float(F[c].iloc[cand[i]]), 2) for c in F.columns}}
            for i in np.argsort(d)[:k]]


def forecast_live(variable, lat, lon, horizons=range(1, MAX_H + 1), power=None, model=None, not_before=None, not_after=None):
    """Dự báo 1–12 tháng cho MỘT điểm từ quan sát mới nhất của NASA POWER (mô hình Satellite, origin = tháng gần nhất có đủ số liệu).
    `power`: DataFrame `live.power_monthly` (để test hoặc dùng lại cache)."""
    from . import live
    model = model or load_model(variable, "full")
    c, la, lo = _cell_of(model, lat, lon)
    df = live.power_monthly(la, lo) if power is None else power
    z = live.power_z(df, int(model["train_end"][:4]))
    origin = live.last_complete(z, _live_cols(model))
    hz = list(horizons)
    ext = pd.date_range(df.index[0], origin + pd.DateOffset(months=max(hz)), freq="MS")
    S = live_state(model, [c], [z], ext)
    o0 = int(ext.get_loc(origin))
    X = features(S, np.full(len(hz), o0), np.zeros(len(hz), dtype=int), np.array(hz), "full")
    lo_z, mid, hi_z, prob = predict_z(model, X)
    tm = (origin.month - 1 + np.array(hz)) % 12
    mu_t, sd_t = S["mu"][tm, 0], S["sd"][tm, 0]
    cand = np.arange(len(hz))
    if not_before is not None:                                   # giải thích tháng từ `not_before` trở đi (không giải thích tháng đã qua)
        ok = np.array([(origin + pd.DateOffset(months=int(h))) >= pd.Timestamp(not_before) and
                       (not_after is None or (origin + pd.DateOffset(months=int(h))) <= pd.Timestamp(not_after)) for h in hz])
        cand = cand[ok] if ok.any() else cand
    star = int(cand[np.argmax(np.abs(prob[cand, 2] - prob[cand, 0]))])
    contrib, _ = contributions(model, X[[star]], np.ones(1))
    obs = z.loc[: origin].tail(12)
    raw = df.loc[obs.index]
    clim_raw = {col: df.loc[:f"{int(model['train_end'][:4])}-12-31", col].groupby(df.loc[:f"{int(model['train_end'][:4])}-12-31"].index.month).mean() for col in df.columns}
    observed = [{"t": t.strftime("%Y-%m"), **{f"z_{col}": (None if pd.isna(obs.at[t, col]) else round(float(obs.at[t, col]), 2)) for col in df.columns},
                 **{f"raw_{col}": (None if pd.isna(raw.at[t, col]) else round(float(raw.at[t, col]), 3)) for col in df.columns},
                 **{f"normal_{col}": round(float(clim_raw[col][t.month]), 3) for col in df.columns}} for t in obs.index]
    zown = z[live.VAR_COL[variable]].reindex(ext).to_numpy()
    return {"variable": variable, "variant": "live", "origin": str(origin.date()), "cell": {"lat": la, "lon": lo}, "horizons": hz,
            "time": [(origin + pd.DateOffset(months=int(h))).strftime("%Y-%m") for h in hz],
            "forecast": (mu_t + mid * sd_t).tolist(), "lower": (mu_t + lo_z * sd_t).tolist(), "upper": (mu_t + hi_z * sd_t).tolist(),
            "z_forecast": mid.tolist(), "climatology": mu_t.tolist(), "tercile_lower": (mu_t + S["tz"][tm, 0, 0] * sd_t).tolist(),
            "tercile_upper": (mu_t + S["tz"][tm, 0, 1] * sd_t).tolist(), "p_below": prob[:, 0].tolist(), "p_near": prob[:, 1].tolist(),
            "p_above": prob[:, 2].tolist(), "signal": _signal(prob).tolist(), "headline_index": star, "contributions": contrib,
            "conditions": conditions(origin), "analogs": analogs_live(zown, S["ctxdf_ext"], ext, o0, hz[star]), "analog_horizon": hz[star],
            "observed": observed, "interval": 1 - ALPHA, "train_end": model["train_end"], "band": BAND_NAMES[int(_band(np.array([la]))[0])],
            "source": "NASA POWER monthly (MERRA-2 / IMERG corrected), 1° cell centre"}


def live_backtest(variable, frames, eval_h=(1, 2, 3, 6, 12), first_target="2025-01", model=None):
    """Kiểm tra cách dự báo từ quan sát mới trên số đo THẬT sau giai đoạn mô hình đã thấy (mặc định từ 2025-01).
    `frames`: {(lat_tâm_ô, lon_tâm_ô): DataFrame power_monthly}. Metric cùng kiểu `_backtest`."""
    from . import live
    model = model or load_model(variable, "full")
    keys = list(frames)
    cells = [_cell_of(model, la, lo)[0] for la, lo in keys]
    base_year = int(model["train_end"][:4])
    zfr = [live.power_z(frames[k], base_year) for k in keys]
    cols = _live_cols(model)
    ext = zfr[0].index
    S = live_state(model, cells, zfr, ext)
    zown = np.column_stack([zf[live.VAR_COL[variable]].reindex(ext).to_numpy() for zf in zfr])
    ok_all = np.column_stack([zf[cols].reindex(ext).notna().all(axis=1).to_numpy() for zf in zfr])
    t0 = int(ext.get_loc(pd.Timestamp(first_target + "-01")))
    last_ok = ext[np.where(ok_all.any(axis=1))[0].max()]
    out = {"variable": variable, "test_period": [first_target, str(last_ok.date())[:7]], "n_cells": len(keys), "by_horizon": {}, "by_latband": {}}
    band_c = _band(S["lat"])
    clim_p = np.full((1, 3), 1 / 3)

    def rpss(prob, cls):
        return 1 - float(np.mean(_rps(prob, cls)) / np.mean(_rps(np.repeat(clim_p, len(cls), 0), cls)))
    for h in eval_h:
        tgt = np.arange(max(t0, NLAG - 1 + h), len(ext))
        o = np.repeat(tgt - h, len(cells))
        ci = np.tile(np.arange(len(cells)), len(tgt))
        keep = ok_all[o, ci] & np.isfinite(zown[o + h, ci])
        o, ci = o[keep], ci[keep]
        if len(o) < 50:
            continue
        X = features(S, o, ci, np.full(len(o), h), "full")
        y = np.clip(zown[o + h, ci], -ZCLIP, ZCLIP)
        lo, mid, hi, prob = predict_z(model, X)
        cls = _classes(y, X[:, FEATURES.index("tzlo")], X[:, FEATURES.index("tzhi")])
        mse0 = float(np.mean(y ** 2))
        row = {"n": int(len(y)), "model": _score(y, mid, mse0)}
        row["model"].update({"coverage_conformal": float(np.mean((y >= lo) & (y <= hi))), "rpss": rpss(prob, cls),
                             "tercile_accuracy": float(np.mean(prob.argmax(1) == cls)),
                             "bss_below": 1 - float(np.mean((prob[:, 0] - (cls == 0)) ** 2) / np.mean((1 / 3 - (cls == 0)) ** 2)),
                             "bss_above": 1 - float(np.mean((prob[:, 2] - (cls == 2)) ** 2) / np.mean((1 / 3 - (cls == 2)) ** 2))})
        row["persistence"] = _score(y, np.clip(zown[o, ci], -ZCLIP, ZCLIP), mse0)
        row["clim"] = _score(y, np.zeros_like(y), mse0)
        out["by_horizon"][int(h)] = _round(row)
        bnd = band_c[ci]
        for bi, bn in enumerate(BAND_NAMES):
            m = bnd == bi
            if m.sum() > 50:
                out["by_latband"].setdefault(bn, {})[int(h)] = _round({
                    "model_skill": 1 - float(np.mean((y[m] - mid[m]) ** 2)) / max(float(np.mean(y[m] ** 2)), 1e-9),
                    "rpss": rpss(prob[m], cls[m]), "n": int(m.sum())})
    return out
