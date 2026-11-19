/**
 * «ذكاء مجتمع شام» — AI intelligence woven across composer, post analysis, smart replies,
 * olfactory semantic search, artisan matchmaking, and discussion synthesis.
 *
 * Uses active external AI engines ordered by admin policy (via `callEngine`) when configured,
 * and seamlessly falls back to a deterministic perfumery chemistry & olfactory NLP engine
 * so community features always deliver immediate, high-craft results without API keys.
 */
import { callEngine, engineStatuses } from '../core/engines';
import type { EngineId, ModelEngineId } from '../core/types';
import { clean, USER_COLUMNS, USER_FROM, publicUser, type Ctx } from './service';
import { postView } from './social';

type Env = Record<string, string | undefined>;
type Lang = 'ar' | 'en';

export interface CommunityAiOptions {
  env?: Env;
  getEnginePolicy?: () => Promise<EngineId[]>;
}

const DEFAULT_ORDER: ModelEngineId[] = ['self_hosted', 'gemini', 'openai', 'claude', 'deepseek', 'openrouter'];

async function runModelJson<T>(
  system: string,
  userPrompt: string,
  options: CommunityAiOptions = {},
  timeoutMs = 11_000,
): Promise<T | null> {
  const env = options.env || process.env;
  const statuses = engineStatuses(env);
  const policy: EngineId[] = options.getEnginePolicy ? await options.getEnginePolicy().catch(() => DEFAULT_ORDER) : DEFAULT_ORDER;
  const order: EngineId[] = [...policy, ...DEFAULT_ORDER.filter((id) => !policy.includes(id))];

  for (const id of order) {
    if (id === 'sham_local') break;
    const modelId = id as ModelEngineId;
    const status = statuses.find((s) => s.id === modelId);
    if (!status?.configured) continue;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const raw = await callEngine(
        modelId,
        system,
        [{ role: 'user', text: userPrompt }],
        { env, signal: controller.signal, temperature: 0.45, maxTokens: 900 },
      ).finally(() => clearTimeout(timer));

      if (!raw) continue;
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]) as T;
      }
    } catch {
      // Fail over silently to next configured engine or deterministic fallback
    }
  }
  return null;
}

/* --------------------------------------- Olfactory Knowledge Bank --------------------------------------- */

interface NoteEntry {
  key: string;
  tier: 'top' | 'heart' | 'base';
  ar: string;
  en: string;
  patterns: RegExp;
  tagAr: string;
  tagEn: string;
}

const NOTE_BANK: NoteEntry[] = [
  { key: 'bergamot', tier: 'top', ar: 'برغموت', en: 'Bergamot', patterns: /برغموت|bergamot|برجموت/i, tagAr: 'برغموت', tagEn: 'Bergamot' },
  { key: 'lemon', tier: 'top', ar: 'حمضيات وليمون', en: 'Citrus & Lemon', patterns: /ليمون|حمضيات|citrus|lemon|mandarin|يوسفي|برتقال/i, tagAr: 'حمضيات', tagEn: 'Citrus' },
  { key: 'cardamom', tier: 'top', ar: 'هيل / حبهان', en: 'Cardamom', patterns: /هيل|حبهان|cardamom/i, tagAr: 'هيل', tagEn: 'Cardamom' },
  { key: 'pink_pepper', tier: 'top', ar: 'فلفل وردي', en: 'Pink Pepper', patterns: /فلفل وردي|pink pepper|pepper/i, tagAr: 'توابل_عطرية', tagEn: 'Spices' },
  { key: 'lavender', tier: 'top', ar: 'لافندر وخزامى', en: 'Lavender', patterns: /لافندر|خزامى|lavender/i, tagAr: 'لافندر', tagEn: 'Lavender' },
  { key: 'saffron', tier: 'heart', ar: 'زعفران', en: 'Saffron', patterns: /زعفران|saffron/i, tagAr: 'زعفران', tagEn: 'Saffron' },
  { key: 'rose', tier: 'heart', ar: 'ورد دمشقي / طائفي', en: 'Damask Rose', patterns: /ورد|جوري|طائفي|غراس|rose|damask|taif/i, tagAr: 'ورد_دمشقي', tagEn: 'DamaskRose' },
  { key: 'jasmine', tier: 'heart', ar: 'ياسمين وسامباك', en: 'Jasmine', patterns: /ياسمين|فل|jasmine/i, tagAr: 'ياسمين', tagEn: 'Jasmine' },
  { key: 'hedione', tier: 'heart', ar: 'هيديون (فوحان)', en: 'Hedione', patterns: /هيديون|hedione/i, tagAr: 'فوحان', tagEn: 'Sillage' },
  { key: 'oud', tier: 'base', ar: 'دهن عود معتق', en: 'Aged Oud', patterns: /عود|كمبودي|هندي|كلاكاسي|بورمي|oud|agarwood/i, tagAr: 'دهن_العود', tagEn: 'AgedOud' },
  { key: 'amber', tier: 'base', ar: 'عنبر ولبان', en: 'Amber & Labdanum', patterns: /عنبر|لبان|جاوي|amber|labdanum|benzoin/i, tagAr: 'عنبر', tagEn: 'Amber' },
  { key: 'musk', tier: 'base', ar: 'مسك أبيض وملكي', en: 'Royal Musk', patterns: /مسك|musk/i, tagAr: 'مسك', tagEn: 'Musk' },
  { key: 'sandalwood', tier: 'base', ar: 'خشب صندل', en: 'Sandalwood', patterns: /صندل|أرز|أخشاب|sandalwood|cedar|wood/i, tagAr: 'أخشاب', tagEn: 'Woods' },
  { key: 'patchouli', tier: 'base', ar: 'باتشولي', en: 'Patchouli', patterns: /باتشولي|patchouli/i, tagAr: 'باتشولي', tagEn: 'Patchouli' },
  { key: 'vanilla', tier: 'base', ar: 'فانيليا وتونكا', en: 'Vanilla & Tonka', patterns: /فانيليا|تونكا|vanilla|tonka/i, tagAr: 'فانيليا', tagEn: 'Vanilla' },
  { key: 'tobacco', tier: 'base', ar: 'توباكو وجلود', en: 'Tobacco & Leather', patterns: /توباكو|تبغ|جلد|جلود|tobacco|leather/i, tagAr: 'توباكو_وجلود', tagEn: 'TobaccoLeather' },
  { key: 'ambroxan', tier: 'base', ar: 'أمبروكسان وإيزو إي', en: 'Ambroxan & Iso E', patterns: /أمبروكسان|ايزو|إيزو|ambroxan|iso e/i, tagAr: 'مثبتات_عطرية', tagEn: 'Fixatives' },
];

