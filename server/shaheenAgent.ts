/**
 * «الوكيل الذكي شاهين» — Autonomous Multi-Step Perfumery AI Agent.
 *
 * Implements a server-side ReAct tool-calling & live-grounding loop powered by the configured
 * Google GenAI client (gemini-4-hydrogen) with:
 * - Multi-step Thinking (MEDIUM / HIGH / XHIGH via ThinkingLevel)
 * - Live Web Search & URL Context grounding (with includeServerSideToolInvocations)
 * - Real executable perfumery tools (formulation math, alcohol dilution, costing,
 *   IFRA & raw material search, world/preset library search, Sham Store catalog lookup,
 *   maceration protocol planning, verified media lookup, and autonomous app action dispatch)
 * - Multimodal input support (images/labels/bottles) and live lab workbench context awareness
 * - Server-Sent Events (SSE) real-time progress streaming to both Shaheen UI surfaces.
 */
import express from 'express';
import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type Content,
  type FunctionDeclaration,
  type Part,
  type Tool,
} from '@google/genai';
import productsData from '../src/data/products.json';
import { RAW_MATERIALS_DATABASE } from '../src/data/rawMaterials';
import { WORLD_PERFUMES } from '../src/data/worldPerfumes';
import { CURATED_FORMULA_PRESETS } from '../src/data/presets';
import {
  calculateAlcoholDilution,
  calculateCosting,
  calculatePerfumeFormulation,
} from '../src/utils/calculations';
import { mergeCatalog, type RawProduct, type StoreCatalogFile } from '../src/utils/storeCatalog';
import { recommend } from '../src/utils/storeAdvisor';
import { normalizeMediaBlocks } from '../src/utils/mediaBlock';
import { stripOpeningGreeting } from '../src/utils/shaheenText';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../src/types/i18n';
import type {
  ActiveArtifactContext,
  AgentAction,
  AgentActionType,
  AgentArtifact,
  AgentAttachmentInput,
  AgentGroundingSource,
  AgentMode,
  AgentPlan,
  AgentPlanTask,
  AgentReasoningDepth,
  AgentStep,
  AgentStreamEvent,
  ArenaBattleResult,
  LabContextSnapshot,
} from '../src/types/shaheenAgent';
import type { ConcentrationType, PyramidNote } from '../src/types/perfume';
import type { ShaheenTool, ToolLink } from '../src/utils/shaheenTools';
import {
  defaultFilenameFor,
  normalizeArtifactLanguage,
  verifyCodeSnippet,
} from '../src/utils/codeVerifier';
import { liveStoreCatalog, newsContext, supervisorGuidance } from './core/liveData';
import { callEngine, engineStatuses, GEMINI_DEFAULT_MODEL } from './core/engines';
import type { ModelEngineId } from './core/types';
import { RateLimiter, clientKey } from './core/rateLimit';
import { VISITOR_ID } from './core/capacity';
import type { Repository } from './core/repository';
import { SHAHEEN_SITE_SETTINGS } from './config/shaheen';
import { ChatError, systemInstruction } from './shaheen';
import { sanitizeQuery, searchImages, searchPlace, searchVideos } from './media';
import { arenaVoteStore, extractArtifactsFromText, runShaheenArena, validateArenaVoteRequest } from './shaheenArena';

type Env = Record<string, string | undefined>;

const AGENT_MODEL = 'gemini-4-hydrogen';
const MAX_AGENT_TURNS = 6;
const MAX_ATTACHMENTS = 3;
const VENDOR_SCRUB = /\b(?:gemini|google|openai|chat ?gpt|gpt-?\d*|claude|anthropic|deepseek|openrouter|llama|qwen|mistral)\b/gi;

export function scrubVendorText(text: string): string {
  return text.replace(VENDOR_SCRUB, 'نظام المعمل').replace(/\s{2,}/g, ' ').trim();
}

