// Form D report helpers: academic wording follows backend verdicts, editions carry identical numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const server = await createServer({ cacheDir: await mkdtemp(join(resolve(tmpdir()), 'terrascope-fd-')), server: { middlewareMode: true, watch: null, hmr: false },
  appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const model = await server.ssrLoadModule('/src/report/model.ts');
  const fd = await server.ssrLoadModule('/src/report/formd.ts');
  const q = { n_months: 288, missing_months: 0, coverage_fraction: 1, sufficient: true };
  const src = { product: 'GPM_3IMERGM', version: '07', provider: 'NASA GES DISC', url: 'https://x' };
  const months = Array.from({ length: 288 }, (_, i) => ({ t: `${2001 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, value: 100, anomaly: (i % 7) - 3 + i * 0.01, valid_fraction: 1 }));
  const trend = (sig, slope, p) => ({ trend_id: `tr${slope}`, variable_id: 'imerg_precip', region: { type: 'preset', id: 'mekong_delta', bbox: [104.4, 8.5, 106.9, 11.1] }, start: '2001-01', end: '2024-12',
    units: 'mm/month', slope_per_decade: slope, slope_ci: [-1.2, 7.5], ci_method: 'ols_anomaly', p_value: p, p_value_autocorr_adjusted: 0.4, significant: sig,
    direction: 'increasing', n: 288, trend_line: [], quality: q, plain_summary: '', source: src, warnings: [] });
  const variable = { id: 'imerg_precip', parameter_name: 'Precipitation', dataset_name: 'GPM IMERG', display_units: 'mm/month', spatial_resolution_deg: 0.5, native_resolution_deg: 0.1 };
  const run = (t) => ({ key: t.trend_id, trend: t, series: { points: months }, variable, place: { label: 'Mekong Delta', bbox: t.region.bbox, ref: { type: 'preset', id: 'mekong_delta' } } });
  const cmpTrend = (s) => ({ ...trend(false, s, 0.3), trend_id: `c${s}` });
  const sahel = { key: 'cmp1', kind: 'regions', title: 'Air temperature: Sahel vs Wisconsin', units: '°C', variableName: 'Air temperature',
    a: { label: 'Sahel', dataset: 'MERRA-2', trend: cmpTrend(-0.21), series: { points: [] } }, b: { label: 'Wisconsin', dataset: 'MERRA-2', trend: cmpTrend(0.17), series: { points: [] } },
    test: { compare_id: 'c1', difference: { slope_diff_per_decade: -0.38, ci: [-0.865, 0.117], p_value: 0.022, significant: false, stable_halves: null, test: 'block_bootstrap' }, verdict: 'opposite_not_significant' } };
  const m = model.buildReport([run(trend(false, 3.4290, 0.077)), run(trend(true, 0.187, 0.0004))], [sahel], new Date('2026-11-14T00:00:00Z'), '0.2.0');
  const [ns, sg] = m.analyses;

  test('form D: titles and statements follow the backend verdict in academic wording', () => {
    assert.match(fd.defaultHeadline(ns), /increasing tendency, not statistically significant$/);
    assert.match(fd.defaultHeadline(sg), /statistically significant increasing trend$/);
    assert.match(fd.resultStatement(ns), /null hypothesis of no monotonic trend is not rejected/);
    assert.match(fd.resultStatement(ns), /does not demonstrate the absence of a trend/);
    assert.match(fd.resultStatement(sg), /null hypothesis of no monotonic trend is rejected/);
    assert.equal(fd.trendStamp(ns).text, 'Not significant'); assert.equal(fd.trendStamp(sg).text, 'Significant trend');
    const all = [fd.abstractText(m), ...m.analyses.map(fd.resultStatement), ...m.comparisons.map(fd.compareStatement)].join(' ');
    assert.ok(!all.includes('—'), 'no long dash');
    assert.ok(!/\b(can't|won't|we|our|a little|up a little)\b/i.test(all), 'academic register: no contractions or first person');
  });
  test('form D: the Sahel vs Wisconsin difference is inconclusive (p < 0.05 but the interval includes zero)', () => {
    const c = m.comparisons[0];
    assert.equal(fd.compareStamp(c).text, 'Inconclusive');
    assert.match(fd.compareHeadline(c), /difference in trends inconclusive/);
    assert.match(fd.compareStatement(c), /-0\.865 to 0\.117|−0\.865 to 0\.117/);
  });
  test('form D: reworded titles may not overclaim, contradict the result, or state causes', () => {
    assert.ok(fd.headlineWarning('Rainfall clearly increased', ns));
    assert.equal(fd.headlineWarning('Rainfall shows a tendency that is not significant', ns), null);
    assert.ok(fd.headlineWarning('No trend in temperature', sg));
    assert.ok(fd.headlineWarning('Rain increased because of dams', sg));
    assert.equal(fd.quickCheck(m, { [ns.key]: 'Rainfall definitely rose' })[1].ok, false);
  });
  test('form D: annual means are a drawing aid only (complete years, means of anomalies)', () => {
    const ys = fd.yearlyMeans({ points: months });
    assert.equal(ys.length, 24); assert.equal(ys[0].year, 2001);
    assert.ok(Math.abs(ys[0].value - months.slice(0, 12).reduce((s, p) => s + p.anomaly, 0) / 12) < 1e-9);
  });
  test('form D: both editions export the same numbers', () => {
    const a = fd.editionMarkdown(m, 'simple', { title: 'Test report', notes: { [ns.key]: 'Field observation' } });
    const b = fd.editionMarkdown(m, 'scientist', { title: 'Test report' });
    for (const n of ['+3.43', '0.077', '+0.187', '288 months']) { assert.ok(a.includes(n), n); assert.ok(b.includes(n), n); }
    assert.ok(b.includes('0.022'), 'scientist carries the comparison p-value');
    assert.ok(a.startsWith('# Test report') && a.includes('## Summary of findings') && a.includes('not part of the evidence') && a.includes('Field observation'));
    assert.ok(b.includes('## Abstract'));
    assert.ok(!a.includes('—') && !b.includes('—'));
  });

  test('Download data (CSV): one row per month, numbers copied from the API, verdict and diagnostic labelled', () => {
    const t = { ...trend(true, 3.43, 0.004), alpha: 0.05 };
    const pts = [{ t: '2001-01', value: 240.5, anomaly: -12.25, valid_fraction: 1 }, { t: '2001-02', value: null, anomaly: null, valid_fraction: 0 }];
    const v = { ...variable, source: src };
    const csv = model.seriesCsv({ trend: t, series: { points: pts }, variable: v, place: { label: 'Mekong Delta', bbox: [104.4, 8.5, 106.9, 11.1] } }, new Date('2026-11-15T12:00:00Z'));
    const lines = csv.trimEnd().split('\n');
    assert.deepEqual(lines.slice(-3), ['month,value,anomaly,valid_fraction', '2001-01,240.5,-12.25,1', '2001-02,,,0']);   // missing month: empty cells
    assert.ok(lines.slice(0, -3).every((l) => l.startsWith('# ')));
    assert.match(csv, /exported 2026-11-15/);
    assert.match(csv, /Sen slope 3\.43 mm\/month per decade; Seasonal Mann-Kendall raw p 0\.004 \(alpha 0\.05\): Significant trend; Hamed-Rao adjusted p 0\.4 \(diagnostic only\)/);
    assert.ok(!csv.includes('—'));
  });
} finally {
  await server.close();
}