export function extractNotes(text: string, lang: Lang) {
  const top: string[] = [];
  const heart: string[] = [];
  const base: string[] = [];
  const tags: string[] = [];
  for (const n of NOTE_BANK) {
    if (n.patterns.test(text)) {
      const label = lang === 'ar' ? n.ar : n.en;
      if (n.tier === 'top' && !top.includes(label)) top.push(label);
      if (n.tier === 'heart' && !heart.includes(label)) heart.push(label);
      if (n.tier === 'base' && !base.includes(label)) base.push(label);
      tags.push(lang === 'ar' ? n.tagAr : n.tagEn);
    }
  }
  return { top, heart, base, tags: [...new Set(tags)].slice(0, 5) };
}

function detectCircle(text: string, lang: Lang): string {
  if (/عود|كمبودي|هندي|بخور|معتق|oud|agarwood/i.test(text)) return lang === 'ar' ? 'حلقة العود والبخور' : 'Oud & Incense Circle';
  if (/ورد|ياسمين|زهر|قطفة|تقطير|rose|jasmine|distill/i.test(text)) return lang === 'ar' ? 'حلقة الورد والتقطير النقي' : 'Floral & Distillation Circle';
  if (/تعتيق|تركيز|كحول|ايثانول|إيثانول|مثبت|ifra|maceration|concentration|hedione|ambroxan/i.test(text)) return lang === 'ar' ? 'حلقة المعمل والتعتيق' : 'Lab & Maceration Circle';
  if (/نيش|توقيع|توباكو|عنبر|فانيليا|leather|niche|signature/i.test(text)) return lang === 'ar' ? 'حلقة عطور النيش والتواقيع' : 'Niche & Signature Circle';
  return lang === 'ar' ? 'مجلس صناع العطور العام' : 'Perfumers General Salon';
}

/* --------------------------------------- 1. AI Composer --------------------------------------- */

