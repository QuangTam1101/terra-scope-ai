"""Compares the browser run (web/e2e/out/scientific/ui_run.json, produced by web/e2e/scientific.e2e.mjs) and the two
exported PDFs with the independent oracle. Writes validation/results/ui_pdf_cases.json and page PNGs.
Display formats mirror the frontend formatters (web/src/ui.tsx signed/pval for the app, web/src/report/model.ts
signedNum/pText for the reports); a value counts as shown only if its formatted string is present."""
import json
import math
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

sys.path.insert(0, str(Path(__file__).resolve().parent))
import oracle  # noqa: E402
from cases import PRESETS  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "web" / "e2e" / "out" / "scientific"
OUT = Path(__file__).resolve().parent / "results"
MINUS = "−"
UNITS = {"mm/month": "mm/month", "degC": "°C", "m3/m3": "m³/m³"}
VAR_OF = {"Precipitation": "imerg_precip", "Evapotranspiration": "gldas_evapotranspiration"}


def js_fixed(x, d):
    return f"{abs(x):.{d}f}"


def ui_signed(x):                                     # web/src/ui.tsx signed()
    d = 1 if abs(x) >= 10 else 2 if abs(x) >= 0.1 else 4 if abs(x) >= 0.001 else 5
    return ("+" if x > 0 else MINUS if x < 0 else "") + js_fixed(x, d)


def ui_p(p):                                          # web/src/ui.tsx pval()
    return "<0.001" if p < 0.001 else f"{p:.3f}"


def rep_num(x, digits=2):                             # web/src/report/model.ts num()
    a = abs(x)
    if a >= 100:
        return f"{x:.1f}"
    if a >= 1:
        return f"{x:.{digits}f}"
    return f"{x:.3g}" if x != 0 else "0"


def rep_signed(x):                                    # signedNum()
    s = rep_num(abs(x))
    return ("+" if x > 0 else MINUS if x < 0 else "") + s


def rep_p(p):                                         # pText()
    return "< 0.001" if p < 0.001 else f"{p:.3f}"


def pdf_audit(path):
    doc = fitz.open(path)
    pages = []
    for i, pg in enumerate(doc):
        text = pg.get_text()
        words = pg.get_text("words")
        outside = [w[4] for w in words if w[0] < -1 or w[1] < -1 or w[2] > pg.rect.width + 1 or w[3] > pg.rect.height + 1]
        pix = pg.get_pixmap(dpi=60)
        png = OUT / "pdf_pages" / f"{Path(path).stem}-p{i + 1}.png"
        png.parent.mkdir(parents=True, exist_ok=True)
        pix.save(png)
        pages.append({"page": i + 1, "chars": len(text), "words_outside_page": outside[:5], "images": len(pg.get_images()),
                      "links": [l.get("uri") for l in pg.get_links() if l.get("uri")], "png": str(png.relative_to(ROOT))})
    full = "\n".join(pg.get_text() for pg in doc)
    return {"path": str(Path(path).relative_to(ROOT)), "n_pages": len(doc), "pages": pages,
            "metadata_title": doc.metadata.get("title"), "text": full}


def norm(s):
    return re.sub(r"\s+", " ", s.replace(" ", " "))


