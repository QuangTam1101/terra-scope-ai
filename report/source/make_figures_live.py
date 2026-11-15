"""Figures 1-3 redrawn from the LIVE app API (1° grid, 2001-2024). Based on report/source/make_figures.py.
Inputs: report/source/live_api_2026-11-15 (saved by fetch_live.py). Usage: python make_figures_live.py <inputs dir> <output dir>
Figures for the formal technical report. Data come from the running Terra-scope backend
(/series, /trends, /compare, /trends/grid), saved as JSON by fetch scripts. Nothing here changes a statistic:
slopes and p-values are copied from the API; only the drawing is done here."""
import json, sys, numpy as np, pandas as pd
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import cartopy.crs as ccrs, cartopy.feature as cfeature
src, out = sys.argv[1], sys.argv[2]
plt.rcParams.update({"font.family": "Arial", "font.size": 9, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.titlesize": 9.5, "savefig.dpi": 300})
UP, DOWN, INK, GREY = "#d9772b", "#2f6fb3", "#2b2540", "#9a94a8"

def monthly(points):
    df = pd.DataFrame(points); df["t"] = pd.to_datetime(df["t"]); return df

def sen_line(ax, df, slope_dec, col, label, x_lab):
    yrs = (df["t"] - df["t"].iloc[0]).dt.days / 365.25
    mid = yrs.median(); y0 = np.nanmedian(df["anomaly"])
    line = y0 + slope_dec / 10 * (yrs - mid)
    ax.plot(df["t"], line, color=col, lw=2.2)
    ax.annotate(label, (df["t"].iloc[-1], line.iloc[-1]), xytext=(4, 0), textcoords="offset points", color=col,
                fontsize=8.5, fontweight="bold", va="center")

def anomaly_panel(ax, df, slope, col, label, ylabel):
    ax.plot(df["t"], df["anomaly"], color=GREY, lw=0.7)
    ann = df.set_index("t")["anomaly"].resample("YS").mean()
    ax.plot(ann.index + pd.Timedelta(days=182), ann.values, "o", ms=3.5, color=INK)
    ax.axhline(0, color="#cfcad8", lw=0.8)
    sen_line(ax, df, slope, col, label, None)
    ax.set_ylabel(ylabel); ax.set_xlim(df["t"].iloc[0], df["t"].iloc[-1] + pd.Timedelta(days=1400))
    ax.set_xticks([pd.Timestamp(f"{y}-01-01") for y in range(2001, 2027, 5)]); ax.set_xticklabels([str(y) for y in range(2001, 2027, 5)])
    import matplotlib.dates as mdates; ax.spines["bottom"].set_bounds(mdates.date2num(df["t"].iloc[0]), mdates.date2num(df["t"].iloc[-1]))

api = json.load(open(src + "/api.json"))
fig, axes = plt.subplots(2, 1, figsize=(6.6, 4.6), sharex=False)
t = api["md_t2m_trend"]; anomaly_panel(axes[0], monthly(api["md_t2m_series"]["points"]), t["slope_per_decade"], UP,
    f"+{t['slope_per_decade']:.2f} °C\nper decade", "Anomaly (°C)")
axes[0].set_title("(a) 2 m air temperature, MERRA-2, 2001 to 2024", loc="left")
r = api["md_pr_trend"]; anomaly_panel(axes[1], monthly(api["md_pr_series"]["points"]), r["slope_per_decade"], UP,
    f"+{r['slope_per_decade']:.2f} mm/month\nper decade", "Anomaly (mm/month)")
axes[1].lines[-1].set_linestyle("--")
axes[1].set_title("(b) Precipitation, GPM IMERG, 2001 to 2024", loc="left")
fig.tight_layout(); fig.savefig(out + "/fig1_mekong_delta.png"); plt.close(fig)

import gzip, os
g = json.load(gzip.open(src + "/grid.json.gz", "rt") if os.path.exists(src + "/grid.json.gz") else open(src + "/grid.json"))
cells = pd.DataFrame(g["cells"]); cells = cells[cells["valid"]]
lons = np.arange(-179.5, 180, 1.0); lats = np.arange(-89.5, 90, 1.0)
Z = np.full((lats.size, lons.size), np.nan); S = np.zeros_like(Z, dtype=bool)
ix = np.round(cells["lon"] + 179.5).astype(int); iy = np.round(cells["lat"] + 89.5).astype(int)
Z[iy, ix] = cells["slope_per_decade"]; S[iy, ix] = cells["significant_fdr"]
from matplotlib.colors import LinearSegmentedColormap, BoundaryNorm
cmap = LinearSegmentedColormap.from_list("td", ["#173f73", DOWN, "#bcd5ee", "#f7f5f2", "#f6c79a", UP, "#8a3a0c"])
bounds = [-0.9, -0.6, -0.3, -0.1, 0, 0.1, 0.3, 0.6, 0.9]; norm = BoundaryNorm(bounds, cmap.N, extend="both")
fig = plt.figure(figsize=(6.6, 3.9)); ax = plt.axes(projection=ccrs.Robinson())
ax.set_global()
Zs = np.where(S, Z, np.nan); Zn = np.where(~S, Z, np.nan)
ax.pcolormesh(lons, lats, np.where(np.isnan(Zn), np.nan, 1.0), cmap=LinearSegmentedColormap.from_list("g", ["#dedae4", "#dedae4"]),
              transform=ccrs.PlateCarree(), shading="nearest", rasterized=True)
m = ax.pcolormesh(lons, lats, Zs, cmap=cmap, norm=norm, transform=ccrs.PlateCarree(), shading="nearest", rasterized=True)
ax.add_feature(cfeature.COASTLINE.with_scale("110m"), lw=0.4, edgecolor=INK)
ax.spines["geo"].set_linewidth(0.5)
cb = fig.colorbar(m, ax=ax, orientation="horizontal", fraction=0.05, pad=0.04, aspect=45, ticks=bounds)
cb.set_label("Sen slope of 2 m air temperature (°C per decade)"); cb.outline.set_linewidth(0.4)
fig.savefig(out + "/fig2_global_trend_map.png", bbox_inches="tight"); plt.close(fig)
n_valid = int(cells.shape[0]); n_sig = int(cells["significant_fdr"].sum())
n_up = int(((cells["slope_per_decade"] > 0) & cells["significant_fdr"]).sum())
print("map", n_valid, n_sig, n_up, n_sig - n_up)

sw = json.load(open(src + "/sw.json")); cmp_ = json.load(open(src + "/compare.json"))
a = monthly(sw["sahel"]["points"]); b = monthly(sw["wisc"]["points"])
diff = a[["t"]].copy(); diff["anomaly"] = a["anomaly"].values - b["anomaly"].values
fig, ax = plt.subplots(figsize=(6.6, 2.6))
d = cmp_["difference"]
anomaly_panel(ax, diff, d["slope_diff_per_decade"], DOWN, f"{d['slope_diff_per_decade']:.2f} °C\nper decade".replace("-", "−"),
              "Sahel minus Wisconsin (°C)")
fig.tight_layout(); fig.savefig(out + "/fig3_sahel_wisconsin.png"); plt.close(fig)
