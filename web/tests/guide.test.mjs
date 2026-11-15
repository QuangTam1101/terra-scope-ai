// Detective guide (F3): routing, demo cases and the caption templates, offline (no backend, no browser).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The five variables the backend serves today (catalog.py; the MODIS ones are listed but unavailable).
const AVAILABLE = ['imerg_precip', 'gldas_soil_moisture_0_10cm', 'gldas_air_temperature', 'gldas_evapotranspiration', 'merra2_air_temperature_2m'];
const src = { product: 'P', version: '1', provider: 'NASA', url: 'https://disc.gsfc.nasa.gov' };
const vars = [
  { id: 'merra2_air_temperature_2m', parameter: 'air_temperature', parameter_name: 'Air temperature', dataset_name: 'MERRA-2 (land and sea)', display_units: '°C', description_simple: 'How warm the air is.', description_technical: 'MERRA-2 2 m air temperature.', available: true },
  { id: 'imerg_precip', parameter: 'precipitation', parameter_name: 'Precipitation', dataset_name: 'GPM IMERG (satellite)', display_units: 'mm/month', description_simple: 'How much rain falls each month.', description_technical: 'IMERG V07.', available: true },
];
const noop = () => {};
globalThis.guideStore = { audience: 'explorer', go: noop, variables: vars, regions: [], ready: true, tempUnit: 'C' };

const cache = await mkdtemp(join(tmpdir(), 'terrascope-guide-'));
const server = await createServer({ cacheDir: cache, server: { middlewareMode: true, watch: null }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, plugins: [{
  name: 'guide-offline', enforce: 'pre',
  resolveId(s) { if (/(?:^|\/)store(?:\.tsx)?$/.test(s)) return '\0guide-store'; if (/(?:^|\/)InfoButton(?:\.tsx)?$/.test(s)) return '\0guide-info'; },
  load(id) {
    if (id === '\0guide-store') return 'export const useStore = () => globalThis.guideStore;';
    if (id === '\0guide-info') return 'export const InfoButton = () => null;';
  },
}] });
after(async () => { await server.close(); await rm(cache, { recursive: true, force: true }); });

const routes = await server.ssrLoadModule('/src/pageRouting.ts');
const { DEMOS, DetectiveGuide, fitDemo } = await server.ssrLoadModule('/src/pages/DetectiveGuide.tsx');
const { CHALLENGE_ROWS } = await server.ssrLoadModule('/src/ChallengeMap.tsx');
const { DemoPlayer, verdictParts, methodLine, pText } = await server.ssrLoadModule('/src/DemoPlayer.tsx');

test('#guide routes to the guide; existing hashes still route', () => {
  assert.equal(routes.pageFromHash('#guide'), 'guide');
  assert.equal(routes.pageFromHash('#/guide'), 'guide');
  assert.equal(routes.pageFromHash('#report?case=abc'), 'report');
  assert.equal(routes.pageFromHash('#explore'), 'explore');
  assert.equal(routes.pageFromHash('#explore?v=imerg_precip&place=region:global&from=2001-01&to=2024-12&view=trend'), 'explore');
  assert.equal(routes.pageFromHash('#nope'), 'home');
});

test('fitDemo cuts a demo period to the server coverage (live cubes end 2024-12)', () => {
  const d = DEMOS.find((x) => x.id === 'world-warming');
  const fit = fitDemo(d, [{ id: d.variable_id, coverage: { start: '2001-01', end: '2024-12' } }]);
  assert.equal(fit.end, '2024-12'); assert.equal(fit.start, d.start); assert.equal(d.end, '2025-12');
  assert.equal(fitDemo(d, [{ id: d.variable_id, coverage: { start: '2001-01', end: '2025-12' } }]).end, '2025-12');
  assert.equal(fitDemo(d, []), d);   // catalog not loaded yet: unchanged
});

test('DEMOS use only available variables, real periods and no Mekong case', () => {
  assert.equal(DEMOS.length, 3);
  for (const d of DEMOS) {
    assert.ok(AVAILABLE.includes(d.variable_id), d.id);
    assert.match(d.start, /^\d{4}-\d{2}$/); assert.match(d.end, /^\d{4}-\d{2}$/);
    assert.ok(d.start >= '2001-01' && d.end <= '2025-12' && d.start < d.end, d.id);
    assert.ok(Number(d.end.slice(0, 4)) - Number(d.start.slice(0, 4)) + 1 >= 10, `${d.id}: at least 10 years`);
    if (d.variable_id === 'imerg_precip') assert.ok(d.end <= '2025-09', `${d.id}: IMERG Final ends 2025-09`);
    assert.ok(!/mekong/i.test(JSON.stringify(d)), d.id);
  }
});

// Fixtures shaped like POST /trends answers (values from SCIENTIFIC_VALIDATION_RESULTS.md, pinned demos).
const q = (sufficient = true) => ({ n_months: 288, missing_months: 0, coverage_fraction: 1, sufficient });
const tr = (o) => ({ trend_id: 't', variable_id: 'v', region: { type: 'bbox', bbox: [-10, 18, 30, 30] }, start: '2001-01', end: '2024-12', units: 'mm/month',
  slope_ci: null, ci_method: 'ols', direction: 'no_trend', n: 288, trend_line: [], quality: q(), plain_summary: '', source: src, warnings: [], ...o });
