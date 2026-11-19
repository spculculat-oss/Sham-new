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
import {
  arenaVoteStore,
  extractArtifactsFromText,
  validateArenaVoteRequest,
} from '../server/shaheenArena';
import { buildArtifactPreviewHtml, verifyCodeSnippet } from '../src/utils/codeVerifier';
import type { AgentArtifact, AgentStreamEvent } from '../src/types/shaheenAgent';

const VENDORS = /gemini|deepseek|openai|chatgpt|gpt|claude|anthropic|openrouter|llama|qwen|google/i;

function makeToolCtx(collectedArtifacts: AgentArtifact[] = []): AgentToolContext {
  return {
    env: {},
    language: 'ar',
    catalogLoader: async () => undefined,
    fetchFn: fetch,
    collectedActions: [],
    collectedArtifacts,
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

test('validateAgentRequest rejects invalid bodies and accepts multimodal, agentMode, and activeArtifact payloads', () => {
  assert.throws(() => validateAgentRequest(null));
  assert.throws(() => validateAgentRequest({ message: '   ' }));
  const valid = validateAgentRequest({
    message: 'صمم عطر عود',
    language: 'ar',
    reasoningDepth: 'max',
    agentMode: 'architect',
    activeArtifact: {
      id: 'art-1',
      title: 'Formula Calculator',
      filename: 'calc.html',
      language: 'html',
      code: '<div><h1>Hello</h1></div>',
    },
    attachments: [{ name: 'bottle.jpg', mimeType: 'image/jpeg', data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD' }],
  });
  assert.equal(valid.reasoningDepth, 'max');
  assert.equal(valid.agentMode, 'architect');
  assert.equal(valid.activeArtifact?.filename, 'calc.html');
  assert.equal(valid.attachments.length, 1);
  assert.match(
    formatLabContextBlock({ activeTab: 'concentration', formulaTitle: 'عطر الشام', macerationDays: 35 }),
    /عطر الشام/,
  );
});

test('verifyCodeSnippet and buildArtifactPreviewHtml validate code, catch defects, and build offline previews', () => {
  const goodHtml = verifyCodeSnippet('html', '<!DOCTYPE html><html><body><main><h1>Test</h1></main><script>const x = 1 + 2;</script></body></html>');
  assert.equal(goodHtml.valid, true);
  assert.ok(goodHtml.score >= 90);

  const badJs = verifyCodeSnippet('javascript', 'function broken( { return 42;');
  assert.equal(badJs.valid, false);
  assert.ok(badJs.diagnostics.some((d) => d.level === 'error'));

  const sqlWarn = verifyCodeSnippet('sql', 'DROP TABLE users;\nDELETE FROM orders;');
  assert.ok(sqlWarn.diagnostics.some((d) => d.level === 'warning'));
  assert.ok(sqlWarn.score < 100);

  const jsonGood = verifyCodeSnippet('json', '{"status":"ok","items":[1,2,3]}');
  assert.equal(jsonGood.valid, true);

  const mermaidPreview = buildArtifactPreviewHtml({
    id: 'm1',
    title: 'Pipeline Flow',
    filename: 'flow.mmd',
    language: 'mermaid',
    summary: 'flow',
    code: 'flowchart TD\nA[Input] --> B[Verify]\nB --> C[Output]',
    runnable: true,
    createdAt: Date.now(),
  });
  assert.ok(mermaidPreview && mermaidPreview.includes('<svg') && mermaidPreview.includes('Verify'));

  const jsPreview = buildArtifactPreviewHtml({
    id: 'j1',
    title: 'Calc',
    filename: 'calc.js',
    language: 'javascript',
    summary: 'js',
    code: 'console.log(2 + 2);',
    runnable: true,
    createdAt: Date.now(),
  });
  assert.ok(jsPreview && jsPreview.includes('console.log(2 + 2)'));
});

test('software engineering tools plan tasks, generate verified artifacts, inspect code, and benchmark matrices', async () => {
  const collectedArtifacts: AgentArtifact[] = [];
  const ctx = makeToolCtx(collectedArtifacts);

  const planRes = await executeAgentTool(
    'plan_engineering_tasks',
    {
      goal: 'بناء حاسبة تركيز عطور تفاعلية',
      tasks: [
        { title: 'تصميم واجهة المدخلات', phase: 'design', status: 'done' },
        { title: 'برمجة معادلة التخفيف', phase: 'build', status: 'in_progress' },
        { title: 'التحقق من الحالات الحدية', phase: 'verify', status: 'pending' },
      ],
    },
    ctx,
  );
  assert.equal(planRes.result.planned, true);
  assert.ok(ctx.collectedPlan && ctx.collectedPlan.tasks.length === 3);

  const genRes = await executeAgentTool(
    'generate_code_artifact',
    {
      title: 'Interactive Dilution Calculator',
      filename: 'dilution-calc.html',
      language: 'html',
      summary: 'Single-file calculator with input guards',
      code: '<!DOCTYPE html><html><body><section><h1>Dilution</h1></section><script>function calc(v,p){return (v*p)/100;}</script></body></html>',
    },
    ctx,
  );
  assert.equal(genRes.result.created, true);
  assert.equal((genRes.result.verification as { valid: boolean }).valid, true);
  assert.equal(collectedArtifacts.length, 1);
  assert.equal(collectedArtifacts[0].runnable, true);

  const inspectRes = await executeAgentTool(
    'inspect_and_verify_code',
    { language: 'javascript', code: 'const sum = (a, b) => a + b;\nconsole.log(sum(3, 4));' },
    ctx,
  );
  assert.equal(inspectRes.result.valid, true);

  const benchRes = await executeAgentTool(
    'benchmark_solutions_matrix',
    {
      topic: 'Choose state storage for offline lab notes',
      options: [
        { name: 'IndexedDB', summary: 'Structured async DB', correctnessScore: 95, maintainabilityScore: 88, scalabilityScore: 96, speedScore: 90 },
        { name: 'localStorage', summary: 'Sync KV store', correctnessScore: 72, maintainabilityScore: 90, scalabilityScore: 45, speedScore: 85 },
      ],
    },
    ctx,
  );
  assert.equal(benchRes.result.winner, 'IndexedDB');
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

test('runShaheenAgent in arena mode runs parallel contenders, extracts verified artifacts, produces judge verdict, and leaks zero vendor names', async () => {
  let callIndex = 0;
  const fakeAi = {
    models: {
      generateContent: async (req: { config?: { responseMimeType?: string } }) => {
        callIndex += 1;
        // Judge call requests application/json
        if (req.config?.responseMimeType === 'application/json') {
          return {
            text: JSON.stringify({
              winner: 'b',
              verdictSummary: 'المسار ب قدّم بنية واجهة كاملة مع التحقق من المدخلات.',
              synthesisMarkdown: '### الحل المدمج النهائي\n\nتم دمج سرعة المسار أ مع دقة المسار ب.',
              scoreA: { accuracy: 86, architecture: 82, clarity: 88, completeness: 84, overall: 85 },
              scoreB: { accuracy: 94, architecture: 95, clarity: 91, completeness: 93, overall: 93 },
            }),
          };
        }
        // Contender responses
        if (callIndex === 1) {
          return {
            text: 'حل عملي سريع:\n```javascript\nfunction dilution(vol, pct) { return Number(((vol * pct) / 100).toFixed(2)); }\nconsole.log(dilution(100, 20));\n```',
          };
        }
        return {
          text: 'تصميم معماري متكامل:\n```html\n<!DOCTYPE html><html><body><div id="app"><h1>Lab Pro</h1></div><script>const ratio = 0.2; console.log(ratio);</script></body></html>\n```',
        };
      },
    },
  } as unknown as GoogleGenAI;

  const events: AgentStreamEvent[] = [];
  const result = await runShaheenAgent(
    { message: 'ابني أداة لحساب تركيز العطور', language: 'ar', agentMode: 'arena', reasoningDepth: 'deep' },
    { ai: fakeAi, env: { GEMINI_API_KEY: 'test-key' }, onEvent: (e) => events.push(e) },
  );

  assert.ok(result.arena, 'Arena battle result must be present');
  assert.equal(result.arena!.contenders.length, 2);
  assert.equal(result.arena!.winner, 'b');
  assert.ok(result.artifacts && result.artifacts.length >= 2, 'Artifacts extracted from both contenders');
  assert.ok(result.artifacts.every((a) => a.verification?.valid === true));
  assert.ok(events.some((e) => e.type === 'arena_start'));
  assert.ok(events.filter((e) => e.type === 'arena_contender').length === 2);
  assert.ok(events.some((e) => e.type === 'artifact'));
  assert.ok(events.some((e) => e.type === 'arena_judge'));
  assert.ok(events.some((e) => e.type === 'done'));

  assert.doesNotMatch(JSON.stringify({ reply: result.reply, arena: result.arena, steps: result.steps, engine: result.engine }), VENDORS);
  assert.equal(extractArtifactsFromText('```sham-formula\n{"concentrationPercent":20}\n```', 'a').length, 0);
});

test('validateArenaVoteRequest and arenaVoteStore tally and switch votes cleanly', () => {
  assert.throws(() => validateArenaVoteRequest({ battleId: 'x', vote: 'a' }));
  assert.throws(() => validateArenaVoteRequest({ battleId: 'arena-abc123', vote: 'invalid' }));

  const validVote = validateArenaVoteRequest({ battleId: 'arena-test-01', vote: 'b' });
  const t1 = arenaVoteStore.record(validVote.battleId, validVote.vote);
  assert.equal(t1.b, 1);

  const switched = validateArenaVoteRequest({ battleId: 'arena-test-01', vote: 'merged', prevVote: 'b' });
  const t2 = arenaVoteStore.record(switched.battleId, switched.vote, switched.prevVote);
  assert.equal(t2.b, 0);
  assert.equal(t2.merged, 1);
});
