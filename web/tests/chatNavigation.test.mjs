import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// Use the installed compiler CLI; TypeScript 7 no longer exposes transpileModule.
const prefix = join(resolve(tmpdir()), 'terrascope-navigation-');
const output = await mkdtemp(prefix);
let outputText;
let panelText;
try {
  execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
    '--ignoreConfig', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler',
    '--jsx', 'react-jsx', '--skipLibCheck', '--noCheck', '--outDir', output,
    fileURLToPath(new URL('../src/chatNavigation.ts', import.meta.url)), fileURLToPath(new URL('../src/ScientificPanel.tsx', import.meta.url))], { stdio: 'pipe' });
  outputText = await readFile(join(output, 'chatNavigation.js'), 'utf8');
  panelText = await readFile(join(output, 'ScientificPanel.js'), 'utf8');
} finally {
  assert.ok(resolve(output).startsWith(prefix));
  await rm(output, { recursive: true, force: true });
}
const { planChatNavigation } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
panelText = panelText.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve('react/jsx-runtime')).href));
const { ScientificPanel } = await import('data:text/javascript;base64,' + Buffer.from(panelText).toString('base64'));
test('scientific panel distinguishes applied methods, recommendations and uncertainty accessibly', () => {
  const rule = { rule_id: 'OLS_NOT_SEN_INTERVAL', explanation: 'OLS anomaly confidence interval is not a Sen slope interval.', evidence_references: ['ci_method'] };
  const advice = { analysis_id: 'tr_verified', applied_methods: [{...rule, method: 'ols_anomaly', status: 'applied'}], recommended_methods: [{...rule, method: 'hamed_rao_anomaly', status: 'recommended'}], available_methods: [], unsupported_methods: [], assumptions: [rule], warnings: [], evidence_references: ['ci_method'], trust_assessment: { status:'limited', statistical_evidence:'Positive slope, not statistically significant.', estimated_direction:'positive', magnitude:3.16, units:'mm/month per decade', decision_basis:'raw_seasonal_p', limitations:[rule], missing_metadata:[], cannot_conclude:['No causality from a trend.'] } };
  const html = renderToStaticMarkup(createElement(ScientificPanel, {advice}));
  assert.match(html, /<details/); assert.match(html, /<summary/);
  assert.match(html, /aria-label="Scientific methods and limitations"/);
  for (const text of ['Applied methods', 'Recommendations', 'not additional computations', 'OLS anomaly confidence interval', 'not a Sen slope interval', 'raw_seasonal_p', 'not statistically significant', 'No causality']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('min-width:0') && html.includes('overflow-wrap:anywhere'));
});
const variables = [{ id: 'imerg_precip', parameter: 'precipitation' }];
const regions = [{ id: 'mekong_delta', name: 'Mekong Delta', bbox: [104.4, 8.5, 106.9, 11.1] }, { id: 'hanoi', name: 'Hanoi', bbox: [105, 20, 107, 22] }];
const action = (page, patch = {}) => ({ type: 'navigate', page, params: {
  variable_id: 'imerg_precip', region: { type: 'preset', id: 'mekong_delta' }, start: '2001-01', end: '2024-12', ...patch,
} });
for (const page of ['explore', 'report']) test(`preserves exact selection for ${page}`, () => {
  const result = planChatNavigation(action(page), variables, regions);
  assert.equal(result.ok, true); assert.equal(result.page, page);
  assert.equal(result.selection.place.ref.id, 'mekong_delta');
  assert.equal(result.selection.startYear, 2001); assert.equal(result.selection.endYear, 2024);
});
test('Hunt preserves both presets instead of its demo defaults', () => {
  const result = planChatNavigation(action('hunt', { region_b: { type: 'preset', id: 'hanoi' } }), variables, regions);
  assert.equal(result.ok, true); assert.deepEqual(result.hunt, { a: 'mekong_delta', b: 'hanoi' });
});
test('month-specific evidence is never silently rounded to years', () => {
  assert.equal(planChatNavigation(action('explore', { start: '2001-03' }), variables, regions).ok, false);
  assert.equal(planChatNavigation(action('report', { end: '2024-10' }), variables, regions).ok, false);
});
test('Hunt rejects unsupported bbox or missing second region', () => {
  assert.equal(planChatNavigation(action('hunt'), variables, regions).ok, false);
  assert.equal(planChatNavigation(action('hunt', { region_b: { type: 'bbox', bbox: [1, 2, 3, 4] } }), variables, regions).ok, false);
});
test('unknown variable and region never navigate to unrelated defaults', () => {
  assert.equal(planChatNavigation(action('explore', { variable_id: 'fake' }), variables, regions).ok, false);
  assert.equal(planChatNavigation(action('report', { region: { type: 'preset', id: 'fake' } }), variables, regions).ok, false);
});
test('a country navigates through the page lookup and fails safely without it', () => {
  const region = { type: 'country', id: 'Vietnam' };
  const place = { ref: region, label: 'Vietnam', bbox: [102, 8, 110, 24] };
  const result = planChatNavigation(action('explore', { region }), variables, regions, (n) => (n === 'Vietnam' ? place : undefined));
  assert.equal(result.ok, true); assert.deepEqual(result.selection.place, place);
  assert.equal(planChatNavigation(action('explore', { region }), variables, regions).ok, false);
});
test('Explore keeps the original bbox', () => {
  const region = { type: 'bbox', bbox: [101, 9, 105, 12] };
  const result = planChatNavigation(action('explore', { region }), variables, regions);
  assert.equal(result.ok, true); assert.deepEqual(result.selection.place.ref, region);
});
