/**
 * «حلبة شاهين للذكاء الاصطناعي والإنشاء البرمجي» — Parallel Dual-Track Arena Duel & Judge Synthesizer.
 *
 * Runs two independent specialist AI reasoning tracks in parallel:
 *   - Track A («المسار أ · المهندس التنفيذي» / Pragmatic Builder): fast, direct, runnable output
 *   - Track B («المسار ب · المعماري المعمّق» / Deep Systems Architect): edge-case rigor, modular architecture
 * Extracts & statically verifies generated code artifacts (`verifyCodeSnippet`), convenes
 * «شاهين المحكّم» (Judge & Merger) to score both contenders and synthesize the best-of-both
 * final solution, and tracks real visitor Arena votes (`POST /api/shaheen/arena/vote`).
 */
import { randomUUID } from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AgentArtifact,
  AgentArtifactLanguage,
  AgentRequestPayload,
  AgentStep,
  AgentStreamEvent,
  ArenaBattleResult,
  ArenaContenderResult,
  ArenaScoreBreakdown,
  ArenaVoteChoice,
  ArenaVoteTotals,
} from '../src/types/shaheenAgent';
import type { ModelEngineId } from './core/types';
import type { SupportedLanguage } from '../src/types/i18n';
import {
  defaultFilenameFor,
  normalizeArtifactLanguage,
  verifyCodeSnippet,
} from '../src/utils/codeVerifier';
import { normalizeMediaBlocks } from '../src/utils/mediaBlock';
import { stripOpeningGreeting } from '../src/utils/shaheenText';
import { callEngine, engineStatuses } from './core/engines';
import { ChatError, systemInstruction } from './shaheen';
import { supervisorGuidance } from './core/liveData';

type Env = Record<string, string | undefined>;

const AGENT_MODEL = 'gemini-4-hydrogen';
const VENDOR_SCRUB = /\b(?:gemini|google|openai|chat ?gpt|gpt-?\d*|claude|anthropic|deepseek|openrouter|llama|qwen|mistral)\b/gi;

function scrub(text: string): string {
  return text.replace(VENDOR_SCRUB, 'نظام المعمل').replace(/\s{2,}/g, ' ').trim();
}

const VALID_VOTES: readonly ArenaVoteChoice[] = ['a', 'b', 'tie', 'merged'];

class BoundedVoteStore {
  private map = new Map<string, ArenaVoteTotals>();

  record(battleId: string, vote: ArenaVoteChoice, prevVote?: ArenaVoteChoice): ArenaVoteTotals {
    if (!this.map.has(battleId)) {
      if (this.map.size >= 500) {
        const oldest = this.map.keys().next().value;
        if (oldest) this.map.delete(oldest);
      }
      this.map.set(battleId, { a: 0, b: 0, tie: 0, merged: 0 });
    }
    const totals = { ...this.map.get(battleId)! };
    if (prevVote && totals[prevVote] > 0) totals[prevVote] -= 1;
    totals[vote] += 1;
    this.map.set(battleId, totals);
    return totals;
  }

  get(battleId: string): ArenaVoteTotals {
    return this.map.get(battleId) || { a: 0, b: 0, tie: 0, merged: 0 };
  }
}

export const arenaVoteStore = new BoundedVoteStore();

export function validateArenaVoteRequest(body: unknown): {
  battleId: string;
  vote: ArenaVoteChoice;
  prevVote?: ArenaVoteChoice;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ChatError(400, 'INVALID_REQUEST', 'A JSON object is required');
  }
  const { battleId, vote, prevVote } = body as Record<string, unknown>;
  if (typeof battleId !== 'string' || !/^[a-zA-Z0-9_-]{6,80}$/.test(battleId.trim())) {
    throw new ChatError(400, 'INVALID_BATTLE_ID', 'Valid battleId is required');
  }
  if (typeof vote !== 'string' || !VALID_VOTES.includes(vote as ArenaVoteChoice)) {
    throw new ChatError(400, 'INVALID_VOTE', 'Vote must be a, b, tie, or merged');
  }
  const safePrev =
    typeof prevVote === 'string' && VALID_VOTES.includes(prevVote as ArenaVoteChoice)
      ? (prevVote as ArenaVoteChoice)
      : undefined;
  return { battleId: battleId.trim(), vote: vote as ArenaVoteChoice, prevVote: safePrev };
}

