"""Evidence report (core feature 5; docs/01 mục 7): kết quả của api.analyze_region / api.compare_regions → Markdown.
Mọi con số lấy thẳng từ dict kết quả (không qua LLM). Frontend hiển thị / in ra PDF bằng trình duyệt."""
from datetime import datetime, timezone

from .schema import PIPELINE_VERSION


def _fmt(x, nd=3):
    return "không xác định" if x is None else f"{x:.{nd}g}"


def _trend_lines(t, unit):
    lo = None if t["ols_slope_per_decade"] is None else t["ols_slope_per_decade"] - t["ols_ci95_per_decade"]
    hi = None if t["ols_slope_per_decade"] is None else t["ols_slope_per_decade"] + t["ols_ci95_per_decade"]
    return [f"- Xu hướng (Sen, Seasonal MK): **{_fmt(t['slope_per_decade'])} {unit}/thập kỷ**, p = {_fmt(t['p_value'])}",
            f"- Kiểm tra lại có hiệu chỉnh tự tương quan (Hamed-Rao): p = {_fmt(t['hr_p_value'])}",
            f"- OLS trên anomaly: {_fmt(t['ols_slope_per_decade'])} {unit}/thập kỷ, CI 95% [{_fmt(lo)}, {_fmt(hi)}]",
            f"- Số tháng có dữ liệu: {t['n_months']}" + (" ⚠️ không đủ dữ liệu để kết luận" if t["insufficient_data"] else "")]


def evidence_report(r):
    unit = r["unit"]
    out = [f"# Báo cáo bằng chứng: {r['name']}", "",
           f"Tạo lúc {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC · pipeline {PIPELINE_VERSION} · Terra-scope AI", ""]
    if "difference" in r:                                       # compare_regions
        d = r["difference"]
        out += ["## Câu hỏi", f"Xu hướng {r['name'].lower()} ở vùng A {r['region_a']['bbox']} và vùng B "
                f"{r['region_b']['bbox']} có khác nhau thật không?", "",
                "## Vùng A", *_trend_lines(r["region_a"]["trend"], unit), "",
                "## Vùng B", *_trend_lines(r["region_b"]["trend"], unit), "",
                "## Khác biệt A − B",
                f"- {_fmt(d['slope_diff_per_decade'])} {unit}/thập kỷ, CI 95% [{_fmt(d['ci95_low'])}, {_fmt(d['ci95_high'])}], "
                f"p = {_fmt(d['p_diff'])}, dấu ổn định hai nửa giai đoạn: {'có' if d['stable_halves'] else 'không'}",
                f"- Kết luận thống kê: **{'khác biệt đáng tin cậy' if r['reliable'] else 'chưa đủ bằng chứng khác biệt'}**", ""]
    else:                                                       # analyze_region
        q = r["quality"]
        out += ["## Câu hỏi", f"{r['name']} ở vùng {r['bbox']} thay đổi thế nào từ {r['start']} đến {r['end']}?", "",
                "## Kết quả", *_trend_lines(r["trend"], unit), "",
                "## Chất lượng dữ liệu",
                f"- {q['months_with_data']}/{q['months_total']} tháng có dữ liệu; "
                f"tỷ lệ ô lưới hợp lệ trung bình {_fmt(q['mean_valid_frac'], 2)}", ""]
    out += ["## Nguồn dữ liệu NASA", f"- {r['source']}", "", "## Phương pháp", f"- {r['method']}", "",
            "## Giới hạn", *[f"- {x}" for x in r["limitations"]], ""]
    return "\n".join(out)