export async function aiCompose(
  input: { mode?: unknown; text?: unknown; topic?: unknown; tone?: unknown; lang?: unknown },
  options: CommunityAiOptions = {},
) {
  const lang: Lang = input.lang === 'en' ? 'en' : 'ar';
  const mode = String(input.mode || 'polish');
  const text = clean(input.text, 2500);
  const topic = clean(input.topic, 300);
  const tone = String(input.tone || 'luxury');

  const sys = `You are Sham Intelligence, a refined Arabic & English perfumery editorial assistant inside a luxury perfumers community. Return ONLY valid JSON with keys: {"result": string, "hashtags": string[], "pollSuggestion"?: {"question": string, "options": string[]}, "storyMeta"?: {"title": string, "scentTag": string, "caption": string}, "suggestedCircle": string}. Never mention external AI company or model names.`;
  const prompt = `Language: ${lang}. Mode: ${mode}. Tone: ${tone}. Existing draft: ${text || '(none)'}. Topic/hint: ${topic || '(none)'}.`;

  const remote = await runModelJson<{
    result?: string;
    hashtags?: string[];
    pollSuggestion?: { question: string; options: string[] };
    storyMeta?: { title: string; scentTag: string; caption: string };
    suggestedCircle?: string;
  }>(sys, prompt, options);

  if (remote?.result) {
    return {
      result: remote.result,
      hashtags: Array.isArray(remote.hashtags) ? remote.hashtags.slice(0, 6) : [],
      pollSuggestion: remote.pollSuggestion,
      storyMeta: remote.storyMeta,
      suggestedCircle: remote.suggestedCircle || detectCircle(`${text} ${topic}`, lang),
      poweredBy: 'sham_intelligence' as const,
    };
  }

  // Deterministic high-craft fallback
  const basis = `${text} ${topic}`.trim();
  const extracted = extractNotes(basis, lang);
  const defaultTags = lang === 'ar'
    ? ['دار_شام', 'صناعة_العطور', 'تعتيق_العطور', ...extracted.tags]
    : ['DarSham', 'Perfumery', 'Maceration', ...extracted.tags];
  const hashtags = [...new Set(defaultTags)].slice(0, 5).map((h) => (h.startsWith('#') ? h : `#${h}`));

  if (mode === 'poll_ideas') {
    const isOud = /عود|oud/i.test(basis);
    const pollSuggestion = lang === 'ar'
      ? isOud
        ? {
            question: 'ما هو التوازن المثالي لافتتاحية العود المعتق في هذا الموسم؟',
            options: ['برغموت إيطالي منعش 8%', 'زعفران وهيل أخضر 6%', 'ورد دمشقي مخملي 12%', 'نقي دون افتتاحية زهرية'],
          }
        : {
            question: topic || 'ما هو التركيز المفضل لديكم للحصول على أعلى فوحان وثبات متوازن؟',
            options: ['Eau de Parfum (18% - 20%)', 'Extrait de Parfum (25% - 30%)', 'زيت عطري صافي 100%', 'تركيز صيفي خفيف 14%'],
          }
      : {
          question: topic || 'Which concentration gives the cleanest sillage-to-longevity curve for ambery formulas?',
          options: ['18% Eau de Parfum', '25% Intense EDP', '30% Extrait de Parfum', 'Pure Attar Oil Blend'],
        };
    return {
      result: pollSuggestion.question,
      hashtags,
      pollSuggestion,
      suggestedCircle: detectCircle(basis, lang),
      poweredBy: 'sham_intelligence' as const,
    };
  }

  if (mode === 'story_prompt') {
    const title = lang === 'ar'
      ? (extracted.base[0] ? `تجربة ${extracted.base[0]}` : 'تجربة معملية جديدة')
      : (extracted.base[0] ? `${extracted.base[0]} Lab Trial` : 'New Atelier Trial');
    const scentTag = [...extracted.top.slice(0, 1), ...extracted.heart.slice(0, 1), ...extracted.base.slice(0, 1)].join(' + ')
      || (lang === 'ar' ? 'برغموت + ورد دمشقي + عود' : 'Bergamot + Rose + Oud');
    const caption = lang === 'ar'
      ? (text ? `${text.trim()} ✨ — توازن الهرم العطري يبدأ بالصبر ودقة الميزان.` : `لحظة تأمل من المعمل حول موازنة ${scentTag} مع تعتيق بارد هادئ لصناعة هالة عطرية لا تُنسى ✨`)
      : (text ? `${text.trim()} ✨ — Olfactory harmony starts with patience and precision.` : `A quiet lab study balancing ${scentTag} under cool maceration for luminous sillage ✨`);
    return {
      result: caption,
      hashtags,
      storyMeta: { title, scentTag, caption },
      suggestedCircle: detectCircle(basis, lang),
      poweredBy: 'sham_intelligence' as const,
    };
  }

  if (mode === 'translate') {
    const isArabic = /[\u0600-\u06FF]/.test(text);
    const out = isArabic
      ? `Perfumer Lab Note: "${text}" — Focused on harmonious olfactory pyramid layering and clean maceration balance.`
      : `مذكرة معمل العطور: «${text}» — تركيز خاص على تناغم الهرم العطري ودقة التعتيق والانتشار.`;
    return {
      result: text ? out : '',
      hashtags,
      suggestedCircle: detectCircle(basis, lang),
      poweredBy: 'sham_intelligence' as const,
    };
  }

  if (mode === 'hashtags') {
    return {
      result: `${text ? `${text.trim()}\n\n` : ''}${hashtags.join(' ')}`,
      hashtags,
      suggestedCircle: detectCircle(basis, lang),
      poweredBy: 'sham_intelligence' as const,
    };
  }

  if (mode === 'draft') {
    const subject = topic || (lang === 'ar' ? 'تعتيق تركيبة عطرية جديدة' : 'macerating a signature formulation');
    const draft = lang === 'ar'
      ? tone === 'scientific'
        ? `🔬 تجربة معملية حول ${subject}:\nبعد ضبط نسبة الزيت العطري ومراقبة التجانس على حرارة 15°م، لاحظنا استقراراً ممتازاً في القاعدة وتدرجاً أنيقاً من الافتتاحية إلى القلب.\nما هي توصياتكم لتعزيز الهالة في الساعات الأولى؟\n\n${hashtags.join(' ')}`
        : `✨ مشاركة من قلب المعمل حول ${subject}:\nعملت اليوم على موازنة الطبقات بين النوتات المنعشة والقاعدة الدافئة للحصول على أثر عطري مخملي يدوم لساعات طويلة.\nيسعدني سماع آرائكم وتجاربكم يا صناع العطور 🌿\n\n${hashtags.join(' ')}`
      : tone === 'scientific'
        ? `Lab Trial — ${subject}:\nAfter calibrating oil concentration and monitoring cool maceration at 15°C, base stability improved significantly with a clean top-to-heart bridge.\nWhat modifier ratios would you suggest to lift the opening projection?\n\n${hashtags.join(' ')}`
        : `From the compounding bench — exploring ${subject}:\nBalancing radiant top aromatics with a velvety resinous drydown for lingering, refined sillage.\nWould love to hear how fellow artisans approach this accord!\n\n${hashtags.join(' ')}`;
    return {
      result: draft,
      hashtags,
      suggestedCircle: detectCircle(basis, lang),
      poweredBy: 'sham_intelligence' as const,
    };
  }

  // mode === 'polish'
  const cleaned = text.replace(/\n{3,}/g, '\n\n').trim();
  const polished = cleaned
    ? lang === 'ar'
      ? tone === 'scientific'
        ? `🔬 ${cleaned}\n\n💡 سؤال للمجتمع: ما ملاحظاتكم حول ثبات التركيبة ونسبة المثبتات المناسبة هنا؟`
        : `✨ ${cleaned}\n\n${hashtags.slice(0, 3).join(' ')}`
      : `✨ ${cleaned}\n\n${hashtags.slice(0, 3).join(' ')}`
    : '';

  return {
    result: polished,
    hashtags,
    suggestedCircle: detectCircle(basis, lang),
    poweredBy: 'sham_intelligence' as const,
  };
}