const CODE_FENCE_RE = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
const IGNORED_FENCES = new Set(['sham-formula', 'sham-media', 'sham-tool', '']);

export function extractArtifactsFromText(
  text: string,
  contenderId: 'a' | 'b' | 'merged',
  languageHint?: SupportedLanguage,
): AgentArtifact[] {
  const artifacts: AgentArtifact[] = [];
  let idx = 0;
  for (const match of text.matchAll(CODE_FENCE_RE)) {
    const rawLang = (match[1] || '').trim().toLowerCase();
    const code = (match[2] || '').trim();
    if (!code || code.length < 16 || IGNORED_FENCES.has(rawLang)) continue;
    // Skip raw JSON unless it looks like a real schema/config (> 80 chars and not an internal formula block)
    if (rawLang === 'json' && (code.length < 80 || /"concentrationPercent"|"pyramidNotes"/.test(code))) continue;

    const lang: AgentArtifactLanguage = normalizeArtifactLanguage(rawLang);
    const titleBase =
      languageHint === 'ar' || languageHint === 'fa'
        ? `مكوّن برمجي (${lang.toUpperCase()}) #${++idx}`
        : `Generated ${lang.toUpperCase()} Artifact #${++idx}`;
    const filename = defaultFilenameFor(lang, `${contenderId}-${lang}-${idx}`);
    const verification = verifyCodeSnippet(lang, code);

    artifacts.push({
      id: `art-${contenderId}-${idx}-${randomUUID().slice(0, 6)}`,
      title: titleBase,
      filename,
      language: lang,
      summary: `${lang.toUpperCase()} · ${verification.metrics.lines} lines · score ${verification.score}/100`,
      code,
      ...(lang === 'html' ? { previewHtml: code } : {}),
      runnable: lang === 'html' || lang === 'svg' || lang === 'mermaid' || lang === 'javascript',
      verification,
      contenderId,
      createdAt: Date.now(),
    });
  }
  return artifacts.slice(0, 4);
}

function defaultClient(env: Env): GoogleGenAI | undefined {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey || /^MY_|placeholder/i.test(apiKey)) return undefined;
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

function clampScore(n: unknown, fallback = 82): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(40, Math.min(100, Math.round(v)));
}