export function createAgentAiClient(env: Env = process.env): GoogleGenAI {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey || /^MY_|placeholder/i.test(apiKey)) {
    throw new ChatError(503, 'PROVIDER_NOT_CONFIGURED', 'AI service key is not configured on server');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

function mapThinkingLevel(depth: AgentReasoningDepth = 'deep'): ThinkingLevel {
  if (depth === 'standard') return ThinkingLevel.MEDIUM;
  if (depth === 'max') return ThinkingLevel.XHIGH;
  return ThinkingLevel.HIGH;
}

const VALID_CONCENTRATION_TYPES: ConcentrationType[] = [
  'extrait',
  'edp',
  'edt',
  'edc',
  'eau_fraiche',
  'aftershave',
  'mist',
  'oil_pure',
  'custom',
];

const VALID_TOOLS: ShaheenTool[] = [
  'concentration',
  'pyramid',
  'maceration',
  'alcohol',
  'costing',
  'raw_materials',
  'guide',
  'store',
];

function toolLabel(toolName: string, language: SupportedLanguage): string {
  const ar = language === 'ar' || language === 'fa';
  const labels: Record<string, { ar: string; en: string }> = {
    calculate_perfume_formulation: { ar: 'حساب التركيبة المعملية بالمل والجرام', en: 'Lab Formulation Calculator' },
    calculate_alcohol_dilution: { ar: 'حاسبة تخفيف الكحول الدقيقة', en: 'Alcohol Dilution Calculator' },
    analyze_scent_cost_margin: { ar: 'تحليل التكلفة وهامش الربح', en: 'Cost & Margin Analyzer' },
    search_raw_materials: { ar: 'فحص موسوعة المواد الخام ومعايير IFRA', en: 'Raw Materials & IFRA Database' },
    search_perfume_library: { ar: 'البحث في مكتبة العطور والتركيبات العالمية', en: 'World Perfumes & Presets Library' },
    search_sham_store: { ar: 'الاستعلام عن منتجات متجر شام الحقيقية', en: 'Sham Store Catalog Lookup' },
    plan_maceration_schedule: { ar: 'تصميم بروتوكول التعتيق والترشيح', en: 'Maceration & Filtration Planner' },
    lookup_perfumery_media: { ar: 'جلب صور ومواقع مرجعية موثقة', en: 'Verified Visual & Origin Lookup' },
    dispatch_app_action: { ar: 'تجهيز إجراء مباشر في معمل التطبيق', en: 'Dispatch Interactive App Action' },
    plan_engineering_tasks: { ar: 'تخطيط المراحل والمهام الهندسية', en: 'Engineering Task Planner' },
    generate_code_artifact: { ar: 'إنشاء وتجميع المكوّن البرمجي التفاعلي', en: 'Code & Interactive Artifact Builder' },
    inspect_and_verify_code: { ar: 'فحص الشفرة والتحقق من صحة البناء والأمان', en: 'Static Code & Syntax Verifier' },
    benchmark_solutions_matrix: { ar: 'مقارنة الحلول والمعايير الهندسية رقمياً', en: 'Solution Trade-off Matrix' },
    web_search: { ar: 'بحث الويب المعرفي المباشر', en: 'Live Web Research' },
  };
  const entry = labels[toolName];
  return entry ? (ar ? entry.ar : entry.en) : toolName;
}

export const AGENT_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'calculate_perfume_formulation',
    description:
      'Compute exact perfume formula volumes (ml) and weights (grams) for fragrance oil, ethanol, distilled water, and fixative per bottle and for a production batch.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        bottleVolumeMl: { type: Type.NUMBER, description: 'Bottle size in milliliters (e.g., 50, 100).' },
        concentrationPercent: { type: Type.NUMBER, description: 'Fragrance oil concentration % (0.5 to 100).' },
        batchCount: { type: Type.NUMBER, description: 'Number of bottles in batch (default 1).' },
        waterPercent: { type: Type.NUMBER, description: 'Distilled water % of total product (default 0).' },
        fixativePercent: { type: Type.NUMBER, description: 'Fixative % of total product (default 0).' },
        oilDensity: { type: Type.NUMBER, description: 'Fragrance oil density g/ml (default 0.92).' },
        alcoholDensity: { type: Type.NUMBER, description: 'Alcohol density g/ml (default 0.80).' },
      },
      required: ['bottleVolumeMl', 'concentrationPercent'],
    },
  },
  {
    name: 'calculate_alcohol_dilution',
    description:
      'Calculate exact initial high-proof ethanol volume (ml) and distilled water volume (ml) required to dilute alcohol from a higher percentage to a target lower percentage.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        initialAlcoholPercent: { type: Type.NUMBER, description: 'Starting alcohol ABV % (e.g., 96 or 99).' },
        targetAlcoholPercent: { type: Type.NUMBER, description: 'Desired target alcohol ABV % (e.g., 70 or 80).' },
        targetVolumeMl: { type: Type.NUMBER, description: 'Desired final diluted volume in ml.' },
      },
      required: ['initialAlcoholPercent', 'targetAlcoholPercent', 'targetVolumeMl'],
    },
  },
  {
    name: 'analyze_scent_cost_margin',
    description:
      'Calculate per-bottle and full-batch production costs, suggested wholesale price, suggested retail price, and profit margin for a fragrance formula.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        bottleVolumeMl: { type: Type.NUMBER, description: 'Bottle volume in ml.' },
        concentrationPercent: { type: Type.NUMBER, description: 'Oil concentration %.' },
        oilCostPerKg: { type: Type.NUMBER, description: 'Oil cost per 1000g (kg).' },
        alcoholCostPerLiter: { type: Type.NUMBER, description: 'Alcohol cost per 1000ml (liter).' },
        bottleUnitCost: { type: Type.NUMBER, description: 'Empty glass bottle & atomizer cost per unit.' },
        packagingUnitCost: { type: Type.NUMBER, description: 'Box and label cost per unit.' },
        laborAndOverheadPerUnit: { type: Type.NUMBER, description: 'Labor and overhead cost per bottle.' },
        batchSize: { type: Type.NUMBER, description: 'Total bottles in batch (default 10).' },
        targetMarginPercent: { type: Type.NUMBER, description: 'Target retail markup percentage (default 150).' },
      },
      required: ['bottleVolumeMl', 'concentrationPercent', 'oilCostPerKg', 'alcoholCostPerLiter'],
    },
  },
  {
    name: 'search_raw_materials',
    description:
      'Search the verified Sham perfumery raw materials encyclopedia for densities, recommended usage %, IFRA guidelines, olfactory profiles, pyramid roles, and blending partners.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Material name, CAS number, scent family, or keyword in Arabic or English.' },
        pyramidPlacement: {
          type: Type.STRING,
          description: 'Optional filter: top, heart, base, carrier, or all.',
        },
        limit: { type: Type.NUMBER, description: 'Max results to return (default 5, max 8).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_perfume_library',
    description:
      'Search curated Sham presets and famous world perfume accord inspirations for pyramid ratios, maceration schedules, and compounding notes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Perfume name, note, brand, or scent family.' },
        limit: { type: Type.NUMBER, description: 'Max recipes to return (default 4).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_sham_store',
    description:
      'Query real in-stock fragrances and raw products from Sham Store catalog to give honest product recommendations with real SKUs, prices, and notes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Customer desire, scent notes, occasion, gender, or budget.' },
        limit: { type: Type.NUMBER, description: 'Number of top matching products to return (default 4, max 6).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'plan_maceration_schedule',
    description:
      'Generate a technical maceration, resting, chilling, and filtration schedule calibrated for a specific concentration type and olfactory profile.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        concentrationType: {
          type: Type.STRING,
          description: 'Concentration type: extrait, edp, edt, edc, mist, or oil_pure.',
        },
        fragranceFamily: {
          type: Type.STRING,
          description: 'Primary fragrance style (e.g., oriental oud, citrus cologne, floral amber, gourmand).',
        },
        macerationDays: { type: Type.NUMBER, description: 'Optional requested maceration duration in days.' },
        containsNaturalCitrus: { type: Type.BOOLEAN, description: 'True if top notes are heavy on natural citrus oils.' },
        containsVanillaOrResin: { type: Type.BOOLEAN, description: 'True if formula includes vanillin, benzoin, or heavy resins.' },
      },
      required: ['concentrationType', 'fragranceFamily'],
    },
  },
  {
    name: 'lookup_perfumery_media',
    description:
      'Verify real Wikimedia Commons botanical/lab images or OpenStreetMap geographic origin coordinates for perfumery ingredients before referencing visual aids.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Short 2-3 word English search term (e.g., Rosa damascena, Grasse, France).' },
        mediaType: { type: Type.STRING, description: 'Type of lookup: image, video, or place.' },
      },
      required: ['query', 'mediaType'],
    },
  },
  {
    name: 'dispatch_app_action',
    description:
      'Prepare an executable action button (or auto-apply command) inside the Sham application workspace: apply formula to calculator, fill fragrance pyramid, save recipe to library, open costing/spec sheet, or open any tool pre-filled.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        actionType: {
          type: Type.STRING,
          description: 'Action type: apply_formula, apply_pyramid, save_recipe, calculate_costing, print_spec_sheet, or open_tool.',
        },
        label: { type: Type.STRING, description: 'Short user-facing action button label in user language.' },
        title: { type: Type.STRING, description: 'Formula title (when applying/saving formula).' },
        concentrationPercent: { type: Type.NUMBER, description: 'Oil % for formula actions.' },
        concentrationType: { type: Type.STRING, description: 'edp, edt, extrait, edc, mist, oil_pure.' },
        bottleVolumeMl: { type: Type.NUMBER, description: 'Bottle volume in ml.' },
        alcoholPercentage: { type: Type.NUMBER, description: 'Ethanol ABV %.' },
        waterPercent: { type: Type.NUMBER, description: 'Water %.' },
        fixativePercent: { type: Type.NUMBER, description: 'Fixative %.' },
        macerationDays: { type: Type.NUMBER, description: 'Maceration days.' },
        summary: { type: Type.STRING, description: 'Brief technical summary of formula.' },
        pyramidNotes: {
          type: Type.ARRAY,
          description: 'Pyramid notes summing to 100% of oil.',
          items: {
            type: Type.OBJECT,
            properties: {
              nameAr: { type: Type.STRING },
              nameEn: { type: Type.STRING },
              category: { type: Type.STRING },
              percentageOfOil: { type: Type.NUMBER },
            },
          },
        },
        tool: {
          type: Type.STRING,
          description: 'Target tab for open_tool: concentration, pyramid, maceration, alcohol, costing, raw_materials, guide, store.',
        },
        search: { type: Type.STRING, description: 'Search query for store or raw_materials tool.' },
        alcoholFrom: { type: Type.NUMBER },
        alcoholTo: { type: Type.NUMBER },
        finalVolumeMl: { type: Type.NUMBER },
      },
      required: ['actionType', 'label'],
    },
  },
  {
    name: 'plan_engineering_tasks',
    description:
      'Emit or update a structured multi-phase engineering/formulation execution plan rendered interactively in the agent workspace.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        goal: { type: Type.STRING, description: 'Concise objective summary in user language.' },
        tasks: {
          type: Type.ARRAY,
          description: 'Ordered execution steps across phases: research, design, build, verify.',
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              phase: { type: Type.STRING, description: 'research, design, build, or verify' },
              status: { type: Type.STRING, description: 'pending, in_progress, or done' },
              detail: { type: Type.STRING },
            },
            required: ['title', 'phase', 'status'],
          },
        },
      },
      required: ['goal', 'tasks'],
    },
  },
  {
    name: 'generate_code_artifact',
    description:
      'Generate a clean, complete software artifact (interactive HTML/JS web app, UI widget, TypeScript/React module, Python computational script, SQL schema, Mermaid diagram, SVG, or JSON API spec) rendered live in Shaheen Arena Code Studio with automatic syntax verification.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Human-readable artifact title in user language.' },
        filename: { type: Type.STRING, description: 'Target filename with extension (e.g., dashboard.html, calculator.ts).' },
        language: {
          type: Type.STRING,
          description: 'One of: html, react, typescript, javascript, python, sql, css, json, mermaid, svg.',
        },
        summary: { type: Type.STRING, description: 'Concise architectural note explaining what the artifact provides.' },
        code: { type: Type.STRING, description: 'Complete source code (never truncated with placeholders).' },
        previewHtml: {
          type: Type.STRING,
          description:
            'Optional self-contained HTML5 document (CSS + Vanilla JS) so non-HTML artifacts (like react/typescript dashboards) also render a working interactive live preview in the sandbox iframe.',
        },
      },
      required: ['title', 'language', 'code'],
    },
  },
  {
    name: 'inspect_and_verify_code',
    description:
      'Run deterministic static analysis, balanced delimiter checks, syntax parsing, and safety verification on source code before presenting it to the user.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        language: {
          type: Type.STRING,
          description: 'html, react, typescript, javascript, python, sql, css, json, mermaid, or svg.',
        },
        code: { type: Type.STRING, description: 'Source code to verify.' },
      },
      required: ['language', 'code'],
    },
  },
  {
    name: 'benchmark_solutions_matrix',
    description:
      'Evaluate 2 or 3 engineering or formulation candidates quantitatively across weighted criteria and compute normalized total scores and a recommendation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: 'Decision topic being evaluated.' },
        options: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              summary: { type: Type.STRING },
              correctnessScore: { type: Type.NUMBER, description: 'Score 0-100' },
              scalabilityScore: { type: Type.NUMBER, description: 'Score 0-100' },
              maintainabilityScore: { type: Type.NUMBER, description: 'Score 0-100' },
              speedScore: { type: Type.NUMBER, description: 'Score 0-100' },
            },
            required: ['name', 'correctnessScore', 'scalabilityScore', 'maintainabilityScore', 'speedScore'],
          },
        },
      },
      required: ['topic', 'options'],
    },
  },
];

