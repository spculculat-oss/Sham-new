import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import express from 'express';
import WebSocket from 'ws';
import { createMapsRouter } from '../server/maps';
import { createAiToolsRouter } from '../server/aiTools';
import { attachLiveVoiceServer } from '../server/liveVoice';
import { attachMessengerCallServer } from '../server/community/callSignaling';
import { connectPglite, migrate } from '../server/community/db';
import { Vault } from '../server/community/crypto';
import { createCommunity } from '../server/community/router';
import * as chatSvc from '../server/community/messenger';
import * as communitySvc from '../server/community/service';
import { evaluateDesignerTrial, generateSampleTestReport } from '../src/utils/designerSimulationEngine';
import {
  addFormulaReview,
  getAvailableFormulasForReview,
  getFormulaPositiveReviews,
  voteFormulaReviewHelpful,
} from '../src/utils/formulaReviews';
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

test('formulaReviews manages positive reviews, helpful votes, and HomeHub reviews tab wiring', () => {
  const store = new Map<string, string>();
  const prevStorage = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };

  try {
    const initial = getFormulaPositiveReviews();
    assert.ok(initial.length >= 6);
    assert.ok(initial.every((r) => r.rating >= 4));

    const formulas = getAvailableFormulasForReview();
    assert.ok(formulas.length > 0);
    const first = formulas[0];

    const added = addFormulaReview({
      formulaId: first.id,
      formulaTitleAr: first.titleAr,
      formulaTitleEn: first.titleEn,
      olfactoryFamily: first.olfactoryFamily,
      concentrationLabel: first.concentrationLabel,
      batchCode: first.batchCode,
      sourceTab: first.sourceTab,
      reviewerName: 'أمل العتيبي',
      rating: 5,
      headline: 'ثبات رائع وفوحان متوازن',
      comment: 'التجربة ممتازة جداً على القماش والبشرة لأكثر من ١٢ ساعة.',
      longevityHours: 12,
      sillageAr: 'فوحان متوازن',
      sillageEn: 'Balanced projection',
    });

    const afterAdd = getFormulaPositiveReviews();
    assert.equal(afterAdd.length, initial.length + 1);
    assert.ok(afterAdd.some((r) => r.id === added.id));

    assert.equal(voteFormulaReviewHelpful(added.id), true);
    assert.equal(voteFormulaReviewHelpful(added.id), false);
    const afterVote = getFormulaPositiveReviews().find((r) => r.id === added.id);
    assert.equal(afterVote?.helpfulCount, 2);

    const homeHubSource = readFileSync(join(process.cwd(), 'src/components/HomeHub.tsx'), 'utf8');
    assert.match(homeHubSource, /'perfume_reviews'/);
    assert.match(homeHubSource, /تقييمات العطور/);
    assert.match(homeHubSource, /soft-pulse-hover/);
  } finally {
    if (prevStorage === undefined) delete (globalThis as Record<string, unknown>).localStorage;
    else (globalThis as Record<string, unknown>).localStorage = prevStorage;
  }
});

function nextWsMessage(ws: WebSocket, predicate: (msg: Record<string, any>) => boolean, timeoutMs = 4000) {
  return new Promise<Record<string, any>>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WS message'));
    }, timeoutMs);
    const onMessage = (raw: WebSocket.RawData) => {
      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(raw.toString()) as Record<string, any>;
      } catch {
        return;
      }
      if (predicate(parsed)) {
        cleanup();
        resolve(parsed);
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
    };
    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