function computeHeuristicScore(reply: string, artifacts: AgentArtifact[]): ArenaScoreBreakdown {
  const len = reply.trim().length;
  const hasStructure = /(^#{1,3}\s|\n\d+\.|```)/m.test(reply);
  const validArtifacts = artifacts.filter((a) => a.verification?.valid !== false).length;
  const brokenArtifacts = artifacts.filter((a) => a.verification?.valid === false).length;

  const accuracy = Math.min(96, Math.max(68, 78 + validArtifacts * 6 - brokenArtifacts * 14));
  const architecture = Math.min(97, Math.max(66, (hasStructure ? 82 : 72) + validArtifacts * 5));
  const clarity = Math.min(96, Math.max(70, len > 180 ? 84 : 74));
  const completeness = Math.min(96, Math.max(68, len > 450 ? 86 : 75));
  const overall = Math.round((accuracy + architecture + clarity + completeness) / 4);
  return { accuracy, architecture, clarity, completeness, overall };
}

export interface ArenaRunResult {
  reply: string;
  steps: AgentStep[];
  artifacts: AgentArtifact[];
  arena: ArenaBattleResult;
  engine: {
    id: string;
    name: string;
    badge: string;
    provider: 'shaheen';
    accentColor: string;
  };
}

export async function runShaheenArena(
  input: AgentRequestPayload,
  options: {
    env?: Env;
    ai?: GoogleGenAI;
    fetchFn?: typeof fetch;
    signal?: AbortSignal;
    onEvent?: (event: AgentStreamEvent) => void;
    extraInstruction?: string;
    labContextBlock?: string;
  } = {},
): Promise<ArenaRunResult> {
  const env = options.env || process.env;
  const fetchFn = options.fetchFn || fetch;
  const emit = options.onEvent || (() => {});
  const ar = input.language === 'ar' || input.language === 'fa';
  const battleId = `arena-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;

  const ai = options.ai || defaultClient(env);
  const configuredSecondary: ModelEngineId[] = engineStatuses(env)
    .filter((s) => s.configured && s.id !== 'gemini' && s.id !== 'sham_local')
    .map((s) => s.id as ModelEngineId);

  if (!ai && !configuredSecondary.length) {
    throw new ChatError(503, 'PROVIDER_NOT_CONFIGURED', 'AI service key is not configured on server');
  }

  const labelA = ar ? 'المسار أ · المهندس التنفيذي' : 'Track A · Pragmatic Builder';
  const styleA = ar ? 'تنفيذ عملي مباشر وكود قابل للتشغيل فوراً' : 'Direct runnable execution & speed';
  const labelB = ar ? 'المسار ب · المعماري المعمّق' : 'Track B · Deep Systems Architect';
  const styleB = ar ? 'هندسة متقدمة، معالجة الحالات الحدية، وأقصى دقة' : 'Deep architecture, edge cases & rigor';

  const steps: AgentStep[] = [];
  let stepCounter = 0;

  emit({
    type: 'arena_start',
    battleId,
    contenders: [
      { id: 'a', label: labelA, styleTag: styleA },
      { id: 'b', label: labelB, styleTag: styleB },
    ],
  });

  const arenaStepId = `step-${++stepCounter}`;
  steps.push({
    id: arenaStepId,
    kind: 'arena',
    tool: 'arena_duel',
    label: ar ? 'تشغيل مساري الحلبة بالتوازي (أ مقابل ب)' : 'Running Dual Arena Contenders in Parallel (A vs B)',
    status: 'running',
  });
  emit({
    type: 'tool_call',
    stepId: arenaStepId,
    tool: 'arena_duel',
    label: steps[0].label,
  });

  const baseSystem =
    systemInstruction(input.language, options.extraInstruction || '', 'deep') +
    (await supervisorGuidance('shaheen_chat', env).catch(() => '')) +
    (options.labContextBlock || '');

  const artifactContextNote = (input as any).activeArtifact
    ? `\n\n[ACTIVE CODE ARTIFACT CONTEXT]\nFilename: ${(input as any).activeArtifact.filename} (${(input as any).activeArtifact.language})\n\`\`\`${(input as any).activeArtifact.language}\n${String((input as any).activeArtifact.code || '').slice(0, 8000)}\n\`\`\``
    : '';

  const softwareCapDirective = `
- You also operate as a Principal Software & Perfumery Systems Architect.
- When asked to build software, UI apps, calculators, charts, APIs, algorithms, SQL schemas, or Mermaid architecture diagrams, provide COMPLETE, production-grade code inside labeled fenced blocks (\`\`\`html, \`\`\`tsx, \`\`\`typescript, \`\`\`javascript, \`\`\`python, \`\`\`sql, \`\`\`mermaid, or \`\`\`svg).
- When building interactive UIs, widgets, dashboards, or visual calculators, prefer complete self-contained HTML5 + modern CSS + Vanilla JS inside a single \`\`\`html block so the live Arena sandbox executes it cleanly offline.
- For perfumery questions, include exact weights/ratios and canonical \`\`\`sham-formula when designing a fragrance.`;

  const sysA =
    baseSystem +
    softwareCapDirective +
    `\n[ARENA PERSONA: PRAGMATIC BUILDER]\nDeliver the sharpest, most practical, cleanly structured, immediately runnable solution with minimal fluff.`;

  const sysB =
    baseSystem +
    softwareCapDirective +
    `\n[ARENA PERSONA: DEEP SYSTEMS ARCHITECT]\nDeliver a modular, edge-case-hardened, thoroughly verified architecture and formulation/code design with clear trade-offs and safety/performance guarantees.`;

  const userPrompt = `${input.message}${artifactContextNote}`;
  const history = (input.conversationHistory || []).slice(-10);

  const runGeminiTrack = async (
    system: string,
    thinkingLevel: ThinkingLevel,
  ): Promise<string> => {
    if (!ai) throw new Error('Primary client missing');
    const contents = [
      ...history.map((h: { role: 'user' | 'assistant'; text: string }) => ({
        role: h.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: h.text }],
      })),
      { role: 'user' as const, parts: [{ text: userPrompt }] },
    ];
    const res = await ai.models.generateContent({
      model: AGENT_MODEL,
      contents,
      config: {
        systemInstruction: system,
        thinkingConfig: { thinkingLevel },
      },
    });
    const parts = res.candidates?.[0]?.content?.parts || [];
    const text =
      parts
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('')
        .trim() || (res.text || '').trim();
    if (!text) throw new Error('Empty contender response');
    return text;
  };

  const runSecondaryTrack = async (system: string): Promise<string> => {
    const useSecondaryEngine = !options.ai && configuredSecondary.length > 0;
    if (useSecondaryEngine) {
      for (const engineId of configuredSecondary) {
        try {
          const text = await callEngine(
            engineId,
            system,
            [...history, { role: 'user', text: userPrompt }],
            {
              env,
              fetch: fetchFn,
              temperature: 0.55,
              maxTokens: 2800,
              signal: AbortSignal.any([
                options.signal || AbortSignal.timeout(35_000),
                AbortSignal.timeout(25_000),
              ]),
            },
          );
          if (text?.trim()) return text.trim();
        } catch {
          // try next engine or fall back to high-thinking primary
        }
      }
    }
    return runGeminiTrack(system, ThinkingLevel.XHIGH);
  };

  const startParallel = Date.now();
  const [resA, resB] = await Promise.allSettled([
    (async () => {
      const t0 = Date.now();
      const raw = ai ? await runGeminiTrack(sysA, ThinkingLevel.MEDIUM) : await runSecondaryTrack(sysA);
      const reply = stripOpeningGreeting(normalizeMediaBlocks(scrub(raw)), input.message);
      const artifacts = extractArtifactsFromText(reply, 'a', input.language);
      return { reply, artifacts, ms: Date.now() - t0 };
    })(),
    (async () => {
      const t0 = Date.now();
      const raw = await runSecondaryTrack(sysB);
      const reply = stripOpeningGreeting(normalizeMediaBlocks(scrub(raw)), input.message);
      const artifacts = extractArtifactsFromText(reply, 'b', input.language);
      return { reply, artifacts, ms: Date.now() - t0 };
    })(),
  ]);

  const ansA = resA.status === 'fulfilled' ? resA.value : undefined;
  const ansB = resB.status === 'fulfilled' ? resB.value : undefined;

  if (!ansA && !ansB) {
    throw new ChatError(503, 'PROVIDER_UNAVAILABLE', 'Both Arena contenders failed to respond');
  }

  const finalA = ansA || {
    reply: ansB!.reply,
    artifacts: [],
    ms: ansB!.ms,
  };
  const finalB = ansB || {
    reply: ansA!.reply,
    artifacts: [],
    ms: ansA!.ms,
  };

  const defaultScoreA = computeHeuristicScore(finalA.reply, finalA.artifacts);
  const defaultScoreB = computeHeuristicScore(finalB.reply, finalB.artifacts);

  steps[0].status = 'done';
  steps[0].durationMs = Date.now() - startParallel;
  steps[0].detail = `${finalA.ms}ms / ${finalB.ms}ms`;
  emit({
    type: 'tool_result',
    stepId: arenaStepId,
    tool: 'arena_duel',
    status: 'done',
    detail: steps[0].detail,
    durationMs: steps[0].durationMs,
  });

  // Judge & Merge Phase
  const judgeStepId = `step-${++stepCounter}`;
  steps.push({
    id: judgeStepId,
    kind: 'arena',
    tool: 'arena_judge',
    label: ar ? 'تحكيم «شاهين المحكّم» ودمج الحل الأفضل' : 'Shahin Judge Evaluation & Best-of-Both Synthesis',
    status: 'running',
  });
  emit({
    type: 'tool_call',
    stepId: judgeStepId,
    tool: 'arena_judge',
    label: steps[1].label,
  });

  const judgeStart = Date.now();
  let winner: 'a' | 'b' | 'tie' =
    defaultScoreB.overall > defaultScoreA.overall + 2
      ? 'b'
      : defaultScoreA.overall > defaultScoreB.overall + 2
        ? 'a'
        : 'tie';
  let scoreA = defaultScoreA;
  let scoreB = defaultScoreB;
  let strengthsA: string[] = ar
    ? ['وضوح التنفيذ المباشر', 'سرعة الصياغة العملية']
    : ['Clear direct execution', 'Fast practical solution'];
  let strengthsB: string[] = ar
    ? ['عمق معماري وتغطية الحالات الحدية', 'تحقق وبنية معيارية متماسكة']
    : ['Deep modular architecture', 'Edge-case & verification rigor'];
  let judgeSummary = ar
    ? 'تم تقييم المسارين ودمج أقوى المكونات البرمجية والتقنية في الحل النهائي الموحد.'
    : 'Both tracks were evaluated and merged into a unified best-of-both engineering synthesis.';
  let synthesizedReply = '';

  const judgePrompt = `Evaluate both AI contenders fairly and synthesize ONE superior unified final answer in ${input.language}.
USER REQUEST:
${input.message}

CONTENDER A (${labelA}) [Verification artifacts: ${finalA.artifacts.length}]:
${finalA.reply.slice(0, 6000)}

CONTENDER B (${labelB}) [Verification artifacts: ${finalB.artifacts.length}]:
${finalB.reply.slice(0, 6000)}

Return JSON strictly matching the schema.`;

  if (ai) {
    try {
      const judgeRes = await ai.models.generateContent({
        model: AGENT_MODEL,
        contents: [{ role: 'user', parts: [{ text: judgePrompt }] }],
        config: {
          systemInstruction: `You are Shahin Judge («شاهين المحكّم»). Compare Contender A and Contender B strictly on engineering merit, correctness, completeness, and clarity. NEVER mention AI model or vendor names. Produce a synthesizedReply that combines the strongest code/formulas from both without redundancy.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              winner: { type: Type.STRING, description: 'a, b, or tie' },
              judgeSummary: { type: Type.STRING },
              scoreA: {
                type: Type.OBJECT,
                properties: {
                  accuracy: { type: Type.NUMBER },
                  architecture: { type: Type.NUMBER },
                  clarity: { type: Type.NUMBER },
                  completeness: { type: Type.NUMBER },
                },
              },
              scoreB: {
                type: Type.OBJECT,
                properties: {
                  accuracy: { type: Type.NUMBER },
                  architecture: { type: Type.NUMBER },
                  clarity: { type: Type.NUMBER },
                  completeness: { type: Type.NUMBER },
                },
              },
              strengthsA: { type: Type.ARRAY, items: { type: Type.STRING } },
              strengthsB: { type: Type.ARRAY, items: { type: Type.STRING } },
              synthesizedReply: { type: Type.STRING },
            },
            required: ['winner', 'judgeSummary', 'synthesizedReply'],
          },
        },
      });

      const rawJson = (judgeRes.text || '').trim();
      const parsed = JSON.parse(rawJson.slice(rawJson.indexOf('{'), rawJson.lastIndexOf('}') + 1));
      if (parsed.winner === 'a' || parsed.winner === 'b' || parsed.winner === 'tie') {
        winner = parsed.winner;
      }
      if (typeof parsed.judgeSummary === 'string' && parsed.judgeSummary.trim()) {
        judgeSummary = scrub(parsed.judgeSummary.trim());
      }
      if (parsed.scoreA) {
        const acc = clampScore(parsed.scoreA.accuracy, defaultScoreA.accuracy);
        const arch = clampScore(parsed.scoreA.architecture, defaultScoreA.architecture);
        const clar = clampScore(parsed.scoreA.clarity, defaultScoreA.clarity);
        const comp = clampScore(parsed.scoreA.completeness, defaultScoreA.completeness);
        scoreA = { accuracy: acc, architecture: arch, clarity: clar, completeness: comp, overall: Math.round((acc + arch + clar + comp) / 4) };
      }
      if (parsed.scoreB) {
        const acc = clampScore(parsed.scoreB.accuracy, defaultScoreB.accuracy);
        const arch = clampScore(parsed.scoreB.architecture, defaultScoreB.architecture);
        const clar = clampScore(parsed.scoreB.clarity, defaultScoreB.clarity);
        const comp = clampScore(parsed.scoreB.completeness, defaultScoreB.completeness);
        scoreB = { accuracy: acc, architecture: arch, clarity: clar, completeness: comp, overall: Math.round((acc + arch + clar + comp) / 4) };
      }
      if (Array.isArray(parsed.strengthsA) && parsed.strengthsA.length) {
        strengthsA = parsed.strengthsA.slice(0, 3).map((s: unknown) => scrub(String(s)));
      }
      if (Array.isArray(parsed.strengthsB) && parsed.strengthsB.length) {
        strengthsB = parsed.strengthsB.slice(0, 3).map((s: unknown) => scrub(String(s)));
      }
      if (typeof parsed.synthesizedReply === 'string' && parsed.synthesizedReply.trim()) {
        synthesizedReply = stripOpeningGreeting(normalizeMediaBlocks(scrub(parsed.synthesizedReply.trim())), input.message);
      }
    } catch {
      // Fallback cleanly to winner's best answer if mock or strict JSON parse skipped
    }
  }

  if (!synthesizedReply) {
    synthesizedReply = winner === 'a' ? finalA.reply : finalB.reply;
  }

  const mergedArtifactsFromJudge = extractArtifactsFromText(synthesizedReply, 'merged', input.language);
  const synthesizedArtifacts = mergedArtifactsFromJudge.length
    ? mergedArtifactsFromJudge
    : winner === 'a'
      ? finalA.artifacts
      : finalB.artifacts;

  const allArtifacts: AgentArtifact[] = [
    ...finalA.artifacts,
    ...finalB.artifacts,
    ...synthesizedArtifacts.filter((sa) => !finalA.artifacts.some((fa) => fa.id === sa.id) && !finalB.artifacts.some((fb) => fb.id === sa.id)),
  ].slice(0, 8);

  const judgeDuration = Date.now() - judgeStart;
  steps[1].status = 'done';
  steps[1].durationMs = judgeDuration;
  steps[1].detail = judgeSummary.slice(0, 140);

  emit({
    type: 'tool_result',
    stepId: judgeStepId,
    tool: 'arena_judge',
    status: 'done',
    detail: steps[1].detail,
    durationMs: judgeDuration,
  });

  const contenders: ArenaContenderResult[] = [
    {
      id: 'a',
      label: labelA,
      styleTag: styleA,
      reply: finalA.reply,
      artifacts: finalA.artifacts,
      durationMs: finalA.ms,
      score: scoreA,
      strengths: strengthsA,
    },
    {
      id: 'b',
      label: labelB,
      styleTag: styleB,
      reply: finalB.reply,
      artifacts: finalB.artifacts,
      durationMs: finalB.ms,
      score: scoreB,
      strengths: strengthsB,
    },
  ];

  for (const c of contenders) {
    emit({ type: 'arena_contender', contender: c });
  }
  for (const art of allArtifacts) {
    emit({ type: 'artifact', artifact: art });
  }
  emit({ type: 'arena_judge', winner, judgeSummary });

  const chunkSize = 90;
  for (let i = 0; i < synthesizedReply.length; i += chunkSize) {
    emit({ type: 'chunk', text: synthesizedReply.slice(i, i + chunkSize) });
  }

  const arena: ArenaBattleResult = {
    battleId,
    contenders,
    winner,
    judgeSummary,
    synthesizedReply,
    synthesizedArtifacts,
    voteTotals: arenaVoteStore.get(battleId),
  };

  const engine = {
    id: 'arena',
    name: ar ? 'الخبير شاهين · حلبة التنافس والإنشاء البرمجي' : 'Master Shahin · Arena AI Agent',
    badge: ar ? '⚔️ حلبة شاهين' : '⚔️ Arena AI Agent',
    provider: 'shaheen' as const,
    accentColor: 'amber',
  };

  emit({
    type: 'done',
    reply: synthesizedReply,
    steps,
    sources: [],
    actions: [],
    artifacts: allArtifacts,
    arena,
    engine,
  });

  return {
    reply: synthesizedReply,
    steps,
    artifacts: allArtifacts,
    arena,
    engine,
  };
}