export interface AgentToolContext {
  env: Env;
  language: SupportedLanguage;
  catalogLoader: () => Promise<StoreCatalogFile | undefined>;
  fetchFn: typeof fetch;
  signal?: AbortSignal;
  collectedActions: AgentAction[];
  collectedArtifacts?: AgentArtifact[];
  collectedPlan?: AgentPlan;
  onPlan?: (plan: AgentPlan) => void;
  onArtifact?: (artifact: AgentArtifact) => void;
}

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function executeAgentTool(
  name: string,
  rawArgs: Record<string, unknown> | undefined,
  ctx: AgentToolContext,
): Promise<{ result: Record<string, unknown>; summary: string }> {
  const args = rawArgs || {};

  switch (name) {
    case 'calculate_perfume_formulation': {
      const bottleVolumeMl = clampNum(args.bottleVolumeMl, 50, 1, 10000);
      const concentrationPercent = clampNum(args.concentrationPercent, 20, 0.1, 100);
      const batchCount = Math.round(clampNum(args.batchCount, 1, 1, 10000));
      const waterPercent = clampNum(args.waterPercent, 0, 0, 95);
      const fixativePercent = clampNum(args.fixativePercent, 0, 0, 50);
      const oilDensity = clampNum(args.oilDensity, 0.92, 0.6, 1.5);
      const alcoholDensity = clampNum(args.alcoholDensity, 0.8, 0.7, 1.0);

      const calc = calculatePerfumeFormulation({
        bottleVolumeMl,
        batchCount,
        concentrationPercent,
        concentrationType:
          concentrationPercent >= 25 ? 'extrait' : concentrationPercent >= 15 ? 'edp' : concentrationPercent >= 8 ? 'edt' : 'edc',
        alcoholPercentage: 96,
        waterPercent,
        fixativePercent,
        oilDensity,
        alcoholDensity,
        unitMode: 'grams',
      });

      return {
        result: {
          bottleVolumeMl,
          batchCount,
          perBottle: {
            oilMl: round2(calc.oilVolumeMl),
            oilGrams: round2(calc.oilWeightGrams),
            oilPercent: round2(calc.oilPercent),
            alcoholMl: round2(calc.alcoholVolumeMl),
            alcoholGrams: round2(calc.alcoholWeightGrams),
            alcoholPercent: round2(calc.alcoholPercent),
            waterMl: round2(calc.waterVolumeMl),
            waterGrams: round2(calc.waterWeightGrams),
            waterPercent: round2(calc.waterPercent),
            fixativeMl: round2(calc.fixativeVolumeMl),
            fixativeGrams: round2(calc.fixativeWeightGrams),
            fixativePercent: round2(calc.fixativePercent),
            totalGrams: round2(calc.totalWeightGrams),
          },
          batchTotals: {
            totalVolumeMl: round2(calc.batchTotalVolumeMl),
            totalOilGrams: round2(calc.batchTotalOilGrams),
            totalAlcoholGrams: round2(calc.batchTotalAlcoholGrams),
            totalWaterGrams: round2(calc.batchTotalWaterGrams),
            totalFixativeGrams: round2(calc.batchTotalFixativeGrams),
            totalWeightGrams: round2(calc.batchTotalWeightGrams),
          },
        },
        summary: `${bottleVolumeMl}ml × ${concentrationPercent}% → ${round2(calc.oilWeightGrams)}g oil, ${round2(calc.alcoholWeightGrams)}g alcohol`,
      };
    }

    case 'calculate_alcohol_dilution': {
      const fromPct = clampNum(args.initialAlcoholPercent, 96, 2, 100);
      const toPct = clampNum(args.targetAlcoholPercent, 70, 1, 99);
      const targetVol = clampNum(args.targetVolumeMl, 1000, 1, 100000);
      const res = calculateAlcoholDilution(fromPct, toPct, targetVol);
      return {
        result: {
          isValid: res.isValid,
          initialAlcoholPercent: fromPct,
          targetAlcoholPercent: toPct,
          targetVolumeMl: targetVol,
          pureAlcoholMlNeeded: round2(res.pureAlcoholVolumeNeeded),
          distilledWaterMlNeeded: round2(res.distilledWaterVolumeNeeded),
          dilutionFactor: round2(res.dilutionFactor),
          errorMessage: res.errorMessage,
        },
        summary: res.isValid
          ? `${fromPct}% → ${toPct}% (${targetVol}ml): ${round2(res.pureAlcoholVolumeNeeded)}ml EtOH + ${round2(res.distilledWaterVolumeNeeded)}ml H2O`
          : res.errorMessage || 'Invalid dilution parameters',
      };
    }

    case 'analyze_scent_cost_margin': {
      const bottleVolumeMl = clampNum(args.bottleVolumeMl, 50, 1, 10000);
      const concentrationPercent = clampNum(args.concentrationPercent, 20, 0.1, 100);
      const batchSize = Math.round(clampNum(args.batchSize, 10, 1, 100000));
      const calc = calculatePerfumeFormulation({
        bottleVolumeMl,
        batchCount: batchSize,
        concentrationPercent,
        concentrationType: 'edp',
        alcoholPercentage: 96,
        waterPercent: 0,
        fixativePercent: 1,
        oilDensity: 0.92,
        alcoholDensity: 0.8,
        unitMode: 'grams',
      });
      const costing = calculateCosting(calc, {
        oilCostPerKg: clampNum(args.oilCostPerKg, 250, 0, 1000000),
        alcoholCostPerLiter: clampNum(args.alcoholCostPerLiter, 15, 0, 100000),
        bottleUnitCost: clampNum(args.bottleUnitCost, 2.5, 0, 10000),
        packagingUnitCost: clampNum(args.packagingUnitCost, 1.5, 0, 10000),
        laborAndOverheadPerUnit: clampNum(args.laborAndOverheadPerUnit, 2, 0, 10000),
        batchSize,
        targetMarginPercent: clampNum(args.targetMarginPercent, 150, 0, 2000),
      });
      return {
        result: {
          bottleVolumeMl,
          concentrationPercent,
          batchSize,
          oilCostPerBottle: round2(costing.oilCostPerBottle),
          alcoholCostPerBottle: round2(costing.alcoholCostPerBottle),
          packagingCostPerBottle: round2(costing.packagingCostPerBottle),
          totalCostPerBottle: round2(costing.totalCostPerBottle),
          suggestedWholesalePrice: round2(costing.suggestedWholesalePrice),
          suggestedRetailPrice: round2(costing.suggestedRetailPrice),
          profitPerBottleRetail: round2(costing.profitPerBottleRetail),
          totalBatchCost: round2(costing.totalBatchCost),
          totalBatchRevenueRetail: round2(costing.totalBatchRevenueRetail),
          totalBatchProfitRetail: round2(costing.totalBatchProfitRetail),
        },
        summary: `Cost/unit: ${round2(costing.totalCostPerBottle)} | Retail: ${round2(costing.suggestedRetailPrice)} (×${batchSize})`,
      };
    }

    case 'search_raw_materials': {
      const q = String(args.query || '').trim().toLowerCase();
      const placement = typeof args.pyramidPlacement === 'string' ? args.pyramidPlacement.trim().toLowerCase() : '';
      const limit = Math.round(clampNum(args.limit, 5, 1, 10));
      const tokens = q.split(/[\s,،]+/).filter((t) => t.length >= 2);
      const scored = RAW_MATERIALS_DATABASE.map((m) => {
        if (placement && placement !== 'all' && m.pyramidPlacement !== placement && m.pyramidPlacement !== 'all') {
          return { m, score: -1 };
        }
        const hay = `${m.nameAr} ${m.nameEn} ${m.casNumber} ${m.olfactoryFamily} ${m.scentProfile} ${m.categoryAr} ${m.roleInPerfume || ''}`.toLowerCase();
        let score = 0;
        if (q && hay.includes(q)) score += 10;
        for (const t of tokens) if (hay.includes(t)) score += 3;
        return { m, score };
      })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      const items = scored.map(({ m }) => ({
        id: m.id,
        nameAr: m.nameAr,
        nameEn: m.nameEn,
        casNumber: m.casNumber,
        placement: m.pyramidPlacement,
        densityGPerMl: m.densityGPerMl,
        recommendedUsagePercent: m.recommendedUsagePercent,
        ifraLimitPercent: m.ifraLimitPercent,
        scentProfile: m.scentProfile,
        roleInPerfume: m.roleInPerfume,
        blendingPartners: m.blendingPartners,
        precautions: m.precautions,
      }));
      return {
        result: { count: items.length, materials: items },
        summary: items.length ? `${items.length} material(s): ${items.map((i) => i.nameEn.split('(')[0].trim()).slice(0, 3).join(', ')}` : `No exact match for "${q}"`,
      };
    }

    case 'search_perfume_library': {
      const q = String(args.query || '').trim().toLowerCase();
      const limit = Math.round(clampNum(args.limit, 4, 1, 8));
      const tokens = q.split(/[\s,،]+/).filter((t) => t.length >= 2);
      const worldMatches = WORLD_PERFUMES.map((w) => {
        const hay = `${w.nameAr} ${w.nameEn} ${w.brand} ${w.categoryAr} ${w.descriptionAr} ${w.pyramidNotes.map((n) => `${n.nameAr} ${n.nameEn || ''}`).join(' ')}`.toLowerCase();
        let score = 0;
        if (q && hay.includes(q)) score += 10;
        for (const t of tokens) if (hay.includes(t)) score += 3;
        return {
          score,
          item: {
            source: 'world_perfumes',
            title: w.nameAr,
            titleEn: w.nameEn,
            brand: w.brand,
            concentrationPercent: w.targetConcentration,
            concentrationType: w.concentrationType,
            macerationDays: w.macerationDays,
            compoundingTips: w.compoundingTips,
            pyramidNotes: w.pyramidNotes.map((n) => ({
              nameAr: n.nameAr,
              nameEn: n.nameEn,
              category: n.category,
              percentageOfOil: n.percentageOfOil,
            })),
          },
        };
      });
      const presetMatches = CURATED_FORMULA_PRESETS.map((p) => {
        const hay = `${p.title} ${p.titleEn || ''} ${p.category || ''} ${p.notes || ''} ${(p.tags || []).join(' ')} ${p.pyramidNotes.map((n) => `${n.nameAr} ${n.nameEn || ''}`).join(' ')}`.toLowerCase();
        let score = 0;
        if (q && hay.includes(q)) score += 10;
        for (const t of tokens) if (hay.includes(t)) score += 3;
        return {
          score,
          item: {
            source: 'curated_presets',
            title: p.title,
            titleEn: p.titleEn,
            concentrationPercent: p.formulation.concentrationPercent,
            concentrationType: p.formulation.concentrationType,
            macerationDays: p.macerationDays,
            compoundingTips: p.notes,
            pyramidNotes: p.pyramidNotes.map((n) => ({
              nameAr: n.nameAr,
              nameEn: n.nameEn,
              category: n.category,
              percentageOfOil: n.percentageOfOil,
            })),
          },
        };
      });
      const combined = [...worldMatches, ...presetMatches]
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.item);

      return {
        result: { count: combined.length, recipes: combined },
        summary: combined.length ? `${combined.length} recipe(s) found` : `No preset found for "${q}"`,
      };
    }

    case 'search_sham_store': {
      const q = String(args.query || '').trim();
      const limit = Math.round(clampNum(args.limit, 4, 1, 6));
      const baseProducts = (productsData as { products?: RawProduct[] }).products || [];
      const liveCatalog = await ctx.catalogLoader().catch(() => undefined);
      const list = mergeCatalog(baseProducts, liveCatalog);
      const { picks, matched } = recommend(list, q || 'عطر', limit);
      const products = picks.map((p) => ({
        sku: p.product.sku,
        nameAr: p.product.name.ar,
        nameEn: p.product.name.en,
        brand: p.product.brand,
        price: p.product.price,
        inStock: p.product.inStock,
        gender: p.product.gender,
        families: p.product.families,
        notes: p.product.notes,
      }));
      return {
        result: { matched, count: products.length, products },
        summary: products.length ? `${products.length} store product(s): ${products.map((p) => p.sku).join(', ')}` : 'No matching store items',
      };
    }

    case 'plan_maceration_schedule': {
      const type = String(args.concentrationType || 'edp').toLowerCase();
      const family = String(args.fragranceFamily || 'general');
      const hasCitrus = Boolean(args.containsNaturalCitrus);
      const hasResin = Boolean(args.containsVanillaOrResin);
      const defaultDays: Record<string, number> = {
        extrait: 42,
        edp: 30,
        edt: 21,
        edc: 14,
        mist: 7,
        oil_pure: 30,
      };
      const baseDays = defaultDays[type] ?? 30;
      const adjustedDays =
        typeof args.macerationDays === 'number' && Number.isFinite(args.macerationDays)
          ? Math.round(clampNum(args.macerationDays, baseDays, 3, 180))
          : Math.min(90, baseDays + (hasResin ? 10 : 0) - (hasCitrus && !hasResin ? 5 : 0));

      return {
        result: {
          concentrationType: type,
          fragranceFamily: family,
          recommendedDays: adjustedDays,
          optimalStorageTempC: '15°C - 18°C (dark amber glass, UV protected)',
          phases: [
            {
              phase: '1. Concentrate Marriage (Pre-dilution)',
              durationDays: type === 'oil_pure' ? adjustedDays : Math.min(7, Math.max(2, Math.round(adjustedDays * 0.15))),
              action: 'Blend aromatic oils and aroma chemicals first; seal tightly with minimal headspace.',
            },
            {
              phase: '2. Carrier Rest & Maceration',
              durationDays: Math.max(5, adjustedDays - 7),
              action: 'Add alcohol and distilled water/fixatives slowly. Store in darkness at 15–18°C; gentle swirl every 3–4 days.',
            },
            {
              phase: '3. Cold Chilling & Micro-Filtration',
              durationDays: 2,
              action: type === 'oil_pure'
                ? 'Allow natural sedimentation or warm cloth strain if waxes appear.'
                : 'Chill at 0°C to 4°C for 24–48 hours then filter cold through 5–10 micron filter paper to prevent haze.',
            },
          ],
          warnings: [
            hasCitrus ? 'Natural citrus terpenes oxidize easily; avoid excessive headspace and high warmth.' : null,
            hasResin ? 'Vanillin and dark resins gradually deepen in amber hue (natural Maillard maturation).' : null,
          ].filter(Boolean),
        },
        summary: `${type.toUpperCase()} (${family}): ${adjustedDays}d schedule + 0–4°C cold filtration`,
      };
    }

    case 'lookup_perfumery_media': {
      const q = sanitizeQuery(args.query);
      const mediaType = String(args.mediaType || 'image').toLowerCase();
      if (!q) {
        return { result: { error: 'Invalid query for media lookup' }, summary: 'Invalid media query' };
      }
      try {
        if (mediaType === 'place') {
          const placeRes = await searchPlace(q, { fetch: ctx.fetchFn, signal: ctx.signal, lang: ctx.language.slice(0, 2) });
          return {
            result: placeRes as unknown as Record<string, unknown>,
            summary: placeRes.places.length ? `Place: ${placeRes.places[0].label}` : `Place not found: ${q}`,
          };
        }
        if (mediaType === 'video') {
          const vidRes = await searchVideos(q, { env: ctx.env, fetch: ctx.fetchFn, signal: ctx.signal, lang: ctx.language.slice(0, 2) });
          return {
            result: vidRes as unknown as Record<string, unknown>,
            summary: `Video lookup: ${vidRes.videos.length} clip(s)`,
          };
        }
        const imgRes = await searchImages(q, { fetch: ctx.fetchFn, signal: ctx.signal, limit: 3 });
        return {
          result: imgRes as unknown as Record<string, unknown>,
          summary: `Images: ${imgRes.images.length} verified Wikimedia asset(s)`,
        };
      } catch {
        return { result: { unavailable: true, query: q }, summary: `Media lookup skipped for "${q}"` };
      }
    }

    case 'dispatch_app_action': {
      const actionType = String(args.actionType || '').trim() as AgentActionType;
      const validTypes: AgentActionType[] = [
        'apply_formula',
        'apply_pyramid',
        'save_recipe',
        'calculate_costing',
        'print_spec_sheet',
        'open_tool',
      ];
      if (!validTypes.includes(actionType)) {
        return { result: { error: 'Unsupported actionType' }, summary: 'Invalid actionType' };
      }
      const label = scrubVendorText(String(args.label || actionType).slice(0, 80));
      const id = `act-${Date.now()}-${ctx.collectedActions.length + 1}`;
      const action: AgentAction = { id, type: actionType, label };

      if (actionType === 'open_tool') {
        const rawTool = String(args.tool || 'concentration').toLowerCase() as ShaheenTool;
        const tool = VALID_TOOLS.includes(rawTool) ? rawTool : 'concentration';
        const link: ToolLink = { tool };
        if (typeof args.bottleVolumeMl === 'number') link.bottleVolumeMl = clampNum(args.bottleVolumeMl, 50, 1, 10000);
        if (typeof args.concentrationPercent === 'number') link.concentrationPercent = clampNum(args.concentrationPercent, 20, 0.1, 100);
        if (typeof args.concentrationType === 'string' && VALID_CONCENTRATION_TYPES.includes(args.concentrationType as ConcentrationType)) {
          link.concentrationType = args.concentrationType as ConcentrationType;
        }
        if (typeof args.alcoholPercentage === 'number') link.alcoholPercentage = clampNum(args.alcoholPercentage, 96, 1, 100);
        if (typeof args.waterPercent === 'number') link.waterPercent = clampNum(args.waterPercent, 0, 0, 100);
        if (typeof args.fixativePercent === 'number') link.fixativePercent = clampNum(args.fixativePercent, 0, 0, 100);
        if (typeof args.macerationDays === 'number') link.macerationDays = Math.round(clampNum(args.macerationDays, 30, 1, 365));
        if (typeof args.alcoholFrom === 'number') link.alcoholFrom = clampNum(args.alcoholFrom, 96, 2, 100);
        if (typeof args.alcoholTo === 'number') link.alcoholTo = clampNum(args.alcoholTo, 70, 1, 99);
        if (typeof args.finalVolumeMl === 'number') link.finalVolumeMl = clampNum(args.finalVolumeMl, 1000, 1, 100000);
        if (typeof args.search === 'string' && args.search.trim()) link.search = args.search.trim().slice(0, 140);
        action.toolLink = link;
      } else {
        const rawConcType = String(args.concentrationType || 'edp').toLowerCase();
        const concType: ConcentrationType = VALID_CONCENTRATION_TYPES.includes(rawConcType as ConcentrationType)
          ? (rawConcType as ConcentrationType)
          : 'edp';
        const rawNotes = Array.isArray(args.pyramidNotes) ? args.pyramidNotes : [];
        const notes: PyramidNote[] = rawNotes
          .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
          .slice(0, 18)
          .map((n, idx) => {
            const cat = String(n.category || 'heart').toLowerCase();
            const category: PyramidNote['category'] = cat === 'top' || cat === 'base' ? cat : 'heart';
            const arName = scrubVendorText(String(n.nameAr || n.nameEn || `Note ${idx + 1}`).slice(0, 80));
            return {
              id: `agent-note-${idx + 1}`,
              nameAr: arName,
              nameEn: scrubVendorText(String(n.nameEn || arName).slice(0, 80)),
              category,
              percentageOfOil: clampNum(n.percentageOfOil, 10, 0.1, 100),
            };
          });
        action.formula = {
          title: scrubVendorText(String(args.title || 'تركيبة شاهين المخصصة').slice(0, 120)),
          author: ctx.language === 'ar' || ctx.language === 'fa' ? 'الخبير شاهين — الوكيل الذكي' : 'Master Shahin AI Agent',
          concentrationPercent: clampNum(args.concentrationPercent, 20, 0.5, 100),
          concentrationType: concType,
          bottleVolumeMl: clampNum(args.bottleVolumeMl, 50, 1, 10000),
          alcoholPercentage: clampNum(args.alcoholPercentage, 96, 1, 100),
          waterPercent: clampNum(args.waterPercent, 0, 0, 95),
          fixativePercent: clampNum(args.fixativePercent, 1, 0, 50),
          macerationDays: Math.round(clampNum(args.macerationDays, 30, 1, 365)),
          summary: scrubVendorText(String(args.summary || 'تركيبة مقترحة للتجربة المعملية').slice(0, 300)),
          pyramidNotes: notes,
        };
      }

      ctx.collectedActions.push(action);
      return {
        result: { queued: true, actionId: action.id, actionType: action.type, label: action.label },
        summary: `Prepared action: ${action.label}`,
      };
    }

    case 'plan_engineering_tasks': {
      const goal = scrubVendorText(String(args.goal || 'Execution Plan').slice(0, 220));
      const rawTasks = Array.isArray(args.tasks) ? args.tasks : [];
      const validPhases = new Set(['research', 'design', 'build', 'verify']);
      const validStatuses = new Set(['pending', 'in_progress', 'done']);
      const tasks: AgentPlanTask[] = rawTasks
        .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
        .slice(0, 10)
        .map((t, idx) => {
          const phase = validPhases.has(String(t.phase)) ? (String(t.phase) as AgentPlanTask['phase']) : 'build';
          const status = validStatuses.has(String(t.status)) ? (String(t.status) as AgentPlanTask['status']) : 'pending';
          return {
            id: String(t.id || `task-${idx + 1}`).slice(0, 32),
            title: scrubVendorText(String(t.title || `Step ${idx + 1}`).slice(0, 140)),
            phase,
            status,
            ...(typeof t.detail === 'string' && t.detail.trim()
              ? { detail: scrubVendorText(t.detail.trim().slice(0, 180)) }
              : {}),
          };
        });
      const plan: AgentPlan = { goal, tasks };
      ctx.collectedPlan = plan;
      ctx.onPlan?.(plan);
      return {
        result: { planned: true, goal, taskCount: tasks.length },
        summary: `Plan (${tasks.length} steps): ${goal.slice(0, 60)}`,
      };
    }

    case 'generate_code_artifact': {
      const language = normalizeArtifactLanguage(args.language);
      const title = scrubVendorText(String(args.title || `${language.toUpperCase()} Artifact`).slice(0, 140));
      const rawCode = String(args.code || '').slice(0, 80_000);
      const code = scrubVendorText(rawCode);
      const filename = String(args.filename || '').trim().slice(0, 90) || defaultFilenameFor(language, title);
      const summary = scrubVendorText(String(args.summary || `${language.toUpperCase()} implementation`).slice(0, 240));
      const previewHtml =
        typeof args.previewHtml === 'string' && args.previewHtml.trim()
          ? args.previewHtml.trim().slice(0, 80_000)
          : language === 'html'
            ? code
            : undefined;
      const verification = verifyCodeSnippet(language, code);
      const artifacts = ctx.collectedArtifacts || (ctx.collectedArtifacts = []);
      const artifact: AgentArtifact = {
        id: `art-${Date.now()}-${artifacts.length + 1}`,
        title,
        filename,
        language,
        summary,
        code,
        ...(previewHtml ? { previewHtml } : {}),
        runnable: Boolean(previewHtml) || language === 'html' || language === 'svg' || language === 'mermaid' || language === 'javascript',
        verification,
        createdAt: Date.now(),
      };
      artifacts.push(artifact);
      ctx.onArtifact?.(artifact);
      return {
        result: {
          created: true,
          id: artifact.id,
          filename: artifact.filename,
          language: artifact.language,
          runnable: artifact.runnable,
          verification,
        },
        summary: `${artifact.filename} (${artifact.language}) · score ${verification.score}/100 (${verification.valid ? 'valid' : 'issues detected'})`,
      };
    }

    case 'inspect_and_verify_code': {
      const language = normalizeArtifactLanguage(args.language);
      const code = String(args.code || '').slice(0, 80_000);
      const report = verifyCodeSnippet(language, code);
      return {
        result: {
          language,
          valid: report.valid,
          score: report.score,
          diagnostics: report.diagnostics,
          metrics: report.metrics,
        },
        summary: `${language.toUpperCase()} verification: ${report.valid ? 'PASSED' : 'ERRORS'} (score ${report.score}/100, ${report.metrics.lines} lines)`,
      };
    }

    case 'benchmark_solutions_matrix': {
      const topic = scrubVendorText(String(args.topic || 'Architecture Comparison').slice(0, 140));
      const rawOptions = Array.isArray(args.options) ? args.options : [];
      const evaluated = rawOptions
        .filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object'))
        .slice(0, 5)
        .map((o) => {
          const correctness = clampNum(o.correctnessScore, 80, 0, 100);
          const scalability = clampNum(o.scalabilityScore, 80, 0, 100);
          const maintainability = clampNum(o.maintainabilityScore, 80, 0, 100);
          const speed = clampNum(o.speedScore, 80, 0, 100);
          const weighted = Math.round(correctness * 0.35 + scalability * 0.25 + maintainability * 0.25 + speed * 0.15);
          return {
            name: scrubVendorText(String(o.name || 'Option').slice(0, 80)),
            summary: scrubVendorText(String(o.summary || '').slice(0, 200)),
            scores: { correctness, scalability, maintainability, speed },
            weightedTotal: weighted,
          };
        })
        .sort((a, b) => b.weightedTotal - a.weightedTotal);

      return {
        result: {
          topic,
          winner: evaluated[0]?.name || null,
          ranking: evaluated,
        },
        summary: evaluated.length
          ? `${topic}: Winner "${evaluated[0].name}" (${evaluated[0].weightedTotal}/100)`
          : `${topic}: no options supplied`,
      };
    }

    default:
      return {
        result: { error: `Unknown tool: ${name}` },
        summary: `Unknown tool ${name}`,
      };
  }
}

