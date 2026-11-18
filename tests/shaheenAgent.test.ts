import test from 'node:test';
import assert from 'node:assert/strict';
import type { GoogleGenAI } from '@google/genai';
import {
  executeAgentTool,
  formatLabContextBlock,
  runShaheenAgent,
  scrubVendorText,
  validateAgentRequest,
  type AgentToolContext,
} from '../server/shaheenAgent';
import type { AgentStreamEvent } from '../src/types/shaheenAgent';

const VENDORS = /gemini|deepseek|openai|chatgpt|gpt|claude|anthropic|openrouter|llama|qwen|google/i;

function makeToolCtx(): AgentToolContext {
  return {
    env: {},
    language: 'ar',
    catalogLoader: async () => undefined,
    fetchFn: fetch,
    collectedActions: [],
  };
}

test('calculate_perfume_formulation and calculate_alcohol_dilution tools produce exact lab figures', async () => {
  const ctx = makeToolCtx();
  const fRes = await executeAgentTool(
    'calculate_perfume_formulation',
    { bottleVolumeMl: 100, concentrationPercent: 20, batchCount: 5, fixativePercent: 2, waterPercent: 0 },
    ctx,
  );
  const perBottle = fRes.result.perBottle as Record<string, number>;
  assert.equal(perBottle.oilMl, 20);
  assert.equal(perBottle.fixativeMl, 2);
  assert.equal(perBottle.alcoholMl, 78);
  assert.equal((fRes.result.batchTotals as Record<string, number>).totalVolumeMl, 500);

  const dRes = await executeAgentTool(
    'calculate_alcohol_dilution',
    { initialAlcoholPercent: 96, targetAlcoholPercent: 72, targetVolumeMl: 1000 },
    ctx,
  );
  assert.equal(dRes.result.isValid, true);
  assert.equal(dRes.result.pureAlcoholMlNeeded, 750);
  assert.equal(dRes.result.distilledWaterMlNeeded, 250);
});

test('search_raw_materials, search_perfume_library, search_sham_store, and plan_maceration_schedule return real datasets', async () => {
  const ctx = makeToolCtx();
  const rawRes = await executeAgentTool('search_raw_materials', { query: 'bergamot', limit: 3 }, ctx);
  assert.ok(Number(rawRes.result.count) >= 1);

  const libRes = await executeAgentTool('search_perfume_library', { query: 'baccarat', limit: 3 }, ctx);
  assert.ok(Number(libRes.result.count) >= 1);

  const storeRes = await executeAgentTool('search_sham_store', { query: 'عود فاخر', limit: 3 }, ctx);
  assert.ok(Array.isArray(storeRes.result.products));
  assert.ok((storeRes.result.products as unknown[]).length >= 1);

  const macRes = await executeAgentTool(
    'plan_maceration_schedule',
    { concentrationType: 'extrait', fragranceFamily: 'oriental oud', containsVanillaOrResin: true },
    ctx,
  );
  assert.ok(Number(macRes.result.recommendedDays) >= 42);
  assert.ok(Array.isArray(macRes.result.phases));
});

test('dispatch_app_action collects validated lab action and sanitizes vendor names', async () => {
  const ctx = makeToolCtx();
  const res = await executeAgentTool(
    'dispatch_app_action',
    {
      actionType: 'apply_formula',
      label: 'تطبيق عطر المساء',
      title: 'مساء دمشق',
      concentrationPercent: 22,
      concentrationType: 'edp',
      bottleVolumeMl: 50,
      pyramidNotes: [
        { nameAr: 'برغموت', category: 'top', percentageOfOil: 20 },
        { nameAr: 'ورد طائفي', category: 'heart', percentageOfOil: 40 },
        { nameAr: 'دهن عود', category: 'base', percentageOfOil: 40 },
      ],
    },
    ctx,
  );
  assert.equal(res.result.queued, true);
  assert.equal(ctx.collectedActions.length, 1);
  assert.equal(ctx.collectedActions[0].formula?.concentrationPercent, 22);
  assert.equal(ctx.collectedActions[0].formula?.pyramidNotes.length, 3);
  assert.doesNotMatch(scrubVendorText('Gemini powered by Google'), VENDORS);
});

