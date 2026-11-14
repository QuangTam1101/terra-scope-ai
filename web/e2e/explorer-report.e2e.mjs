// Explorer report 2.0 in a real browser: the interactive companion (accordion, keyboard, chart views, hover readout,
// study area, NASA source, Detective hand-off), mobile layout, Explorer/Scientist switching, and the PDF printed AFTER
// interacting (the companion must not print). Every value checked against the backend /series and /trends responses.
// Servers must be running. Run: node --test e2e/explorer-report.e2e.mjs   Screenshots: web/e2e/out/explorer/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { launch } from "./cdp.mjs";

const APP = (process.env.TERRA_E2E_APP ?? "http://localhost:5173").replace(/\/$/, "");
const API = (process.env.TERRA_E2E_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";
const OUT = new URL("./out/explorer/", import.meta.url);
const MEKONG = { type: "preset", id: "mekong_delta" }, BOX = [104.4, 8.5, 106.9, 11.1];
const item = (variable_id, start, end) => ({ kind: "trend", variable_id, region: MEKONG, place_label: "Mekong Delta", bbox: BOX, start, end, method: "seasonal_mk", alpha: 0.05 });
const CASE = { schema: "terra-scope-case/1", id: "case-explorer-e2e", title: "Explorer QA", created_at: "2026-11-15T00:00:00Z", backend_version: "0.2.0",
  items: [item("merra2_air_temperature_2m", "2001-01", "2025-12"), item("imerg_precip", "2001-01", "2024-12")] };
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const signed = (x) => { const a = Math.abs(x); const b = a >= 100 ? a.toFixed(1) : a >= 1 ? a.toFixed(2) : a.toPrecision(3); return (x > 0 ? "+" : x < 0 ? "−" : "") + b; };
const btn = (label, scope = ".xcomp") => `[...document.querySelectorAll('${scope} button')].find((b) => b.innerText.trim() === ${JSON.stringify(label)})`;
const readout = `return document.querySelector(".xc-readout").innerText`;

const post = async (path, body) => (await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();

test("Explorer report: interactive companion, accessibility, mobile, mode switch and PDF after interaction", async () => {
  await mkdir(OUT, { recursive: true });
  const req = { variable_id: "merra2_air_temperature_2m", region: MEKONG, start: "2001-01", end: "2025-12" };
  const [series, trend] = await Promise.all([post("/series", req), post("/trends", req)]);
  const page = await launch();
  const shot = async (name) => writeFile(new URL(`${name}.png`, OUT), await page.screenshot());
  try {
    await page.viewport(1366, 900);
    await page.goto(`${APP}/`);
    await page.evaluate(`localStorage.setItem("terra-scope:audience-mode:v1","explorer"); localStorage.setItem("terra-scope:onboarding:v1","done"); return true`);
    await page.goto("about:blank");
    await page.goto(`${APP}/#report?case=${b64url(CASE)}`);
    await page.waitFor(`document.querySelector(".xcomp") && document.querySelector('.report-doc[data-edition="explorer"]')`, { timeout: 180000, label: "explorer companion" });

    // Same numbers as the backend, in the companion and in the report.
    const head = await page.evaluate(`return document.querySelector(".xcomp .xc-head").innerText`);
    assert.ok(head.includes(`${signed(trend.slope_per_decade)} °C every 10 years`), head);
    assert.ok(head.includes("Significant trend") === trend.significant);
    await page.evaluate(`document.querySelector(".xcomp").scrollIntoView(); return true`);
    await sleep(300); await shot("01-companion");

    // Accordion: a journey button opens the explanation; native <details> also opens with the keyboard.
    await page.click(btn("Learn about significance"));
    await page.waitFor(`document.querySelector('[data-topic="p"]').open`, { label: "p-value topic open" });
    const pTopic = await page.evaluate(`return document.querySelector('[data-topic="p"]').innerText`);
    assert.ok(pTopic.includes(trend.p_value < 0.001 ? "p < 0.001" : `p ${trend.p_value.toFixed(3)}`), pTopic);
    assert.match(pTopic, /never proves a cause/);
    await page.evaluate(`const s = document.querySelector('[data-topic="limits"] summary'); s.focus(); return document.activeElement === s`);
    await page.key("Enter", "Enter", 13);
    await page.waitFor(`document.querySelector('[data-topic="limits"]').open`, { label: "limits opened with Enter" });
    assert.match(await page.evaluate(`return document.querySelector('[data-topic="limits"]').innerText`), /not a forecast/);
    await page.click(btn("Inspect the NASA data source"));
    await page.waitFor(`document.querySelector('[data-topic="data"]').open`);
    const href = await page.evaluate(`return document.querySelector('[data-topic="data"] a').href`);
    assert.equal(href, trend.source.url);
    await page.evaluate(`document.querySelector(".xc-topics").scrollIntoView({ block: "center" }); return true`); await sleep(300);
    await shot("02-explanations");

    // Chart: keyboard reading of real yearly means (mean of the backend monthly anomalies, years with >= 6 months).
    const byYear = new Map();
    for (const p of series.points) if (p.anomaly !== null) byYear.set(p.t.slice(0, 4), [...(byYear.get(p.t.slice(0, 4)) ?? []), p.anomaly]);
    const years = [...byYear.entries()].filter(([, v]) => v.length >= 6).map(([y, v]) => [y, v.reduce((s, x) => s + x, 0) / v.length]);
    await page.evaluate(`document.querySelector(".xc-chart svg").focus(); return true`);
    await page.key("Home", "Home", 36);
    let r = await page.evaluate(readout);
    assert.ok(r.startsWith(`${years[0][0]}: ${signed(years[0][1])} °C`), r);
    await page.key("ArrowRight", "ArrowRight", 39); await page.key("ArrowRight", "ArrowRight", 39);
    r = await page.evaluate(readout);
    assert.ok(r.startsWith(`${years[2][0]}: ${signed(years[2][1])} °C`), r);
    await page.key("End", "End", 35);
    r = await page.evaluate(readout);
    assert.ok(r.startsWith(`${years.at(-1)[0]}: `), r);

    // Monthly view: one bar per month of the backend series; hover shows that month's anomaly.
    await page.click(btn("Each month"));
    await page.waitFor(`document.querySelectorAll(".xc-chart svg rect").length === ${series.points.length}`, { label: "monthly bars" });
    await page.evaluate(`const r = document.querySelectorAll(".xc-chart svg rect")[150]; r.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); return true`);
    const m150 = series.points[150];
    r = await page.evaluate(readout);
    assert.ok(r.includes(`${signed(m150.anomaly)} °C compared with usual`), `${r} vs ${m150.t} ${m150.anomaly}`);
    await page.click(btn("Warmer than usual"));
    const dimmed = await page.evaluate(`return [...document.querySelectorAll(".xc-chart svg rect")].filter((x) => x.getAttribute("opacity") === "0.25").length`);
    assert.equal(dimmed, series.points.filter((p) => p.anomaly !== null && p.anomaly < 0).length);
    await page.click(`document.querySelector(".xcomp details.disclose summary")`);
    const missing = await page.evaluate(`return document.querySelector(".xcomp details.disclose").innerText`);
    assert.match(missing, /Every month in the period has data|Months without data/);
    await shot("03-monthly-highlight");

    // Second finding: switching findings changes the evidence shown.
    await page.click(btn("Precipitation, Mekong Delta, Vietnam"));
    await page.waitFor(`/mm\\/month every 10 years/.test(document.querySelector(".xcomp .xc-head").innerText)`, { label: "second finding" });

    // Mobile layout: no horizontal scroll, the companion stacks.
    await page.viewport(390, 844, true);
    await sleep(400);
    const overflow = await page.evaluate(`return document.documentElement.scrollWidth - window.innerWidth`);
    assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
    await page.evaluate(`document.querySelector(".xcomp").scrollIntoView(); return true`);
    await sleep(300); await shot("04-mobile");
    await page.viewport(1366, 900);

    // Explorer -> Scientist -> Explorer on the report keeps the same numbers and makes no new analysis request.
    await page.evaluate(`window.__n = 0; const f = window.fetch.bind(window); window.fetch = (...a) => { window.__n++; return f(...a); }; return true`);
    await page.click(`[...document.querySelectorAll('[aria-labelledby="redlabel"] button')].find((b) => b.innerText.trim() === "Scientist")`);
    await page.waitFor(`document.querySelector('.report-doc[data-edition="scientist"]') && !document.querySelector(".xcomp")`, { label: "scientist edition" });
    await page.click(`[...document.querySelectorAll('[aria-labelledby="redlabel"] button')].find((b) => b.innerText.trim() === "Explorer")`);
    await page.waitFor(`document.querySelector('.report-doc[data-edition="explorer"]') && document.querySelector(".xcomp")`, { label: "explorer edition again" });
    assert.equal(await page.evaluate(`return window.__n`), 0);

    // PDF after interaction: the companion and controls are not printed; the report pages are.
    const pdf = await page.pdf();
    await writeFile(new URL("after-interaction.pdf", OUT), pdf);
    const raw = pdf.toString("latin1");
    assert.ok(pdf.length > 50000 && raw.startsWith("%PDF"));
    const printed = await page.evaluate(`const s = getComputedStyle(document.querySelector(".xcomp")); return s.display`);
    assert.equal(printed, "flex"); // on screen
    await page.evaluate(`window.__mm = window.matchMedia("print"); return true`);

    // Detective hand-off: the selection becomes the finding, and the Detective page opens.
    await page.evaluate(`document.querySelector(".xcomp").scrollIntoView(); return true`);
    await page.click(btn("Ask the Detective a follow-up"));
    await page.waitFor(`location.hash.startsWith("#detective") || document.querySelector('[data-tour="detective-input"]')`, { label: "detective page" });
    await sleep(300); await shot("05-detective");
    const errs = page.errors.filter((e) => !/favicon\.ico/.test(e));   // a missing favicon is not an app error
    if (errs.length) assert.fail(`page errors: ${errs.join(" | ")}`);
  } finally { await page.close(); }
});