export function formatLabContextBlock(lab?: LabContextSnapshot): string {
  if (!lab) return '';
  const parts: string[] = [];
  if (lab.activeTab) parts.push(`Current Workspace Tab: ${lab.activeTab}`);
  if (lab.formulaTitle) parts.push(`Active Formula Title: ${lab.formulaTitle}`);
  if (lab.formulation) {
    const f = lab.formulation;
    parts.push(
      `Bench Formulation: ${f.bottleVolumeMl}ml × ${f.batchCount} batch(es), ${f.concentrationPercent}% ${f.concentrationType.toUpperCase()}, Ethanol ${f.alcoholPercentage}%, Water ${f.waterPercent}%, Fixative ${f.fixativePercent}%, Unit: ${f.unitMode}`,
    );
  }
  if (lab.macerationDays) parts.push(`Active Maceration Target: ${lab.macerationDays} days`);
  if (lab.pyramidNotes?.length) {
    const list = lab.pyramidNotes.slice(0, 14).map((n) => `${n.nameAr}${n.nameEn ? ` (${n.nameEn})` : ''} [${n.category}: ${n.percentageOfOil}%]`).join('; ');
    parts.push(`Active Pyramid Notes: ${list}`);
  }
  if (lab.currencyCode || lab.countryName) parts.push(`Region/Currency: ${lab.countryName || ''} (${lab.currencyCode || ''})`);
  if (typeof lab.savedCount === 'number') parts.push(`Saved Formulas in Library: ${lab.savedCount}`);
  if (!parts.length) return '';
  return `\n\n[ACTIVE USER WORKBENCH CONTEXT — use when relevant to current question]\n${parts.join('\n')}`;
}

