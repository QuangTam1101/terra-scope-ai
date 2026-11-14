// Builds the Terra-scope AI pitch deck (7 slides, 16:9) from real app screenshots and verified numbers.
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa6");
const { applyTheme } = require("C:/Users/bim/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/local-agent-mode-sessions/skills-plugin/c6f960b4-d24c-448e-bf36-812013ab8c70/2b56a08d-5863-4015-92e6-bf02b6584969/skills/pptx/scripts/apply_theme.js");

const ROOT = "C:/NUS CS/Y1/Nasa Challenge/terra-scope-ai/presentation";
const IMG = (n) => path.join(ROOT, "screenshots/crops", n + ".png");
const OUT = path.join(ROOT, "Terra-scope-AI_pitch-deck.pptx");

const HEX = { navy: "171B36", ivory: "F8F4EC", lav: "A99BE8", blue: "4B9FD5", orange: "F4A261", white: "FFFFFF", muted: "5B5F7D", lavSoft: "ECE8FA", line: "E4DDCF" };
const THEME = {
  name: "Terra-scope",
  headFontFace: "Arial Rounded MT Bold",
  bodyFontFace: "Calibri",
  colors: {
    dk1: HEX.navy, lt1: HEX.white, dk2: HEX.muted, lt2: HEX.ivory,
    accent1: HEX.lav, accent2: HEX.blue, accent3: HEX.orange, accent4: HEX.lavSoft, accent5: "2B2F55", accent6: HEX.line,
    hlink: "3E7FB3", folHlink: "7A6CC4",
  },
};

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
  pres.title = "Terra-scope AI: Discover Earth's Changing Story";
  pres.author = "Team Terra-scope AI";
  pres.subject = "NASA Space Apps Challenge 2026: Be An Earth System Trend Detective!";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;
  const W = 13.333, M = 0.6;

  const footer = (dark) => ({ text: { text: "Terra-scope AI · NASA Space Apps Challenge 2026", options: { x: M, y: 7.0, w: 7, h: 0.3, fontSize: 10, color: dark ? C.accent1 : C.text2, margin: 0 } } });
  pres.defineSlideMaster({
    title: "DARK", background: { color: HEX.navy },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: M, y: 0.5, w: W - 2 * M, h: 0.9, fontSize: 36, color: C.background2, valign: "top", margin: 0 }, text: "" } },
      footer(true),
    ],
    slideNumber: { x: W - M - 0.6, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: HEX.lav, align: "right" },
  });
  pres.defineSlideMaster({
    title: "LIGHT", background: { color: HEX.ivory },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: M, y: 0.42, w: W - 2 * M, h: 0.75, fontSize: 32, color: C.text1, valign: "top", margin: 0 }, text: "" } },
      footer(false),
    ],
    slideNumber: { x: W - M - 0.6, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: HEX.muted, align: "right" },
  });

  const card = (s, x, y, w, h, fill, name) => s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.18, fill: { color: fill }, line: { color: fill }, objectName: name,
    shadow: { type: "outer", color: "171B36", opacity: 0.12, blur: 8, offset: 2, angle: 90 } });
  const shot = (s, file, x, y, w, h, name, alt) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, rectRadius: 0.12, fill: { color: HEX.white }, line: { color: HEX.line, width: 0.75 }, objectName: name + " frame",
      shadow: { type: "outer", color: "171B36", opacity: 0.14, blur: 10, offset: 3, angle: 90 } });
    s.addImage({ path: IMG(file), x, y, w, h, objectName: name, altText: alt });
  };
  const txt = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, fontFace: undefined, ...o });
  const pill = (s, label, x, y, w, fill, color, name) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.4, rectRadius: 0.2, fill: { color: fill }, line: { color: fill }, objectName: name });
    txt(s, label, { x, y, w, h: 0.4, fontSize: 13, bold: true, color, align: "center", valign: "middle" });
  };
  const iconDot = async (s, Comp, x, y, d, bg, fg, name) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg }, objectName: name });
    s.addImage({ data: await icon(Comp, fg), x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52, objectName: name + " icon" });
  };

  // ---------- 1. Title ----------
  pres.addSection({ title: "Opening" });
  let s = pres.addSlide({ masterName: "DARK", sectionTitle: "Opening" });
  txt(s, "NASA SPACE APPS CHALLENGE 2026  ·  BE AN EARTH SYSTEM TREND DETECTIVE!", { x: M, y: 0.75, w: 7.4, h: 0.35, fontSize: 12, bold: true, color: C.accent1, charSpacing: 1 });
  txt(s, "Discover Earth's Changing Story", { x: M, y: 1.35, w: 7.2, h: 2.0, fontSize: 50, fontFace: THEME.headFontFace, color: C.background2, valign: "top" });
  txt(s, "TERRA-SCOPE AI", { x: M, y: 3.55, w: 7, h: 0.5, fontSize: 24, fontFace: THEME.headFontFace, color: C.accent3, charSpacing: 2 });
  txt(s, "Earth Intelligence: From Observation to Prediction", { x: M, y: 4.08, w: 7.2, h: 0.45, fontSize: 18, italic: true, color: C.background2 });
  txt(s, "Explore NASA Earth data, test whether a change is real, and ask an AI detective that only speaks with verified numbers.",
    { x: M, y: 4.75, w: 6.8, h: 0.8, fontSize: 16, color: "C9C6E0" });
  txt(s, [
    { text: "Team Terra-scope AI   ", options: { bold: true, color: HEX.ivory } },
    { text: "Tâm · Đăng · Long · Phú · Hưng", options: { color: HEX.lav } },
  ], { x: M, y: 5.95, w: 7.2, h: 0.4, fontSize: 15 });
  card(s, 8.2, 1.05, 4.75, 4.45, "F4F1FB", "globe card");
  s.addImage({ path: IMG("hero_globe"), x: 8.45, y: 1.25, w: 4.25, h: 3.96, rounding: false, objectName: "Terra mascot and trend globe", altText: "Terra mascot beside a globe coloured by real MERRA-2 temperature trends, from the app landing page" });
  txt(s, "Real screenshot from the Terra-scope landing page: globe coloured by MERRA-2 temperature trends", { x: 8.2, y: 5.85, w: 4.6, h: 0.5, fontSize: 10, color: "A9A6C8", align: "center" });
  s.addNotes("Hook (25 s). Every month NASA satellites and models add more measurements of our planet. But for most people a simple question is still hard to answer: is this place really changing, or is it just noise? We are Team Terra-scope AI: Tâm, Đăng, Long, Phú and Hưng. Our project helps anyone discover Earth's changing story, from observation to a tested trend and, carefully, to an outlook.");

  // ---------- 2. Problem & mission ----------
  pres.addSection({ title: "Problem" });
  s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Problem" });
  s.addText("Earth's data is open. Its story is hard to read", { placeholder: "title" });
  const probs = [
    [fa.FaLayerGroup, "Too many variables", "Hundreds of NASA products. Choosing the right one is often harder than the analysis."],
    [fa.FaDatabase, "Huge, scattered files", "Gridded archives across data centres, in formats built for experts."],
    [fa.FaCircleQuestion, "Real, or just chance?", "Seasons and noise hide trends. A rising line is not proof."],
  ];
  for (let i = 0; i < 3; i++) {
    const x = M + i * 4.1, y = 1.45, w = 3.83, h = 2.35;
    card(s, x, y, w, h, HEX.white, "problem card " + (i + 1));
    await iconDot(s, probs[i][0], x + 0.3, y + 0.3, 0.75, HEX.lavSoft, "6A5BC7", "problem icon " + (i + 1));
    txt(s, probs[i][1], { x: x + 0.3, y: y + 1.15, w: w - 0.6, h: 0.4, fontSize: 19, fontFace: THEME.headFontFace, color: C.text1 });
    txt(s, probs[i][2], { x: x + 0.3, y: y + 1.55, w: w - 0.6, h: 0.7, fontSize: 14, color: C.text2, valign: "top" });
  }
  card(s, M, 4.15, W - 2 * M, 2.55, HEX.navy, "mission panel");
  txt(s, "OUR MISSION", { x: M + 0.4, y: 4.4, w: 4, h: 0.3, fontSize: 12, bold: true, color: C.accent1, charSpacing: 1 });
  txt(s, "Turn NASA observations into tested, explainable trends anyone can investigate.", { x: M + 0.4, y: 4.72, w: 11.3, h: 0.5, fontSize: 21, fontFace: THEME.headFontFace, color: C.background2 });
  const steps = ["Pick a variable", "Pick a place", "Pick a period", "Time series", "Test the trend"];
  const sw = 2.1, gap = (W - 2 * M - 0.8 - 5 * sw) / 4;
  for (let i = 0; i < 5; i++) {
    const x = M + 0.4 + i * (sw + gap);
    s.addShape(pres.shapes.OVAL, { x, y: 5.6, w: 0.5, h: 0.5, fill: { color: i === 4 ? HEX.orange : HEX.lav }, line: { color: i === 4 ? HEX.orange : HEX.lav }, objectName: "step dot " + (i + 1) });
    txt(s, String(i + 1), { x, y: 5.6, w: 0.5, h: 0.5, fontSize: 15, bold: true, color: C.text1, align: "center", valign: "middle" });
    txt(s, steps[i], { x: x + 0.6, y: 5.6, w: sw - 0.55, h: 0.5, fontSize: 14, color: C.background2, valign: "middle" });
    if (i < 4) s.addShape(pres.shapes.LINE, { x: x + sw + 0.05, y: 5.85, w: gap - 0.1, h: 0, line: { color: "4A4E78", width: 1.5, endArrowType: "triangle" }, objectName: "step arrow " + (i + 1) });
  }
  txt(s, "The five steps the challenge asks for, in one guided app", { x: M + 0.4, y: 6.22, w: 8, h: 0.3, fontSize: 11, italic: true, color: "A9A6C8" });
  s.addNotes("Problem and mission (25 s). The data is open, but three things stop people: too many variables, huge scattered files, and the question of whether a change is real or just chance. The challenge asks for five steps: choose a variable, a place and a period, build a time series, and test its significance. Terra-scope does all five in one guided app.");

  // ---------- 3. Explore ----------
  pres.addSection({ title: "Product" });
  s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Product" });
  s.addText("Explore any place on Earth, then test the trend", { placeholder: "title" });
  shot(s, "trendmap", M + 0.06, 1.45, 7.2, 3.61, "global trend map", "Explore page trend map: MERRA-2 air temperature change per decade on a 0.5 degree grid, 2001 to 2025");
  txt(s, "Air temperature trend per decade, MERRA-2, 2001 to 2025. Orange = rising, blue = falling, striped = could be chance after FDR.",
    { x: M, y: 5.2, w: 7.3, h: 0.5, fontSize: 12, color: C.text2 });
  const chips = ["Values", "Trend", "Time-lapse", "3D globe", "°C / °F"];
  let cx = M;
  for (const c of chips) { const w = 0.32 + c.length * 0.105; pill(s, c, cx, 5.85, w, HEX.lavSoft, "3D3480", "feature chip " + c); cx += w + 0.15; }
  txt(s, "5 NASA variables: GPM IMERG rainfall · GLDAS soil moisture, temperature, evapotranspiration · MERRA-2 air temperature",
    { x: M, y: 6.38, w: 7.4, h: 0.45, fontSize: 11, color: C.text2 });
  // right column
  const rx = 8.35, rw = W - M - rx;
  txt(s, "MEKONG DELTA, VIETNAM · AIR TEMPERATURE", { x: rx, y: 1.4, w: rw, h: 0.3, fontSize: 12, bold: true, color: "6A5BC7", charSpacing: 1 });
  txt(s, [{ text: "+0.19 °C", options: { fontSize: 50, fontFace: THEME.headFontFace, color: "C8661F" } }], { x: rx, y: 1.72, w: rw, h: 0.85 });
  txt(s, "per decade, 2001 to 2025 (MERRA-2)", { x: rx, y: 2.55, w: rw, h: 0.35, fontSize: 15, color: C.text1 });
  pill(s, "✓ Clear trend · p < 0.001", rx, 2.98, 2.75, "DCEBF8", "1E5C8C", "verdict pill");
  shot(s, "chart", rx + 0.06, 3.58, rw - 0.12, (rw - 0.12) / 1.712, "anomaly chart", "Monthly temperature anomalies for the Mekong Delta with a Theil-Sen trend line");
  txt(s, "Seasons removed, Seasonal Mann-Kendall test, Sen slope. Every map cell is tested and corrected for false discoveries (FDR).",
    { x: rx, y: 6.2, w: rw, h: 0.6, fontSize: 12, color: C.text2 });
  s.addNotes("Explore (30 s). Pick a variable and a place, anywhere on Earth. The map shows values, the trend per decade, a month-by-month time-lapse, or a 3D globe. Across 259,200 grid cells, 55 percent of places warmed significantly and 8 percent cooled; striped cells could be chance, because we correct for testing so many places at once. Zoom into the Mekong Delta: plus 0.19 degrees per decade since 2001, a clear trend with p below 0.001, using the Seasonal Mann-Kendall test and Sen slope, the methods the challenge recommends.");

  // ---------- 4. Detective + Hunter ----------
  s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Product" });
  s.addText("Ask questions. Hunt contradictions. Trust the evidence", { placeholder: "title" });
  const colW = 5.85, lx = M, rx2 = W - M - colW;
  await iconDot(s, fa.FaMagnifyingGlass, lx, 1.4, 0.6, HEX.navy, HEX.lav, "detective icon");
  txt(s, "AI Detective (Gemini)", { x: lx + 0.75, y: 1.4, w: colW - 0.8, h: 0.6, fontSize: 20, fontFace: THEME.headFontFace, color: C.text1, valign: "middle" });
  shot(s, "detective", lx + 0.06, 2.2, 4.4, 3.1, "detective answer", "Real Gemini AI Mode answer: Mekong Delta air temperature rose about 0.187 degrees per decade, p below 0.001");
  txt(s, [
    { text: "Plain-language answers", options: { bold: true, color: HEX.navy, breakLine: true } },
    { text: "Every number comes from the statistics engine. The backend checks each cited number, retries once, and falls back to a safe template if it does not match.", options: { color: HEX.muted } },
  ], { x: lx, y: 5.5, w: colW, h: 1.2, fontSize: 13, valign: "top" });
  // hunter
  await iconDot(s, fa.FaArrowsUpDown, rx2, 1.4, 0.6, HEX.navy, HEX.orange, "hunter icon");
  txt(s, "Contradiction Hunter", { x: rx2 + 0.75, y: 1.4, w: colW - 0.8, h: 0.6, fontSize: 20, fontFace: THEME.headFontFace, color: C.text1, valign: "middle" });
  card(s, rx2, 2.15, colW, 1.45, HEX.white, "hunt numbers card");
  txt(s, "SAHEL", { x: rx2 + 0.3, y: 2.3, w: 2.4, h: 0.3, fontSize: 12, bold: true, color: C.text2 });
  txt(s, "−0.21", { x: rx2 + 0.3, y: 2.58, w: 2.4, h: 0.6, fontSize: 34, bold: true, fontFace: "Calibri", color: "2F7FBF" });
  txt(s, "vs", { x: rx2 + 2.55, y: 2.6, w: 0.6, h: 0.6, fontSize: 16, color: C.text2, align: "center", valign: "middle" });
  txt(s, "WISCONSIN", { x: rx2 + 3.3, y: 2.3, w: 2.4, h: 0.3, fontSize: 12, bold: true, color: C.text2 });
  txt(s, "+0.21", { x: rx2 + 3.3, y: 2.58, w: 2.4, h: 0.6, fontSize: 34, bold: true, fontFace: "Calibri", color: "C8661F" });
  txt(s, "°C per decade, MERRA-2, 2001 to 2025: opposite directions", { x: rx2 + 0.3, y: 3.2, w: colW - 0.6, h: 0.3, fontSize: 12, color: C.text2 });
  shot(s, "hunt_top", rx2 + 0.06, 3.85, colW - 0.12, (colW - 0.12) / 5.233, "hunt verdict", "Contradiction Hunter verdict: Not settled yet, comparable, going opposite ways, only one passes the test");
  txt(s, [
    { text: "Honest verdict: not settled yet", options: { bold: true, color: HEX.navy, breakLine: true } },
    { text: "The gap test gives p 0.022, but its bootstrap interval [−0.87, +0.12] includes zero, so no difference is claimed. Also compares NASA datasets and time periods.", options: { color: HEX.muted } },
  ], { x: rx2, y: 5.25, w: colW, h: 1.6, fontSize: 13, valign: "top" });
  s.addNotes("Detective and Hunter (30 s). Ask Terra a question in plain words. Gemini writes the answer, but every number must come from our statistics engine, and the backend checks each one before you see it. The Contradiction Hunter puts two places, two NASA datasets or two periods side by side. The Sahel cooled while Wisconsin warmed, yet the direct test of the gap is not conclusive, so Terra-scope says 'not settled yet' instead of overclaiming.");

  // ---------- 5. Forecast ----------
  s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Product" });
  s.addText("From trends to an experimental outlook", { placeholder: "title" });
  shot(s, "forecast", M + 0.06, 1.45, 7.25, 2.93, "forecast result", "Forecast page: Mekong Delta air temperature outlook with seasonal norm and 80 percent range, confidence low");
  txt(s, "Mekong Delta, MERRA-2 air temperature, Outlook mode: 64% chance of an above-normal December 2026 (33% with no signal). Confidence: low.",
    { x: M, y: 4.55, w: 7.4, h: 0.55, fontSize: 13, color: C.text1 });
  card(s, M, 5.3, 3.55, 1.1, HEX.white, "satellite mode card");
  txt(s, [{ text: "Satellite mode", options: { bold: true, color: HEX.navy, breakLine: true } }, { text: "NASA data to Dec 2024 + 9 NOAA climate indices · up to 12 months", options: { color: HEX.muted } }],
    { x: M + 0.25, y: 5.45, w: 3.1, h: 0.85, fontSize: 13, valign: "top" });
  card(s, M + 3.85, 5.3, 3.55, 1.1, HEX.white, "outlook mode card");
  txt(s, [{ text: "Outlook mode", options: { bold: true, color: HEX.navy, breakLine: true } }, { text: "NOAA indices to Jun 2026 + warming trend · up to 18 months", options: { color: HEX.muted } }],
    { x: M + 4.1, y: 5.45, w: 3.1, h: 1.2, fontSize: 13, valign: "top" });
  // skill chart
  const fx = 8.4, fw = W - M - fx;
  s.addChart(pres.charts.BAR, [
    { name: "Air temperature (MERRA-2)", labels: ["1 mo", "3 mo", "6 mo", "12 mo"], values: [0.37, 0.18, 0.03, -0.02] },
    { name: "Soil moisture (GLDAS)", labels: ["1 mo", "3 mo", "6 mo", "12 mo"], values: [0.38, 0.13, 0.01, -0.01] },
  ], {
    x: fx, y: 1.4, w: fw, h: 3.4, barDir: "col", barGapWidthPct: 60,
    chartColors: [HEX.navy, HEX.lav],
    showTitle: true, title: "Backtest skill, Satellite mode", titleFontSize: 13, titleColor: HEX.navy, titleFontFace: "+mn-lt",
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 10, dataLabelColor: HEX.navy, dataLabelFontFace: "+mn-lt", dataLabelFormatCode: "+0.00;-0.00;0",
    catAxisLabelColor: HEX.muted, valAxisLabelColor: HEX.muted, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
    valAxisMinVal: -0.1, valAxisMaxVal: 0.5, valAxisMajorUnit: 0.1, valAxisLabelFormatCode: "0.0",
    valGridLine: { color: HEX.line, size: 0.75 }, catGridLine: { style: "none" },
    showLegend: true, legendPos: "b", legendFontSize: 11, legendColor: HEX.muted, legendFontFace: "+mn-lt",
    plotArea: { fill: { color: HEX.ivory } },
  });
  txt(s, "Tested 2020 to 2024 on grid cells the model never saw. 0 = no better than the seasonal normal.", { x: fx, y: 4.85, w: fw, h: 0.5, fontSize: 11, color: C.text2 });
  card(s, fx, 5.45, fw, 1.0, "FDEBDC", "honesty card");
  txt(s, [{ text: "Experimental, and labelled that way", options: { bold: true, color: "8A3F0B", breakLine: true } },
    { text: "Useful 1 to 3 months ahead; weak beyond. Seasonal odds, not weather, kept apart from historical trends.", options: { color: "6B3A17" } }],
    { x: fx + 0.25, y: 5.52, w: fw - 0.5, h: 0.9, fontSize: 12, valign: "top" });
  s.addNotes("Forecast (30 s). We also asked: what might come next? Our forecast engine learns from NASA data plus nine NOAA climate indices such as El Niño. It gives odds of an above, near or below normal month, with an 80 percent range and a confidence label. We publish its measured skill: good one to three months ahead, close to zero by six to twelve months, and weak in Outlook mode. So it is clearly marked experimental and kept separate from the historical trends.");

  // ---------- 6. Designed for everyone ----------
  s = pres.addSlide({ masterName: "LIGHT", sectionTitle: "Product" });
  s.addText("Designed for curious minds and scientists", { placeholder: "title" });
  const cols = [
    { x: M, w: 4.35, img: "mode", r: 2.472, head: "Two modes, same verdicts", body: "Explorer speaks plain language; Scientist adds p-values, intervals and provenance. Switching never changes the evidence.", alt: "Mode selection screen: Explore Earth or Scientific Analysis" },
    { x: M + 4.7, w: 4.0, img: "scientist", r: 1.663, head: "Full method on demand", body: "Product version, grid, sample size, adjusted p-value and warnings, shown in Scientist mode.", alt: "Scientist mode result with analysis metadata and statistical estimates" },
    { x: M + 9.05, w: 3.08, img: "report", r: 0.879, head: "Reports you can share", body: "Explorer and Scientist PDF reports, plus saved cases anyone can reopen.", alt: "Explorer report preview for a Mekong Delta finding" },
  ];
  const bandY = 1.45, bandH = 2.95;
  for (const c of cols) {
    let iw2 = c.w - 0.12, ih = iw2 / c.r;
    if (ih > bandH) { ih = bandH; iw2 = ih * c.r; }
    shot(s, c.img, c.x + 0.06 + (c.w - 0.12 - iw2) / 2, bandY + (bandH - ih) / 2, iw2, ih, c.img + " screenshot", c.alt);
    const ty = 4.65;
    txt(s, c.head, { x: c.x, y: ty, w: c.w, h: 0.4, fontSize: 17, fontFace: THEME.headFontFace, color: C.text1 });
    txt(s, c.body, { x: c.x, y: ty + 0.42, w: c.w, h: 0.95, fontSize: 13, color: C.text2, valign: "top" });
  }
  const tags = [[fa.FaRoute, "Guided tutorials"], [fa.FaBook, "Built-in glossary"], [fa.FaFilePdf, "PDF reports"], [fa.FaUpRightFromSquare, "Open in NASA Giovanni"]];
  let tx = M;
  for (const [Ic, label] of tags) {
    const w = 0.75 + label.length * 0.1;
    await iconDot(s, Ic, tx, 6.25, 0.42, HEX.navy, HEX.lav, "tag icon " + label);
    txt(s, label, { x: tx + 0.52, y: 6.25, w: w - 0.5, h: 0.42, fontSize: 13, bold: true, color: C.text1, valign: "middle" });
    tx += w + 0.35;
  }
  s.addNotes("Designed for everyone (25 s). Students and the public choose Explorer: plain words, a glossary and guided tutorials. Researchers choose Scientist: product versions, sample sizes, adjusted p-values and warnings. Both see the same numbers and the same verdicts. Any finding becomes a shareable PDF report, in Explorer or Scientist style, and a saved case anyone can reopen and recompute. One click opens the same series in NASA Giovanni to check it.");

  // ---------- 7. Impact & closing ----------
  pres.addSection({ title: "Closing" });
  s = pres.addSlide({ masterName: "DARK", sectionTitle: "Closing" });
  s.addText("Every claim, checked. Every change, explained", { placeholder: "title" });
  const stats = [
    ["48 PASS · 0 FAIL", "independent re-computation of our statistics (1 inconclusive)"],
    ["0.9996", "correlation with a NASA Giovanni series (Mekong soil moisture, 293 months)"],
    ["259,200", "grid cells tested per global map, with false-discovery control"],
  ];
  for (let i = 0; i < 3; i++) {
    const y = 1.55 + i * 1.5;
    card(s, M, y, 5.7, 1.28, "232850", "stat card " + (i + 1));
    txt(s, stats[i][0], { x: M + 0.3, y: y + 0.14, w: 5.2, h: 0.6, fontSize: 28, fontFace: THEME.headFontFace, color: i === 0 ? HEX.orange : HEX.ivory });
    txt(s, stats[i][1], { x: M + 0.3, y: y + 0.76, w: 5.2, h: 0.4, fontSize: 13, color: "C9C6E0" });
  }
  const ix = 6.95, iw = W - M - ix;
  txt(s, "WHO IT HELPS", { x: ix, y: 1.55, w: iw, h: 0.3, fontSize: 12, bold: true, color: C.accent1, charSpacing: 1 });
  const who = [
    [fa.FaGraduationCap, "Students and teachers", "learn the scientific method on real NASA data"],
    [fa.FaPeopleGroup, "Communities and journalists", "check if a local change is real before sharing it"],
    [fa.FaFlask, "Researchers", "a fast, reproducible first look with full provenance"],
  ];
  for (let i = 0; i < 3; i++) {
    const y = 2.0 + i * 0.95;
    await iconDot(s, who[i][0], ix, y, 0.62, "2B2F55", HEX.lav, "impact icon " + (i + 1));
    txt(s, [{ text: who[i][1], options: { bold: true, color: HEX.ivory, breakLine: true } }, { text: who[i][2], options: { color: "C9C6E0" } }],
      { x: ix + 0.8, y: y - 0.05, w: iw - 0.8, h: 0.75, fontSize: 14, valign: "top" });
  }
  card(s, ix, 5.0, iw, 1.4, "2B2F55", "closing card");
  txt(s, [
    { text: "Terra-scope AI · ", options: { bold: true, color: HEX.orange } },
    { text: "Tâm · Đăng · Long · Phú · Hưng", options: { color: HEX.ivory, breakLine: true } },
    { text: "github.com/QuangTam1101/terra-scope-ai", options: { color: HEX.lav, breakLine: true } },
    { text: "Repository is private now and will be public at submission. Built on NASA open data; not endorsed by NASA. Code written with AI assistance (see README).", options: { color: "A9A6C8", fontSize: 11 } },
  ], { x: ix + 0.25, y: 5.12, w: iw - 0.5, h: 1.2, fontSize: 14, valign: "top" });
  s.addNotes("Impact and close (25 s). Trust is the core of Terra-scope. An independent re-computation of our statistics passed 48 checks with zero failures, and our values match NASA Giovanni with a correlation of 0.9996. We help students learn science on real data, help communities check a local change before sharing it, and give researchers a reproducible first look. Terra-scope AI: discover Earth's changing story, with evidence. Thank you.");

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
