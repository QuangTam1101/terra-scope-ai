// Scientific browser run: drives the real app like a user (Explorer mode first), captures the network request and
// response of every analysis, the visible numbers in Explorer and Scientist mode, screenshots, and finally the
// Explorer and Scientist report PDFs. Output: web/e2e/out/scientific/ (validation/run_ui_pdf.py compares it with
// the independent oracle). Servers must be running. Run: node e2e/scientific.e2e.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { launch, byText } from "./cdp.mjs";

const APP = (process.env.TERRA_E2E_APP ?? "http://localhost:5173").replace(/\/$/, "");
const OUT = new URL("./out/scientific/", import.meta.url);

// place: { search: "text to type, first hit" } or { coords: [lat, lon] } (the cell that contains the point)
const SCENARIOS = [
  { id: "UI-01", tc: "TC-01", parameter: "Precipitation", dataset: "GPM IMERG", years: [2001, 2024], place: { search: "Mekong Delta" } },
  { id: "UI-02", tc: "TC-02", parameter: "Air temperature", dataset: "MERRA-2", years: [2001, 2025], place: { search: "Hanoi, Vietnam" } },
  { id: "UI-03", tc: "TC-06 (country box from the search list)", parameter: "Air temperature", dataset: "MERRA-2", years: [2001, 2025], place: { search: "Australia" } },
  { id: "UI-04", tc: "point cell in the Sahara", parameter: "Air temperature", dataset: "MERRA-2", years: [2001, 2025], place: { coords: [23.3, 10.2] } },
  { id: "UI-05", tc: "TC-17", parameter: "Evapotranspiration", dataset: "GLDAS", years: [2001, 2025], place: { search: "Central Highlands" } },
];

const CAPTURE = `if (!window.__cap) { window.__cap = []; const f = window.fetch.bind(window);
  window.fetch = async (input, init) => { const url = typeof input === "string" ? input : input.url; const r = await f(input, init);
    if (/\\/api\\/v1\\/(trends|series)$/.test(url.split("?")[0])) { const body = init && init.body ? JSON.parse(init.body) : null;
      r.clone().json().then((j) => window.__cap.push({ url, body, status: r.status, json: j })).catch(() => undefined); }
    return r; }; } return true;`;