export interface AgentRunInput {
  message: string;
  language: SupportedLanguage;
  agentMode?: AgentMode;
  reasoningDepth?: AgentReasoningDepth;
  autoWebSearch?: boolean;
  conversationHistory?: { role: 'user' | 'assistant'; text: string }[];
  attachments?: AgentAttachmentInput[];
  labContext?: LabContextSnapshot;
  activeArtifact?: ActiveArtifactContext;
}

export interface AgentRunResult {
  reply: string;
  steps: AgentStep[];
  sources: AgentGroundingSource[];
  actions: AgentAction[];
  plan?: AgentPlan;
  artifacts?: AgentArtifact[];
  arena?: ArenaBattleResult;
  engine: {
    id: string;
    name: string;
    badge: string;
    provider: 'shaheen';
    accentColor: string;
  };
}

export async function runShaheenAgent(
  input: AgentRunInput,
  options: {
    env?: Env;
    ai?: GoogleGenAI;
    fetchFn?: typeof fetch;
    catalogLoader?: () => Promise<StoreCatalogFile | undefined>;
    signal?: AbortSignal;
    onEvent?: (event: AgentStreamEvent) => void;
    extraInstruction?: string;
  } = {},
): Promise<AgentRunResult> {
  const env = options.env || process.env;
  const fetchFn = options.fetchFn || fetch;
  const catalogLoader = options.catalogLoader || (() => liveStoreCatalog(env, fetchFn));
  const emit = options.onEvent || (() => {});

  const labContextBlock = formatLabContextBlock(input.labContext);

  if (input.agentMode === 'arena') {
    const arenaResult = await runShaheenArena(input, {
      env,
      ai: options.ai,
      fetchFn,
      signal: options.signal,
      onEvent: emit,
      extraInstruction: options.extraInstruction,
      labContextBlock,
    });
    return {
      reply: arenaResult.reply,
      steps: arenaResult.steps,
      sources: [],
      actions: [],
      artifacts: arenaResult.artifacts,
      arena: arenaResult.arena,
      engine: arenaResult.engine,
    };
  }

  let ai: GoogleGenAI | undefined = options.ai;
  if (!ai) {
    try {
      ai = createAgentAiClient(env);
    } catch {
      ai = undefined;
    }
  }
  const configuredSecondary: ModelEngineId[] = engineStatuses(env)
    .filter((s) => s.configured && s.id !== 'gemini' && s.id !== 'sham_local')
    .map((s) => s.id as ModelEngineId);
  if (!ai && !configuredSecondary.length) {
    throw new ChatError(503, 'PROVIDER_NOT_CONFIGURED', 'AI service key is not configured on server');
  }
  const thinkingLevel = mapThinkingLevel(input.reasoningDepth || (input.agentMode === 'architect' ? 'max' : 'deep'));
  const enableWeb = input.autoWebSearch !== false;

  const baseSystem =
    systemInstruction(input.language, options.extraInstruction || '', 'deep') +
    (await newsContext(input.message, input.language, env).catch(() => '')) +
    (await supervisorGuidance('shaheen_chat', env).catch(() => '')) +
    labContextBlock;

  const activeArtifactNote = input.activeArtifact
    ? `\n\n[ACTIVE STUDIO ARTIFACT — user may ask to modify, debug, or upgrade this file]\nFilename: ${input.activeArtifact.filename} (${input.activeArtifact.language})\n\`\`\`${input.activeArtifact.language}\n${input.activeArtifact.code.slice(0, 12000)}\n\`\`\``
    : '';

  const architectDirective =
    input.agentMode === 'architect'
      ? `\n\n[SOFTWARE & CODE STUDIO ARCHITECT MODE — MANDATORY WORKFLOW]
- You are acting as an Arena-grade Principal Software Engineer & Computational Perfumery Architect.
- Step 1: Call plan_engineering_tasks first to map concrete phases (research -> design -> build -> verify).
- Step 2: Build complete, production-ready code with ZERO placeholder comments ("// TODO", "...rest of code"). Call generate_code_artifact for every runnable script, web tool, React/TS component, SQL schema, Python calculator, or Mermaid architecture diagram.
- Step 3: For interactive web widgets, dashboards, simulators, visualizations, or calculators, ALWAYS set language='html' OR supply a standalone 'previewHtml' bundle using clean HTML5 + modern CSS + Vanilla JS so the sandbox executes immediately offline!
- Step 4: Call inspect_and_verify_code on critical scripts or inspect the returned verification diagnostics from generate_code_artifact. If any errors exist, fix and regenerate cleanly before concluding.`
      : '';

  const agentDirective = `

[AUTONOMOUS AI AGENT & PROGRAMMATIC ENGINEERING CAPABILITIES]
You are operating in Autonomous Master Perfumer & Software Engineering Agent mode inside Sham Lab.
- Plan your work systematically using plan_engineering_tasks for multi-step software/architectural or complex R&D tasks.
- Call real executable perfumery tools (calculate_perfume_formulation, calculate_alcohol_dilution, analyze_scent_cost_margin, search_raw_materials, search_perfume_library, search_sham_store, plan_maceration_schedule) whenever exact perfumery figures or store items are needed.
- When asked to build software, calculators, dashboards, HTML/CSS/JS widgets, TypeScript/React components, Python scripts, SQL schemas, API specs, or architecture diagrams (Mermaid/SVG), call generate_code_artifact with COMPLETE code (and self-contained previewHtml for interactive UIs), and verify via inspect_and_verify_code.
- Use live web search or URL context when asked about recent trends, regulations, obscure botanical origins, documentation, or pasted URLs.
- If the user uploads an image (bottle, formula sheet, UI screenshot, error diagram), analyze it carefully and integrate findings.
- When designing or modifying a perfume formula, call dispatch_app_action so the user gets an instant interactive action in the lab AND include the canonical sham-formula block.
- NEVER invent tool results, SKUs, prices, or citations. Rely strictly on tool outputs.
- NEVER reveal internal engine, API, or vendor/company names.`;

  const systemText = baseSystem + activeArtifactNote + agentDirective + architectDirective;

  const contents: Content[] = (input.conversationHistory || []).slice(-16).map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));

  const userParts: Part[] = [];
  if (Array.isArray(input.attachments) && input.attachments.length) {
    for (const att of input.attachments.slice(0, MAX_ATTACHMENTS)) {
      if (!att?.data || !att?.mimeType) continue;
      const cleanData = att.data.includes(',') ? att.data.split(',')[1] : att.data;
      if (cleanData) {
        userParts.push({ inlineData: { data: cleanData, mimeType: att.mimeType } });
      }
    }
  }
  userParts.push({ text: input.message });
  contents.push({ role: 'user', parts: userParts });

  const tools: Tool[] = enableWeb
    ? [{ googleSearch: {} }, { urlContext: {} }, { functionDeclarations: AGENT_FUNCTION_DECLARATIONS }]
    : [{ functionDeclarations: AGENT_FUNCTION_DECLARATIONS }];

  const steps: AgentStep[] = [];
  const sourcesMap = new Map<string, AgentGroundingSource>();
  const collectedActions: AgentAction[] = [];
  const collectedArtifacts: AgentArtifact[] = [];
  const toolCtx: AgentToolContext = {
    env,
    language: input.language,
    catalogLoader,
    fetchFn,
    signal: options.signal,
    collectedActions,
    collectedArtifacts,
    onPlan: (plan) => {
      emit({ type: 'plan', goal: plan.goal, tasks: plan.tasks });
    },
    onArtifact: (artifact) => {
      emit({ type: 'artifact', artifact });
    },
  };

  let finalReply = '';
  let stepCounter = 0;

  emit({ type: 'status', phase: 'planning' });

  let activeModel = AGENT_MODEL;
  let disableThinking = false;
  let disableWebTool = false;

  const fallbackViaSecondary = async (primaryError: unknown): Promise<AgentRunResult | null> => {
    if (options.ai || !configuredSecondary.length) return null;
    const ar = input.language === 'ar' || input.language === 'fa';
    for (const engineId of configuredSecondary) {
      try {
        const raw = await callEngine(
          engineId,
          systemText,
          [...(input.conversationHistory || []).slice(-12), { role: 'user', text: input.message }],
          {
            env,
            fetch: fetchFn,
            temperature: 0.55,
            maxTokens: 3200,
            signal: options.signal || AbortSignal.timeout(30_000),
          },
        );
        if (!raw?.trim()) continue;
        const cleanReply = normalizeMediaBlocks(stripOpeningGreeting(scrubVendorText(raw.trim()), input.message));
        const extracted = extractArtifactsFromText(cleanReply, 'merged', input.language);
        for (const art of extracted) emit({ type: 'artifact', artifact: art });
        const stepId = `step-${++stepCounter}`;
        const step: AgentStep = {
          id: stepId,
          kind: 'action',
          label: ar ? 'تنفيذ عبر محرك بديل احتياطي' : 'Executed via failover engine',
          status: 'done',
        };
        steps.push(step);
        const resObj: AgentRunResult = {
          reply: cleanReply,
          steps,
          sources: [...sourcesMap.values()],
          actions: collectedActions,
          ...(extracted.length ? { artifacts: extracted } : {}),
          engine: {
            id: input.agentMode === 'architect' ? 'architect' : 'agent',
            name: ar ? 'الخبير شاهين · الوكيل الذكي' : 'Master Shahin · AI Agent',
            badge: ar ? '🤖 الوكيل الذكي' : '🤖 AI Agent',
            provider: 'shaheen',
            accentColor: 'amber',
          },
        };
        emit({
          type: 'done',
          reply: resObj.reply,
          steps: resObj.steps,
          sources: resObj.sources,
          actions: resObj.actions,
          ...(resObj.artifacts ? { artifacts: resObj.artifacts } : {}),
          engine: resObj.engine,
        });
        return resObj;
      } catch {
        // try next configured engine
      }
    }
    if (primaryError) return null;
    return null;
  };

  if (!ai) {
    const failoverResult = await fallbackViaSecondary(null);
    if (failoverResult) return failoverResult;
    throw new ChatError(503, 'PROVIDER_UNAVAILABLE', 'Configured AI engines did not return a valid answer');
  }

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    if (options.signal?.aborted) {
      throw new ChatError(504, 'PROVIDER_TIMEOUT', 'Agent request was cancelled or timed out');
    }

    const useTools = turn < MAX_AGENT_TURNS - 1;
    const activeTools: Tool[] = !useTools
      ? []
      : enableWeb && !disableWebTool
        ? tools
        : [{ functionDeclarations: AGENT_FUNCTION_DECLARATIONS }];
    let response;
    let lastErr: unknown;
    for (let retry = 0; retry < 3; retry++) {
      try {
        response = await ai.models.generateContent({
          model: activeModel,
          contents,
          config: {
            systemInstruction: systemText,
            ...(!disableThinking ? { thinkingConfig: { thinkingLevel } } : {}),
            ...(activeTools.length
              ? {
                  tools: activeTools,
                  ...(enableWeb && !disableWebTool ? { toolConfig: { includeServerSideToolInvocations: true } } : {}),
                }
              : {}),
          },
        });
        break;
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || err || '');
        const isModelOrFeatureMismatch =
          !options.ai && /404|400|NOT_FOUND|INVALID_ARGUMENT|not found|not supported|thinking/i.test(msg);
        if (isModelOrFeatureMismatch && activeModel !== GEMINI_DEFAULT_MODEL) {
          activeModel = GEMINI_DEFAULT_MODEL;
          disableThinking = true;
          disableWebTool = true;
          continue;
        }
        const transient = err?.status === 429 || err?.status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE|429|503/i.test(msg);
        if (transient && retry === 0 && !options.signal?.aborted) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        const failoverResult = await fallbackViaSecondary(err);
        if (failoverResult) return failoverResult;
        throw err;
      }
    }
    if (!response) {
      const failoverResult = await fallbackViaSecondary(lastErr);
      if (failoverResult) return failoverResult;
      throw lastErr || new Error('Empty agent response');
    }

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // Collect thought summaries without leaking internal vendor terms
    for (const part of parts) {
      if (part.thought && typeof part.text === 'string' && part.text.trim()) {
        const thoughtText = scrubVendorText(part.text.trim()).slice(0, 600);
        const stepId = `step-${++stepCounter}`;
        const step: AgentStep = {
          id: stepId,
          kind: 'thought',
          label: toolLabel('thought', input.language) === 'thought'
            ? (input.language === 'ar' || input.language === 'fa' ? 'تحليل وتخطيط مخبري' : 'Lab Reasoning & Planning')
            : toolLabel('thought', input.language),
          status: 'done',
          detail: thoughtText,
        };
        steps.push(step);
        emit({ type: 'thought', stepId, text: thoughtText });
      }
    }

    // Collect live web search & URL grounding citations
    const chunks = candidate?.groundingMetadata?.groundingChunks || [];
    const newSources: AgentGroundingSource[] = [];
    for (const ch of chunks) {
      const uri = ch?.web?.uri;
      const title = ch?.web?.title || uri;
      if (uri && /^https?:\/\//i.test(uri) && !sourcesMap.has(uri)) {
        const cleanTitle = scrubVendorText(String(title)).slice(0, 140) || uri;
        const src = { title: cleanTitle, uri };
        sourcesMap.set(uri, src);
        newSources.push(src);
      }
    }
    if (newSources.length) {
      const webStepId = `step-${++stepCounter}`;
      const webLabel = toolLabel('web_search', input.language);
      steps.push({
        id: webStepId,
        kind: 'web',
        tool: 'web_search',
        label: webLabel,
        status: 'done',
        detail: `${newSources.length} verified source(s): ${newSources.map((s) => s.title).slice(0, 2).join(' · ')}`,
      });
      emit({ type: 'tool_call', stepId: webStepId, tool: 'web_search', label: webLabel });
      emit({
        type: 'tool_result',
        stepId: webStepId,
        tool: 'web_search',
        status: 'done',
        detail: `${newSources.length} verified source(s)`,
      });
      emit({ type: 'grounding', sources: [...sourcesMap.values()] });
    }

    // Check client-side functionCalls emitted by the model
    const calls = (response.functionCalls && response.functionCalls.length
      ? response.functionCalls
      : parts.filter((p) => p.functionCall).map((p) => p.functionCall!)) || [];

    if (calls.length > 0 && useTools) {
      // Preserve candidate.content faithfully (including thoughtSignature & tool invocations)
      if (candidate?.content) {
        contents.push(candidate.content);
      }

      const functionResponseParts: Part[] = [];
      for (const call of calls) {
        const fnName = call.name || 'unknown_tool';
        const stepId = `step-${++stepCounter}`;
        const label = toolLabel(fnName, input.language);
        const startTime = Date.now();
        const isActionDispatch = fnName === 'dispatch_app_action';
        const isCodeStep =
          fnName === 'generate_code_artifact' ||
          fnName === 'inspect_and_verify_code' ||
          fnName === 'plan_engineering_tasks' ||
          fnName === 'benchmark_solutions_matrix';

        const stepObj: AgentStep = {
          id: stepId,
          kind: isActionDispatch ? 'action' : isCodeStep ? 'code' : 'tool',
          tool: fnName,
          label,
          status: 'running',
        };
        steps.push(stepObj);
        emit({ type: 'tool_call', stepId, tool: fnName, label });

        const prevActionsCount = collectedActions.length;
        try {
          const executed = await executeAgentTool(fnName, (call.args || {}) as Record<string, unknown>, toolCtx);
          const durationMs = Date.now() - startTime;
          stepObj.status = 'done';
          stepObj.detail = scrubVendorText(executed.summary);
          stepObj.durationMs = durationMs;

          if (collectedActions.length > prevActionsCount) {
            for (const act of collectedActions.slice(prevActionsCount)) {
              emit({ type: 'action', action: act });
            }
          }

          emit({
            type: 'tool_result',
            stepId,
            tool: fnName,
            status: 'done',
            detail: stepObj.detail,
            durationMs,
          });

          functionResponseParts.push({
            functionResponse: {
              name: fnName,
              ...(call.id ? { id: call.id } : {}),
              response: { output: executed.result },
            },
          });
        } catch (toolErr: any) {
          const durationMs = Date.now() - startTime;
          const errMsg = String(toolErr?.message || 'Tool execution failed').slice(0, 140);
          stepObj.status = 'error';
          stepObj.detail = errMsg;
          stepObj.durationMs = durationMs;
          emit({
            type: 'tool_result',
            stepId,
            tool: fnName,
            status: 'error',
            detail: errMsg,
            durationMs,
          });
          functionResponseParts.push({
            functionResponse: {
              name: fnName,
              ...(call.id ? { id: call.id } : {}),
              response: { error: errMsg },
            },
          });
        }
      }

      contents.push({ role: 'user', parts: functionResponseParts });
      continue;
    }

    // Final synthesis answer (filter out thought parts cleanly)
    const visibleText = parts
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
      .trim() || (response.text || '').trim();

    if (visibleText) {
      finalReply = visibleText;
      break;
    }
  }

  if (!finalReply) {
    throw new ChatError(503, 'PROVIDER_UNAVAILABLE', 'Agent could not complete a response');
  }

  const normalizedReply = scrubVendorText(stripOpeningGreeting(normalizeMediaBlocks(finalReply), input.message));
  // Emit progressive text chunks for smooth streaming rendering
  const chunkSize = 80;
  for (let i = 0; i < normalizedReply.length; i += chunkSize) {
    emit({ type: 'chunk', text: normalizedReply.slice(i, i + chunkSize) });
  }

  const sources = [...sourcesMap.values()];
  const result: AgentRunResult = {
    reply: normalizedReply,
    steps,
    sources,
    actions: collectedActions,
    ...(toolCtx.collectedPlan ? { plan: toolCtx.collectedPlan } : {}),
    ...(collectedArtifacts.length ? { artifacts: collectedArtifacts } : {}),
    engine: {
      id: input.agentMode === 'architect' ? 'architect' : 'agent',
      name:
        input.language === 'ar' || input.language === 'fa'
          ? input.agentMode === 'architect'
            ? 'الخبير شاهين · استوديو الهندسة البرمجية'
            : 'الخبير شاهين · الوكيل الذكي'
          : input.agentMode === 'architect'
            ? 'Master Shahin · Code Architect'
            : 'Master Shahin · AI Agent',
      badge:
        input.language === 'ar' || input.language === 'fa'
          ? input.agentMode === 'architect'
            ? '⚡ استوديو البرمجة'
            : '🤖 الوكيل الذكي'
          : input.agentMode === 'architect'
            ? '⚡ Code Studio'
            : '🤖 AI Agent',
      provider: 'shaheen',
      accentColor: 'amber',
    },
  };

  emit({
    type: 'done',
    reply: result.reply,
    steps: result.steps,
    sources: result.sources,
    actions: result.actions,
    ...(result.plan ? { plan: result.plan } : {}),
    ...(result.artifacts ? { artifacts: result.artifacts } : {}),
    engine: result.engine,
  });

  return result;
}

