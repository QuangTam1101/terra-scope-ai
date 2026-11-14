// Dual audience (Explorer / Scientist): preference storage, routing, tours, glossary and identical evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const mem = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

const server = await createServer({ cacheDir: await mkdtemp(join(resolve(tmpdir()), 'terrascope-aud-')), server: { middlewareMode: true, watch: null, hmr: false },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const aud = await server.ssrLoadModule('/src/audience.ts');
  test('audience: explicit choice is stored, deep links default to Explorer, broken storage never throws', () => {
    const s = mem();
    assert.equal(aud.lastAudience(s), null);
    assert.equal(aud.initialAudience(s), 'explorer');
    assert.equal(aud.saveAudience('scientist', s), true);
    assert.equal(aud.lastAudience(s), 'scientist');
    assert.deepEqual([...s.m.keys()], ['terra-scope:audience-mode:v1']);
    s.setItem('terra-scope:audience-mode:v1', 'child');           // stale or tampered value is ignored
    assert.equal(aud.initialAudience(s), 'explorer');
    assert.equal(aud.lastAudience(broken), null); assert.equal(aud.saveAudience('explorer', broken), false); assert.equal(aud.initialAudience(null), 'explorer');
  });
  test('audience: plain finding follows the backend verdict and never upgrades a non-significant result', () => {
    const q = { sufficient: true };
    const ns = aud.plainFinding({ slope_per_decade: 3.16, significant: false, quality: q }, 'rainfall');
    assert.match(ns, /not strong enough to confirm/); assert.ok(!/clear (up|down)ward/.test(ns)); assert.match(ns, /does not mean nothing is changing/);
    assert.match(aud.plainFinding({ slope_per_decade: -0.2, significant: true, quality: q }, 'temperature'), /clear downward trend/);
    assert.match(aud.plainFinding({ slope_per_decade: 1, significant: null, quality: { sufficient: false } }, 'x'), /not enough data/);
    assert.equal(aud.strengthOf({ significant: true, quality: { sufficient: false } }), 'untested');
  });

  const routes = await server.ssrLoadModule('/src/pageRouting.ts');
  test('routing: #start is the experience choice; other deep links are unchanged', () => {
    assert.equal(routes.pageFromHash('#start'), 'start'); assert.equal(routes.pageFromHash('#/start'), 'start');
    assert.equal(routes.pageFromHash('#report?case=x'), 'report'); assert.equal(routes.pageFromHash(''), 'landing');
  });

  const ob = await server.ssrLoadModule('/src/onboarding.ts');
  test('tours: separate completion per audience; the first tour still counts as Explorer', () => {
    const s = mem();
    assert.equal(ob.shouldAutoStart(true, false, s, 'scientist'), true);
    ob.markOnboardingDone(s);                                     // original key = Explorer
    assert.equal(ob.isOnboardingDone(s, 'explorer'), true); assert.equal(ob.isOnboardingDone(s, 'scientist'), false);
    ob.markOnboardingDone(s, 'scientist');
    assert.equal(ob.shouldAutoStart(true, false, s, 'scientist'), false);
    assert.deepEqual([...s.m.keys()].sort(), ['terra-scope:onboarding:scientist:v1', 'terra-scope:onboarding:v1']);
  });
  test('tours: Scientist steps are well formed and point only at real targets', async () => {
    const steps = ob.tourSteps('scientist');
    assert.notEqual(steps, ob.tourSteps('explorer'));
    assert.equal(steps[0].id, 'welcome'); assert.equal(steps.at(-1).id, 'finish');
    const file = { explore: 'Explore', hunt: 'Hunt', detective: 'Detective', report: 'Report' };
    for (const s of steps) {
      assert.ok(!s.body.includes('—') && s.body.length > 20, s.id);
      if (!s.target) continue;
      const id = s.target.match(/data-tour="([\w-]+)"/)[1];
      const src = await readFile(new URL(`../src/pages/${file[s.page]}.tsx`, import.meta.url), 'utf8');
      assert.ok(src.includes(`data-tour="${id}"`), `${s.id}: ${id}`);
    }
    assert.equal(ob.clampStep(99, steps.length), steps.length - 1);
  });

  const { GLOSSARY } = await server.ssrLoadModule('/src/glossary.ts');
  test('glossary: required terms, both definitions, no forbidden p-value claims', () => {
    for (const k of ['trend', 'time_series', 'p_value', 'significance', 'null_hypothesis', 'sen_slope', 'seasonal_mk', 'autocorrelation', 'confidence_interval',
      'fdr', 'anomaly', 'reanalysis', 'spatial_resolution', 'provenance', 'missing_data', 'uncertainty', 'forecast_vs_trend']) {
      const g = GLOSSARY[k]; assert.ok(g && g.plain && g.technical && g.example, k);
      assert.ok(!(g.plain + g.technical + g.example).includes('—'), k);
    }
    const p = (GLOSSARY.p_value.plain + ' ' + GLOSSARY.p_value.technical).toLowerCase();
    assert.ok(p.includes('not the probability that the null hypothesis is true'));
    assert.ok(!/p > 0.05 proves|proves there is no trend|proves a caus/.test(p));
  });

  const model = await server.ssrLoadModule('/src/report/model.ts');
  test('reports: Plain-language and Scientific markdown carry the same numbers', () => {
    const q = { n_months: 288, missing_months: 0, coverage_fraction: 1, sufficient: true };
    const src = { product: 'GPM_3IMERGM', version: '07', provider: 'NASA GES DISC', url: 'https://x' };
    const trend = { trend_id: 'tr1', variable_id: 'imerg_precip', region: { type: 'preset', id: 'mekong_delta', bbox: [104.4, 8.5, 106.9, 11.1] }, start: '2001-01', end: '2024-12',
      units: 'mm/month', slope_per_decade: 3.163604736328125, slope_ci: [-1.2, 7.5], ci_method: 'ols_anomaly', p_value: 0.11031644898805326, p_value_autocorr_adjusted: 0.4,
      significant: false, direction: 'increasing', n: 288, trend_line: [], quality: q, plain_summary: '', source: src, warnings: [] };
    const variable = { id: 'imerg_precip', parameter_name: 'Precipitation', dataset_name: 'GPM IMERG', display_units: 'mm/month', spatial_resolution_deg: 0.5, native_resolution_deg: 0.1 };
    const m = model.buildReport([{ key: 'tr1', trend, series: { points: [] }, variable, place: { label: 'Mekong Delta', bbox: trend.region.bbox, ref: { type: 'preset', id: 'mekong_delta' } } }], [], new Date('2026-11-14T00:00:00Z'), '0.2.0');
    const sci = model.toMarkdown(m, 'scientific'), plain = model.toMarkdown(m, 'plain');
    for (const n of ['+3.16', '0.110', '288 months']) { assert.ok(sci.includes(n), n); assert.ok(plain.includes(n), n); }
    assert.ok(plain.includes('## In plain words') && !sci.includes('## In plain words'));
    assert.match(plain, /not strong enough to confirm/);
    assert.deepEqual(model.toReproJson(m), model.toReproJson(m));     // JSON does not depend on the presentation
  });

  globalThis.audStore = { audience: 'explorer' };
  const { ModeSelect } = await server.ssrLoadModule('/src/pages/ModeSelect.tsx');
  test('experience choice: two balanced options, nothing preselected, last choice only marked', () => {
    const html = renderToStaticMarkup(createElement(ModeSelect, { last: 'scientist', onChoose: () => {}, onBack: () => {} }));
    assert.ok(html.includes('How would you like to explore Earth?'));
    assert.ok(html.includes('Continue as Explorer') && html.includes('Continue as Scientist'));
    assert.equal((html.match(/Last used/g) || []).length, 1);
    assert.ok(!/aria-checked="true"|aria-pressed="true"/.test(html), 'no default selection');
    assert.ok(html.includes('Back to the start page') && !html.includes('—'));
  });
} finally {
  await server.close();
}