test('attachMessengerCallServer authenticates members, relays WebRTC call signals, and logs system call history', async () => {
  const key = 'test-call-key-0123456789-abcdefghijklmnop';
  const sql = await connectPglite();
  await migrate(sql);
  const community = createCommunity({ sql, env: { SHAM_DATA_KEY: key } });
  const ctx = (await community.ready())!;
  assert.ok(ctx);

  const app = express();
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  attachMessengerCallServer(server, community);

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const wsUrl = `ws://127.0.0.1:${port}/ws/messenger-calls`;

  const sockets: WebSocket[] = [];
  try {
    const alice = await communitySvc.register(ctx, {
      name: 'أليس الشامية',
      email: 'alice.calls@example.com',
      password: 'Password123',
      country: 'SY',
    });
    const bob = await communitySvc.register(ctx, {
      name: 'بوب العطار',
      email: 'bob.calls@example.com',
      password: 'Password123',
      country: 'SY',
    });

    const convId = await chatSvc.openDirect(ctx, alice.me.id, bob.me.id);

    // 1. Unauthenticated connection is rejected cleanly with 4401
    const unauthWs = new WebSocket(`${wsUrl}?token=invalid-token`);
    sockets.push(unauthWs);
    const unauthClose = await new Promise<{ code: number }>((resolve) => {
      unauthWs.once('close', (code) => resolve({ code }));
    });
    assert.equal(unauthClose.code, 4401);

    // 2. Connect caller (Alice), callee (Bob), and Bob's secondary tab
    const aliceWs = new WebSocket(`${wsUrl}?token=${encodeURIComponent(alice.token)}`);
    const bobWs1 = new WebSocket(`${wsUrl}?token=${encodeURIComponent(bob.token)}`);
    const bobWs2 = new WebSocket(`${wsUrl}?token=${encodeURIComponent(bob.token)}`);
    sockets.push(aliceWs, bobWs1, bobWs2);

    await Promise.all([
      nextWsMessage(aliceWs, (m) => m.type === 'ready'),
      nextWsMessage(bobWs1, (m) => m.type === 'ready'),
      nextWsMessage(bobWs2, (m) => m.type === 'ready'),
    ]);

    // 3. Alice starts a live video call
    const pCreated = nextWsMessage(aliceWs, (m) => m.type === 'call:created');
    const pIncoming1 = nextWsMessage(bobWs1, (m) => m.type === 'call:incoming');
    const pIncoming2 = nextWsMessage(bobWs2, (m) => m.type === 'call:incoming');
    aliceWs.send(JSON.stringify({ type: 'call:start', conversationId: convId, mode: 'video' }));

    const [created, incoming1, incoming2] = await Promise.all([pCreated, pIncoming1, pIncoming2]);
    assert.equal(created.conversationId, convId);
    assert.equal(created.mode, 'video');
    assert.ok(created.onlinePeerIds.includes(bob.me.id));
    assert.equal(incoming1.callId, created.callId);
    assert.equal(incoming2.callId, created.callId);
    assert.equal(incoming1.caller.id, alice.me.id);

    // 4. Bob accepts on tab 1 -> Alice receives call:accepted and Bob's tab 2 receives call:dismiss
    const pAccepted = nextWsMessage(aliceWs, (m) => m.type === 'call:accepted');
    const pDismiss = nextWsMessage(bobWs2, (m) => m.type === 'call:dismiss');
    bobWs1.send(JSON.stringify({ type: 'call:accept', callId: created.callId, mode: 'video' }));

    const [accepted, dismiss] = await Promise.all([pAccepted, pDismiss]);
    assert.equal(accepted.callId, created.callId);
    assert.equal(accepted.peer.id, bob.me.id);
    assert.equal(dismiss.callId, created.callId);

    // 5. Alice relays WebRTC SDP offer to Bob
    const pOffer = nextWsMessage(bobWs1, (m) => m.type === 'call:signal' && m.signalType === 'offer');
    aliceWs.send(
      JSON.stringify({
        type: 'call:signal',
        callId: created.callId,
        toUserId: bob.me.id,
        signalType: 'offer',
        payload: { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1' },
      }),
    );
    const offer = await pOffer;
    assert.equal(offer.fromUserId, alice.me.id);
    assert.equal(offer.payload.type, 'offer');

    // 6. Alice ends the call -> Bob receives call:ended & SQL records call_started + call_ended
    const pEndedBob = nextWsMessage(bobWs1, (m) => m.type === 'call:ended');
    aliceWs.send(JSON.stringify({ type: 'call:end', callId: created.callId }));
    const endedBob = await pEndedBob;
    assert.equal(endedBob.callId, created.callId);
    assert.equal(endedBob.reason, 'hangup');
    assert.ok(endedBob.durationSec >= 1);

    // Wait briefly for system message write to complete
    await new Promise((r) => setTimeout(r, 80));
    const list = await chatSvc.conversations(ctx, bob.me.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].last?.kind, 'system');
    assert.match(list[0].last?.text || '', /^call_ended:\d+$/);
  } finally {
    for (const s of sockets) {
      if (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING) {
        s.terminate();
      }
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await sql.close();
  }
});

