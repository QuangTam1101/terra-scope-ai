// Full-feature browser tests: drive the real app (http://localhost:5173) in headless Chrome against the running
// backend and real NASA data. Start both servers first (scripts/start-local.ps1). Run: npm run e2e
// TERRA_E2E_GEMINI=1 also checks that the Detective answers in Gemini mode (one billable model request).
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { launch, byText, byTextStart } from "./cdp.mjs";

const APP = (process.env.TERRA_E2E_APP ?? "http://localhost:5173").replace(/\/$/, "");
const API = (process.env.TERRA_E2E_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";
const GEMINI = process.env.TERRA_E2E_GEMINI === "1";
const OUT = new URL("./out/", import.meta.url);
const up = await fetch(API + "/health").then((r) => r.ok).catch(() => false) && await fetch(APP).then((r) => r.ok).catch(() => false);

const api = (path, body) => fetch(API + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined).then((r) => r.json());
const text = (sel = ".main") => `document.querySelector(${JSON.stringify(sel)})?.innerText ?? ""`;

describe("Terra-scope full feature E2E", { skip: !up && "servers not running", concurrency: false }, () => {
  let page;
  before(async () => { page = await launch(); await mkdir(OUT, { recursive: true }); });
  after(async () => { await page?.close(); });

  it("landing page, experience choice and guided tutorial", async () => {
    await page.goto(APP + "/");
    await page.waitFor(`document.querySelector("h1")?.innerText.includes("Discover Earth")`);
    assert.equal(await page.evaluate(`return document.querySelectorAll("h1").length`), 1);
    await page.click(byText("button", "Get Started"));
    // Get Started opens the experience choice: two balanced cards, no default selection.
    await page.waitFor(`location.hash === "#start" && document.querySelectorAll(".ms-card").length === 2`, { label: "experience choice" });
    const choice = await page.evaluate(`return document.querySelector(".modeselect").innerText`);
    assert.match(choice, /How would you like to explore Earth\?/);
    assert.match(choice, /Continue as Explorer/); assert.match(choice, /Continue as Scientist/);
    await page.click(byText("button", "Continue as Explorer"));
    await page.waitFor(`location.hash === "#explore"`);
    assert.equal(await page.evaluate(`return localStorage.getItem("terra-scope:audience-mode:v1")`), "explorer");
    await page.waitFor(`document.querySelector('[role="dialog"]')`, { label: "tour dialog" });
    const tourText = await page.evaluate(`return document.querySelector('[role="dialog"]').innerText`);
    assert.match(tourText, /1\s*(of|\/)\s*12|Welcome/i);
    await page.click(`[...document.querySelectorAll('[role="dialog"] button')].find(b => /skip|close/i.test(b.innerText + b.getAttribute("aria-label")))`);
    await page.waitFor(`!document.querySelector('[role="dialog"]')`);
    assert.equal(await page.evaluate(`return localStorage.getItem("terra-scope:onboarding:v1")`), "done");
  });

  it("explore: regional analysis shows real progress, matches the backend and offers Giovanni", async () => {
    await page.waitFor(`document.querySelector("#place-q")`);
    await page.evaluate(`const b = document.querySelector('[data-tour="variable"] .dd-btn'); b.click(); await new Promise((r) => setTimeout(r, 50));
      [...document.querySelectorAll('.dd-list [role="option"]')].find((o) => o.innerText.trim().endsWith("Precipitation")).click(); return true;`);
    await page.click(`document.querySelector("#place-q")`);
    await page.type("Mekong Delta");
    await page.waitFor(`document.querySelector("#place-list")`);
    await page.key("Enter");
    await page.waitFor(`document.querySelector(".progress-box")`, { timeout: 10000, label: "regional progress steps" });
    const progress = await page.evaluate(`return document.querySelector(".progress-box").innerText`);
    assert.match(progress, /Analyzing precipitation in Mekong Delta/);
    assert.match(progress, /Building the monthly time series/);
    assert.match(progress, /Testing the trend for statistical significance/);
    assert.ok(!/%/.test(progress), "no invented percentages");
    await page.waitFor(`document.querySelector(".result") && !document.querySelector(".progress-box") && /per decade/.test(document.querySelector(".result").innerText)`, { timeout: 60000 });
    const result = await page.evaluate(`return document.querySelector(".result").innerText`);
    const years = await page.evaluate(`return [...document.querySelectorAll('[data-tour="years"] select')].map(s => s.value)`);
    const direct = await api("/trends", { variable_id: "imerg_precip", region: { type: "preset", id: "mekong_delta" }, start: `${years[0]}-01`, end: `${years[1]}-12` });
    const shown = Number(result.match(/([+−-]\d+\.\d+)\s*mm\/month/)[1].replace("−", "-"));
    assert.ok(Math.abs(shown - direct.slope_per_decade) < 0.01, `UI ${shown} vs API ${direct.slope_per_decade}`);
    assert.match(result, direct.significant ? /significant/i : /not|proven|significant/i);
    const href = await page.evaluate(`return document.querySelector(".nasacheck a")?.href ?? ""`);
    assert.match(href, /giovanni\.gsfc\.nasa\.gov\/giovanni\/#service=ArAvTs/);
    assert.match(href, /data=GPM_3IMERGM_07_precipitation/);
    assert.match(href, /endtime=2025-09-30/, "IMERG link is capped at Giovanni's last month");
  });

  it("experience switch keeps the analysis and makes no new request", async () => {
    const before = await page.evaluate(`return document.querySelector(".result").innerText`);
    const n0 = await page.evaluate(`return performance.getEntriesByType("resource").filter(e => e.name.includes("/api/v1/trends") || e.name.includes("/api/v1/series")).length`);
    await page.click(byText(".modebar button", "Scientist"));
    await page.waitFor(`document.querySelector(".shell").dataset.audience === "scientist" && /Analysis metadata/.test(document.querySelector(".result").innerText)`, { label: "scientist view" });
    const sci = await page.evaluate(`return document.querySelector(".result").innerText`);
    const num = (s) => s.match(/([+−-]\d+\.\d+)\s*mm\/month/)[1];
    assert.equal(num(sci), num(before), "same slope in both modes");
    assert.match(sci, /Raw Seasonal MK p/);
    assert.match(await page.evaluate(`return document.querySelector(".tour-offer")?.innerText ?? ""`), /Take a quick tour of Scientist Mode/);
    const n1 = await page.evaluate(`return performance.getEntriesByType("resource").filter(e => e.name.includes("/api/v1/trends") || e.name.includes("/api/v1/series")).length`);
    assert.equal(n1, n0, "switching mode must not recompute");
    await page.click(byText(".tour-offer button", "Skip"));
    await page.click(byText(".modebar button", "Explorer"));
    await page.waitFor(`document.querySelector(".shell").dataset.audience === "explorer" && /What did we find/.test(document.querySelector(".result").innerText)`, { label: "explorer view" });
  });

  it("explore: map overlay names the real grid operation", async () => {
    const from = `[...document.querySelectorAll('[data-tour="years"] select')][0]`;
    await page.evaluate(`const s = ${from}; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "2003"); s.dispatchEvent(new Event("change", {bubbles: true})); return true;`);
    await page.waitFor(`/Computing trend statistics across the global grid|Loading previously computed analysis|Loading the map/.test(document.querySelector(".mapcard").innerText)`, { timeout: 8000, label: "map loading message" });
    const msg = await page.evaluate(`return document.querySelector(".mapcard [role=status]")?.innerText ?? ""`);
    assert.ok(!/every place on Earth|ready instantly/.test(msg), msg);
    if (/Computing/.test(msg)) assert.match(msg, /259,200 grid cells/);
    await page.evaluate(`const s = ${from}; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set; set.call(s, "2001"); s.dispatchEvent(new Event("change", {bubbles: true})); return true;`);
  });

  it("explore further: seasons are descriptive and time windows reuse the production test", async () => {
    await page.waitFor(`document.getElementById("further")`, { timeout: 20000 });
    const seasons = await page.evaluate(`return document.querySelector('[aria-labelledby="further"]').innerText`);
    assert.match(seasons, /descriptive, not tested/);
    await page.click(byText('[aria-labelledby="further"] [role="tab"]', "Time window"));
    await page.waitFor(`document.querySelector('[aria-labelledby="further"] table tbody tr')`, { timeout: 30000, label: "first window row" });
    const row = await page.evaluate(`return document.querySelector('[aria-labelledby="further"] table tbody tr').innerText`);
    assert.match(row, /\d{4} to \d{4}/);
  });

  it("hunt: discover contradictions, inspect, add to report", async () => {
    // The Hunt tutorial is covered by e2e/hunt.e2e.mjs; here it is marked as seen so it does not cover the page.
    await page.evaluate(`localStorage.setItem("terra-scope:hunt-tour:explorer:v1", "done"); localStorage.setItem("terra-scope:hunt-tour:scientist:v1", "done"); return true`);
    await page.click(byText("button.nav", "Hunt"));
    await page.click(byText("button", "Discover Interesting Differences"));
    await page.click(byText("button", "Scan"));
    await page.waitFor(`document.querySelector(".cand") || /No interesting differences found/.test(${text()})`, { timeout: 180000, label: "discovery result" });
    const cands = await page.evaluate(`return document.querySelectorAll(".cand").length`);
    assert.ok(cands >= 1, "at least one candidate in the Sahel default area");
    const first = await page.evaluate(`return document.querySelector(".cand").innerText`);
    assert.match(first, /Difference confirmed by a test|Not settled yet|Described, not tested|The test does not support a difference|Can't be compared|Statistically tested difference|Inconclusive|Descriptive difference|Difference not statistically supported|Not comparable/);
    await page.click(`[...document.querySelectorAll(".cand button")].find(b => b.innerText === "Investigate this pair")`);
    await page.click(byText("button", "Run the comparison"));
    await page.waitFor(`document.querySelector('[data-tour="hunt-evidence"]')`, { timeout: 120000, label: "region comparison" });
    assert.match(await page.evaluate(`return document.querySelector('[data-tour="hunt-evidence"]').innerText`), /What cannot be concluded\?/);
    await page.click(byText("button", "Add to Report"));
    await page.waitFor(`${byText("button", "Added to report")}`);
  });

  it("hunt: dataset comparison is descriptive and warns about coverage", async () => {
    await page.click(`[...document.querySelectorAll(".hunt-card")].find((b) => b.querySelector(".hunt-card-t").innerText.trim() === "Compare NASA Datasets")`);
    await page.waitFor(`/Compare NASA Datasets/.test(document.querySelector('[data-tour="hunt-config"] h2')?.innerText ?? "")`);
    await page.click(byText("button", "Run the comparison"));
    await page.waitFor(`/Described, not tested|Descriptive difference/.test(document.querySelector('[data-tour="hunt-evidence"]')?.innerText ?? "")`, { timeout: 120000, label: "dataset comparison" });
  });

  it("detective answers with backend evidence" + (GEMINI ? " in Gemini mode" : ""), async () => {
    await page.click(byText("button.nav", "Detective"));
    await page.waitFor(`document.querySelector('textarea, input[placeholder^="Ask"]')`);
    await page.click(`document.querySelector('textarea, input[placeholder^="Ask"]')`);
    await page.type("Is rainfall in the Mekong Delta increasing? Explain simply.");
    await page.key("Enter");
    await page.waitFor(`/Gemini AI Mode|Template Mode|Could not answer/.test(${text("[role=log]")}) && !/Selecting safe tools/.test(${text("[role=log]")})`, { timeout: 180000, label: "detective answer" });
    let t = await page.evaluate(`return ${text("[role=log]")}`);
    if (GEMINI && !/Gemini AI Mode/.test(t) && /temporarily unavailable|pauses AI answers|could not connect|exceeded the response deadline/.test(t)) {
      // Transient Gemini outage: wait out the app's 60 s pause and ask once more, like a user would.
      await new Promise((r) => setTimeout(r, 65000));
      const before = (t.match(/Gemini AI Mode|Template Mode/g) ?? []).length;
      await page.click(`document.querySelector('input#q')`);
      await page.type("Is rainfall in the Mekong Delta increasing? Explain simply.");
      await page.key("Enter");
      await page.waitFor(`(${text("[role=log]")}.match(/Gemini AI Mode|Template Mode/g) ?? []).length > ${before} && !/Selecting safe tools/.test(${text("[role=log]")})`, { timeout: 180000, label: "second detective answer" });
      t = await page.evaluate(`return ${text("[role=log]")}`);
      t = t.slice(t.lastIndexOf("Is rainfall in the Mekong Delta"));
    }
    assert.ok(!/Could not answer/.test(t), "detective error");
    if (GEMINI) assert.match(t, /Gemini AI Mode/);
    assert.match(t, /Details and method/);
  });

  it("report (Form D): reader, findings, preview; both editions, exports, save and reopen a case, PDF", async () => {
    await page.click(byText("button.nav", "Report"));
    // Step 1: who will read it (defaults to the current Experience: Explorer).
    await page.waitFor(`document.querySelectorAll(".redcard").length === 2`, { label: "edition cards" });
    assert.equal(await page.evaluate(`return document.querySelector('.redcard[aria-checked="true"] .redname').innerText`), "Explorer");
    await page.click(byText("button", "Next: pick findings"));
    // Step 2: findings in print order, with stamps.
    await page.waitFor(`document.querySelectorAll(".rpick li").length >= 2`, { label: "finding list" });
    await page.click(byText("button", "Next: preview"));
    // Step 3: Explorer edition, plain language, test outcome in words, no evidence meter.
    await page.waitFor(`document.querySelector(".report-doc")?.getAttribute("aria-label") === "Explorer edition report"`, { label: "explorer edition" });
    const plain = await page.evaluate(`return document.querySelector(".report-doc").innerText`);
    for (const s of ["The discovery", "Statistical test outcome", "Behind the discovery", "Sources"]) assert.ok(plain.includes(s), `explorer: ${s}`);
    for (const s of ["Strength of evidence", "null hypothesis"]) assert.ok(!plain.includes(s), `explorer must not say: ${s}`);
    await page.evaluate(`const i = document.querySelector('input[aria-label="Report title"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "E2E case"); i.dispatchEvent(new Event("input", {bubbles: true})); return true;`);
    await page.waitFor(`/E2E case/.test(document.querySelector(".report-doc h1").innerText)`, { label: "title on the cover" });
    await page.click(`[...document.querySelectorAll('[aria-labelledby="redlabel"] button')].find((b) => b.innerText.trim() === "Scientist")`);
    await page.waitFor(`document.querySelector(".report-doc")?.getAttribute("aria-label") === "Scientist edition report"`, { label: "scientist edition" });
    const pages = await page.evaluate(`return document.querySelectorAll(".rpage").length`);
    const overflow = await page.evaluate(`return [...document.querySelectorAll(".rpage")].some(p => p.scrollWidth > p.clientWidth + 1)`);
    assert.ok(pages >= 4 && !overflow, `${pages} pages, overflow ${overflow}`);
    const doc = await page.evaluate(`return document.querySelector(".report-doc").innerText`);
    for (const s of ["Research question", "Abstract", "Table 1. Summary of findings", "Raw Seasonal MK p", "95% CI for the OLS anomaly slope", "Used for the verdict", "Diagnostic or context only", "Reproducibility", "References"])
      assert.ok(doc.includes(s) || new RegExp(s, "i").test(doc), s);
    assert.ok(!doc.includes("—"), "no long dash in the report");
    const pdf = await page.pdf();
    await writeFile(new URL("report.pdf", OUT), pdf);
    const pdfPages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    assert.ok(pdfPages >= pages, `PDF has ${pdfPages} pages for ${pages} report pages`);
    await page.click(byText("button", "Save case"));
    await page.waitFor(`/Saved "E2E case"/.test(document.querySelector(".casebox").innerText)`);
    await page.reload();   // real reload: in-memory results are gone, the saved case is in storage
    await page.waitFor(`${byText(".casebox button", "Reopen")}`, { timeout: 20000 });
    await page.click(byText(".casebox button", "Reopen"));
    await page.waitFor(`/Reopened "E2E case"/.test(document.querySelector(".casebox").innerText)`, { timeout: 120000 });
    const msg = await page.evaluate(`return document.querySelector(".casebox [role=status]").innerText`);
    assert.match(msg, /recomputed from the backend/);
    assert.ok(!/could not be recomputed/.test(msg), msg);
  });

  it("phone width: no page scrolls sideways", async () => {
    await page.viewport(375, 812, true);
    for (const p of ["home", "explore", "hunt", "detective", "report"]) {
      await page.evaluate(`location.hash = "${p}"; return true;`);
      await new Promise((r) => setTimeout(r, 900));
      const over = await page.evaluate(`return document.documentElement.scrollWidth - innerWidth`);
      assert.ok(over <= 0, `${p} overflows by ${over}px`);
    }
    await writeFile(new URL("mobile-report.png", OUT), await page.screenshot());
    await page.viewport(1440, 900);
  });

  it("no JavaScript errors during the whole run", () => {
    const real = page.errors.filter((e) => !/favicon|ERR_ABORTED|net::ERR_FAILED.*grid|Failed to load resource.*(cancel|abort)/i.test(e));
    assert.deepEqual(real, []);
  });
});
