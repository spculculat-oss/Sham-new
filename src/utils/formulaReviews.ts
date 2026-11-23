import { CURATED_FORMULA_PRESETS } from '../data/presets';
import { WORLD_PERFUMES } from '../data/worldPerfumes';
import type { SavedFormula } from '../types/perfume';

export type FormulaFamilyFilter = 'all' | 'oriental' | 'floral' | 'woody' | 'citrus' | 'gourmand';

export interface FormulaReviewItem {
  id: string;
  formulaId: string;
  formulaTitleAr: string;
  formulaTitleEn: string;
  olfactoryFamily: Exclude<FormulaFamilyFilter, 'all'>;
  concentrationLabel: string;
  reviewerNameAr: string;
  reviewerNameEn: string;
  reviewerRoleAr: string;
  reviewerRoleEn: string;
  rating: number; // 1..5 (positive list shows >= 4)
  headlineAr: string;
  headlineEn: string;
  commentAr: string;
  commentEn: string;
  longevityHours: number;
  sillageAr: string;
  sillageEn: string;
  batchCode: string;
  date: string; // ISO YYYY-MM-DD
  helpfulCount: number;
  sourceTab: 'formulas' | 'world_perfumes' | 'designer';
}

const STORAGE_KEY = 'sham_formula_positive_reviews_v1';
const HELPFUL_KEY = 'sham_formula_reviews_helpful_v1';