export function validateAgentRequest(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ChatError(400, 'INVALID_REQUEST', 'A JSON object is required');
  }
  const {
    message,
    language = 'ar',
    agentMode = 'agent',
    reasoningDepth = 'deep',
    autoWebSearch = true,
    conversationHistory = [],
    attachments = [],
    labContext,
    activeArtifact,
  } = body as Record<string, unknown>;

  if (typeof message !== 'string' || !message.trim()) {
    throw new ChatError(400, 'INVALID_MESSAGE', 'Message is required');
  }
  if (message.length > 4000) {
    throw new ChatError(400, 'MESSAGE_TOO_LONG', 'Message exceeds 4000 characters');
  }
  if (!SUPPORTED_LANGUAGES.some((l) => l.code === language)) {
    throw new ChatError(400, 'INVALID_LANGUAGE', 'Unsupported language');
  }
  const mode: AgentMode =
    agentMode === 'arena' || agentMode === 'architect' ? agentMode : 'agent';
  const depth: AgentReasoningDepth =
    reasoningDepth === 'standard' || reasoningDepth === 'max' ? reasoningDepth : 'deep';

  const history: { role: 'user' | 'assistant'; text: string }[] = Array.isArray(conversationHistory)
    ? conversationHistory
        .slice(-24)
        .filter(
          (t): t is { role: 'user' | 'assistant'; text: string } =>
            Boolean(t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string' && t.text.trim()),
        )
        .map((t) => ({ role: t.role, text: t.text.trim().slice(0, 4000) }))
    : [];

  const safeAttachments: AgentAttachmentInput[] = Array.isArray(attachments)
    ? attachments
        .slice(0, MAX_ATTACHMENTS)
        .filter(
          (a): a is AgentAttachmentInput =>
            Boolean(
              a &&
                typeof a.mimeType === 'string' &&
                /^image\/(png|jpeg|jpg|webp|gif)$/i.test(a.mimeType) &&
                typeof a.data === 'string' &&
                a.data.length > 10 &&
                a.data.length <= 4_500_000,
            ),
        )
        .map((a) => ({
          name: String(a.name || 'image').slice(0, 80),
          mimeType: a.mimeType,
          data: a.data,
        }))
    : [];

  const safeArtifact: ActiveArtifactContext | undefined =
    activeArtifact &&
    typeof activeArtifact === 'object' &&
    typeof (activeArtifact as ActiveArtifactContext).code === 'string' &&
    (activeArtifact as ActiveArtifactContext).code.trim()
      ? {
          id: String((activeArtifact as ActiveArtifactContext).id || 'art').slice(0, 64),
          filename: String((activeArtifact as ActiveArtifactContext).filename || 'artifact.ts').slice(0, 90),
          language: String((activeArtifact as ActiveArtifactContext).language || 'typescript').slice(0, 32),
          code: String((activeArtifact as ActiveArtifactContext).code).slice(0, 32_000),
        }
      : undefined;

  return {
    message: message.trim(),
    language: language as SupportedLanguage,
    agentMode: mode,
    reasoningDepth: depth,
    autoWebSearch: autoWebSearch !== false,
    conversationHistory: history,
    attachments: safeAttachments,
    labContext: labContext && typeof labContext === 'object' ? (labContext as LabContextSnapshot) : undefined,
    activeArtifact: safeArtifact,
  };
}