/* --------------------------------------- 2. Post Analyzer --------------------------------------- */

export async function aiAnalyzePost(
  input: { body?: unknown; recipe?: { title?: string; data?: Record<string, unknown> } | null; lang?: unknown },
  options: CommunityAiOptions = {},
) {
  const lang: Lang = input.lang === 'en' ? 'en' : 'ar';
  const body = clean(input.body, 4000);
  const recipeTitle = clean(input.recipe?.title, 180);
  const fullText = `${body} ${recipeTitle} ${JSON.stringify(input.recipe?.data || {})}`;

  const remote = await runModelJson<{
    summary?: string;
    circle?: string;
    detectedNotes?: { top: string[]; heart: string[]; base: string[] };
    craftTip?: string;
    suggestedReplies?: string[];
  }>(
    `You are Sham Fragrance AI Analyst. Analyze this community post for a perfumery forum. Return ONLY JSON: {"summary": string, "circle": string, "detectedNotes": {"top": string[], "heart": string[], "base": string[]}, "craftTip": string, "suggestedReplies": string[]}. Keep summary under 2 sentences, craftTip practical and chemistry-accurate, and 3 natural reply options.`,
    `Lang: ${lang}. Post: ${body}. Recipe: ${recipeTitle || 'none'}`,
    options,
  );

  if (remote?.summary && Array.isArray(remote.suggestedReplies)) {
    return {
      summary: remote.summary,
      circle: remote.circle || detectCircle(fullText, lang),
      detectedNotes: remote.detectedNotes || { top: [], heart: [], base: [] },
      craftTip: remote.craftTip || '',
      suggestedReplies: remote.suggestedReplies.slice(0, 3),
    };
  }

  const notes = extractNotes(fullText, lang);
  const circle = detectCircle(fullText, lang);
  const hasOudOrAmber = notes.base.length > 0;
  const hasCitrusOrTop = notes.top.length > 0;

  const summary = lang === 'ar'
    ? recipeTitle
      ? `يركز المنشور على تركيبة «${recipeTitle}» ضمن ${circle}، مع حضور واضح لنوتات ${[...notes.base, ...notes.heart].slice(0, 3).join(' و') || 'متنوعة'}.`
      : `تدوينة عطرية ضمن ${circle} تتناول ${hasOudOrAmber ? 'بناء القاعدة والثبات العطري' : hasCitrusOrTop ? 'إشراقة الافتتاحية وتوازن الفوحان' : 'تجربة معملية لصناع العطور'}.`
    : recipeTitle
      ? `Highlights the formulation "${recipeTitle}" in the ${circle}, anchored by ${[...notes.base, ...notes.heart].slice(0, 3).join(', ') || 'balanced accords'}.`
      : `A discussion inside ${circle} exploring ${hasOudOrAmber ? 'deep base fixation & aging' : 'top-note radiance & pyramid balance'}.`;

  const craftTip = lang === 'ar'
    ? hasOudOrAmber && !hasCitrusOrTop
      ? 'نصيحة شاهين المعملية: إضافة 4–6% من البرغموت الإيطالي أو الـ Hedione تفتح القاعدة الثقيلة وتمنح العطر إشراقة فوحان أسرع.'
      : hasCitrusOrTop
        ? 'نصيحة شاهين المعملية: التعتيق المظلم لمدة 21–30 يوماً مع 1.5% أمبروكسان يحمي النوتات العليا من الأكسدة ويطيل بقاءها على البشرة.'
        : 'نصيحة شاهين المعملية: اترك العينة ترتاح 14 يوماً قبل الحكم النهائي على التجانس، ودوّن التغيرات الشمّية في دفتر المعمل.'
    : hasOudOrAmber && !hasCitrusOrTop
      ? 'Sham Lab Tip: Lifting a rich resinous base with 4–6% Bergamot or Hedione accelerates early diffusion without muddying the heart.'
      : 'Sham Lab Tip: Cool dark maturation (15°C for 3–4 weeks) merges alcohol and essential oils into a noticeably rounder sillage.';

  const suggestedReplies = lang === 'ar'
    ? [
        recipeTitle
          ? `تركيبة «${recipeTitle}» متوازنة جداً! هل تم تعتيقها أكثر من 30 يوماً؟`
          : 'اختيار موفق للنوتات! كم كانت نسبة التعتيق ودرجة الحرارة المستخدمة؟',
        hasOudOrAmber
          ? 'دمج رائع في القاعدة، إضافة لمسة هيديون خفيفة ستزيد من انتشارها السحري ✨'
          : 'إشراقة جميلة جداً! جرب استخدام زجاج عسلي معزول عن الضوء للحفاظ على الافتتاحية 🌿',
        'شكراً لمشاركة هذه التجربة الثرية مع مجتمع صناع العطور 👏',
      ]
    : [
        recipeTitle
          ? `Lovely balance on "${recipeTitle}"! How long did you macerate this batch?`
          : 'Great accord direction! What carrier percentage and maturation time worked best?',
        'Subtle Hedione or Ambroxan (1-2%) would elevate the spatial diffusion smoothly.',
        'Appreciate you sharing your bench notes with the community 👏',
      ];

  return {
    summary,
    circle,
    detectedNotes: { top: notes.top, heart: notes.heart, base: notes.base },
    craftTip,
    suggestedReplies,
  };
}

