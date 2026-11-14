// Contradiction Hunter 3.0 in a real browser (Chrome headless): landing, Hunt tutorial (first visit, keyboard, skip,
// return visit, replay), the three comparison modes with numbers checked against the backend, discovery, stale-request
// protection, Explorer/Scientist switching, Save Investigation, Add to Report, Detective handoff and mobile layout.
// Servers must be running. Run: node --test e2e/hunt.e2e.mjs   Screenshots: web/e2e/out/hunt/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { launch } from "./cdp.mjs";

const APP = (process.env.TERRA_E2E_APP ?? "http://localhost:5173").replace(/\/$/, "");
const API = (process.env.TERRA_E2E_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "") + "/api/v1";
const OUT = new URL("./out/hunt/", import.meta.url);
const SAHEL = [-17, 10, 30, 18], WISC = [-92.9, 42.5, -86.8, 47.1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Same formatting as the app panels (ui.tsx signed).
const signed = (x) => { const a = Math.abs(x); const d = a >= 10 ? 1 : a >= 0.1 ? 2 : a >= 0.001 ? 4 : 5; return (x > 0 ? "+" : x < 0 ? "−" : "") + a.toFixed(d); };
const post = async (path, body) => (await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
const btn = (label, scope = "") => `[...document.querySelectorAll('${scope} button')].find((b) => b.innerText.trim() === ${JSON.stringify(label)})`;
const card = (title) => `[...document.querySelectorAll('.hunt-card')].find((b) => b.querySelector('.hunt-card-t').innerText.trim() === ${JSON.stringify(title)})`;
const setSelect = (sel, value) => `const el = ${sel}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event("change", { bubbles: true })); return true;`;
// Free place choice: type into the A/B (or single) place field and press Enter, like a user.
const pickPlace = (tag, value) => `const el = ${tag ? `document.querySelector('input[data-place="${tag}"]')` : `document.querySelector('[data-tour="hunt-config"] .place-field input')`};
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true;`;
const text = (sel) => `return document.querySelector(${JSON.stringify(sel)})?.innerText ?? ""`;
const CAPTURE = `window.__req = []; const f = window.fetch.bind(window); window.fetch = (input, init) => { const u = typeof input === "string" ? input : input.url;
  if (/\\/api\\/v1\\/(compare|trends|series|chat|hunt)/.test(u)) window.__req.push(u.split("/api/v1/")[1].split("?")[0]); return f(input, init); }; return true;`;

test("Contradiction Hunter 3.0: tutorial, three modes, discovery, investigations, report, Detective, modes, mobile", async () => {
  await mkdir(OUT, { recursive: true });
  const page = await launch();
  const shot = async (name) => writeFile(new URL(`${name}.png`, OUT), await page.screenshot());
  try {
    await page.viewport(1366, 900);
    await page.goto(`${APP}/`);
    await page.evaluate(`localStorage.clear(); localStorage.setItem("terra-scope:audience-mode:v1","explorer"); localStorage.setItem("terra-scope:onboarding:v1","done"); return true`);
    await page.goto("about:blank");
    await page.goto(`${APP}/#hunt`);

    // 1. First visit: the Hunt tutorial starts by itself (main tour is done), with its own wording.
    await page.waitFor(`document.querySelector(".tour-card") && /Contradiction Hunter/.test(document.querySelector(".tour-card").innerText)`, { label: "hunt tour", timeout: 30000 });
    await shot("01-tour-welcome");
    assert.match(await page.evaluate(text(".tour-card")), /Step 1 of 9/);
    await page.key("ArrowRight", "ArrowRight", 39);
    await page.waitFor(`/Step 2 of 9/.test(document.querySelector(".tour-card").innerText)`);
    await page.click(btn("Back", ".tour-card"));
    await page.waitFor(`/Step 1 of 9/.test(document.querySelector(".tour-card").innerText)`);
    for (let i = 0; i < 2; i++) { await page.click(btn("Next", ".tour-card")); await sleep(300); }
    // Step 3 asks the page for Compare Regions (a view switch only) and highlights the real A/B selectors.
    await page.waitFor(`/Step 3 of 9/.test(document.querySelector(".tour-card").innerText) && document.querySelector('[data-tour="hunt-config"]') && document.querySelector(".tour-spot")`, { label: "config step" });
    await shot("02-tour-config");
    for (let i = 0; i < 2; i++) { await page.click(btn("Next", ".tour-card")); await sleep(300); }
    // Result steps before a run: a clear fallback, not an invisible highlight.
    await page.waitFor(`/Step 5 of 9/.test(document.querySelector(".tour-card").innerText) && /appears after you run a comparison/.test(document.querySelector(".tour-card").innerText)`, { label: "fallback step" });
    await page.key("Escape", "Escape", 27);
    await page.waitFor(`!document.querySelector(".tour")`, { label: "tour closed" });
    assert.equal(await page.evaluate(`return localStorage.getItem("terra-scope:hunt-tour:explorer:v1")`), "done");
    assert.equal(await page.evaluate(`return document.querySelectorAll(".tour-shield").length`), 0, "no overlay left behind");

    // 2. Region vs region: Sahel vs Wisconsin; numbers equal the backend /compare.
    const cmp = await post("/compare", { variable_id: "merra2_air_temperature_2m", region_a: { type: "bbox", bbox: SAHEL }, region_b: { type: "bbox", bbox: WISC }, start: "2001-01", end: "2025-12" });
    await page.evaluate(CAPTURE);
    await page.click(btn("Run the comparison"));
    await page.waitFor(`document.querySelector('[data-tour="hunt-evidence"]')`, { label: "region result", timeout: 180000 });
    const ev = await page.evaluate(text('[data-tour="hunt-evidence"]'));
    assert.match(ev, cmp.difference.significant ? /Difference confirmed by a test/ : /Not settled yet|does not support/);
    assert.match(ev, /Going opposite ways/);
    assert.match(ev, /does not show that the two are really different/);
    const vis = await page.evaluate(text('[data-tour="hunt-visual"]'));
    assert.ok(vis.includes(`${signed(cmp.a.slope_per_decade)} °C per decade`) && vis.includes(`${signed(cmp.b.slope_per_decade)} °C per decade`), vis);
    await page.evaluate(`document.querySelector('[data-tour="hunt-evidence"]').scrollIntoView(); return true`); await sleep(300); await shot("03-regions-evidence");
    await page.evaluate(`document.querySelector('[data-tour="hunt-visual"]').scrollIntoView(); return true`); await sleep(300); await shot("04-regions-panels");

    // 3. Explorer -> Scientist keeps the same result without any new request; Scientist shows the method table.
    await page.evaluate(`window.__req = []; return true`);
    await page.click(btn("Scientist", ".modebar"));
    await page.waitFor(`/Inconclusive|Statistically tested difference|Difference not statistically supported/.test(document.querySelector('[data-tour="hunt-evidence"]')?.innerText ?? "")`, { label: "scientist wording" });
    const sciText = await page.evaluate(text('[data-tour="hunt-evidence"]'));
    assert.match(sciText, /Comparability checks/);
    assert.ok(sciText.includes(cmp.difference.p_value < 0.001 ? "< 0.001" : cmp.difference.p_value.toFixed(3)), "difference p shown");
    assert.deepEqual(await page.evaluate(`return window.__req`), [], "mode switch made no request");
    assert.equal(await page.evaluate(`return !!document.querySelector(".tour")`), false, "switching mode on Hunt does not start a tutorial over the work");
    await page.evaluate(`document.querySelector('[data-tour="hunt-evidence"] details:last-of-type').open = true; document.querySelector('[data-tour="hunt-evidence"]').scrollIntoView(); return true`);
    await sleep(300); await shot("05-scientist-method");
    await page.click(btn("Explorer", ".modebar"));

    // 4. Save Investigation (local only) and Add to Report.
    await page.evaluate(`const t = document.querySelector('[data-tour="hunt-save"] textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, "My note <b>not evidence</b>"); t.dispatchEvent(new Event("input", { bubbles: true })); return true`);
    await page.click(btn("Save Investigation"));
    await page.waitFor(`/Saved ".*" in this browser/.test(document.querySelector('[data-tour="hunt-save"]').innerText)`, { label: "saved" });
    const stored = JSON.parse(await page.evaluate(`return localStorage.getItem("terra-scope:investigations:v1")`));
    assert.equal(stored.length, 1); assert.equal(stored[0].mode, "regions"); assert.equal(stored[0].notes, "My note <b>not evidence</b>");
    assert.equal(stored[0].evidence.compare.p_value, cmp.difference.p_value);
    await page.click(btn("Add to Report"));
    await page.waitFor(`${btn("Added to report")}`, { label: "added" });

    // 5. The same area typed as a box for B (a different way of choosing it) is still refused before any request.
    await page.evaluate(pickPlace("B", "-17, 10, 30, 18"));
    await page.waitFor(`/Choose two different places/.test(document.querySelector('[data-tour="hunt-run"]').innerText)`, { label: "same area refused" });

    // 5b. Both places chosen freely: a country for A and a point (one grid cell) for B, then compared for real.
    await page.evaluate(pickPlace("A", "Vietnam"));
    await page.evaluate(pickPlace("B", "48.85, 2.35"));
    await page.waitFor(`/Vietnam/.test(document.querySelector('input[data-place="A"]').closest('.place-field').innerText) && /Point/.test(document.querySelector('input[data-place="B"]').closest('.place-field').innerText)`, { label: "free places chosen" });
    await page.click(btn("Run the comparison"));
    await page.waitFor(`/Vietnam/.test(document.querySelector('[data-tour="hunt-visual"]')?.innerText ?? "") && /Point/.test(document.querySelector('[data-tour="hunt-visual"]')?.innerText ?? "")`, { label: "free comparison result", timeout: 180000 });
    await page.evaluate(`document.querySelector('[data-tour="hunt-config"]').scrollIntoView(); return true`); await sleep(300); await shot("05b-free-places");

    // 5c. "Choose your own coordinates": a large map dialog; drag a box with the real mouse for B, confirm.
    await page.click(`document.querySelector('[data-map-pick="B"]')`);
    await page.waitFor(`document.querySelector('.mappick canvas')`, { label: "map dialog" });
    await sleep(500);
    const r = await page.evaluate(`const b = document.querySelector('.mappick canvas').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }`);
    const at = (fx, fy) => ({ x: Math.round(r.x + r.w * fx), y: Math.round(r.y + r.h * fy) });
    const p0 = at(0.55, 0.30), p1 = at(0.62, 0.40);   // a box near Egypt and the Red Sea on the zoomed-out world
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p0.x, y: p0.y });
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p0.x, y: p0.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 5; i++) await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p0.x + ((p1.x - p0.x) * i) / 5, y: p0.y + ((p1.y - p0.y) * i) / 5, button: "left", buttons: 1 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p1.x, y: p1.y, button: "left", buttons: 0, clickCount: 1 });
    await page.waitFor(`/Selected box:/.test(document.querySelector('.mappick [role="status"]').innerText)`, { label: "box drawn" });
    const drawn = await page.evaluate(`return document.querySelector('.mappick [role="status"]').innerText`);
    assert.match(drawn, /west -?\d+, south -?\d+, east -?\d+, north -?\d+/);
    await shot("05c-map-pick");
    await page.click(btn("Use this box for B", ".mappick"));
    await page.waitFor(`!document.querySelector('.mappick') && /B: Box/.test(document.querySelector('input[data-place="B"]').closest('.place-field').innerText)`, { label: "box used for B" });
    assert.match(await page.evaluate(text('[data-tour="hunt-run"]')), /Run the comparison/);

    // 5d. Keyboard path in the same dialog for A: typed edges, the 180° rule, and Escape cancels without changing A.
    const aBefore = await page.evaluate(`return document.querySelector('input[data-place="A"]').closest('.place-field').innerText`);
    await page.click(`document.querySelector('[data-map-pick="A"]')`);
    await page.waitFor(`document.querySelector('.mappick input')`);
    const typeEdges = (vals) => page.evaluate(`const ins = document.querySelectorAll('.mappick input'); ${JSON.stringify(vals)}.forEach((v, i) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(ins[i], v); ins[i].dispatchEvent(new Event("input", { bubbles: true })); }); return true`);
    await typeEdges(["170", "-20", "-170", "-10"]);
    await page.waitFor(`/cannot cross the 180° line/.test(document.querySelector('.mappick [role="alert"]')?.innerText ?? "")`, { label: "antimeridian refused" });
    await typeEdges(["100", "10", "100.2", "11"]);
    await page.waitFor(`/at least one grid cell/.test(document.querySelector('.mappick [role="alert"]')?.innerText ?? "")`, { label: "too small refused" });
    await page.key("Escape", "Escape", 27);
    await page.waitFor(`!document.querySelector('.mappick')`, { label: "escape closes" });
    assert.equal(await page.evaluate(`return document.querySelector('input[data-place="A"]').closest('.place-field').innerText`), aBefore, "cancel keeps A");

    // 6. Dataset vs dataset: MERRA-2 and GLDAS over the Sahel (descriptive only; coverage limitation shown).
    const [tm, tg] = await Promise.all([post("/trends", { variable_id: "merra2_air_temperature_2m", region: { type: "bbox", bbox: SAHEL }, start: "2001-01", end: "2025-12" }),
      post("/trends", { variable_id: "gldas_air_temperature", region: { type: "bbox", bbox: SAHEL }, start: "2001-01", end: "2025-12" })]);
    await page.click(card("Compare NASA Datasets"));
    await page.waitFor(`/Compare NASA Datasets/.test(document.querySelector('[data-tour="hunt-config"] h2')?.innerText ?? "")`);
    await page.evaluate(setSelect(`document.querySelectorAll('[data-tour="hunt-config"] select')[0]`, "merra2_air_temperature_2m"));
    await page.evaluate(pickPlace(null, "-17, 10, 30, 18"));
    await page.click(btn("Run the comparison"));
    await page.waitFor(`document.querySelector('[data-tour="hunt-evidence"]') && /Described, not tested/.test(document.querySelector('[data-tour="hunt-evidence"]').innerText)`, { label: "datasets result", timeout: 180000 });
    const ds = await page.evaluate(text('[data-tour="hunt-evidence"]')) + await page.evaluate(text('[data-tour="hunt-visual"]'));
    assert.ok(ds.includes(`${signed(tm.slope_per_decade)} °C per decade`) && ds.includes(`${signed(tg.slope_per_decade)} °C per decade`));
    assert.match(ds, /Datasets tell different stories/);
    assert.match(ds, /no statistical test for comparing two datasets|can't tell which dataset is right/);
    await page.evaluate(`document.querySelector('[data-tour="hunt-evidence"]').scrollIntoView(); return true`); await sleep(300); await shot("06-datasets");

    // 7. Time vs time: Mekong Delta, 2001 to 2012 versus 2013 to 2025 (non-overlapping, short-window limitation).
    const pa = await post("/trends", { variable_id: "merra2_air_temperature_2m", region: { type: "preset", id: "mekong_delta" }, start: "2001-01", end: "2012-12" });
    await page.click(card("Compare Time Periods"));
    await page.waitFor(`/Compare Time Periods/.test(document.querySelector('[data-tour="hunt-config"] h2')?.innerText ?? "")`);
    const sels = `document.querySelectorAll('[data-tour="hunt-config"] select')`;
    await page.evaluate(setSelect(`${sels}[0]`, "merra2_air_temperature_2m"));
    await page.evaluate(pickPlace(null, "Mekong Delta"));
    await page.evaluate(setSelect(`${sels}[1]`, 2001)); await page.evaluate(setSelect(`${sels}[2]`, 2012));
    await page.evaluate(setSelect(`${sels}[3]`, 2013)); await page.evaluate(setSelect(`${sels}[4]`, 2025));
    await page.click(btn("Run the comparison"));
    await page.waitFor(`document.querySelector('[data-tour="hunt-evidence"]') && /Described, not tested/.test(document.querySelector('[data-tour="hunt-evidence"]').innerText)`, { label: "periods result", timeout: 180000 });
    const pt = await page.evaluate(text('[data-tour="hunt-evidence"]')) + await page.evaluate(text('[data-tour="hunt-visual"]'));
    assert.ok(pt.includes(`${signed(pa.slope_per_decade)} °C per decade`), "period A slope equals /trends");
    assert.match(pt, /not proof that the trend changed|years you pick/);
    assert.ok(await page.evaluate(`return !!document.querySelector('svg[aria-label*="window A 2001-01 to 2012-12"]')`), "period chart drawn");
    await page.evaluate(`document.querySelector('[data-tour="hunt-visual"]').scrollIntoView(); return true`); await sleep(300); await shot("07-periods");

    // 8. Discovery: bounded scan of the Sahel and Sahara extent with 10° tiles (real backend results only).
    await page.click(btn("Discover Interesting Differences"));
    await page.waitFor(`/Discover Interesting Differences/.test(document.querySelector('#disc-h')?.innerText ?? "")`);
    await page.evaluate(setSelect(`document.querySelectorAll('section select')[0]`, "merra2_air_temperature_2m"));
    await page.evaluate(setSelect(`document.querySelectorAll('section select')[2]`, 10));
    await page.click(btn("Scan"));
    await page.waitFor(`/candidate|No interesting differences found/.test([...document.querySelectorAll('section h2')].map((h) => h.innerText).join(" "))`, { label: "scan result", timeout: 300000 });
    const cands = await page.evaluate(`return document.querySelectorAll(".cand").length`);
    if (cands) {
      assert.match(await page.evaluate(text(".cand")), /Going opposite ways/);
      await shot("08-discover");
      await page.click(btn("Investigate this pair", ".cand"));
      await page.waitFor(`/Compare Regions/.test(document.querySelector('[data-tour="hunt-config"] h2')?.innerText ?? "")`, { label: "inspect opens regions" });
    }

    // 9. Report: the region comparison added above is listed.
    await page.click(`[...document.querySelectorAll("button.nav")].find((e) => e.innerText.trim() === "Report")`);
    await page.waitFor(`document.querySelector(".report-page")`);
    await page.click(`[...document.querySelectorAll('.rstep')][1]`);
    assert.match(await page.evaluate(`return document.querySelector(".rpick")?.innerText ?? ""`), /Two regions · from Hunt/);
    await page.click(`[...document.querySelectorAll("button.nav")].find((e) => e.innerText.trim() === "Hunt")`);

    // 10. Saved investigation reopens (recomputed) and the Hunt tutorial does not start again; Replay works.
    await page.waitFor(`document.querySelector("#inv-h")`, { label: "saved list" });
    assert.ok(!(await page.evaluate(`return !!document.querySelector(".tour")`)), "tutorial not restarted on return visit");
    await page.click(btn("Replay Hunt Tutorial"));
    await page.waitFor(`document.querySelector(".tour-card") && /Step 1 of 9/.test(document.querySelector(".tour-card").innerText)`, { label: "replay" });
    await page.click(btn("Skip", ".tour-card"));
    await page.waitFor(`!document.querySelector(".tour")`);
    await page.click(`[...document.querySelectorAll('#inv-h ~ ul button')].find((b) => b.innerText === "Reopen")`);
    await page.waitFor(`document.querySelector('[data-tour="hunt-evidence"]') && /Compare Regions/.test(document.querySelector('[data-tour="hunt-config"] h2').innerText)`, { label: "reopened", timeout: 180000 });

    // 11. Mobile: A/B stack, no horizontal scroll.
    await page.viewport(390, 844, true); await sleep(500);
    assert.ok(await page.evaluate(`return document.documentElement.scrollWidth - window.innerWidth`) <= 1, "no horizontal overflow");
    await page.evaluate(`document.querySelector('[data-tour="hunt-visual"]').scrollIntoView(); return true`); await sleep(300); await shot("09-mobile");
    await page.viewport(1366, 900);

    // 12. Detective handoff: the context carries identifiers; the Detective page opens with the question.
    await page.evaluate(CAPTURE);
    await page.click(btn("Investigate with Detective"));
    await page.waitFor(`document.querySelector('[data-tour="detective-input"]')`, { label: "detective page" });
    await page.waitFor(`window.__req.includes("chat")`, { label: "chat request sent", timeout: 20000 });
    await sleep(300); await shot("10-detective");
    const errs = page.errors.filter((e) => !/favicon\.ico/.test(e));   // a missing favicon is not an app error
    if (errs.length) assert.fail(`page errors: ${errs.join(" | ")}`);
  } finally { await page.close(); }
});