export function createShaheenAgentRouter(options: {
  repo: Repository;
  env?: Env;
  fetch?: typeof fetch;
}) {
  const env = options.env || process.env;
  const router = express.Router();
  const visitorLimiter = new RateLimiter(Number(env.SHAM_AGENT_RATE_PER_MIN) || 12, 60_000);
  const ipLimiter = new RateLimiter(Number(env.SHAM_AGENT_IP_RATE_PER_MIN) || 24, 60_000);

  router.post('/shaheen/agent', async (req, res) => {
    const controller = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', cancel);

    const writeEvent = (event: AgentStreamEvent) => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    try {
      const input = validateAgentRequest(req.body);
      const ip = clientKey(req);
      const browser = req.get('x-sham-visitor') || (typeof req.body?.visitorId === 'string' ? req.body.visitorId : undefined);
      const visitor = browser && VISITOR_ID.test(browser) ? `${ip}|${browser}` : ip;
      if (!visitorLimiter.allow(visitor) || !ipLimiter.allow(ip)) {
        throw new ChatError(429, 'RATE_LIMITED', 'Too many agent requests, please wait a minute');
      }

      const { shaheen } = await options.repo.settings().catch(() => ({ shaheen: SHAHEEN_SITE_SETTINGS }));
      if (!shaheen.enabled) {
        throw new ChatError(503, 'SHAHEEN_DISABLED', 'Shaheen is turned off by the site administration');
      }

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const combinedSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(55_000)]);

      await runShaheenAgent(input, {
        env,
        fetchFn: options.fetch || fetch,
        signal: combinedSignal,
        extraInstruction: shaheen.instructions,
        onEvent: (event) => writeEvent(event),
      });

      if (!res.writableEnded) res.end();
    } catch (error: any) {
      if (res.destroyed) return;
      const errMsg = String(error?.message || error || '');
      const status =
        error instanceof ChatError
          ? error.status
          : error?.status === 429
            ? 429
            : /401|403|404|502|503|UNAVAILABLE|NOT_FOUND|PERMISSION_DENIED|fetch failed|ECONN/i.test(errMsg)
              ? 503
              : 500;
      const code =
        error instanceof ChatError
          ? error.code
          : error?.status === 429 || /RESOURCE_EXHAUSTED/i.test(errMsg)
            ? 'RATE_LIMITED'
            : /API_KEY|configured/i.test(errMsg)
              ? 'PROVIDER_NOT_CONFIGURED'
              : status === 503
                ? 'PROVIDER_UNAVAILABLE'
                : 'AGENT_FAILED';
      const safeMessage =
        code === 'PROVIDER_NOT_CONFIGURED'
          ? 'AI service key is not configured on server'
          : code === 'PROVIDER_UNAVAILABLE'
            ? 'The configured AI providers did not return a valid answer'
            : code === 'RATE_LIMITED'
              ? 'Too many requests right now, please retry shortly'
              : error instanceof ChatError
                ? error.message
                : 'Shaheen Agent failed to complete this task';

      if (res.headersSent) {
        writeEvent({ type: 'error', code, message: safeMessage });
        if (!res.writableEnded) res.end();
      } else {
        res.status(status).json({ error: safeMessage, code });
      }
    } finally {
      res.off('close', cancel);
    }
  });

  router.post('/shaheen/arena/vote', (req, res) => {
    try {
      const ip = clientKey(req);
      if (!ipLimiter.allow(ip)) {
        res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });
        return;
      }
      const { battleId, vote, prevVote } = validateArenaVoteRequest(req.body);
      const voteTotals = arenaVoteStore.record(battleId, vote, prevVote);
      res.json({ battleId, vote, voteTotals });
    } catch (error: any) {
      const status = error instanceof ChatError ? error.status : 400;
      const code = error instanceof ChatError ? error.code : 'INVALID_REQUEST';
      res.status(status).json({ error: error?.message || 'Invalid vote payload', code });
    }
  });

  return router;
}