test('validateAgentRequest rejects invalid bodies and accepts valid multimodal payloads', () => {
  assert.throws(() => validateAgentRequest(null));
  assert.throws(() => validateAgentRequest({ message: '   ' }));
  const valid = validateAgentRequest({
    message: 'صمم عطر عود',
    language: 'ar',
    reasoningDepth: 'max',
    attachments: [{ name: 'bottle.jpg', mimeType: 'image/jpeg', data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD' }],
  });
  assert.equal(valid.reasoningDepth, 'max');
  assert.equal(valid.attachments.length, 1);
  assert.match(
    formatLabContextBlock({ activeTab: 'concentration', formulaTitle: 'عطر الشام', macerationDays: 35 }),
    /عطر الشام/,
  );
});

test('runShaheenAgent executes multi-step ReAct tool calls, preserves thought signatures, streams SSE events, and leaks zero vendor strings', async () => {
  const sentContentsSnapshots: unknown[] = [];
  let turn = 0;

  const fakeAi = {
    models: {
      generateContent: async (req: { contents: unknown[] }) => {
        sentContentsSnapshots.push(JSON.parse(JSON.stringify(req.contents)));
        turn += 1;
        if (turn === 1) {
          const fc = {
            id: 'fc-1',
            name: 'calculate_perfume_formulation',
            args: { bottleVolumeMl: 50, concentrationPercent: 20 },
          };
          return {
            functionCalls: [fc],
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [
                    { thought: true, text: 'Need exact weights for 50ml EDP before replying.' },
                    { functionCall: fc, thoughtSignature: 'sig_abc_123' },
                  ],
                },
                groundingMetadata: {
                  groundingChunks: [{ web: { uri: 'https://example.org/perfume-notes', title: 'Perfumery Guide' } }],
                },
              },
            ],
          };
        }
        return {
          text: 'الكمية الدقيقة لزجاجة 50 مل بتركيز 20% هي 9.2 جرام زيت عطري.',
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'الكمية الدقيقة لزجاجة 50 مل بتركيز 20% هي 9.2 جرام زيت عطري.' }],
              },
            },
          ],
        };
      },
    },
  } as unknown as GoogleGenAI;

  const events: AgentStreamEvent[] = [];
  const result = await runShaheenAgent(
    { message: 'احسب 50 مل تركيز 20%', language: 'ar', reasoningDepth: 'max' },
    { ai: fakeAi, env: { GEMINI_API_KEY: 'test-key' }, onEvent: (e) => events.push(e) },
  );

  assert.equal(turn, 2);
  assert.match(result.reply, /9\.2/);
  assert.ok(result.steps.some((s) => s.tool === 'calculate_perfume_formulation' && s.status === 'done'));
  assert.equal(result.sources.length, 1);
  assert.ok(events.some((e) => e.type === 'tool_call'));
  assert.ok(events.some((e) => e.type === 'tool_result'));
  assert.ok(events.some((e) => e.type === 'done'));

  // Verify thoughtSignature preserved on second turn
  const secondTurnContents = sentContentsSnapshots[1] as { role: string; parts: Record<string, unknown>[] }[];
  const modelPartWithSig = secondTurnContents.find((c) => c.role === 'model')?.parts.find((p) => p.thoughtSignature === 'sig_abc_123');
  assert.ok(modelPartWithSig, 'Must preserve thoughtSignature across ReAct tool turns');

  // Verify visitor-facing engine metadata and step labels leak no AI vendor names
  assert.doesNotMatch(JSON.stringify({ engine: result.engine, steps: result.steps }), VENDORS);
});
