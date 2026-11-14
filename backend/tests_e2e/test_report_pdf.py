"""PDF export checks on REAL PDFs (both editions, several fixtures) produced by headless Chrome through the same print
path a user takes ("Save as PDF"). Needs both servers running and Node; otherwise skipped.

What is checked: a real text layer on every page (selectable, searchable), custom title / author / note kept verbatim,
Vietnamese and scientific symbols extracted correctly, numbers equal to the backend, links to NASA and DOIs, PDF title
metadata, no interactive controls or localhost URLs printed, no text outside the page, no near-empty page except the
last, and every page rendered to PNG in web/e2e/out/pdf for visual inspection.
"""
import os
import shutil
import subprocess
from pathlib import Path

import pytest
import requests

pymupdf = pytest.importorskip("pymupdf")

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
OUT = WEB / "e2e" / "out" / "pdf"
API = os.getenv("TERRA_E2E_BASE", "http://127.0.0.1:8000").rstrip("/") + "/api/v1"
APP = os.getenv("TERRA_E2E_APP", "http://localhost:5173")
TITLE_VI = "Nhiệt độ Đồng bằng sông Cửu Long: xu hướng 2001 to 2025 (α = 0.05, ±, ≤, ≥, °C)"


def _up(url):
    try:
        return requests.get(url, timeout=5).ok
    except requests.RequestException:
        return False


pytestmark = pytest.mark.skipif(not (_up(API + "/health") and _up(APP) and shutil.which("node")), reason="servers or node not available")


@pytest.fixture(scope="module")
def pdfs():
    r = subprocess.run(["node", "e2e/report-pdf.mjs"], cwd=WEB, capture_output=True, text=True, timeout=900, encoding="utf-8")
    assert r.returncode == 0, r.stderr[-2000:]
    docs = {}
    for f in sorted(OUT.glob("*.pdf")):
        d = pymupdf.open(f)
        for i, page in enumerate(d):
            page.get_pixmap(dpi=70).save(OUT / f"{f.stem}-p{i + 1}.png")
        docs[f.stem] = d
    assert {"single-simple", "single-scientist", "nonsig-simple", "nonsig-scientist", "multi-simple", "multi-scientist",
            "sigdown-simple", "nonsigneg-simple", "insufficient-simple", "large-simple", "small-simple"} <= set(docs)
    return docs


def text(d):
    return "\n".join(p.get_text() for p in d)


def flat(d):
    return " ".join(text(d).split())


def signed(x):
    """Same formatting as the report (model.ts signedNum)."""
    a = abs(x)
    body = f"{a:.1f}" if a >= 100 else f"{a:.2f}" if a >= 1 else f"{a:.3g}"
    return ("+" if x > 0 else "−" if x < 0 else "") + body


def trend(variable_id, start, end):
    return requests.post(API + "/trends", json={"variable_id": variable_id, "region": {"type": "preset", "id": "mekong_delta"},
                                                "start": start, "end": end}, timeout=120).json()


def test_every_page_has_a_real_text_layer(pdfs):
    for name, d in pdfs.items():
        for i, page in enumerate(d):
            n = len(page.get_text().strip())
            assert n > 300 or (i == d.page_count - 1 and n > 50), f"{name} page {i + 1} has only {n} characters of text"
            assert not page.get_images() or n > 300, f"{name} page {i + 1} looks like an image-only page"


def test_custom_title_author_and_note_are_kept_verbatim(pdfs):
    for ed in ("simple", "scientist"):
        t = flat(pdfs[f"single-{ed}"])
        assert " ".join(TITLE_VI.split()) in t, ed
        assert "Lê Gia Hưng" in t
        raw = text(pdfs[f"single-{ed}"])
        assert "hello world\nSecond line of the author note." in raw, "line break of the note must be kept"
        assert "written by the report author, not part of the evidence" in t
        m = flat(pdfs[f"multi-{ed}"])
        assert "Title Le gia Hung Title Le gia Hung" in m and "Team Terra-scope" in m
        assert pdfs[f"single-{ed}"].metadata["title"].startswith("Nhiệt độ Đồng bằng sông Cửu Long")