def main():
    OUT.mkdir(exist_ok=True)
    run = json.loads((RUN / "ui_run.json").read_text(encoding="utf-8"))
    pdf = {ed: pdf_audit(run["pdfs"][ed]) for ed in ("explorer", "scientist")}
    ptxt = {ed: norm(pdf[ed]["text"]) for ed in pdf}
    results = []
    for sc in run["scenarios"]:
        rec = {"id": sc["id"], "maps_to": sc["tc"], "ui_place_input": sc["place"], "first_search_hit": sc.get("first_hit"), "checks": []}

        def check(name, ok, expected=None, actual=None):
            rec["checks"].append({"check": name, "pass": bool(ok), "expected": expected, "actual": actual})

        req, tr = sc["request"], sc["trend_response"]
        region = req["region"]
        bbox = PRESETS[region["id"]] if region["type"] == "preset" else tuple(region["bbox"])
        rec.update(variable_id=req["variable_id"], bbox=list(bbox), start=req["start"], end=req["end"])
        exp = oracle.regional_expected(req["variable_id"], bbox, req["start"], req["end"])
        rec["expected"] = {k: exp.get(k) for k in ("slope_per_decade", "p_value", "significant", "p_value_hr", "ols_ci95", "n_months")}
        rec["actual_backend"] = {k: tr.get(k) for k in ("slope_per_decade", "p_value", "significant", "p_value_autocorr_adjusted", "slope_ci", "n")}
        check("request matches the chosen context (variable, years)", req["start"].startswith(str(sc["years"][0])) and req["end"].startswith(str(sc["years"][1])),
              sc["years"], [req["start"], req["end"]])
        check("backend slope = oracle", math.isclose(tr["slope_per_decade"], exp["slope_per_decade"], rel_tol=1e-9), exp["slope_per_decade"], tr["slope_per_decade"])
        check("backend raw p = oracle", math.isclose(tr["p_value"], exp["p_value"], rel_tol=1e-9, abs_tol=1e-12), exp["p_value"], tr["p_value"])
        check("backend verdict = oracle", tr["significant"] == exp["significant"], exp["significant"], tr["significant"])
        u = UNITS[tr["units"]]
        s_ui, p_ui = ui_signed(exp["slope_per_decade"]), ui_p(exp["p_value"])
        ex, sci = norm(sc["explorer_text"]), norm(sc["scientist_text"])
        check("Explorer screen shows the oracle slope", f"{s_ui} {u}" in ex, f"{s_ui} {u}", None)
        check("Explorer screen shows the oracle p", f"p {p_ui}" in ex, f"p {p_ui}", None)
        badge = "Clear trend (significant)" if exp["significant"] else "Not proven yet"
        check("Explorer verdict label", badge in ex, badge, None)
        if not exp["significant"]:
            check("Explorer wording does not claim a clear change", "not strong enough to confirm" in ex and "clear upward" not in ex, "hedged wording", None)
        check("Scientist screen shows slope and raw p", f"{s_ui} {u}" in sci and p_ui in sci, [f"{s_ui} {u}", p_ui], None)
        check("Scientist screen shows Hamed-Rao p", ui_p(exp["p_value_hr"]) in sci, ui_p(exp["p_value_hr"]), None)
        check("Scientist decision sentence", ("criterion is met" in sci) == bool(exp["significant"]) and ("criterion is not met" in sci) == (not exp["significant"]), exp["significant"], None)
        check("mode switch made no new request", sc["requests_after_mode_switch"] == 0, 0, sc["requests_after_mode_switch"])
        rs, rp = rep_signed(exp["slope_per_decade"]), rep_p(exp["p_value"])
        for ed in ("explorer", "scientist"):
            check(f"{ed} PDF contains the slope", rs in ptxt[ed], rs, None)
        check("scientist PDF contains the raw p", rp in ptxt["scientist"], rp, None)
        check("scientist PDF contains the Hamed-Rao p", rep_p(exp["p_value_hr"]) in ptxt["scientist"], rep_p(exp["p_value_hr"]), None)
        lo, hi = exp["ols_ci95"]
        ci_ok = any(f"{rep_num(lo)} to {rep_num(hi)}".replace("-", m) in ptxt["scientist"] for m in ("-", MINUS))
        check("scientist PDF contains the OLS 95% CI", ci_ok, f"{rep_num(lo)} to {rep_num(hi)}", None)
        # verdict consistency: the row of Table 1 (scientist) and the stamp next to the finding title (explorer)
        row = re.search(re.escape(rs) + r"[^|]{0,40}?" + re.escape(rp) + r"\s*(\d+)\s*(Significant trend|Not significant|Insufficient data)", ptxt["scientist"])
        want = "Significant trend" if exp["significant"] else "Not significant"
        check("scientist PDF table row: n months and verdict", bool(row) and row.group(1) == str(exp["n_months"]) and row.group(2) == want,
              [exp["n_months"], want], row.groups() if row else None)
        place = (sc.get("first_hit") or "").split("\n")[0].strip()
        rec["pdf_place_label"] = place
        results.append(rec)
    # report-level checks
    rep = {"id": "PDF", "checks": []}
    for ed in ("explorer", "scientist"):
        p = pdf[ed]
        rep["checks"].append({"check": f"{ed}: every page has selectable text", "pass": all(pg["chars"] > 50 for pg in p["pages"]), "actual": [pg["chars"] for pg in p["pages"]]})
        rep["checks"].append({"check": f"{ed}: no word outside the page", "pass": all(not pg["words_outside_page"] for pg in p["pages"])})
        rep["checks"].append({"check": f"{ed}: no long dash", "pass": "—" not in p["text"]})
        rep["checks"].append({"check": f"{ed}: NASA products named", "pass": all(k in p["text"] for k in ("GPM_3IMERGM", "M2IMNXASM", "GLDAS_NOAH025_M"))})
    rep["checks"].append({"check": "scientist: OLS interval attributed correctly", "pass": "not the Sen slope" in ptxt["scientist"] and "not a Sen-slope confidence interval" in ptxt["scientist"]})
    rep["checks"].append({"check": "scientist: clickable reference links", "pass": sum(len(pg["links"]) for pg in pdf["scientist"]["pages"]) > 0,
                          "actual": sorted({l for pg in pdf["scientist"]["pages"] for l in pg["links"]})[:12]})
    rep["checks"].append({"check": "explorer: no p-value misreading", "pass": not re.search(r"probability that (the )?(null|hypothesis)[^.]* is true|proves? (there is )?no (trend|change)|proves? (a )?caus", ptxt["explorer"], re.I)})
    rep["pages"] = {ed: pdf[ed]["n_pages"] for ed in pdf}
    rep["page_pngs"] = {ed: [pg["png"] for pg in pdf[ed]["pages"]] for ed in pdf}
    for r in results + [rep]:
        r["status"] = "PASS" if all(c["pass"] for c in r["checks"]) else "FAIL"
        print(r["id"], r["status"], [c["check"] for c in r["checks"] if not c["pass"]])
    (OUT / "ui_pdf_cases.json").write_text(json.dumps({"scenarios": results, "report": rep}, indent=1, ensure_ascii=False, default=str), encoding="utf-8")


if __name__ == "__main__":
    main()