/* --------------------------------------- 3. Smart Reply Assist --------------------------------------- */

export async function aiReplyAssist(
  input: {
    contextType?: unknown;
    recentMessages?: Array<{ sender?: string; text: string }>;
    threadTitle?: unknown;
    threadBody?: unknown;
    draft?: unknown;
    mode?: unknown;
    tone?: unknown;
    lang?: unknown;
  },
  options: CommunityAiOptions = {},
) {
  const lang: Lang = input.lang === 'en' ? 'en' : 'ar';
  const contextType = String(input.contextType || 'messenger');
  const mode = String(input.mode || 'suggest');
  const draft = clean(input.draft, 1500);
  const title = clean(input.threadTitle, 250);
  const body = clean(input.threadBody, 2000);
  const msgs = Array.isArray(input.recentMessages)
    ? input.recentMessages.slice(-5).map((m) => `${m.sender || 'member'}: ${String(m.text || '').slice(0, 300)}`).join('\n')
    : '';

  const remote = await runModelJson<{ suggestions?: string[]; polishedDraft?: string; summary?: string }>(
    `You are Sham Community Assistant helping perfumers reply faster in ${contextType}. Return ONLY JSON: {"suggestions": string[], "polishedDraft": string, "summary": string}. Never mention model vendor names.`,
    `Lang: ${lang}. Mode: ${mode}. Draft: ${draft}. Title: ${title}. Body: ${body}. Recent conversation:\n${msgs}`,
    options,
  );

  if (remote?.suggestions?.length || remote?.polishedDraft) {
    return {
      suggestions: (remote.suggestions || []).slice(0, 3),
      polishedDraft: remote.polishedDraft || undefined,
      summary: remote.summary || undefined,
    };
  }

  if (mode === 'polish' && draft) {
    const polishedDraft = lang === 'ar'
      ? `${draft.trim().replace(/[.،]+$/, '')}، مع خالص التقدير لتجربتك العطرية ✨`
      : `${draft.trim()} — Wishing you luminous results on the blending bench! ✨`;
    return { suggestions: [], polishedDraft };
  }

  if (mode === 'translate' && draft) {
    const isArabic = /[\u0600-\u06FF]/.test(draft);
    const polishedDraft = isArabic
      ? `Message regarding fragrance note & formula: "${draft}"`
      : `بخصوص التجربة والتركيبة العطرية: «${draft}»`;
    return { suggestions: [], polishedDraft };
  }

  const combined = `${title} ${body} ${msgs}`;
  const notes = extractNotes(combined, lang);

  if (contextType === 'discussion') {
    const summary = lang === 'ar'
      ? `خلاصة شاهين للنقاش: يدور الحوار حول ${notes.tags.length ? notes.tags.map((x) => x.replace(/_/g, ' ')).join(' و') : 'معايير الجودة والتعتيق'} مع إجماع الخبراء على أهمية استقرار الحرارة وعزل الضوء.`
      : `Sham Salon Synthesis: Artisans are weighing ${notes.tags.join(', ') || 'aging & stability parameters'}, emphasizing cool dark maceration and clean solvent ratios.`;
    const suggestions = lang === 'ar'
      ? [
          'من واقع تجربتي في المعمل، التبريد الهادئ على 15°م يعطي أعلى نقاء للتجانس دون تغيم.',
          'أتفق تماماً! جربت أيضاً تقليل النوتات الحادة بواقع 2% فكانت النتيجة أكثر مخملية.',
          'هل تم اختبار هذه النسبة على شريط الشم (Blotter) بعد مرور 6 ساعات؟',
        ]
      : [
          'In my lab trials, slow cold maceration at 15°C prevents clouding and rounds harsh edges.',
          'Spot on — trimming the top spice by 2% usually lets the saffron and resin breathe better.',
          'Curious how this ratio evolves on a scent strip at the 6-hour drydown mark?',
        ];
    return { summary, suggestions };
  }

  // Messenger / Comment replies
  const lastMsg = msgs.split('\n').pop() || '';
  const asksRecipe = /تركيبة|وصفة|نسبة|كم|تركيز|recipe|ratio|formula|oud|عود/i.test(lastMsg);
  const suggestions = lang === 'ar'
    ? asksRecipe
      ? [
          'أهلاً بك! سأشاركك الآن تفاصيل النسب الكاملة من مكتبة التركيبات 🧪',
          'تركيز 22% مع تعتيق 3 أسابيع يعطي أفضل توازن في هذه الخلطة ✨',
          'بالتأكيد! أي نوع من العود أو المثبتات تفضل الاعتماد عليه في القاعدة؟',
        ]
      : [
          'أهلاً وسهلاً بك يا مبدع! يسعدني تبادل الخبرات معك في معمل شام 🌿',
          'فكرة رائعة جداً، متى نختبر العينة ونشارك النتائج في المجتمع؟ ✨',
          'شكراً جزيلاً لتواصلك الراقي، في انتظار أحدث إبداعاتك العطرية 🙏',
        ]
    : asksRecipe
      ? [
          'Happy to help! Let me pull the exact ratio straight from my saved formulas 🧪',
          '22% concentration with 3 weeks of dark maceration hits the sweet spot ✨',
          'Definitely — which oud or fixative base are you pairing it with?',
        ]
      : [
          'Great connecting with you on Sham Community! Always a pleasure exchanging bench notes 🌿',
          'Brilliant idea — let us test a sample batch and compare drydown notes ✨',
          'Thank you kindly, excited to see your next creation!',
        ];

  return { suggestions };
}