const setSelect = (sel, value) => `const el = ${sel}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event("change", { bubbles: true })); return true;`;
const setInput = (sel, value) => `const el = ${sel}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event("input", { bubbles: true })); return true;`;
const resultText = `return document.querySelector(".result")?.innerText ?? ""`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const page = await launch({ width: 1440, height: 1000 });
  const out = { app: APP, started: new Date().toISOString(), scenarios: [], pdfs: {} };
  try {
    await page.goto(`${APP}/#start`);
    await page.evaluate(`localStorage.setItem("terra-scope:onboarding:v1", "done"); localStorage.setItem("terra-scope:onboarding:scientist:v1", "done"); return true;`);
    await page.reload();                                   // same-document hash navigation would not fire a load event
    await page.click(byText("button", "Continue as Explorer"));
    await page.waitFor(`location.hash === "#explore" && document.querySelector("#place-q")`, { timeout: 60000, label: "explore ready" });
    await page.evaluate(CAPTURE);
    for (const sc of SCENARIOS) {
      const rec = { ...sc };
      await page.click(`document.querySelector('[data-tour="variable"] button[aria-label=${JSON.stringify(sc.parameter)}]')`);
      await page.click(`[...document.querySelectorAll('[data-tour="dataset"] .chip')].find((b) => b.innerText.trim().startsWith(${JSON.stringify(sc.dataset)}))`);
      const yearSel = (k) => `[...document.querySelectorAll('[data-tour="years"] select')][${k}]`;
      await page.evaluate(setSelect(yearSel(0), sc.years[0]));
      await page.evaluate(setSelect(yearSel(1), sc.years[1]));
      await sleep(300);
      const before = await page.evaluate(`return window.__cap.length`);
      if (sc.place.search) {
        await page.click(`[...document.querySelectorAll('[aria-label="How to choose a place"] button')].find((b) => b.innerText.trim() === "Name")`);
        await page.click(`document.querySelector("#place-q")`);
        await page.type(sc.place.search);
        await page.waitFor(`document.querySelector("#place-list")`, { label: "place list" });
        rec.first_hit = await page.evaluate(`return document.querySelector("#place-list li")?.innerText ?? ""`);
        await page.key("Enter");
      } else {
        await page.click(`[...document.querySelectorAll('[aria-label="How to choose a place"] button')].find((b) => b.innerText.trim() === "Coordinates")`);
        const inputs = `[...document.querySelectorAll('input[inputmode="decimal"]')]`;
        await page.evaluate(setInput(`${inputs}[0]`, sc.place.coords[0]));
        await page.evaluate(setInput(`${inputs}[1]`, sc.place.coords[1]));
        await page.click(byText("button", "Use these coordinates"));
      }
      await page.waitFor(`window.__cap.length >= ${before + 2} && document.querySelector(".result") && !document.querySelector(".progress-box") && /per decade/.test(document.querySelector(".result").innerText)`,
        { timeout: 180000, label: `${sc.id} result` });
      await sleep(500);
      const caps = await page.evaluate(`return window.__cap.slice(${before})`);
      rec.request = caps.find((c) => c.url.includes("/trends"))?.body ?? null;
      rec.trend_response = caps.find((c) => c.url.includes("/trends"))?.json ?? null;
      rec.series_points = (caps.find((c) => c.url.includes("/series"))?.json?.points ?? []).length;
      rec.explorer_text = await page.evaluate(resultText);
      await writeFile(new URL(`${sc.id}-explorer.png`, OUT), await page.screenshot());
      const n0 = await page.evaluate(`return window.__cap.length`);
      await page.click(byText(".modebar button", "Scientist"));
      await page.waitFor(`document.querySelector(".shell").dataset.audience === "scientist" && /Analysis metadata/.test(document.querySelector(".result").innerText)`, { label: `${sc.id} scientist` });
      await sleep(300);
      rec.scientist_text = await page.evaluate(resultText);
      rec.requests_after_mode_switch = (await page.evaluate(`return window.__cap.length`)) - n0;
      await writeFile(new URL(`${sc.id}-scientist.png`, OUT), await page.screenshot());
      const offer = await page.evaluate(`return !!document.querySelector(".tour-offer")`);
      if (offer) await page.click(byText(".tour-offer button", "Skip"));
      await page.click(byText(".modebar button", "Explorer"));
      await page.waitFor(`document.querySelector(".shell").dataset.audience === "explorer"`);
      out.scenarios.push(rec);
      console.log(sc.id, rec.request?.region, rec.trend_response?.slope_per_decade, rec.trend_response?.p_value);
    }
    // Report: all analyses of this session, both editions.
    await page.click(byText("button.nav", "Report"));
    await page.waitFor(`document.querySelectorAll(".redcard").length === 2 || document.querySelector(".report-doc")`, { timeout: 30000, label: "report" });
    if (await page.evaluate(`return !!${byText("button", "Next: pick findings")}`)) await page.click(byText("button", "Next: pick findings"));
    await page.waitFor(`${byText("button", "Next: preview")}`, { label: "step 2" });
    out.report_items = await page.evaluate(`return [...document.querySelectorAll(".rpick li")].map((li) => ({ text: li.innerText, included: li.querySelector("input").checked }))`);
    await page.click(byText("button", "Next: preview"));
    for (const [edition, label] of [["explorer", "Explorer"], ["scientist", "Scientist"]]) {
      await page.click(`[...document.querySelectorAll('[aria-labelledby="redlabel"] button')].find((b) => b.innerText.trim() === "${label}")`);
      await page.waitFor(`document.querySelector('.report-doc[data-edition="${edition}"]')`, { timeout: 30000, label: edition });
      await sleep(600);
      const file = new URL(`report-${edition}.pdf`, OUT);
      await writeFile(file, await page.pdf());
      out.pdfs[edition] = decodeURIComponent(file.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
      out[`report_${edition}_text`] = await page.evaluate(`return document.querySelector(".report-doc").innerText`);
    }
    out.page_errors = page.errors;
  } finally {
    await page.close();
  }
  await writeFile(new URL("ui_run.json", OUT), JSON.stringify(out, null, 1));
  console.log("written", decodeURIComponent(new URL("ui_run.json", OUT).pathname));
}

await main();
