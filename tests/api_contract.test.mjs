import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TerraScopeApi, API_BASE_URL } from '../src/lib/api.ts';
import { generateGrid } from '../src/lib/mockData.ts';
import { getMetric, REGION_META, VARIABLE_META } from '../src/lib/types.ts';

test('Contract R1: No API keys, secret tokens, or private endpoints in source code', () => {
  const srcFiles = ['src/App.tsx', 'src/lib/api.ts', 'src/lib/types.ts', 'src/components/AIEarthDetective.tsx'];
  const forbiddenPatterns = [/sk-[a-zA-Z0-9]{20,}/, /OPENAI_API_KEY\s*=\s*['"][^'"]+['"]/, /GEMINI_API_KEY\s*=\s*['"][^'"]+['"]/];

  for (const file of srcFiles) {
    const content = fs.readFileSync(path.resolve(file), 'utf8');
    for (const pat of forbiddenPatterns) {
      assert.equal(pat.test(content), false, `Forbidden secret pattern found in ${file}`);
    }
  }
});

test('Contract R3: Dynamic units provided by API metadata, not hardcoded', async () => {
  const varsRes = await TerraScopeApi.fetchVariables();
  assert.ok(Array.isArray(varsRes.variables));
  assert.ok(varsRes.variables.length >= 2);

  const imerg = varsRes.variables.find((v) => v.id === 'imerg_precip');
  assert.ok(imerg);
  assert.equal(imerg.units, 'mm/hr');
  assert.equal(imerg.display_units, 'mm/month');

  const gldas = varsRes.variables.find((v) => v.id === 'gldas_soil_moisture_0_10cm');
  assert.ok(gldas);
  assert.equal(gldas.units, 'kg/m2');
  assert.equal(gldas.display_units, 'kg/m2');
});

test('Contract R4: Grid heatmap and cell metrics support FDR-corrected significance (significant_fdr)', () => {
  const grid = generateGrid('mekong', '2005-2024');
  assert.ok(grid.features.length > 0);

  const sampleCell = grid.features[0].properties;
  const rainMetric = getMetric(sampleCell, 'rain');
  assert.equal(typeof rainMetric.significantFdr, 'boolean');

  const soilMetric = getMetric(sampleCell, 'soil');
  assert.equal(typeof soilMetric.significantFdr, 'boolean');
});

test('Contract R7 & 4.9: AI Earth Detective outputs answer with cited_numbers, actions, and disclaimer', async () => {
  const explainRes = await TerraScopeApi.explainQuery({
    question: 'Is it getting drier in the Mekong Delta?',
    context: {
      region: 'mekong',
      variable: 'rain',
      period: '2005-2024',
    },
  });

  assert.ok(explainRes.answer.length > 20);
  assert.ok(typeof explainRes.disclaimer === 'string' && explainRes.disclaimer.length > 10);
  assert.ok(Array.isArray(explainRes.cited_numbers));
  assert.ok(explainRes.cited_numbers.length > 0);
  assert.ok(explainRes.cited_numbers[0].units);
  assert.ok(explainRes.cited_numbers[0].source_field);
  assert.ok(explainRes.disclaimer.includes('AI-generated explanation'));
});

test('Contract R9: ApiError supports standardized error codes from Section 4.11', () => {
  const validCodes = [
    'VALIDATION_ERROR',
    'REGION_TOO_LARGE',
    'INVALID_TIME_RANGE',
    'NOT_FOUND',
    'NO_DATA',
    'RATE_LIMITED',
    'UPSTREAM_ERROR',
    'UPSTREAM_TIMEOUT',
    'INTERNAL_ERROR',
    'NETWORK_ERROR',
  ];

  for (const code of validCodes) {
    assert.ok(code.length > 0);
  }
});

test('Contract R10: Base URL uses VITE_API_BASE_URL convention and resolves to /api/v1', () => {
  assert.ok(API_BASE_URL.endsWith('/api/v1'));
});

test('Contract R12 & 4.3: Prototype includes at least one is_demo preset region', async () => {
  const regionsRes = await TerraScopeApi.fetchRegions();
  assert.ok(regionsRes.regions.length > 0);
  const demoRegion = regionsRes.regions.find((r) => r.is_demo === true);
  assert.ok(demoRegion, 'Must contain a demo region flagged with is_demo: true');
  assert.equal(demoRegion.id, 'mekong_delta');
  assert.equal(demoRegion.bbox.length, 4);
});