/* --------------------------------------- 4. Smart Omnibar Search --------------------------------------- */

export async function aiSearch(
  ctx: Ctx,
  viewerId: string,
  rawQuery: unknown,
  rawLang: unknown = 'ar',
  options: CommunityAiOptions = {},
) {
  const lang: Lang = rawLang === 'en' ? 'en' : 'ar';
  const query = clean(rawQuery, 120);
  if (query.length < 2) {
    return { answer: '', posts: [], people: [], recipes: [], relatedTags: [] };
  }
  const safeLike = `%${query.toLowerCase().replace(/[%_\\]/g, '')}%`;

  const peopleRows = await ctx.sql.query(
    `SELECT ${USER_COLUMNS} FROM ${USER_FROM}
     WHERE u.status = 'active' AND u.id <> $1
       AND (lower(u.name) LIKE $2 OR u.handle LIKE $2 OR lower(u.bio) LIKE $2)
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $1))
     ORDER BY u.last_seen DESC LIMIT 6`,
    [viewerId, safeLike],
  );

  const postRows = await ctx.sql.query(
    `SELECT ${USER_COLUMNS}, p.id AS post_id, p.author_id, p.body, p.image, p.recipe_id, p.visibility, p.created_at AS post_created, p.edited_at,
       (SELECT count(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'visible')::int AS comments,
       (SELECT coalesce(json_object_agg(kind, n), '{}') FROM (SELECT kind, count(*)::int AS n FROM reactions r WHERE r.post_id = p.id GROUP BY kind) k) AS reaction_counts,
       (SELECT kind FROM reactions r WHERE r.post_id = p.id AND r.user_id = $1) AS my_reaction,
       (SELECT coalesce(json_object_agg(option_index::text, n), '{}') FROM (SELECT option_index, count(*)::int AS n FROM poll_votes pv WHERE pv.post_id = p.id GROUP BY option_index) pk) AS poll_votes,
       (SELECT option_index FROM poll_votes pv WHERE pv.post_id = p.id AND pv.user_id = $1) AS my_poll_vote,
       EXISTS (SELECT 1 FROM bookmarks bk WHERE bk.post_id = p.id AND bk.user_id = $1) AS bookmarked,
       rc.title AS recipe_title, rc.data AS recipe_data, rc.visibility AS recipe_visibility
     FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN merchants m ON m.user_id = u.id LEFT JOIN recipes rc ON rc.id = p.recipe_id
     WHERE p.status = 'visible' AND u.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = p.author_id) OR (b.blocker = p.author_id AND b.blocked = $1))
       AND (p.visibility = 'public' OR p.author_id = $1 OR EXISTS (
         SELECT 1 FROM friendships f WHERE f.status = 'accepted' AND ((f.user_a = $1 AND f.user_b = p.author_id) OR (f.user_b = $1 AND f.user_a = p.author_id))))
       AND (lower(p.body) LIKE $2 OR lower(coalesce(rc.title, '')) LIKE $2)
     ORDER BY p.created_at DESC LIMIT 8`,
    [viewerId, safeLike],
  );

  const recipeRows = await ctx.sql.query(
    `SELECT r.id, r.title, u.name AS owner_name, u.handle AS owner_handle
     FROM recipes r JOIN users u ON u.id = r.user_id
     WHERE u.status = 'active' AND (r.visibility = 'public' OR r.user_id = $1)
       AND (lower(r.title) LIKE $2 OR lower(r.notes) LIKE $2)
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = r.user_id) OR (b.blocker = r.user_id AND b.blocked = $1))
     ORDER BY r.updated_at DESC LIMIT 5`,
    [viewerId, safeLike],
  );

  const people = peopleRows.map(publicUser);
  const posts = postRows.map((r) => postView(r, viewerId));
  const recipes = recipeRows.map((r) => ({ id: r.id, title: r.title, ownerName: r.owner_name, ownerHandle: r.owner_handle }));
  const notes = extractNotes(query + ' ' + posts.map((p) => p.body).join(' '), lang);

  const contextSnippets = posts.slice(0, 3).map((p) => `- ${p.author.name}: ${p.body.slice(0, 140)}`).join('\n');
  const remote = await runModelJson<{ answer?: string }>(
    `You summarize Sham Perfumers Community search findings concisely (max 2 sentences). Return ONLY JSON: {"answer": string}. Never invent fake products or vendor names.`,
    `Lang: ${lang}. Query: "${query}". Found ${posts.length} posts, ${recipes.length} formulas, ${people.length} perfumers.\n${contextSnippets}`,
    options,
    8000,
  );

  const fallbackAnswer = lang === 'ar'
    ? posts.length || recipes.length || people.length
      ? `تم العثور على ${posts.length} منشورات و${recipes.length} تركيبات و${people.length} صانعي عطور مرتبطين بـ «${query}» ضمن ${detectCircle(query, lang)}.`
      : `توجيه شاهين حول «${query}»: يمكنك طرح سؤال في مجلس النقاش العام أو تفعيل حاسبة المعمل لاختبار نسب ${notes.tags[0]?.replace(/_/g, ' ') || 'هذا التناغم العطري'}.`
    : posts.length || recipes.length || people.length
      ? `Found ${posts.length} posts, ${recipes.length} shared formulas, and ${people.length} perfumers related to "${query}" in ${detectCircle(query, lang)}.`
      : `Sham AI insight on "${query}": start a thread in the Salon or open the Lab Calculator to explore ratios for this accord.`;

  return {
    answer: remote?.answer || fallbackAnswer,
    posts,
    people,
    recipes,
    relatedTags: notes.tags,
  };
}