const SEED_FORMULA_REVIEWS: FormulaReviewItem[] = [
  {
    id: 'fr-seed-1',
    formulaId: 'formula-royal-oud',
    formulaTitleAr: 'سلطان العود والعنبر (Royal Amber Oud)',
    formulaTitleEn: 'Royal Amber Oud Extrait',
    olfactoryFamily: 'oriental',
    concentrationLabel: '25% Extrait',
    reviewerNameAr: 'م. طارق العسيري',
    reviewerNameEn: 'Eng. Tariq Al-Asiri',
    reviewerRoleAr: 'صانع عطور مستقل · الرياض',
    reviewerRoleEn: 'Independent Perfumer · Riyadh',
    rating: 5,
    headlineAr: 'ثبات يتخطى 14 ساعة بعد التعتيق البارد',
    headlineEn: 'Over 14h longevity after cold maceration',
    commentAr:
      'طبّقت المعادلة بنسبة ٢٥٪ أكستري مع تعتيق ٣٥ يوماً؛ الزعفران والورد الطائفي اندمجا بسلاسة مذهلة مع دهن العود الهندي دون أي حدة كحولية.',
    commentEn:
      'Compounded at 25% Extrait and macerated for 35 days; Kashmiri saffron and Taif rose melded seamlessly into aged Indian oud with zero harshness.',
    longevityHours: 14,
    sillageAr: 'فوحان ملكي واسع',
    sillageEn: 'Regal wide projection',
    batchCode: 'SHAM-OUD-08',
    date: '2026-11-18',
    helpfulCount: 28,
    sourceTab: 'formulas',
  },
  {
    id: 'fr-seed-2',
    formulaId: 'baccarat-rouge-540',
    formulaTitleAr: 'مستوحى من: بكرات روج 540',
    formulaTitleEn: 'Baccarat Rouge 540 Accord',
    olfactoryFamily: 'oriental',
    concentrationLabel: '24% Extrait',
    reviewerNameAr: 'د. نادية كمال',
    reviewerNameEn: 'Dr. Nadia Kamal',
    reviewerRoleAr: 'كيميائية عطور · القاهرة',
    reviewerRoleEn: 'Fragrance Chemist · Cairo',
    rating: 5,
    headlineAr: 'هالة أثيرية نقية وتوازن أمبروكسان دقيق',
    headlineEn: 'Crystal ethereal aura & balanced Ambroxan',
    commentAr:
      'نسبة الإيثيل مالتول ١٠٪ مقابل ٢٠٪ أمبروكسان أعطت إشعاعاً ناعماً يلتف حول المرتدي طوال اليوم دون إرهاق حاسة الشم.',
    commentEn:
      'Balancing 10% Ethyl Maltol against 20% pure Ambroxan yielded a luminous crystal aura that lasts all day without olfactory fatigue.',
    longevityHours: 16,
    sillageAr: 'إشعاع أثيري ممتد',
    sillageEn: 'Radiant lingering aura',
    batchCode: 'BR-540-EX',
    date: '2026-11-15',
    helpfulCount: 21,
    sourceTab: 'world_perfumes',
  },
  {
    id: 'fr-seed-3',
    formulaId: 'formula-paris-rose',
    formulaTitleAr: 'فلورا روز دي باريس (Parisian Rose)',
    formulaTitleEn: 'Parisian Rose & Vanilla EDP',
    olfactoryFamily: 'floral',
    concentrationLabel: '20% EDP',
    reviewerNameAr: 'سلمى الشهابي',
    reviewerNameEn: 'Salma Al-Shehabi',
    reviewerRoleAr: 'مصممة خطوط بوتيك · دبي',
    reviewerRoleEn: 'Boutique Line Designer · Dubai',
    rating: 5,
    headlineAr: 'أنوثة زهرية ناعمة محبوبة من أول تجربة',
    headlineEn: 'Velvety floral signature loved from first spray',
    commentAr:
      'تركيبة متزنة جداً للطقس الدافئ؛ الافتتاحية المشرقة تفتح الطريق لقلب الورد والفانيليا بشكل طبيعي ومخملي.',
    commentEn:
      'Remarkably balanced for warm climates; bright citrus opening glides effortlessly into velvety rose and Madagascar vanilla.',
    longevityHours: 10,
    sillageAr: 'فوحان متوسط أنيق',
    sillageEn: 'Refined moderate trail',
    batchCode: 'SHAM-FLR-02',
    date: '2026-11-11',
    helpfulCount: 17,
    sourceTab: 'formulas',
  },
  {
    id: 'fr-seed-4',
    formulaId: 'creed-aventus',
    formulaTitleAr: 'مستوحى من: كريد أفينتوس',
    formulaTitleEn: 'Creed Aventus Master Formula',
    olfactoryFamily: 'woody',
    concentrationLabel: '20% EDP',
    reviewerNameAr: 'أحمد زيدان',
    reviewerNameEn: 'Ahmed Zaidan',
    reviewerRoleAr: 'تاجر عطور نيش · عمّان',
    reviewerRoleEn: 'Niche Perfumery Owner · Amman',
    rating: 5,
    headlineAr: 'اتزان مثالي بين الأناناس المدخن والبتولا',
    headlineEn: 'Crisp smoked pineapple & birch harmony',
    commentAr:
      'أفضل نسخة تشيبر فاكهي جربتها؛ التزامن بين الأناناس والبرغموت مع ١٠٪ بتولا دخانية أعطى عمقاً راقياً دون تغطية الانتعاش.',
    commentEn:
      'Cleanest fruity-chypre execution; keeping birch tar restrained lets bright pineapple shine through into an oakmoss drydown.',
    longevityHours: 12,
    sillageAr: 'فوحان نفاذ واضح',
    sillageEn: 'Assertive clean projection',
    batchCode: 'AVT-2026',
    date: '2026-11-08',
    helpfulCount: 19,
    sourceTab: 'world_perfumes',
  },
  {
    id: 'fr-seed-5',
    formulaId: 'sauvage-dior',
    formulaTitleAr: 'مستوحى من: ديور سوفاج EDP',
    formulaTitleEn: 'Dior Sauvage Aromatic Blend',
    olfactoryFamily: 'citrus',
    concentrationLabel: '18% EDP',
    reviewerNameAr: 'عمر المنصور',
    reviewerNameEn: 'Omar Al-Mansour',
    reviewerRoleAr: 'مختبر عينات · الكويت',
    reviewerRoleEn: 'Sample Evaluator · Kuwait',
    rating: 4,
    headlineAr: 'انتعاش حمضي فوار وثبات يومي يعتمد عليه',
    headlineEn: 'Sparkling bergamot punch with all-day hold',
    commentAr:
      'فوحان قوي في الساعات الثلاث الأولى بفضل برغموت كالابريا والفلفل الوردي، ثم يستقر على قاعدة أمبروكسان نظيفة جداً للمكتب.',
    commentEn:
      'Lively projection during the first three hours from Calabrian bergamot and pink pepper, settling into a crisp daily Ambroxan base.',
    longevityHours: 11,
    sillageAr: 'فوحان قوي أول ٣ ساعات',
    sillageEn: 'Strong initial sillage',
    batchCode: 'SVG-18EDP',
    date: '2026-11-04',
    helpfulCount: 13,
    sourceTab: 'world_perfumes',
  },
  {
    id: 'fr-seed-6',
    formulaId: 'khamrah-angels-share',
    formulaTitleAr: 'مستوحى من: خمرة / أنجلز شير',
    formulaTitleEn: 'Khamrah & Angels’ Share Gourmand',
    olfactoryFamily: 'gourmand',
    concentrationLabel: '22% EDP',
    reviewerNameAr: 'رنا الحسيني',
    reviewerNameEn: 'Rana Al-Husseini',
    reviewerRoleAr: 'مصممة عطور · بيروت',
    reviewerRoleEn: 'Perfume Designer · Beirut',
    rating: 5,
    headlineAr: 'دفء شتوي آسر بالقرفة والتونكا والبرالين',
    headlineEn: 'Captivating winter warmth of cinnamon & tonka',
    commentAr:
      'أبهرت العملاء في موسم الخريف والشتاء؛ ثبات على المعاطف الصوفية يتجاوز ٢٤ ساعة مع رائحة تمور مكرملة فاخرة.',
    commentEn:
      'Instant bestseller for cool evenings; lasts over 24 hours on wool coats with spiced Ceylon cinnamon and praline warmth.',
    longevityHours: 18,
    sillageAr: 'فوحان دافئ غني',
    sillageEn: 'Rich enveloping sillage',
    batchCode: 'KHM-22W',
    date: '2026-10-29',
    helpfulCount: 24,
    sourceTab: 'world_perfumes',
  },
];

