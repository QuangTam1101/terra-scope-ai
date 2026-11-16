"""Xu hướng (docs/01 S8, docs/05 FDR): anomaly, Seasonal MK + Sen, Hamed-Rao, OLS, Benjamini–Hochberg."""
import numpy as np
import pandas as pd
import pymannkendall as mk
from scipy import stats


def anomaly(s):
    """Giá trị − trung bình cùng tháng qua các năm (bỏ nhịp mùa)."""
    return s - s.groupby(s.index.month).transform("mean")


def trend_one(s, min_years=10, min_frac=0.7, annual=False):
    """s: chuỗi tháng (index = đầu tháng, NaN = thiếu) → dict một dòng của trends.parquet.
    Độ dốc quy về đơn vị / thập kỷ. ✅ pymannkendall 1.4.3: seasonal_test(period=12).slope là / năm;
    hamed_rao trên chuỗi tháng cho slope / tháng.
    annual=True (chuỗi đếm sự kiện theo mùa, api.ANNUAL_SLOPE): độ dốc = Sen trên trung bình anomaly từng năm.
    Sen theo mùa là trung vị của mọi cặp năm trong 12 tháng, nên ra 0 khi sự kiện chỉ rơi vào vài tháng mỗi năm
    (điểm cháy Sahel: −0,61 so với CI OLS [−24; −12]). p vẫn của Seasonal MK. Dùng anomaly để năm thiếu tháng không lệch theo mùa."""
    present = s.dropna()
    insufficient = present.index.year.nunique() < min_years or s.notna().mean() < min_frac
    smk = mk.seasonal_test(s.to_numpy(dtype="float64"), period=12)
    a = anomaly(s)
    hr = mk.hamed_rao_modification_test(a.to_numpy(dtype="float64"))
    ok = a.notna().to_numpy()
    years = ((s.index - s.index[0]).days / 365.25).to_numpy()
    lr = stats.linregress(years[ok], a.to_numpy()[ok])
    ci = stats.t.ppf(0.975, ok.sum() - 2) * lr.stderr
    slope = mk.sens_slope(a.groupby(a.index.year).mean().to_numpy()).slope if annual else smk.slope
    return {"trend": smk.trend, "slope_per_decade": slope * 10, "z": smk.z, "p_value": smk.p,
            "hr_slope_per_decade": hr.slope * 12 * 10, "hr_p_value": hr.p,
            "ols_slope_per_decade": lr.slope * 10, "ols_ci95_per_decade": ci * 10,
            "method": "seasonal_mk_sen_annual" if annual else "seasonal_mk_sen", "n_months": int(s.notna().sum()), "insufficient_data": insufficient}


def bh_fdr(p):
    """q-value Benjamini–Hochberg. p: mảng p-value (NaN giữ nguyên)."""
    p = np.asarray(p, dtype="float64")
    q = np.full_like(p, np.nan)
    ok = np.isfinite(p)
    ps = p[ok]
    order = np.argsort(ps)
    ranked = ps[order] * len(ps) / np.arange(1, len(ps) + 1)
    ranked = np.minimum.accumulate(ranked[::-1])[::-1]        # đảm bảo q không giảm theo thứ hạng
    out = np.empty_like(ps)
    out[order] = np.minimum(ranked, 1.0)
    q[ok] = out
    return q


def trends_table(obs, alpha=0.05):
    """observations (bảng chuẩn) → trends: một dòng mỗi (vùng, biến); FDR tính riêng trong từng biến."""
    out = []
    for (region, var), g in obs.groupby(["region_id", "variable"]):
        s = g.set_index(pd.to_datetime(g["time"]))["value"].sort_index().asfreq("MS")
        out.append({"region_id": region, "variable": var, "unit": g["unit"].iloc[0], **trend_one(s)})
    t = pd.DataFrame(out)
    t["p_value_fdr"] = t.groupby("variable")["p_value"].transform(lambda p: bh_fdr(p))
    t["significant"] = (t["p_value_fdr"] < alpha) & ~t["insufficient_data"]
    return t
