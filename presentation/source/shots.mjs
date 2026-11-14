// Captures authentic screenshots of the running local Terra-scope app for the pitch deck.
import { launch, byText } from "file:///C:/NUS%20CS/Y1/Nasa%20Challenge/terra-scope-ai/web/e2e/cdp.mjs";
import { writeFile } from "node:fs/promises";
const OUT = "C:/NUS CS/Y1/Nasa Challenge/terra-scope-ai/presentation/screenshots/";
const APP = "http://localhost:5173";
const only = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1440, H = 900;
const page = await launch({ width: W, height: H });
await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1.5, mobile: false });
const log = {};
const shot = async (n) => { await sleep(600); await writeFile(OUT + n + ".png", await page.screenshot()); console.log("shot", n); };
const text = (sel) => page.evaluate(`return document.querySelector(${JSON.stringify(sel)})?.innerText ?? ""`);
const top = () => page.evaluate(`window.scrollTo(0,0); return true`);
const into = (js, block = "start") => page.evaluate(`const el = ${js}; el && el.scrollIntoView({block:"${block}"}); return true;`);
const run = (n) => !only || only.split(",").includes(n);
try {
  await page.goto(APP + "/");
  await page.evaluate(`localStorage.clear(); localStorage.setItem("terra-scope:onboarding:v1","done"); localStorage.setItem("terra-scope:audience-mode:v1","explorer");
    for (const m of ["explorer","scientist"]) localStorage.setItem("terra-scope:hunt-tour:" + m + ":v1","done"); return true`);
  await page.goto("about:blank");
  if (run("landing")) {
    await page.goto(APP + "/#landing");
    await page.waitFor(`document.querySelector("h1")?.innerText.includes("Discover Earth")`);
    await sleep(3000); await shot("01_landing");
    await page.goto("about:blank");
    await page.goto(APP + "/#start");
    await page.waitFor(`document.querySelectorAll(".ms-card").length === 2`);
    await sleep(1200); await shot("02_mode");
  }
  await page.goto("about:blank");
  await page.goto(APP + "/#explore");
  await page.waitFor(`/Of [\\d,]+ places with data/.test(document.querySelector(".main")?.innerText ?? "")`, { timeout: 180000, label: "trend map" });
  await sleep(2000);
  if (run("map")) {
    await shot("03_explore_trendmap");
    log.mapCaption = (await text(".main")).match(/Of [\d,]+ places with data[^\n]*/)?.[0];
    await page.click(byText("button", "3D globe")).catch(() => console.log("no 3D button"));
    await sleep(2500); await shot("04_globe");
    await page.click(byText("button", "Flat map")).catch(() => {});
    await sleep(800);
  }
  if (run("explore")) {
    await page.click(byText(".chip", "Air temperature")); await sleep(500); await page.click(byText(".chip", "MERRA-2 (land and sea)")); await sleep(500);
    await sleep(600);
    await page.evaluate(`document.querySelector("#place-q").focus(); return true`);
    await page.type("Mekong Delta");
    await page.waitFor(`document.querySelector("#place-list")`);
    await page.key("Enter");
    await page.waitFor(`document.querySelector(".result") && !document.querySelector(".progress-box") && /per decade/.test(document.querySelector(".result").innerText)`, { timeout: 180000 });
    await sleep(1500);
    log.result = (await text(".result")).slice(0, 900);
    await into(`document.querySelector(".result")`);
    await shot("05_explore_result");
    await page.evaluate(`window.scrollBy(0, 420); return true`);
    await shot("06_explore_chart");
    await top();
    await page.click(byText("button", "Time-lapse"));
    await sleep(9000); await shot("07_timelapse");
  }
  if (run("hunt")) {
    await top();
    await page.click(byText("button.nav", "Hunt"));
    await page.waitFor(`document.querySelector(".hunt-card")`);
    await sleep(800); await shot("08_hunt_cards");
    await page.click(`[...document.querySelectorAll('.hunt-card')].find((b) => b.querySelector('.hunt-card-t').innerText.trim() === "Compare Regions")`);
    await sleep(800);
    await page.click(byText("button", "Run the comparison"));
    await page.waitFor(`document.querySelector('[data-tour="hunt-evidence"]')`, { timeout: 180000 });
    await sleep(1500);
    log.hunt = (await page.evaluate(`return document.querySelector('[data-tour="hunt-evidence"]').innerText`)).slice(0, 1200);
    await into(`document.querySelector('[data-tour="hunt-visual"]') ?? document.querySelector('[data-tour="hunt-evidence"]')`);
    await shot("09_hunt_visual");
    await into(`document.querySelector('[data-tour="hunt-evidence"]')`);
    await shot("10_hunt_evidence");
    await page.click(byText("button", "Add to Report")).catch(() => {});
    await sleep(600);
  }
  if (run("detective")) {
    await top();
    await page.click(byText("button.nav", "Detective"));
    await page.waitFor(`document.querySelector('input#q, textarea')`);
    await page.evaluate(`document.querySelector('input#q, textarea').focus(); return true`);
    await page.type("Is the Mekong Delta getting warmer? Explain simply.");
    await page.key("Enter");
    const L = `(document.querySelector("[role=log]")?.innerText ?? "")`;
    await page.waitFor(`/Gemini AI Mode|Template Mode|Could not answer/.test(${L}) && !/Selecting safe tools/.test(${L})`, { timeout: 180000, label: "answer" });
    await sleep(1500);
    log.detective = (await page.evaluate(`return ${L}`)).slice(0, 1500);
    await shot("11_detective");
    await page.evaluate(`window.scrollBy(0, 380); return true`);
    await shot("12_detective_mid");
  }
  if (run("forecast")) {
    await top();
    await page.click(byText("button.nav", "Forecast"));
    await page.waitFor(`/Climate outlook/.test(document.querySelector(".main")?.innerText ?? "")`);
    await sleep(800);
    await page.click(`[...document.querySelectorAll('.main .chip')].find(c => /MERRA-2/.test(c.innerText) && /temperature/i.test(c.innerText))`).catch(() => console.log("no merra chip"));
    await sleep(600);
    await shot("13_forecast_setup");
    await page.click(`[...document.querySelectorAll('.main button')].find(b => b.innerText.trim() === "Run forecast")`);
    await page.waitFor(`document.querySelector('[aria-label="Forecast summary"]')`, { timeout: 180000 });
    await sleep(2500);
    log.forecast = (await text(".main")).slice(0, 2500);
    await into(`document.querySelector('[aria-label="Forecast summary"]')`);
    await shot("14_forecast_summary");
    await page.evaluate(`window.scrollBy(0, 500); return true`);
    await shot("15_forecast_chart");
  }
  if (run("report")) {
    await top();
    await page.click(byText("button.nav", "Report"));
    await page.waitFor(`document.querySelectorAll(".redcard").length === 2`);
    await sleep(800); await shot("16_report_audience");
    await page.click(byText("button", "Next: pick findings"));
    await page.waitFor(`document.querySelectorAll(".rpick li").length >= 1`);
    await page.click(byText("button", "Next: preview"));
    await page.waitFor(`document.querySelector(".report-doc")`);
    await sleep(1500);
    await into(`document.querySelector(".report-doc")`);
    await shot("17_report_preview");
  }
  if (run("scientist")) {
    await page.goto("about:blank");
    await page.evaluate(`localStorage.setItem("terra-scope:audience-mode:v1","scientist"); return true`).catch(() => {});
    await page.goto(APP + "/#explore");
    await page.evaluate(`localStorage.setItem("terra-scope:audience-mode:v1","scientist"); return true`);
    await page.reload();
    await page.waitFor(`document.querySelector("#place-q")`, { timeout: 60000 });
    await page.click(byText(".chip", "Air temperature")); await sleep(500); await page.click(byText(".chip", "MERRA-2 (land and sea)")); await sleep(500);
    await page.evaluate(`document.querySelector("#place-q").focus(); return true`);
    await page.type("Mekong Delta");
    await page.waitFor(`document.querySelector("#place-list")`);
    await page.key("Enter");
    await page.waitFor(`document.querySelector(".result") && /per decade/.test(document.querySelector(".result").innerText)`, { timeout: 180000 });
    await sleep(1500);
    log.scientist = (await text(".result")).slice(0, 1200);
    await into(`document.querySelector(".result")`);
    await shot("18_scientist_result");
  }
  console.log("JS errors:", page.errors.filter((e) => !/favicon/.test(e)).slice(0, 10));
} catch (e) { console.error("FAILED", e.message); await writeFile(OUT + "zz_error.png", await page.screenshot()); }
finally {
  await writeFile(OUT + "capture_log.json", JSON.stringify(log, null, 1));
  await page.close();
}
