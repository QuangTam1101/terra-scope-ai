// Generates real report PDFs with headless Chrome (the same print path a user takes with "Save as PDF"), for every
// fixture and both editions, into web/e2e/out/pdf/. backend/tests_e2e/test_report_pdf.py then extracts and checks
// the text layer and renders every page. Servers must be running. Run: node e2e/report-pdf.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { launch } from "./cdp.mjs";

const APP = (process.env.TERRA_E2E_APP ?? "http://localhost:5173").replace(/\/$/, "");
const OUT = new URL("./out/pdf/", import.meta.url);

const trend = (variable_id, region, place_label, bbox, start = "2001-01", end = "2025-12") =>
  ({ kind: "trend", variable_id, region, place_label, bbox, start, end, method: "seasonal_mk", alpha: 0.05 });
const MEKONG = { type: "preset", id: "mekong_delta" }, MEKONG_BOX = [104.4, 8.5, 106.9, 11.1];
const SAHEL = { type: "bbox", bbox: [-17, 10, 30, 18] }, WISC = { type: "bbox", bbox: [-92.9, 42.5, -86.8, 47.1] };

export const FIXTURES = [
  { id: "single", title: "Nhiệt độ Đồng bằng sông Cửu Long: xu hướng 2001 to 2025 (α = 0.05, ±, ≤, ≥, °C)", author: "Lê Gia Hưng",
    note: "hello world\nSecond line of the author note.", items: [trend("merra2_air_temperature_2m", MEKONG, "Mekong Delta", MEKONG_BOX)] },
  { id: "nonsig", title: "", author: "", note: "",
    items: [trend("imerg_precip", MEKONG, "Mekong Delta", MEKONG_BOX, "2001-01", "2024-12")] },
  { id: "multi", title: "Title Le gia Hung ".repeat(6).trim(), author: "Team Terra-scope", note: "Long note. ".repeat(40).trim(),
    items: [trend("merra2_air_temperature_2m", MEKONG, "Mekong Delta", MEKONG_BOX), trend("imerg_precip", MEKONG, "Mekong Delta", MEKONG_BOX, "2001-01", "2024-12"),
      trend("gldas_evapotranspiration", { type: "bbox", bbox: [107.2, 11.2, 109.0, 15.5] }, "Central Highlands, Vietnam", [107.2, 11.2, 109.0, 15.5]),
      { kind: "compare", variable_id: "merra2_air_temperature_2m", region_a: SAHEL, region_b: WISC, label_a: "Sahel (box)", label_b: "Wisconsin, USA (box)",
        start: "2001-01", end: "2025-12", method: "seasonal_mk", alpha: 0.05 }] },
];

// Explorer redesign scenarios (real analyses; every printed number is a real backend result, nothing synthetic).
const box = (b) => ({ type: "bbox", bbox: b });
export const EXPLORER_FIXTURES = [
  { id: "sigdown", title: "", author: "", note: "", editions: ["simple"],
    items: [trend("imerg_precip", box([-75, -15, -50, 5]), "Amazon Basin", [-75, -15, -50, 5], "2001-01", "2024-12")] },
  { id: "nonsigneg", title: "", author: "", note: "", editions: ["simple"],
    items: [trend("imerg_precip", box([-10, 18, 30, 30]), "Sahara Desert", [-10, 18, 30, 30], "2001-01", "2024-12")] },
  { id: "insufficient", title: "Seven years of rain in the Mekong Delta", author: "Nguyễn Thị Ánh", note: "", editions: ["simple"], tick: true,
    items: [trend("imerg_precip", MEKONG, "Mekong Delta", MEKONG_BOX, "2018-01", "2024-12")] },
  { id: "large", title: "", author: "", note: "", editions: ["simple"],
    items: [trend("merra2_air_temperature_2m", box([-180, -90, 180, 90]), "Whole world", [-180, -90, 180, 90])] },
  { id: "small", title: "", author: "", note: "", editions: ["simple"],
    items: [trend("merra2_air_temperature_2m", box([10, 23, 10.5, 23.5]), "Cell near 23.25 N, 10.25 E", [10, 23, 10.5, 23.5])] },
];

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const setValue = (sel, value) => `const el = ${sel}; const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true;`;

export async function makePdfs() {
  await mkdir(OUT, { recursive: true });
  const page = await launch();
  const made = [];
  try {
    const wanted = (f) => !process.env.TERRA_FIXTURE || process.env.TERRA_FIXTURE.split(",").includes(f.id);
    for (const f of [...FIXTURES, ...EXPLORER_FIXTURES].filter(wanted)) {
      const kase = { schema: "terra-scope-case/1", id: `case-${f.id}`, title: f.title || "Fixture", created_at: "2026-11-14T00:00:00Z", backend_version: "0.2.0", items: f.items };
      await page.goto("about:blank");                  // a fresh document per fixture (hash-only changes do not reload)
      await page.goto(`${APP}/#report?case=${b64url(kase)}`);
      if (f.tick) {
        // Findings without enough data start unticked: tick it on step 2 the way a user would.
        await page.waitFor(`document.querySelectorAll('.rstep').length === 3 && !document.querySelector('.rstep[disabled]')`, { timeout: 180000, label: "wizard" });
        await page.waitFor(`/Reopened/.test(document.body.innerText)`, { timeout: 180000, label: "case reopened" });
        await page.click(`[...document.querySelectorAll('.rstep')][1]`);
        await page.click(`document.querySelector('.rpick input[type="checkbox"]:not(:checked)')`);
        await page.click(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === "Next: preview")`);
      }
      await page.waitFor(`document.querySelector(".report-doc")`, { timeout: 180000, label: `report for ${f.id}` });
      await page.evaluate(setValue(`document.querySelector('input[aria-label="Report title"]')`, f.title));
      await page.evaluate(setValue(`document.querySelector('input[aria-label="Prepared by"]')`, f.author));
      if (f.note) await page.evaluate(setValue(`document.querySelector('textarea[aria-label^="Author note"]')`, f.note));
      for (const edition of f.editions ?? ["simple", "scientist"]) {
        await page.click(`[...document.querySelectorAll('[aria-labelledby="redlabel"] button')].find((b) => b.innerText.trim() === "${edition === "simple" ? "Explorer" : "Scientist"}")`);
        await page.waitFor(`document.querySelector('.report-doc[aria-label^="${edition === "simple" ? "Explorer" : "Scientist"}"]')`, { timeout: 20000 });
        await new Promise((r) => setTimeout(r, 400));
        const file = new URL(`${f.id}-${edition}.pdf`, OUT);
        await writeFile(file, await page.pdf());
        made.push(file.pathname);
      }
    }
    if (page.errors.length) console.warn("page errors:", page.errors);
  } finally { await page.close(); }
  return made;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("e2e/report-pdf.mjs")) {
  const made = await makePdfs();
  console.log(made.map((p) => decodeURIComponent(p)).join("\n"));
}