/* --------------------------------------- 5. Artisan Matchmaking --------------------------------------- */

export async function aiMatchmaking(
  ctx: Ctx,
  viewerId: string,
  rawLang: unknown = 'ar',
  _options: CommunityAiOptions = {},
) {
  const lang: Lang = rawLang === 'en' ? 'en' : 'ar';
  const rows = await ctx.sql.query(
    `SELECT ${USER_COLUMNS},
       (SELECT count(*) FROM recipes r WHERE r.user_id = u.id AND r.visibility = 'public')::int AS pub_recipes,
       (SELECT string_agg(left(p.body, 120), ' | ') FROM posts p WHERE p.author_id = u.id AND p.status = 'visible' AND p.visibility = 'public') AS recent_text
     FROM ${USER_FROM}
     WHERE u.status = 'active' AND u.id <> $1
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $1))
       AND NOT EXISTS (SELECT 1 FROM friendships f WHERE (f.user_a = $1 AND f.user_b = u.id) OR (f.user_b = $1 AND f.user_a = u.id))
     ORDER BY pub_recipes DESC, u.last_seen DESC LIMIT 6`,
    [viewerId],
  );

  const matches = rows.map((r) => {
    const u = publicUser(r);
    const notes = extractNotes(`${u.bio} ${r.recent_text || ''}`, lang);
    const sharedInterests = [
      ...notes.top.slice(0, 1),
      ...notes.heart.slice(0, 1),
      ...notes.base.slice(0, 2),
    ];
    if (!sharedInterests.length) {
      sharedInterests.push(lang === 'ar' ? 'الكيمياء العطرية' : 'Perfume Compounding');
    }
    const circle = detectCircle(`${u.bio} ${r.recent_text || ''}`, lang);
    const reason = lang === 'ar'
      ? u.craftLevel === 'master_lab'
        ? `معمل معتمد في ${circle} · ${r.pub_recipes || 0} تركيبات منشورة`
        : `تخصص في ${sharedInterests.slice(0, 2).join(' و')} ضمن ${circle}`
      : u.craftLevel === 'master_lab'
        ? `Master Lab active in ${circle} · ${r.pub_recipes || 0} public formulas`
        : `Specializes in ${sharedInterests.slice(0, 2).join(' & ')} inside ${circle}`;

    return {
      user: u,
      sharedInterests: sharedInterests.slice(0, 3),
      reason,
      sharedCircle: circle,
    };
  });

  const circleSpotlights = [
    {
      id: 'oud',
      nameAr: 'حلقة العود والبخور',
      nameEn: 'Oud & Incense Circle',
      reason: lang === 'ar' ? 'أعلى تفاعل في تقنيات التعتيق البارد والعود المعتق' : 'High activity in cold maceration & aged oud craft',
    },
    {
      id: 'lab',
      nameAr: 'حلقة المعمل والتعتيق',
      nameEn: 'Lab & Maceration Circle',
      reason: lang === 'ar' ? 'نقاشات يومية حول المثبتات ومعامل الأمان العطري' : 'Daily bench notes on fixatives and stability testing',
    },
    {
      id: 'floral',
      nameAr: 'حلقة الورد والتقطير النقي',
      nameEn: 'Floral & Distillation Circle',
      reason: lang === 'ar' ? 'مراجعات حيّة لمواسم قطاف الورد الدمشقي والياسمين' : 'Live harvest notes on Damask rose and jasmine extraction',
    },
  ];

  return { matches, circleSpotlights };
}