def test_unicode_symbols_extract_correctly(pdfs):
    t = flat(pdfs["single-scientist"]) + flat(pdfs["single-simple"])
    for s in ["α", "±", "≤", "≥", "°C", "Đồng bằng", "Cửu Long", "Hưng"]:
        assert s in t, s
    assert "�" not in t


def test_numbers_equal_the_backend(pdfs):
    t25, t24 = trend("merra2_air_temperature_2m", "2001-01", "2025-12"), trend("imerg_precip", "2001-01", "2024-12")
    for ed in ("simple", "scientist"):
        assert f"{signed(t25['slope_per_decade'])} °C" in flat(pdfs[f"single-{ed}"])
        assert f"{signed(t24['slope_per_decade'])} mm/month" in flat(pdfs[f"nonsig-{ed}"])
    s = flat(pdfs["nonsig-scientist"])
    assert f"p {t24['p_value']:.3f}" in s and t24["significant"] is False
    assert "M2IMNXASM v5.12.4" in flat(pdfs["single-scientist"]) and "GPM_3IMERGM v07" in s
    assert "2001-01 to 2025-12" in flat(pdfs["single-scientist"]) and "Mekong Delta" in s


def test_explorer_is_plain_language_and_has_no_evidence_meter(pdfs):
    for name in ("single-simple", "nonsig-simple", "multi-simple"):
        t = flat(pdfs[name])
        assert "The discovery" in t and "Statistical test outcome" in t and "Behind the discovery" in t
        assert "Strength of evidence" not in t and "Rejection region" not in t and "null hypothesis" not in t
    assert "Meets the selected significance threshold" in flat(pdfs["single-simple"])
    nonsig = flat(pdfs["nonsig-simple"])
    assert "Does not meet the selected significance threshold" in nonsig
    assert "did not find enough evidence to confirm a clear increase" in nonsig and "not proof that nothing changed" in nonsig


def test_scientist_has_depth_and_honest_labels(pdfs):
    t = flat(pdfs["multi-scientist"])
    for s in ["Research question", "Table 1. Summary of findings", "Used for the verdict", "Diagnostic or context only",
              "95% CI for the OLS anomaly slope", "targets the OLS slope, not the Sen slope", "Hamed-Rao", "Benjamini-Hochberg",
              "Reproducibility", "code revision", "Criteria for a significant difference", "Monthly anomaly ("]:
        assert s in t, s
    assert "Sen confidence interval" not in t.replace("not a Sen confidence interval", "")


def test_links_and_references(pdfs):
    for name, d in pdfs.items():
        uris = [l.get("uri", "") for p in d for l in p.get_links()]
        assert any("disc.gsfc.nasa.gov" in u for u in uris), name
        assert sum("doi.org/" in u for u in uris) >= 5, name
        assert not any("localhost" in u or "127.0.0.1" in u for u in uris), name
        assert "localhost" not in text(d), name


def test_no_controls_printed_and_nothing_outside_the_page(pdfs):
    for name, d in pdfs.items():
        t = flat(d)
        for ui in ["EXPERIENCE", "Plain-language explanations", "Download PDF", "Pick findings", "Saved cases", "Replay Tutorial"]:
            assert ui not in t, f"{name}: interactive text '{ui}' was printed"
        for i, page in enumerate(d):
            w, h = page.rect.width, page.rect.height
            for b in page.get_text("dict")["blocks"]:
                x0, y0, x1, y1 = b["bbox"]
                assert x0 >= -1 and y0 >= -1 and x1 <= w + 1 and y1 <= h + 1, f"{name} page {i + 1}: text outside the page {b['bbox']}"


def test_no_near_empty_pages(pdfs):
    for name, d in pdfs.items():
        for i, page in enumerate(d[:-1]):
            assert len(page.get_text().strip()) > 400, f"{name} page {i + 1} is nearly empty (bad page break)"


EXPLORER = ["single-simple", "nonsig-simple", "sigdown-simple", "nonsigneg-simple", "insufficient-simple", "large-simple", "small-simple", "multi-simple"]


def bbox_trend(variable_id, bbox, start, end):
    return requests.post(API + "/trends", json={"variable_id": variable_id, "region": {"type": "bbox", "bbox": bbox}, "start": start, "end": end}, timeout=300).json()