const sentence = (t, name) => { const p = verdictParts(t, name); return `${p.change} ${p.label}: ${p.rest}`.trim(); };

test('captions fill from the response: significant rise, significant fall, not significant, not enough data', () => {
  const world = tr({ units: '°C', slope_per_decade: 0.167, p_value: 0, p_value_autocorr_adjusted: 0.011, significant: true, direction: 'increasing', n: 300 });
  assert.equal(sentence(world, 'Air temperature'), 'Air temperature rose 0.167 °C per decade. Significant: unlikely to be chance alone.');
  assert.match(methodLine(world), /raw p < 0\.0001 vs α 0\.05; Hamed-Rao adjusted p 0\.011 \(diagnostic\); Sen slope \+0\.167 °C\/decade; n = 300 months/);

  const amazon = tr({ slope_per_decade: -7.12, p_value: 8.98e-5, p_value_autocorr_adjusted: 0.033, significant: true, direction: 'decreasing' });
  assert.equal(sentence(amazon, 'Precipitation'), 'Precipitation fell 7.12 mm/month per decade. Significant: unlikely to be chance alone.');
  assert.match(methodLine(amazon), /adjusted p 0\.033/);

  const sahara = tr({ slope_per_decade: -0.133, p_value: 0.185, p_value_autocorr_adjusted: 0.285, significant: false });
  assert.equal(sentence(sahara, 'Precipitation'),
    'Precipitation changed −0.133 mm/month per decade. Not significant: it could still be chance. A longer record might settle it.');
  assert.match(methodLine(sahara), /raw p 0\.185 .*adjusted p 0\.285/);

  const short = tr({ slope_per_decade: 1, p_value: null, p_value_autocorr_adjusted: null, significant: null, quality: q(false) });
  assert.equal(verdictParts(short, 'Precipitation').label, 'Not enough data');
  assert.equal(pText(null), 'n/a'); assert.equal(pText(0.0042), '0.0042');
});

const words = (html) => html.replace(/<button[\s\S]*?<\/button>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&quot;|&amp;/g, 'x')
  .split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

test('guide page: Explorer copy budget, no long dash, Scientist extras only in Scientist mode', () => {
  globalThis.guideStore = { ...globalThis.guideStore, audience: 'explorer' };
  const exp = renderToStaticMarkup(createElement(DetectiveGuide));
  assert.ok(exp.includes('Be a data detective: pick something to investigate, a place and a period.'));
  for (const d of DEMOS) assert.ok(exp.includes(d.question.replace(/'/g, '&#x27;')), d.question);   // React escapes the apostrophe
  for (const s of ['How a trend test works', 'How we know the numbers are right', 'every compared grid cell matched', 'href="#hunt"', 'href="#explore"', 'Past trends, not forecasts'])
    assert.ok(exp.includes(s), s);
  assert.ok(!exp.includes('Method and limits') && !exp.includes('verify.py') && !exp.includes('0.9996'));
  assert.ok(!exp.includes('—'), 'no long dash');
  const n = words(exp.replace(/<section[^>]*guide-challenge[\s\S]*?<\/section>/, ''));   // the judges' map is outside the student copy budget
  assert.ok(n <= 180, `Explorer words: ${n}`); console.log(`Explorer visible words: ${n}`);

  globalThis.guideStore = { ...globalThis.guideStore, audience: 'scientist' };
  const sci = renderToStaticMarkup(createElement(DetectiveGuide));
  for (const s of ['Method and limits', 'preprocess/verify.py', '48 of 48 checks pass', 'Benjamini-Hochberg', 'α = 0.05']) assert.ok(sci.includes(s), s);
  assert.ok(!sci.includes('—') && !sci.includes('0.9996'));
});

test('demo player starts on the question with Back, Play/Pause and Next', () => {
  globalThis.guideStore = { ...globalThis.guideStore, audience: 'explorer' };
  const html = renderToStaticMarkup(createElement(DemoPlayer, { demo: DEMOS[0] }));
  for (const s of ['Step 1 of 6', DEMOS[0].question, '25 years of monthly NASA data, 2001 to 2025', '>Back<', '>Pause<', '>Next<']) assert.ok(html.includes(s), s);
  assert.ok(!html.includes('—'));
});

test('challenge map: 4 objectives and the considerations, each linking to a real page', () => {
  globalThis.guideStore = { ...globalThis.guideStore, audience: 'explorer' };
  const html = renderToStaticMarkup(createElement(DetectiveGuide));
  const sec = html.match(/<section[^>]*guide-challenge[\s\S]*?<\/section>/)?.[0];
  assert.ok(sec && sec.includes('How Terra-scope meets the challenge'));
  for (let i = 1; i <= 4; i++) assert.ok(sec.includes(`Objective ${i}`), `Objective ${i}`);
  const hrefs = [...sec.matchAll(/<a[^>]*href="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(hrefs.length, CHALLENGE_ROWS.length);
  const pages = ['home', 'guide', 'explore', 'forecast', 'hunt', 'detective', 'report'];
  for (const h of hrefs) assert.ok(pages.includes(routes.pageFromHash(h)) && routes.pageFromHash(h) === h.slice(1), h);
  for (const r of CHALLENGE_ROWS) assert.ok(sec.includes(r.need), r.need);
  assert.ok(sec.includes('Partly') && sec.includes('does not pick variables yet'), 'AI row is honest');
  assert.ok(!sec.includes('—'), 'no long dash');
});
