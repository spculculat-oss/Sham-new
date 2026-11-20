import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createMapsRouter } from '../server/maps';
import { createAiToolsRouter } from '../server/aiTools';
import { attachLiveVoiceServer } from '../server/liveVoice';
import { evaluateDesignerTrial, generateSampleTestReport } from '../src/utils/designerSimulationEngine';
import type { FormulationState } from '../src/types/perfume';

async function withServer(router: express.Router, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('GET /api/maps/config reflects VITE_GOOGLE_MAPS_API_KEY configuration safely', async () => {
  await withServer(createMapsRouter({ VITE_GOOGLE_MAPS_API_KEY: 'test-maps-key' }), async (base) => {
    const res = await fetch(`${base}/api/maps/config`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { configured: boolean; apiKey: string };
    assert.equal(data.configured, true);
    assert.equal(data.apiKey, 'test-maps-key');
  });

  await withServer(createMapsRouter({}), async (base) => {
    const res = await fetch(`${base}/api/maps/config`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { configured: boolean; apiKey: string };
    assert.equal(data.configured, false);
    assert.equal(data.apiKey, '');
  });
});

test('POST /api/maps/grounding validates queries and handles missing server key', async () => {
  await withServer(createMapsRouter({}), async (base) => {
    const empty = await fetch(`${base}/api/maps/grounding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '   ' }),
    });
    assert.equal(empty.status, 400);

    const tooLong = await fetch(`${base}/api/maps/grounding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'a'.repeat(501) }),
    });
    assert.equal(tooLong.status, 400);

    const unconfigured = await fetch(`${base}/api/maps/grounding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Grasse perfumery', lat: 43.65, lng: 6.92 }),
    });
    assert.equal(unconfigured.status, 503);
  });
});

test('POST /api/ai/harmony validates active lab notes and missing server AI key', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await withServer(createAiToolsRouter(), async (base) => {
      const empty = await fetch(`${base}/api/ai/harmony`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: [] }),
      });
      assert.equal(empty.status, 400);
      const emptyBody = (await empty.json()) as { code?: string };
      assert.equal(emptyBody.code, 'EMPTY_NOTES');

      const missingKey = await fetch(`${base}/api/ai/harmony`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: [
            { nameAr: 'برغموت', nameEn: 'Bergamot', category: 'top', percentageOfOil: 25 },
            { nameAr: 'عود', nameEn: 'Oud', category: 'base', percentageOfOil: 45 },
          ],
          formulaTitle: 'Royal Amber',
          language: 'ar',
        }),
      });
      assert.equal(missingKey.status, 503);
      const missingKeyBody = (await missingKey.json()) as { code?: string };
      assert.equal(missingKeyBody.code, 'MISSING_API_KEY');
    });
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test('attachLiveVoiceServer exports a valid upgrade handler initializer', () => {
  assert.equal(typeof attachLiveVoiceServer, 'function');
});

test('evaluateDesignerTrial detects IFRA violations, louching risk, and generates 1-click patches', () => {
  const baseFormulation: FormulationState = {
    bottleVolumeMl: 50,
    batchCount: 1,
    concentrationPercent: 25,
    concentrationType: 'extrait',
    alcoholPercentage: 96,
    waterPercent: 1,
    fixativePercent: 1.5,
    oilDensity: 0.92,
    alcoholDensity: 0.8,
    unitMode: 'grams',
  };

  // 1. Healthy formula produces valid kinetics & radar
  const healthy = evaluateDesignerTrial({
    formulation: baseFormulation,
    pyramidNotes: [
      { id: '1', nameAr: 'برغموت', nameEn: 'Bergamot FCF', category: 'top', percentageOfOil: 18 },
      { id: '2', nameAr: 'هيديون', nameEn: 'Hedione', category: 'heart', percentageOfOil: 32 },
      { id: '3', nameAr: 'أمبروكسان', nameEn: 'Ambroxan Pure', category: 'base', percentageOfOil: 50 },
    ],
    macerationDays: 35,
    ambientTempC: 25,
    humidityPct: 45,
  });
  assert.equal(healthy.evaporationCurve.length, 10);
  assert.equal(healthy.clarityStatus, 'pass');
  assert.ok(healthy.estimatedLongevityHours > 4);
  assert.ok(healthy.radar.baseTenacity >= 0 && healthy.radar.baseTenacity <= 100);

  // 2. Excess Damascenone + watery low-proof alcohol triggers critical failures & fixes
  const risky = evaluateDesignerTrial({
    formulation: {
      ...baseFormulation,
      alcoholPercentage: 80,
      waterPercent: 9,
      fixativePercent: 0,
    },
    pyramidNotes: [
      { id: 'd1', nameAr: 'داماسينون بيتا', nameEn: 'Beta Damascenone', category: 'heart', percentageOfOil: 12 },
      { id: 'd2', nameAr: 'برغموت', nameEn: 'Bergamot FCF', category: 'top', percentageOfOil: 88 },
    ],
    macerationDays: 5,
    ambientTempC: 38,
    humidityPct: 80,
  });
  assert.equal(risky.safetyVerdict, 'fail');
  assert.equal(risky.clarityStatus, 'fail');
  assert.ok(risky.suggestions.some((s) => s.area === 'safety' && s.severity === 'critical'));
  assert.ok(risky.suggestions.some((s) => s.area === 'solubility'));
});

test('POST /api/ai/designer-optimize validates empty notes and missing server key', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await withServer(createAiToolsRouter(), async (base) => {
      const empty = await fetch(`${base}/api/ai/designer-optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: [] }),
      });
      assert.equal(empty.status, 400);
      const emptyBody = (await empty.json()) as { code?: string };
      assert.equal(emptyBody.code, 'EMPTY_NOTES');

      const missingKey = await fetch(`${base}/api/ai/designer-optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: [{ nameAr: 'برغموت', nameEn: 'Bergamot', category: 'top', percentageOfOil: 20 }],
          formulaTitle: 'Designer Trial',
          goal: 'balanced_luxury',
          language: 'ar',
        }),
      });
      assert.equal(missingKey.status, 503);
      const missingKeyBody = (await missingKey.json()) as { code?: string };
      assert.equal(missingKeyBody.code, 'MISSING_API_KEY');
    });
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test('generateSampleTestReport forecasts longevity, spatial projection, timeline & ingredient attribution', () => {
  const formulation: FormulationState = {
    bottleVolumeMl: 50,
    batchCount: 1,
    concentrationPercent: 24,
    concentrationType: 'edp',
    alcoholPercentage: 96,
    waterPercent: 1,
    fixativePercent: 1.5,
    oilDensity: 0.92,
    alcoholDensity: 0.8,
    unitMode: 'grams',
  };

  const oudNotes = [
    { id: '1', nameAr: 'برغموت', nameEn: 'Bergamot FCF', category: 'top' as const, percentageOfOil: 15 },
    { id: '2', nameAr: 'هيديون', nameEn: 'Hedione', category: 'heart' as const, percentageOfOil: 25 },
    { id: '3', nameAr: 'دهن عود كمبودي', nameEn: 'Aged Cambodian Oud Oil', category: 'base' as const, percentageOfOil: 35 },
    { id: '4', nameAr: 'أمبروكسان نقي', nameEn: 'Ambroxan Pure', category: 'base' as const, percentageOfOil: 25 },
  ];

  const oilyFabricReport = generateSampleTestReport({
    formulaTitle: 'Royal Oud Sample',
    formulation,
    pyramidNotes: oudNotes,
    macerationDays: 40,
    ambientTempC: 24,
    humidityPct: 50,
    skinType: 'oily',
    sprayCount: 5,
    wearScenario: 'evening_open',
    applicationTarget: 'skin_and_fabric',
  });

  const drySkinCitrusReport = generateSampleTestReport({
    formulaTitle: 'Citrus Splash',
    formulation: { ...formulation, concentrationPercent: 8, fixativePercent: 0 },
    pyramidNotes: [
      { id: 'c1', nameAr: 'برغموت', nameEn: 'Bergamot FCF', category: 'top', percentageOfOil: 85 },
      { id: 'c2', nameAr: 'كالون 1951', nameEn: 'Calone 1951', category: 'top', percentageOfOil: 15 },
    ],
    macerationDays: 5,
    ambientTempC: 35,
    humidityPct: 75,
    skinType: 'dry',
    sprayCount: 1,
    wearScenario: 'humid_summer',
    applicationTarget: 'skin_only',
  });

  assert.equal(oilyFabricReport.timelineStages.length, 4);
  assert.equal(oilyFabricReport.ingredientContributions.length, 4);
  assert.ok(oilyFabricReport.longevityHours > drySkinCitrusReport.longevityHours);
  assert.ok(oilyFabricReport.peakProjectionMeters > drySkinCitrusReport.peakProjectionMeters);
  assert.ok(oilyFabricReport.clothingResidualHours > oilyFabricReport.skinFadeHour);
  const sumLongevityAttrib = oilyFabricReport.ingredientContributions.reduce(
    (sum, item) => sum + item.longevityContributionPct,
    0,
  );
  assert.ok(sumLongevityAttrib >= 97 && sumLongevityAttrib <= 103);
});