/* --------------------------------------- 6. Profile Olfactory Insight --------------------------------------- */

export async function aiProfileSummary(
  ctx: Ctx,
  viewerId: string,
  handle: string,
  rawLang: unknown = 'ar',
  options: CommunityAiOptions = {},
) {
  const lang: Lang = rawLang === 'en' ? 'en' : 'ar';
  const [userRow] = await ctx.sql.query(
    `SELECT ${USER_COLUMNS} FROM ${USER_FROM} WHERE u.handle = $1 AND u.status = 'active'`,
    [clean(handle, 40).toLowerCase()],
  );
  if (!userRow) return { headline: '', summary: '', topNotes: [], collabIdea: '' };

  const posts = await ctx.sql.query(
    `SELECT body FROM posts WHERE author_id = $1 AND status = 'visible' AND (visibility = 'public' OR author_id = $2) ORDER BY created_at DESC LIMIT 8`,
    [userRow.id, viewerId],
  );
  const recipes = await ctx.sql.query(
    `SELECT title FROM recipes WHERE user_id = $1 AND (visibility = 'public' OR user_id = $2) LIMIT 8`,
    [userRow.id, viewerId],
  );

  const combined = `${userRow.bio} ${posts.map((p) => p.body).join(' ')} ${recipes.map((r) => r.title).join(' ')}`;
  const notes = extractNotes(combined, lang);
  const topNotes = [...notes.base, ...notes.heart, ...notes.top].slice(0, 5);
  const circle = detectCircle(combined, lang);

  const remote = await runModelJson<{ headline?: string; summary?: string; collabIdea?: string }>(
    `Create a warm, insightful 2-sentence olfactory profile summary for this artisan in JSON: {"headline": string, "summary": string, "collabIdea": string}.`,
    `Lang: ${lang}. Name: ${userRow.name}. Craft: ${userRow.craft_level}. Bio: ${userRow.bio}. Notes detected: ${topNotes.join(', ')}`,
    options,
    7000,
  );

  return {
    headline: remote?.headline || (lang === 'ar' ? `بصمة ${circle}` : `${circle} Signature`),
    summary: remote?.summary || (
      lang === 'ar'
        ? `يميل أسلوب ${userRow.name.split(' ')[0]} إلى التوازن بين ${topNotes.slice(0, 3).join(' و') || 'التركيبات الشرقية والنيش'} مع اهتمام واضح بدقة التعتيق وثبات الهالة العطرية.`
        : `${userRow.name.split(' ')[0]} focuses on balancing ${topNotes.slice(0, 3).join(', ') || 'Oriental and Niche accords'} with disciplined maceration and sillage clarity.`
    ),
    topNotes,
    collabIdea: remote?.collabIdea || (
      lang === 'ar'
        ? 'تعاون مقترح: تجربة موازنة عطر مشترك عبر مشاركة وصفة في الماسنجر واختبار تركيز 24%.'
        : 'Suggested collaboration: exchange a 24% Extrait trial formula directly in Messenger.'
    ),
  };
}
