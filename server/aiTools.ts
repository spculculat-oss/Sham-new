import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { RateLimiter, clientKey } from './core/rateLimit';

interface HarmonyNoteInput {
  nameAr?: string;
  nameEn?: string;
  category: 'top' | 'heart' | 'base';
  percentageOfOil: number;
}

const VALID_VERDICTS = new Set(['balanced', 'needs_bridge', 'top_heavy', 'base_heavy', 'clashing']);
const harmonyLimiter = new RateLimiter(24, 15 * 60_000);

export function createAiToolsRouter() {
  const router = express.Router();

  // Initialize GoogleGenAI SDK with environment key and required User-Agent
  const getAi = () => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      const err: any = new Error('GEMINI_API_KEY is not configured on server');
      err.status = 503;
      err.code = 'MISSING_API_KEY';
      throw err;
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  };

  /**
   * Olfactory Harmony Analysis using model: gemini-4-hydrogen
   * Evaluates current pyramid notes, concentration, and maceration state via structured JSON schema.
   */
  router.post('/ai/harmony', async (req, res) => {
    try {
      if (!harmonyLimiter.allow(clientKey(req))) {
        res.status(429).json({
          error: 'Too many harmony analysis requests. Please wait a few minutes.',
          code: 'RATE_LIMITED',
        });
        return;
      }

      const body = req.body || {};
      const rawNotes = Array.isArray(body.notes) ? body.notes : [];
      const sanitizedNotes: HarmonyNoteInput[] = rawNotes
        .slice(0, 40)
        .filter((item: any) => item && typeof item === 'object')
        .map((item: any): HarmonyNoteInput => {
          const category = item.category === 'top' || item.category === 'heart' || item.category === 'base'
            ? item.category
            : 'heart';
          const pct = Number(item.percentageOfOil);
          return {
            nameAr: typeof item.nameAr === 'string' ? item.nameAr.trim().slice(0, 80) : '',
            nameEn: typeof item.nameEn === 'string' ? item.nameEn.trim().slice(0, 80) : '',
            category,
            percentageOfOil: Number.isFinite(pct) ? Math.min(100, Math.max(0, Number(pct.toFixed(2)))) : 0,
          };
        })
        .filter((n: HarmonyNoteInput) => n.nameAr!.length > 0 || (n.nameEn !== undefined && n.nameEn.length > 0));

      if (sanitizedNotes.length === 0) {
        res.status(400).json({
          error: 'At least one fragrance note in the lab is required for harmony analysis.',
          code: 'EMPTY_NOTES',
        });
        return;
      }

      const language = typeof body.language === 'string' && body.language.trim()
        ? body.language.trim().slice(0, 10)
        : 'ar';
      const formulaTitle = typeof body.formulaTitle === 'string' && body.formulaTitle.trim()
        ? body.formulaTitle.trim().slice(0, 120)
        : 'Lab Accord';
      const macerationDays = Number.isFinite(Number(body.macerationDays))
        ? Math.min(365, Math.max(0, Math.round(Number(body.macerationDays))))
        : 30;
      const f = body.formulation && typeof body.formulation === 'object' ? body.formulation : {};
      const concPct = Number.isFinite(Number(f.concentrationPercent)) ? Number(f.concentrationPercent) : 20;
      const concType = typeof f.concentrationType === 'string' ? f.concentrationType.trim().slice(0, 40) : 'EDP';
      const bottleVol = Number.isFinite(Number(f.bottleVolumeMl)) ? Number(f.bottleVolumeMl) : 50;
      const fixativePct = Number.isFinite(Number(f.fixativePercent)) ? Number(f.fixativePercent) : 0;
      const alcoholPct = Number.isFinite(Number(f.alcoholPercentage)) ? Number(f.alcoholPercentage) : 96;

      const tierTotals = sanitizedNotes.reduce(
        (acc, note) => {
          acc[note.category] = +(acc[note.category] + note.percentageOfOil).toFixed(2);
          acc.total = +(acc.total + note.percentageOfOil).toFixed(2);
          return acc;
        },
        { top: 0, heart: 0, base: 0, total: 0 },
      );

      const notesSummary = sanitizedNotes
        .map((n) => {
          const label = [n.nameAr, n.nameEn].filter(Boolean).join(' / ');
          return `- [${n.category.toUpperCase()}] ${label}: ${n.percentageOfOil}%`;
        })
        .join('\n');

      const langNames: Record<string, string> = {
        ar: 'Arabic',
        en: 'English',
        fr: 'French',
        es: 'Spanish',
        it: 'Italian',
        de: 'German',
        ru: 'Russian',
        zh: 'Chinese (Simplified)',
        tr: 'Turkish',
        fa: 'Persian',
      };
      const targetLanguageName = langNames[language] || 'English';

      const ai = getAi();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          `Evaluate the olfactory harmony, pyramid balance, chemical accord bridges, and maturation profile of this active perfume lab formula.
Write ALL descriptive text fields strictly in ${targetLanguageName}.

Formula Title: ${formulaTitle}
Concentration: ${concPct}% (${concType}), Bottle: ${bottleVol} ml, Alcohol: ${alcoholPct}%, Fixative: ${fixativePct}%, Maceration: ${macerationDays} days
Tier Totals (of aromatic oil): Top=${tierTotals.top}%, Heart=${tierTotals.heart}%, Base=${tierTotals.base}% (Total=${tierTotals.total}%)

Active Lab Notes:
${notesSummary}`,
        ],
        config: {
          systemInstruction:
            'You are a senior master perfumer and fragrance formulation chemist. Analyze the exact user-provided pyramid notes, percentages, and carrier parameters. Be honest, precise, and scientific: identify real note synergies, volatility gaps, overdoses/clashes, missing heart bridges, and actionable bridge additions without inventing fake lab test numbers or naming AI vendors.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              harmonyScore: {
                type: Type.INTEGER,
                description: 'Overall olfactory harmony score from 0 to 100 based on pyramid ratio balance, accords cohesion, and volatility continuity.',
              },
              verdictStatus: {
                type: Type.STRING,
                enum: ['balanced', 'needs_bridge', 'top_heavy', 'base_heavy', 'clashing'],
                description: 'Structural classification of the current formula harmony.',
              },
              olfactoryProfile: {
                type: Type.STRING,
                description: 'Concise fragrance family and character label (e.g., Woody Amber Spicy).',
              },
              executiveSummary: {
                type: Type.STRING,
                description: '2-3 crisp sentences summarizing the formula harmony, character, and pyramid structure.',
              },
              volatilityCurveSummary: {
                type: Type.STRING,
                description: 'How the composition evolves across Opening (0-20m), Heart (20m-3h), and Dry-down (3h+).',
              },
              tierAssessment: {
                type: Type.OBJECT,
                properties: {
                  top: { type: Type.STRING },
                  heart: { type: Type.STRING },
                  base: { type: Type.STRING },
                },
                required: ['top', 'heart', 'base'],
              },
              synergies: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    pair: { type: Type.STRING, description: 'Two or more notes interacting positively.' },
                    effect: { type: Type.STRING, description: 'Aromatic and volatility benefit of this pairing.' },
                  },
                  required: ['pair', 'effect'],
                },
              },
              tensions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    issue: { type: Type.STRING, description: 'Detected imbalance, gap, harsh edge, or ratio skew.' },
                    suggestion: { type: Type.STRING, description: 'Concrete formulation adjustment to resolve it.' },
                  },
                  required: ['issue', 'suggestion'],
                },
              },
              recommendedAdditions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'Specific natural or aroma-chemical bridge note to add.' },
                    category: { type: Type.STRING, enum: ['top', 'heart', 'base'] },
                    suggestedPct: { type: Type.NUMBER, description: 'Suggested oil percentage between 1 and 25.' },
                    rationale: { type: Type.STRING, description: 'Why this addition strengthens the harmony.' },
                  },
                  required: ['name', 'category', 'suggestedPct', 'rationale'],
                },
              },
              macerationAdvice: {
                type: Type.STRING,
                description: 'Tailored advice on maceration duration, fixative interaction, and clarity based on current days & fixative%.',
              },
            },
            required: [
              'harmonyScore',
              'verdictStatus',
              'olfactoryProfile',
              'executiveSummary',
              'volatilityCurveSummary',
              'tierAssessment',
              'synergies',
              'tensions',
              'recommendedAdditions',
              'macerationAdvice',
            ],
          },
        },
      });

      const rawText = (response.text || '').trim();
      if (!rawText) {
        throw new Error('Empty response returned by harmony analysis model');
      }

      const parsed = JSON.parse(rawText);
      const harmonyScore = Math.min(100, Math.max(0, Math.round(Number(parsed.harmonyScore) || 0)));
      const verdictStatus = VALID_VERDICTS.has(parsed.verdictStatus) ? parsed.verdictStatus : 'needs_bridge';

      res.json({
        success: true,
        analyzedAt: new Date().toISOString(),
        tierTotals,
        noteCount: sanitizedNotes.length,
        report: {
          harmonyScore,
          verdictStatus,
          olfactoryProfile: String(parsed.olfactoryProfile || '').trim().slice(0, 140),
          executiveSummary: String(parsed.executiveSummary || '').trim().slice(0, 1200),
          volatilityCurveSummary: String(parsed.volatilityCurveSummary || '').trim().slice(0, 1000),
          tierAssessment: {
            top: String(parsed.tierAssessment?.top || '').trim().slice(0, 400),
            heart: String(parsed.tierAssessment?.heart || '').trim().slice(0, 400),
            base: String(parsed.tierAssessment?.base || '').trim().slice(0, 400),
          },
          synergies: Array.isArray(parsed.synergies)
            ? parsed.synergies.slice(0, 4).map((s: any) => ({
                pair: String(s?.pair || '').trim().slice(0, 120),
                effect: String(s?.effect || '').trim().slice(0, 400),
              })).filter((s: any) => s.pair && s.effect)
            : [],
          tensions: Array.isArray(parsed.tensions)
            ? parsed.tensions.slice(0, 4).map((t: any) => ({
                issue: String(t?.issue || '').trim().slice(0, 160),
                suggestion: String(t?.suggestion || '').trim().slice(0, 400),
              })).filter((t: any) => t.issue && t.suggestion)
            : [],
          recommendedAdditions: Array.isArray(parsed.recommendedAdditions)
            ? parsed.recommendedAdditions.slice(0, 3).map((r: any) => ({
                name: String(r?.name || '').trim().slice(0, 80),
                category: r?.category === 'top' || r?.category === 'heart' || r?.category === 'base' ? r.category : 'heart',
                suggestedPct: Math.min(35, Math.max(1, Number(Number(r?.suggestedPct || 5).toFixed(1)))),
                rationale: String(r?.rationale || '').trim().slice(0, 360),
              })).filter((r: any) => r.name && r.rationale)
            : [],
          macerationAdvice: String(parsed.macerationAdvice || '').trim().slice(0, 600),
        },
      });
    } catch (error: any) {
      console.error('[AI Tools] Harmony analysis error:', error);
      const isMissingKey = error?.code === 'MISSING_API_KEY' || error?.status === 503;
      const isQuota = error?.status === 429 || /RESOURCE_EXHAUSTED/i.test(error?.message || '');
      const status = isMissingKey ? 503 : isQuota ? 429 : 500;
      res.status(status).json({
        error: isMissingKey
          ? 'Server AI key is not configured for olfactory harmony analysis.'
          : isQuota
          ? 'Analysis quota temporarily exceeded. Please retry shortly.'
          : 'Failed to complete olfactory harmony analysis.',
        code: isMissingKey ? 'MISSING_API_KEY' : isQuota ? 'RATE_LIMITED' : 'HARMONY_ERROR',
      });
    }
  });

  /**
   * Designer Product Optimization & Developer Engineering Advisor using model: gemini-4-hydrogen
   * Evaluates current experimental formula, IFRA audit, climate profile, and developer optimization goal.
   */
  router.post('/ai/designer-optimize', async (req, res) => {
    try {
      if (!harmonyLimiter.allow(clientKey(req))) {
        res.status(429).json({
          error: 'Too many optimization requests. Please wait a few minutes.',
          code: 'RATE_LIMITED',
        });
        return;
      }

      const body = req.body || {};
      const rawNotes = Array.isArray(body.notes) ? body.notes : [];
      const sanitizedNotes: HarmonyNoteInput[] = rawNotes
        .slice(0, 40)
        .filter((item: any) => item && typeof item === 'object')
        .map((item: any): HarmonyNoteInput => {
          const category =
            item.category === 'top' || item.category === 'heart' || item.category === 'base'
              ? item.category
              : 'heart';
          const pct = Number(item.percentageOfOil);
          return {
            nameAr: typeof item.nameAr === 'string' ? item.nameAr.trim().slice(0, 80) : '',
            nameEn: typeof item.nameEn === 'string' ? item.nameEn.trim().slice(0, 80) : '',
            category,
            percentageOfOil: Number.isFinite(pct) ? Math.min(100, Math.max(0, Number(pct.toFixed(2)))) : 0,
          };
        })
        .filter((n: HarmonyNoteInput) => n.nameAr!.length > 0 || (n.nameEn !== undefined && n.nameEn.length > 0));

      if (sanitizedNotes.length === 0) {
        res.status(400).json({
          error: 'At least one experimental note is required before generating developer optimizations.',
          code: 'EMPTY_NOTES',
        });
        return;
      }

      const language =
        typeof body.language === 'string' && body.language.trim() ? body.language.trim().slice(0, 10) : 'ar';
      const goalRaw = typeof body.goal === 'string' ? body.goal.trim() : 'balanced_luxury';
      const goalDescriptions: Record<string, string> = {
        balanced_luxury: 'Balanced luxury fine fragrance: smooth Top->Heart->Base transition, commercial appeal, and full IFRA compliance',
        max_longevity: 'Maximum skin longevity (10h+) and projecting sillage aura without cloying heaviness',
        strict_safety: 'Zero IFRA Category 4 warnings/failures, minimal dermal sensitization, and crystal-clear solubility',
        cost_efficiency: 'Optimize batch unit cost while preserving signature olfactory identity using smart aroma-chemical bridges',
      };
      const targetGoal = goalDescriptions[goalRaw] || goalDescriptions.balanced_luxury;
      const formulaTitle =
        typeof body.formulaTitle === 'string' && body.formulaTitle.trim()
          ? body.formulaTitle.trim().slice(0, 120)
          : 'Designer Trial';
      const f = body.formulation && typeof body.formulation === 'object' ? body.formulation : {};
      const concPct = Number.isFinite(Number(f.concentrationPercent)) ? Number(f.concentrationPercent) : 20;
      const alcPct = Number.isFinite(Number(f.alcoholPercentage)) ? Number(f.alcoholPercentage) : 96;
      const waterPct = Number.isFinite(Number(f.waterPercent)) ? Number(f.waterPercent) : 1;
      const fixPct = Number.isFinite(Number(f.fixativePercent)) ? Number(f.fixativePercent) : 1.5;
      const macerationDays = Number.isFinite(Number(body.macerationDays)) ? Number(body.macerationDays) : 30;
      const ambientTempC = Number.isFinite(Number(body.ambientTempC)) ? Number(body.ambientTempC) : 25;
      const humidityPct = Number.isFinite(Number(body.humidityPct)) ? Number(body.humidityPct) : 45;
      const safetySummary =
        typeof body.safetySummary === 'string' ? body.safetySummary.trim().slice(0, 800) : 'Not supplied';

      const langNames: Record<string, string> = {
        ar: 'Arabic',
        en: 'English',
        fr: 'French',
        es: 'Spanish',
        it: 'Italian',
        de: 'German',
        ru: 'Russian',
        zh: 'Chinese (Simplified)',
        tr: 'Turkish',
        fa: 'Persian',
      };
      const targetLanguageName = langNames[language] || 'English';

      const notesSummary = sanitizedNotes
        .map((n) => `- [${n.category.toUpperCase()}] ${[n.nameAr, n.nameEn].filter(Boolean).join(' / ')}: ${n.percentageOfOil}%`)
        .join('\n');

      const ai = getAi();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          `Act as a Chief R&D Perfumer and Cosmetic Formulation Engineer reviewing a designer's live trial formula before batch production.
Write ALL natural language fields strictly in ${targetLanguageName}.

Optimization Goal: ${targetGoal}
Formula Title: ${formulaTitle}
Carrier & Conditions: Concentration=${concPct}%, Ethanol=${alcPct}%, Water=${waterPct}%, Fixative=${fixPct}%, Maceration=${macerationDays}d, Climate=${ambientTempC}°C / ${humidityPct}% RH
IFRA & Clarity Audit Snapshot: ${safetySummary}

Current Trial Notes (% of fragrance oil):
${notesSummary}`,
        ],
        config: {
          systemInstruction:
            'You are a lead fragrance R&D chemist advising a perfume product developer. Provide concrete, technically valid optimization patches with realistic ingredient percentages, solvent adjustments, and production/filtration steps. Never invent fake lab claims or mention AI vendors.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              productDiagnosis: {
                type: Type.STRING,
                description: '2-3 crisp engineering sentences evaluating pre-production readiness and key bottlenecks.',
              },
              targetWearerAndOccasion: {
                type: Type.STRING,
                description: 'Concise commercial positioning, climate fit, and ideal wearer profile.',
              },
              manufacturingProtocol: {
                type: Type.STRING,
                description: 'Concrete lab compounding order, chill filtration temperature, and maceration vessel protocol.',
              },
              patches: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    impactTag: { type: Type.STRING, description: 'Short 2-3 word impact summary e.g. +2.5h Longevity or IFRA Safe.' },
                    actionType: { type: Type.STRING, enum: ['add_note', 'update_note', 'adjust_carrier'] },
                    noteNameAr: { type: Type.STRING },
                    noteNameEn: { type: Type.STRING },
                    category: { type: Type.STRING, enum: ['top', 'heart', 'base'] },
                    targetPct: { type: Type.NUMBER },
                    concentrationPercent: { type: Type.NUMBER },
                    fixativePercent: { type: Type.NUMBER },
                    waterPercent: { type: Type.NUMBER },
                    macerationDays: { type: Type.INTEGER },
                  },
                  required: ['title', 'rationale', 'impactTag', 'actionType'],
                },
              },
            },
            required: ['productDiagnosis', 'targetWearerAndOccasion', 'manufacturingProtocol', 'patches'],
          },
        },
      });

      const rawText = (response.text || '').trim();
      if (!rawText) {
        throw new Error('Empty response returned by designer optimizer model');
      }

      const parsed = JSON.parse(rawText);
      const validActions = new Set(['add_note', 'update_note', 'adjust_carrier']);

      res.json({
        success: true,
        generatedAt: new Date().toISOString(),
        goal: goalRaw,
        optimization: {
          productDiagnosis: String(parsed.productDiagnosis || '').trim().slice(0, 1200),
          targetWearerAndOccasion: String(parsed.targetWearerAndOccasion || '').trim().slice(0, 500),
          manufacturingProtocol: String(parsed.manufacturingProtocol || '').trim().slice(0, 800),
          patches: Array.isArray(parsed.patches)
            ? parsed.patches.slice(0, 5).map((p: any, idx: number) => ({
                id: `ai-patch-${Date.now()}-${idx}`,
                title: String(p?.title || '').trim().slice(0, 140),
                rationale: String(p?.rationale || '').trim().slice(0, 420),
                impactTag: String(p?.impactTag || '').trim().slice(0, 60),
                actionType: validActions.has(p?.actionType) ? p.actionType : 'add_note',
                noteNameAr: p?.noteNameAr ? String(p.noteNameAr).trim().slice(0, 80) : undefined,
                noteNameEn: p?.noteNameEn ? String(p.noteNameEn).trim().slice(0, 80) : undefined,
                category:
                  p?.category === 'top' || p?.category === 'heart' || p?.category === 'base'
                    ? p.category
                    : 'heart',
                targetPct: Number.isFinite(Number(p?.targetPct))
                  ? Math.min(45, Math.max(0.5, Number(Number(p.targetPct).toFixed(1))))
                  : undefined,
                concentrationPercent: Number.isFinite(Number(p?.concentrationPercent))
                  ? Math.min(50, Math.max(1, Number(Number(p.concentrationPercent).toFixed(1))))
                  : undefined,
                fixativePercent: Number.isFinite(Number(p?.fixativePercent))
                  ? Math.min(6, Math.max(0, Number(Number(p.fixativePercent).toFixed(1))))
                  : undefined,
                waterPercent: Number.isFinite(Number(p?.waterPercent))
                  ? Math.min(10, Math.max(0, Number(Number(p.waterPercent).toFixed(1))))
                  : undefined,
                macerationDays: Number.isFinite(Number(p?.macerationDays))
                  ? Math.min(120, Math.max(0, Math.round(Number(p.macerationDays))))
                  : undefined,
              })).filter((p: any) => p.title && p.rationale)
            : [],
        },
      });
    } catch (error: any) {
      console.error('[AI Tools] Designer optimize error:', error);
      const isMissingKey = error?.code === 'MISSING_API_KEY' || error?.status === 503;
      const isQuota = error?.status === 429 || /RESOURCE_EXHAUSTED/i.test(error?.message || '');
      const status = isMissingKey ? 503 : isQuota ? 429 : 500;
      res.status(status).json({
        error: isMissingKey
          ? 'Server AI key is not configured for developer optimization.'
          : isQuota
          ? 'Optimization quota temporarily exceeded. Please retry shortly.'
          : 'Failed to generate product optimization plan.',
        code: isMissingKey ? 'MISSING_API_KEY' : isQuota ? 'RATE_LIMITED' : 'DESIGNER_OPTIMIZE_ERROR',
      });
    }
  });

  /**
   * Audio Transcription using model: gemini-3.5-transcribe
   * Accepts base64 encoded audio from browser microphone
   */
  router.post('/ai/transcribe', async (req, res) => {
    try {
      const { audio, mimeType } = req.body || {};
      if (!audio || typeof audio !== 'string') {
        res.status(400).json({ error: 'Missing audio base64 payload', code: 'INVALID_AUDIO' });
        return;
      }

      // Clean base64 header if included (data:audio/...;base64,)
      const cleanBase64 = audio.includes(',') ? audio.split(',')[1] : audio;
      const detectedMime = mimeType || 'audio/webm';

      const ai = getAi();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            text: 'Transcribe this audio recording verbatim in its original spoken language (Arabic, English, French, etc.). Output only the exact transcribed text without introductions or formatting tags.',
          },
          {
            inlineData: {
              data: cleanBase64,
              mimeType: detectedMime,
            },
          },
        ],
      });

      const transcription = (response.text || '').trim();
      res.json({
        success: true,
        model: 'gemini-3.5-transcribe',
        transcription,
      });
    } catch (error: any) {
      console.error('[AI Tools] Transcribe error:', error);
      const isQuota = error?.status === 429 || /RESOURCE_EXHAUSTED/i.test(error?.message || '');
      res.status(isQuota ? 429 : 500).json({
        error: isQuota ? 'Transcription quota exceeded. Please retry shortly.' : 'Failed to transcribe audio',
        code: isQuota ? 'RATE_LIMITED' : 'TRANSCRIBE_ERROR',
        details: error?.message || String(error),
      });
    }
  });

  /**
   * Music Generation using Lyria models:
   * - lyria-3-clip-preview: Short clips (up to 30s)
   * - lyria-3-pro-preview: Full-length tracks
   */
  router.post('/ai/music', async (req, res) => {
    try {
      const { prompt, duration = 'clip', scentName, scentNotes } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing music prompt', code: 'INVALID_PROMPT' });
        return;
      }

      const modelName = duration === 'full' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
      const ai = getAi();

      // Enriched prompt with fragrance mood if provided
      let fullPrompt = prompt.trim();
      if (scentName || scentNotes) {
        fullPrompt = `A rich, atmospheric instrumental piece inspired by the luxury fragrance "${scentName || 'Signature Scent'}". Olfactory notes: ${scentNotes || 'Oud, Amber, Damask Rose'}. Mood and style: ${prompt}`;
      }

      console.log(`[AI Tools] Generating music with ${modelName} for prompt:`, fullPrompt.slice(0, 100));

      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: fullPrompt,
      });

      let audioBase64 = '';
      let lyrics = '';
      let mimeType = 'audio/wav';

      for await (const chunk of responseStream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;

        for (const part of parts) {
          if (part.inlineData?.data) {
            if (!audioBase64 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioBase64 += part.inlineData.data;
          }
          if (part.text && !lyrics) {
            lyrics = part.text;
          }
        }
      }

      if (!audioBase64) {
        throw new Error('No audio returned by Lyria music model');
      }

      res.json({
        success: true,
        model: modelName,
        audioBase64,
        mimeType,
        lyrics,
        duration: duration === 'full' ? 'full_track' : '30s_clip',
      });
    } catch (error: any) {
      console.error('[AI Tools] Music generation error:', error);
      const isPaidKeyIssue =
        error?.status === 403 ||
        error?.status === 400 ||
        error?.status === 429 ||
        /PERMISSION_DENIED|RESOURCE_EXHAUSTED|API_KEY_INVALID|paid/i.test(error?.message || '');

      res.status(isPaidKeyIssue ? 402 : 500).json({
        error: isPaidKeyIssue
          ? 'Lyria music generation models (lyria-3-clip-preview / lyria-3-pro-preview) require a billing-enabled Gemini API key.'
          : 'Failed to generate music',
        code: isPaidKeyIssue ? 'PAID_KEY_REQUIRED' : 'MUSIC_GENERATION_FAILED',
        details: error?.message || String(error),
      });
    }
  });

  /**
   * Neural Text-to-Speech using model: gemini-3.8-flash-lite-tts
   * Returns WAV audio (24kHz mono 16-bit) encoded in base64.
   */
  router.post('/ai/tts', async (req, res) => {
    try {
      const { text, language = 'ar', voice = 'Charon' } = req.body || {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Missing text for speech synthesis', code: 'INVALID_TEXT' });
        return;
      }

      // Clean markdown & code fences for natural speech cadence
      const cleanText = text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[*_`#>|]/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2400);

      if (!cleanText) {
        res.status(400).json({ error: 'No speakable text found', code: 'INVALID_TEXT' });
        return;
      }

      const allowedVoices = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
      const voiceName = allowedVoices.has(String(voice)) ? String(voice) : 'Charon';

      const ai = getAi();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: language === 'ar' || language === 'fa'
                    ? 'Warm, authoritative master perfumer mentor, clear and unhurried articulation'
                    : 'Warm, articulate master perfumer advisor, calm and refined pacing',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error('No audio data returned by speech synthesis model');
      }

      res.json({
        success: true,
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (error: any) {
      console.error('[AI Tools] TTS error:', error);
      const isQuota = error?.status === 429 || /RESOURCE_EXHAUSTED/i.test(error?.message || '');
      res.status(isQuota ? 429 : 500).json({
        error: isQuota ? 'Speech synthesis quota exceeded. Please retry shortly.' : 'Failed to synthesize speech',
        code: isQuota ? 'RATE_LIMITED' : 'TTS_ERROR',
      });
    }
  });

  return router;
}