def test_explorer_structure_and_no_references_only_page(pdfs):
    for name in EXPLORER:
        d, t = pdfs[name], flat(pdfs[name])
        for s in ["What changed in this part of Earth?", "How did NASA Earth data become this finding?", "Start with NASA Earth data", "Focus on your region",
                  "Look beyond the seasons", "Check whether the pattern is convincing", "Science made simple", "What this finding cannot tell us",
                  "Past, not future.", "What, not why.", "Sources", "Takeaway", "Figure 1."]:
            assert s in t, f"{name}: {s}"
        assert "Glossary" not in t and "adds up to roughly" not in t, name
        assert "seasons are removed" not in t and "removing the regular seasons" not in t, name
        # The sources sit on the same page as the explainer: no page that holds only a bibliography.
        last = d[-1].get_text()
        assert "Behind the discovery" in last or "Sources" in last, name
        assert len(" ".join(last.split())) > 1500 or name == "multi-simple", f"{name}: last page has only {len(last)} characters"
    for name in ["single-simple", "nonsig-simple", "sigdown-simple", "nonsigneg-simple", "insufficient-simple", "large-simple", "small-simple"]:
        assert pdfs[name].page_count == 3, f"{name}: {pdfs[name].page_count} pages (one finding should give 3)"


def test_explorer_scenarios_match_the_backend(pdfs):
    cases = {"sigdown-simple": ("imerg_precip", [-75, -15, -50, 5], "2001-01", "2024-12", "mm/month", True, "Falling"),
             "nonsigneg-simple": ("imerg_precip", [-10, 18, 30, 30], "2001-01", "2024-12", "mm/month", False, "Falling"),
             "large-simple": ("merra2_air_temperature_2m", [-180, -90, 180, 90], "2001-01", "2025-12", "°C", True, "Rising"),
             "small-simple": ("merra2_air_temperature_2m", [10, 23, 10.5, 23.5], "2001-01", "2025-12", "°C", True, "Rising")}
    for name, (v, b, s0, s1, u, sig, word) in cases.items():
        tr = bbox_trend(v, b, s0, s1)
        assert tr["significant"] is sig, name
        t = flat(pdfs[name])
        assert f"{signed(tr['slope_per_decade'])} {u} every 10 years" in t, name
        assert f"{word} · estimated rate" in t, name
        assert ("Meets the selected significance threshold" in t) is sig and ("Does not meet the selected significance threshold" in t) is (not sig), name
        # A total over the period is printed only for significant trends, and only as a labelled projection.
        assert ("straight-line projection of the rate, not a measured difference" in t) is sig, name
    ins = flat(pdfs["insufficient-simple"])
    assert "Insufficient data" in ins and "No rate estimated" in ins and "Not tested" in ins and "estimated rate" not in ins.replace("No rate estimated", "")
    assert "Nguyễn Thị Ánh" in ins and "Seven years of rain in the Mekong Delta" in ins


def test_explorer_data_kinds_are_described_honestly(pdfs):
    merra = flat(pdfs["single-simple"])
    assert "M2IMNXASM is a reanalysis" in merra and "not a direct satellite measurement" in merra
    multi = flat(pdfs["multi-simple"])
    for s in ["GPM_3IMERGM is rainfall estimated from a constellation of satellites", "GLDAS_NOAH025_M is a computer model of the land surface", "3 NASA products"]:
        assert s in multi, s
    # Grid size: north-south fixed; east-west given as a range for a tall area (never a flat "55 km" everywhere).
    assert "east-west from about 56 km down to 0 km" in flat(pdfs["large-simple"])
    assert "about 55 km)" not in multi


def test_explorer_text_is_readable_size(pdfs):
    for name in EXPLORER:
        sizes = [sp["size"] for p in pdfs[name] for b in p.get_text("dict")["blocks"] for l in b.get("lines", []) for sp in l["spans"] if sp["text"].strip()]
        small = [x for x in sizes if x < 7.5]
        assert len(small) <= 0.02 * len(sizes), f"{name}: {len(small)} of {len(sizes)} text spans under 7.5 pt"
        assert min(sizes) >= 6.5, f"{name}: smallest text {min(sizes):.1f} pt"
