// Explorer edition (plain-language report): wording follows backend verdicts, no evidence meter, custom text kept as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const server = await createServer({ cacheDir: await mkdtemp(join(resolve(tmpdir()), 'terrascope-ex-')), server: { middlewareMode: true, watch: null, hmr: false },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, define: { __GIT_REV__: '"test"' } });
try {
  const model = await server.ssrLoadModule('/src/report/model.ts');
  const fd = await server.ssrLoadModule('/src/report/formd.ts');
  const { EditionDoc } = await server.ssrLoadModule('/src/report/EditionDoc.tsx');
  const { EvidenceChart } = await server.ssrLoadModule('/src/report/ExplorerCompanion.tsx');
  const q = (ok) => ({ n_months: ok ? 288 : 60, missing_months: 0, coverage_fraction: 1, sufficient: ok });
  const src = { product: 'GPM_3IMERGM', version: '07', provider: 'NASA GES DISC', url: 'https://disc.gsfc.nasa.gov/' };
  const months = Array.from({ length: 288 }, (_, i) => ({ t: `${2001 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, value: 100, anomaly: (i % 7) - 3 + i * 0.01, valid_fraction: 1 }));
  const trend = (id, sig, slope, p, ok = true) => ({ trend_id: id, variable_id: 'imerg_precip', region: { type: 'preset', id: 'mekong_delta', bbox: [104.4, 8.5, 106.9, 11.1] }, start: '2001-01', end: '2024-12',
    units: 'mm/month', slope_per_decade: ok ? slope : null, slope_ci: [-1.2, 7.5], ci_method: 'ols_anomaly', p_value: ok ? p : null, p_value_autocorr_adjusted: 0.4, significant: sig,
    direction: slope > 0 ? 'increasing' : 'decreasing', n: 288, trend_line: [], quality: q(ok), plain_summary: '', source: src, warnings: [] });
  const variable = { id: 'imerg_precip', parameter_name: 'Precipitation', dataset_name: 'GPM IMERG', display_units: 'mm/month', spatial_resolution_deg: 0.5, native_resolution_deg: 0.1 };
  const run = (t) => ({ key: t.trend_id, trend: t, series: { points: months }, variable, place: { label: 'Mekong Delta', bbox: t.region.bbox, ref: { type: 'preset', id: 'mekong_delta' } } });
  const m = model.buildReport([run(trend('ns', false, 3.429, 0.077)), run(trend('sg', true, -0.5, 0.0004)), run(trend('in', false, 1, null, false))], [], new Date('2026-11-14T00:00:00Z'), '0.2.0');
  const [ns, sg, ins] = m.analyses;

  test('explorer: findings follow the backend verdict and direction (D4)', () => {
    assert.match(fd.plainFinding(sg), /statistical evidence of a downward trend in rainfall/);
    assert.match(fd.plainFinding(ns), /estimated trend in rainfall is upward, but the statistical test did not find enough evidence to confirm a clear increase/);
    assert.match(fd.plainFinding(ins), /not sufficient for a reliable trend conclusion/);
    assert.match(fd.explorerHeadline(sg), /went down from 2001 to 2024$/);
    assert.match(fd.explorerHeadline(ns), /an upward tendency the test does not confirm$/);
    assert.match(fd.explorerHeadline(ins), /not enough data for a trend$/);
    assert.equal(fd.plainRate(ns), 'About +3.43 mm/month every 10 years (estimated rate).');
    assert.equal(fd.plainRate(ins), null);
    // A total over the period is a labelled straight-line projection, and only for significant trends.
    assert.equal(fd.linearProjection(ns), null);
    assert.equal(fd.linearProjection(ins), null);
    assert.match(fd.linearProjection(sg), /^If this estimated rate had held steadily for all 24 years, it would add up to about \u22121\.20 mm\/month\. This is a straight-line projection of the rate, not a measured difference/);
  });

  test('explorer: test outcome in words, no meter or percentage (D5)', () => {
    assert.equal(fd.testOutcome(sg).met, true);
    assert.equal(fd.testOutcome(sg).title, 'Meets the selected significance threshold');
    assert.equal(fd.testOutcome(ns).met, false);
    assert.match(fd.testOutcome(ns).detail, /0\.077.*not proof that nothing changed/);
    assert.equal(fd.testOutcome(ins).met, null);
    assert.equal(fd.testOutcome(ins).title, 'Not tested');
    const all = [ns, sg, ins].flatMap((a) => [fd.plainFinding(a), fd.testOutcome(a).detail, fd.explorerHeadline(a)]).join(' ');
    assert.ok(!/Strength of evidence|% (sure|certain|confident|likely)|null hypothesis|\u2014/.test(all), all);
  });

  test('explorer: custom title, author and notes are kept as text and escaped in Markdown', () => {
    assert.match(fd.defaultReportTitle(m), /Mekong Delta/);
    assert.equal(fd.safeText('<b>x</b> & y'), '&lt;b&gt;x&lt;/b&gt; &amp; y');
    const md = fd.editionMarkdown(m, 'simple', { title: 'Title Le gia Hung <script>', author: 'Lê Gia Hưng', notes: { [ns.key]: 'hello world\nline 2' } });
    assert.ok(md.startsWith('# Title Le gia Hung &lt;script&gt;'));
    assert.ok(md.includes('Prepared by: Lê Gia Hưng') && md.includes('hello world / line 2'));
    assert.ok(!md.includes('<script>') && !md.includes('Strength of evidence') && !md.includes('\u2014'));
    assert.ok(md.includes('https://doi.org/10.2307/1907187'));
  });

  test('explorer: rendered document has the D sections, outcome box, and the user title wins', () => {
    const props = { m, title: 'helloworld', author: 'Team', headlines: {}, notes: { [ns.key]: 'hello world' } };
    const ex = renderToStaticMarkup(createElement(EditionDoc, { ...props, edition: 'simple' }));
    for (const s of ['The discovery', 'What changed in this part of Earth?', 'The evidence', 'Behind the discovery', 'How did NASA Earth data become this finding?',
      'Start with NASA Earth data', 'Focus on your region', 'Look beyond the seasons', 'Check whether the pattern is convincing', 'Science made simple',
      'What this finding cannot tell us', 'Past, not future.', 'What, not why.', 'Sources', 'https://doi.org/10.2307/1907187', 'Takeaway',
      'Statistical test outcome', 'helloworld', 'hello world', 'not part of the evidence', 'Explorer edition report'])
      assert.ok(ex.includes(s), s);
    assert.ok(!ex.includes('Strength of evidence') && !ex.includes('\u2014'));
    assert.ok(!ex.includes('Glossary') && !ex.includes('adds up to roughly'), 'no full glossary or unlabelled total in the main Explorer report');
    // The step about seasons must not claim the seasons were removed before the Seasonal Mann-Kendall test.
    assert.ok(!/seasons are removed|removing the regular seasons/i.test(ex));
    // "Not tested" concept appears because one finding has insufficient data.
    assert.ok(ex.includes('Not tested'));
    const sci = renderToStaticMarkup(createElement(EditionDoc, { ...props, edition: 'scientist' }));
    for (const s of ['Research question', '95% CI for the OLS anomaly slope', 'Used for the verdict', 'Diagnostic or context only', 'Reproducibility', 'helloworld'])
      assert.ok(sci.includes(s), s);
    const withAppendix = renderToStaticMarkup(createElement(EditionDoc, { ...props, edition: 'simple', appendix: true }));
    assert.ok(withAppendix.includes('Technical appendix') && !ex.includes('Technical appendix'));
    assert.ok(withAppendix.includes('Glossary') && withAppendix.includes('Benjamini, Y., &amp; Hochberg'));
  });
  test('explorer: data kinds and grid size are described honestly', () => {
    assert.equal(fd.productKind('M2IMNXASM').kind, 'Reanalysis');
    assert.match(fd.productKind('M2IMNXASM').plain, /not a direct satellite measurement/);
    assert.equal(fd.productKind('GLDAS_NOAH025_M').kind, 'Land-surface model');
    assert.equal(fd.productKind('GPM_3IMERGM').kind, 'Satellite-based estimate');
    assert.deepEqual(fd.cellSizeKm(0.5, 0), { ns: 56, ew: 56 });
    assert.deepEqual(fd.cellSizeKm(0.5, 60), { ns: 56, ew: 28 });
    assert.ok(!fd.GLOSSARY.some(([, v]) => /about 55 km\)/.test(v)));
    assert.deepEqual(fd.explorerConcepts({ analyses: [ns, sg] }), ['trend', 'pValue', 'notSig']);
    assert.deepEqual(fd.explorerConcepts({ analyses: [sg] }), ['trend', 'pValue', 'anomaly']);
  });

  test('explorer: interactive companion explains the same evidence without network calls', () => {
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (...a) => { calls.push(a); throw new Error('no network in this test'); };
    try {
      const html = renderToStaticMarkup(createElement(EvidenceChart, { a: ns, view: 'yearly', highlight: 'none' }));
      assert.ok(html.includes('role="group"') && html.includes('tabindex="0"') && html.includes('arrow keys'));
      assert.equal((html.match(/<rect /g) || []).length, 24, 'one bar per year');
      const monthly = renderToStaticMarkup(createElement(EvidenceChart, { a: ns, view: 'monthly', highlight: 'above' }));
      assert.equal((monthly.match(/<rect /g) || []).length, 288, 'one bar per month');
      assert.ok(monthly.includes('opacity="0.25"'), 'highlight dims the other bars');
      assert.equal(calls.length, 0);
    } finally { globalThis.fetch = realFetch; }
  });
} finally {
  await server.close();
}