function loadCustomReviews(): FormulaReviewItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getHelpfulCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(HELPFUL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getHelpfulVotedIds(): string[] {
  try {
    const raw = localStorage.getItem(`${HELPFUL_KEY}_voted`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getAvailableFormulasForReview(savedFormulas: SavedFormula[] = []) {
  const seen = new Set<string>();
  const options: Array<{
    id: string;
    titleAr: string;
    titleEn: string;
    olfactoryFamily: Exclude<FormulaFamilyFilter, 'all'>;
    concentrationLabel: string;
    batchCode: string;
    sourceTab: 'formulas' | 'world_perfumes' | 'designer';
  }> = [];

  for (const f of savedFormulas) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    const cat = (f.category || 'oriental').toLowerCase();
    const family: Exclude<FormulaFamilyFilter, 'all'> =
      cat === 'floral' || cat === 'woody' || cat === 'citrus' || cat === 'gourmand' ? cat : 'oriental';
    options.push({
      id: f.id,
      titleAr: f.title,
      titleEn: f.titleEn || f.title,
      olfactoryFamily: family,
      concentrationLabel: `${f.formulation.concentrationPercent}% ${f.formulation.concentrationType.toUpperCase()}`,
      batchCode: f.batchCode || 'LAB-01',
      sourceTab: 'formulas',
    });
  }

  for (const f of CURATED_FORMULA_PRESETS) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    const cat = (f.category || 'oriental').toLowerCase();
    const family: Exclude<FormulaFamilyFilter, 'all'> =
      cat === 'floral' || cat === 'woody' || cat === 'citrus' || cat === 'gourmand' ? cat : 'oriental';
    options.push({
      id: f.id,
      titleAr: f.title,
      titleEn: f.titleEn || f.title,
      olfactoryFamily: family,
      concentrationLabel: `${f.formulation.concentrationPercent}% ${f.formulation.concentrationType.toUpperCase()}`,
      batchCode: f.batchCode || 'SHAM-01',
      sourceTab: 'formulas',
    });
  }

  for (const w of WORLD_PERFUMES) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    const cat = (w.category || 'oriental').toLowerCase();
    const family: Exclude<FormulaFamilyFilter, 'all'> =
      cat === 'floral' || cat === 'woody' || cat === 'citrus' || cat === 'gourmand' ? cat : 'oriental';
    options.push({
      id: w.id,
      titleAr: w.nameAr,
      titleEn: w.nameEn,
      olfactoryFamily: family,
      concentrationLabel: `${w.targetConcentration}% ${w.concentrationType.toUpperCase()}`,
      batchCode: w.id.slice(0, 8).toUpperCase(),
      sourceTab: 'world_perfumes',
    });
  }

  return options;
}

export function getFormulaPositiveReviews(): FormulaReviewItem[] {
  const custom = loadCustomReviews();
  const helpfulBoosts = getHelpfulCounts();
  const merged = [...custom, ...SEED_FORMULA_REVIEWS]
    .filter((r) => r.rating >= 4)
    .map((r) => ({
      ...r,
      helpfulCount: r.helpfulCount + (helpfulBoosts[r.id] || 0),
    }));

  return merged.sort((a, b) => b.date.localeCompare(a.date));
}

export function addFormulaReview(input: {
  formulaId: string;
  formulaTitleAr: string;
  formulaTitleEn: string;
  olfactoryFamily: Exclude<FormulaFamilyFilter, 'all'>;
  concentrationLabel: string;
  batchCode: string;
  sourceTab: 'formulas' | 'world_perfumes' | 'designer';
  reviewerName: string;
  rating: number;
  headline: string;
  comment: string;
  longevityHours: number;
  sillageAr: string;
  sillageEn: string;
}): FormulaReviewItem {
  const existing = loadCustomReviews();
  const item: FormulaReviewItem = {
    id: `fr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    formulaId: input.formulaId,
    formulaTitleAr: input.formulaTitleAr,
    formulaTitleEn: input.formulaTitleEn,
    olfactoryFamily: input.olfactoryFamily,
    concentrationLabel: input.concentrationLabel,
    reviewerNameAr: input.reviewerName.trim() || 'عاشق العطور',
    reviewerNameEn: input.reviewerName.trim() || 'Perfume Artisan',
    reviewerRoleAr: 'مختبر شام للتركيبات',
    reviewerRoleEn: 'Sham Atelier Evaluator',
    rating: Math.min(5, Math.max(4, Math.round(input.rating))),
    headlineAr: input.headline.trim() || 'تركيبة متناغمة وثبات ممتاز',
    headlineEn: input.headline.trim() || 'Harmonious blend with strong hold',
    commentAr: input.comment.trim(),
    commentEn: input.comment.trim(),
    longevityHours: Math.min(48, Math.max(1, Math.round(input.longevityHours))),
    sillageAr: input.sillageAr,
    sillageEn: input.sillageEn,
    batchCode: input.batchCode || 'SHAM-NEW',
    date: new Date().toISOString().split('T')[0],
    helpfulCount: 1,
    sourceTab: input.sourceTab,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([item, ...existing]));
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sham-formula-review-added', { detail: item }));
  }
  return item;
}

export function voteFormulaReviewHelpful(reviewId: string): boolean {
  try {
    const voted = getHelpfulVotedIds();
    if (voted.includes(reviewId)) return false;
    const boosts = getHelpfulCounts();
    boosts[reviewId] = (boosts[reviewId] || 0) + 1;
    localStorage.setItem(HELPFUL_KEY, JSON.stringify(boosts));
    localStorage.setItem(`${HELPFUL_KEY}_voted`, JSON.stringify([...voted, reviewId]));
    return true;
  } catch {
    return false;
  }
}
