import heroLuxuryImg from '../assets/images/hero_luxury_perfume_1791692409081.jpg';
import grasseRoseImg from '../assets/images/grasse_rose_harvest_1791696039244.jpg';
import labCompoundingImg from '../assets/images/perfume_lab_compounding_1791692420116.jpg';
import nicheRevealImg from '../assets/images/niche_perfume_reveal_1791968798991.jpg';
import botanicalHarvestImg from '../assets/images/botanical_harvest_raw_1791968832488.jpg';
import exhibitionImg from '../assets/images/luxury_perfume_exhibition_1791696134494.jpg';
import pyramidImg from '../assets/images/perfume_ingredients_pyramid_1791692429360.jpg';

export const SCENE_CATALOG = [
  { key: 'scene:compounding', src: labCompoundingImg, ar: 'المعمل والتركيب', en: 'Blending Bench' },
  { key: 'scene:rose', src: grasseRoseImg, ar: 'قطاف الورد', en: 'Rose Harvest' },
  { key: 'scene:niche', src: nicheRevealImg, ar: 'إصدار نيش', en: 'Niche Reveal' },
  { key: 'scene:flacon', src: heroLuxuryImg, ar: 'زجاجة ملكية', en: 'Crystal Flacon' },
  { key: 'scene:harvest', src: botanicalHarvestImg, ar: 'خامات وأخشاب', en: 'Botanical Raw Woods' },
  { key: 'scene:exhibition', src: exhibitionImg, ar: 'صالون العرض', en: 'Luxury Exhibition' },
  { key: 'scene:pyramid', src: pyramidImg, ar: 'الهرم العطري', en: 'Olfactory Pyramid' },
] as const;

export function resolveSceneSrc(value?: string | null, fallback = labCompoundingImg): string {
  if (!value) return fallback;
  const hit = SCENE_CATALOG.find((s) => s.key === value || s.key.replace('scene:', 'cover:') === value);
  if (hit) return hit.src;
  return value;
}

export const POST_BG_STYLES: {
  id: '' | 'amber' | 'obsidian' | 'rose' | 'emerald' | 'royal' | 'sunset';
  ar: string;
  en: string;
  cardClass: string;
  swatchClass: string;
}[] = [
  { id: '', ar: 'افتراضي', en: 'Default', cardClass: '', swatchClass: 'bg-white border-stone-300' },
  {
    id: 'amber',
    ar: 'عنبر ملكي',
    en: 'Royal Amber',
    cardClass: 'bg-gradient-to-br from-amber-700 via-amber-800 to-stone-900 text-white',
    swatchClass: 'bg-gradient-to-br from-amber-700 to-stone-900 border-amber-500',
  },
  {
    id: 'obsidian',
    ar: 'أوبسيديان داكن',
    en: 'Obsidian',
    cardClass: 'bg-gradient-to-br from-stone-900 via-zinc-900 to-amber-950 text-amber-100',
    swatchClass: 'bg-gradient-to-br from-stone-900 to-amber-950 border-stone-700',
  },
  {
    id: 'rose',
    ar: 'ورد دمشقي',
    en: 'Damask Rose',
    cardClass: 'bg-gradient-to-br from-rose-700 via-rose-800 to-stone-900 text-white',
    swatchClass: 'bg-gradient-to-br from-rose-700 to-stone-900 border-rose-500',
  },
  {
    id: 'emerald',
    ar: 'أرز زمردي',
    en: 'Cedar Emerald',
    cardClass: 'bg-gradient-to-br from-emerald-800 via-teal-900 to-stone-950 text-white',
    swatchClass: 'bg-gradient-to-br from-emerald-800 to-stone-950 border-emerald-500',
  },
  {
    id: 'royal',
    ar: 'نيش نيلي',
    en: 'Indigo Niche',
    cardClass: 'bg-gradient-to-br from-indigo-800 via-slate-900 to-stone-950 text-white',
    swatchClass: 'bg-gradient-to-br from-indigo-800 to-stone-950 border-indigo-500',
  },
  {
    id: 'sunset',
    ar: 'زعفران دافئ',
    en: 'Saffron Warmth',
    cardClass: 'bg-gradient-to-br from-orange-600 via-amber-700 to-rose-900 text-white',
    swatchClass: 'bg-gradient-to-br from-orange-600 to-rose-900 border-orange-400',
  },
];

export const CURATED_LOCATIONS = [
  { ar: 'دمشق — معمل التقطير والورد', en: 'Damascus — Rose Atelier' },
  { ar: 'القاهرة — مختبر العطور الشرقية', en: 'Cairo — Oriental Lab' },
  { ar: 'الرياض — صالون دهن العود', en: 'Riyadh — Oud Salon' },
  { ar: 'دبي — دار النيش الفاخرة', en: 'Dubai — Niche House' },
  { ar: 'جدة — سوق المسك والعنبر', en: 'Jeddah — Amber & Musk' },
  { ar: 'غراس — حقول الياسمين', en: 'Grasse — Jasmine Fields' },
];
