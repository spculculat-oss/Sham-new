import React, { useState, useMemo } from 'react';
import {
  Bookmark,
  Search,
  Plus,
  Trash2,
  Printer,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Clock,
  Layers,
  Check,
  Tag,
  Filter,
  Sparkle,
  Calendar,
} from 'lucide-react';
import { SavedFormula } from '../types/perfume';
import { CURATED_FORMULA_PRESETS } from '../data/presets';
import { SupportedLanguage } from '../types/i18n';
import { getCommonLabel, isRTL } from '../لغات/localizedContent';
import { LText, makeT, fmt, localeDate } from '../لغات/localize';

interface FormulaLibraryProps {
  currentLang?: SupportedLanguage;
  savedFormulas: SavedFormula[];
  onLoadFormula: (formula: SavedFormula) => void;
  onDeleteFormula: (id: string) => void;
  onPrintFormula: (formula: SavedFormula) => void;
}

export interface OlfactoryCategoryDef {
  id: string;
  labelAr: string;
  labelEn: string;
  emoji: string;
  color: string;
  activeColor: string;
}

export const OLFACTORY_CATEGORIES: OlfactoryCategoryDef[] = [
  { id: 'all', labelAr: 'جميع العائلات العطرية', labelEn: 'All Olfactory Families', emoji: '✨', color: 'bg-stone-100 text-stone-700 border-stone-200', activeColor: 'bg-stone-900 text-white' },
  { id: 'floral', labelAr: 'زهري (Floral)', labelEn: 'Floral', emoji: '🌸', color: 'bg-pink-50 text-pink-700 border-pink-200', activeColor: 'bg-pink-600 text-white' },
  { id: 'oriental', labelAr: 'شرقي (Oriental)', labelEn: 'Oriental', emoji: '🪵', color: 'bg-amber-50 text-amber-900 border-amber-300', activeColor: 'bg-amber-800 text-white' },
  { id: 'woody', labelAr: 'خشبي (Woody)', labelEn: 'Woody', emoji: '🌲', color: 'bg-emerald-50 text-emerald-800 border-emerald-300', activeColor: 'bg-emerald-800 text-white' },
  { id: 'fresh', labelAr: 'منعش ومائي (Fresh)', labelEn: 'Fresh & Aquatic', emoji: '🌊', color: 'bg-sky-50 text-sky-800 border-sky-300', activeColor: 'bg-sky-700 text-white' },
  { id: 'citrus', labelAr: 'حمضي (Citrus)', labelEn: 'Citrus', emoji: '🍊', color: 'bg-orange-50 text-orange-800 border-orange-300', activeColor: 'bg-orange-600 text-white' },
  { id: 'gourmand', labelAr: 'تذوقي (Gourmand)', labelEn: 'Gourmand', emoji: '🍫', color: 'bg-yellow-50 text-yellow-900 border-yellow-300', activeColor: 'bg-amber-950 text-white' },
  { id: 'aromatic', labelAr: 'أروماتيك (Aromatic)', labelEn: 'Aromatic', emoji: '🌿', color: 'bg-teal-50 text-teal-800 border-teal-300', activeColor: 'bg-teal-700 text-white' },
  { id: 'leather', labelAr: 'جلدي (Leather)', labelEn: 'Leather', emoji: '🧥', color: 'bg-stone-100 text-stone-800 border-stone-300', activeColor: 'bg-stone-800 text-white' },
];

/** Smart auto-detection of olfactory category from formula notes & title if not explicitly set */
export function detectFormulaCategory(formula: SavedFormula): string {
  if (formula.category) return formula.category.toLowerCase();
  
  const text = `${formula.title} ${formula.notes || ''} ${formula.pyramidNotes.map((n) => `${n.nameAr} ${n.nameEn || ''}`).join(' ')}`.toLowerCase();
  
  if (/ورد|ياسمين|زهور|rose|jasmine|floral|neroli|blossom|peony/.test(text)) return 'floral';
  if (/عود|عنبر|زعفران|oud|amber|saffron|oriental|incense|بخور/.test(text)) return 'oriental';
  if (/صندل|أرز|سيدار|خشب|sandalwood|cedar|woody|vetiver|فيتيفر|كشمير/.test(text)) return 'woody';
  if (/بحر|ماء|أوزون|ملح|aqua|marine|fresh|ozone|cool/.test(text)) return 'fresh';
  if (/برغموت|ليمون|يوسفي|حمضيات|citrus|lemon|bergamot|mandarin/.test(text)) return 'citrus';
  if (/فانيليا|كراميل|تونكا|لوز|شوكولاتة|vanilla|caramel|tonka|gourmand|almond/.test(text)) return 'gourmand';
  if (/لافندر|خزامى|إكليل|نعناع|lavender|rosemary|aromatic|mint|sage/.test(text)) return 'aromatic';
  if (/جلد|ليذر|leather|suede/.test(text)) return 'leather';
  
  return 'oriental'; // luxury default
}

const S = {
  page_title: {
    ar: 'مكتبة الوصفات وتاريخ التشغيلات',
    en: 'Formulation Library & Batch Archive',
    fr: 'Bibliothèque de formules et archives',
    es: 'Biblioteca de fórmulas y archivo',
    it: 'Libreria formule e archivio lotti',
    de: 'Formelbibliothek & Chargenarchiv',
    ru: 'Библиотека формул и архив партий',
    zh: '配方库与批次档案',
    tr: 'Formül kütüphanesi ve parti arşivi',
    fa: 'کتابخانه فرمول‌ها و تاریخچه پارت‌ها',
  },
  page_desc: {
    ar: 'تصفح تركيباتك المسجلة المصنفة حسب العائلات العطرية، حمّلها مباشرة إلى حاسبة المعمل، أو اطبع بطاقة التشغيلة للمصنع.',
    en: 'Browse saved formulas categorized by olfactory family, load directly into the laboratory calculator, or print production spec sheets.',
    fr: 'Parcourez vos formules par famille olfactive, chargez-les dans le calculateur ou imprimez les fiches de production.',
    es: 'Explore sus fórmulas clasificadas por familia olfativa, cárguelas en la calculadora o imprima fichas de producción.',
    it: 'Sfoglia le formule per famiglia olfattiva, caricale nel calcolatore o stampa le schede di produzione.',
    de: 'Durchsuchen Sie Formeln nach Duftfamilien, laden Sie sie in den Rechner oder drucken Sie Produktionsblätter.',
    ru: 'Просматривайте формулы по ольфакторным семействам, загружайте в калькулятор или печатайте техкарты.',
    zh: '按香调家族浏览配方，直接载入实验室计算器，或打印生产规格单。',
    tr: 'Koku ailelerine göre sınıflandırılmış formülleri gözden geçirin, hesaplayıcıya yükleyin veya yazdırın.',
    fa: 'فرمول‌های دسته‌بندی‌شده بر اساس خانواده بویایی را مرور کنید یا برای تولید چاپ نمایید.',
  },
  search_ph: {
    ar: 'بحث بالاسم، الكود، المصمم، النوتات أو الفئة العطرية...',
    en: 'Search by formula name, batch code, category or notes...',
    fr: 'Rechercher par nom, code de lot, catégorie ou notes...',
    es: 'Buscar por nombre, código, categoría o notas...',
    it: 'Cerca per nome, codice lotto, categoria o note...',
    de: 'Nach Name, Chargencode, Kategorie oder Noten suchen...',
    ru: 'Поиск по названию, коду, категории или нотам...',
    zh: '按配方名、代码、香调或香材搜索…',
    tr: 'İsim, parti kodu, kategori veya notalara göre ara...',
    fa: 'جستجو بر اساس نام، کد، دسته یا نت‌ها...',
  },
  all_formulas_tpl: {
    ar: 'جميع التركيبات ({n})',
    en: 'All Formulas ({n})',
    fr: 'Toutes les formules ({n})',
    es: 'Todas las fórmulas ({n})',
    it: 'Tutte le formule ({n})',
    de: 'Alle Formeln ({n})',
    ru: 'Все формулы ({n})',
    zh: '全部配方（{n}）',
    tr: 'Tüm formüller ({n})',
    fa: 'همه ترکیب‌ها ({n})',
  },
  presets_tab: {
    ar: 'النماذج الكلاسيكية',
    en: 'Curated Presets',
    fr: 'Formules de référence',
    es: 'Fórmulas de referencia',
    it: 'Formule di riferimento',
    de: 'Meisterformeln',
    ru: 'Эталонные формулы',
    zh: '精选大师配方',
    tr: 'Usta formülleri',
    fa: 'فرمول‌های مرجع',
  },
  custom_tab: {
    ar: 'وصفاتي الخاصة',
    en: 'My Custom Recipes',
    fr: 'Mes recettes personnalisées',
    es: 'Mis recetas personalizadas',
    it: 'Le mie ricette personalizzate',
    de: 'Eigene Rezepte',
    ru: 'Мои рецепты',
    zh: '我的自创配方',
    tr: 'Özel reçetelerim',
    fa: 'فرمول‌های سفارشی من',
  },
  perfumer: {
    ar: 'المصمم:',
    en: 'Perfumer:',
    fr: 'Parfumeur :',
    es: 'Perfumista:',
    it: 'Profumiere:',
    de: 'Parfümeur:',
    ru: 'Парфюмер:',
    zh: '调香师：',
    tr: 'Parfümör:',
    fa: 'طراح:',
  },
  volume_strength: {
    ar: 'الحجم والتركيز',
    en: 'Volume & Strength',
    fr: 'Volume et concentration',
    es: 'Volumen y concentración',
    it: 'Volume e concentrazione',
    de: 'Volumen & Stärke',
    ru: 'Объём и концентрация',
    zh: '容量与浓度',
    tr: 'Hacim ve konsantrasyon',
    fa: 'حجم و غلظت',
  },
  maceration: {
    ar: 'مدة التعتيق',
    en: 'Maceration Period',
    fr: 'Durée de macération',
    es: 'Período de maceración',
    it: 'Tempo di macerazione',
    de: 'Reifezeit',
    ru: 'Срок мацерации',
    zh: '陈化期',
    tr: 'Maserasyon süresi',
    fa: 'مدت‌زمان کهنگی',
  },
  days: {
    ar: 'يوم',
    en: 'days',
    fr: 'jours',
    es: 'días',
    it: 'giorni',
    de: 'Tage',
    ru: 'дней',
    zh: '天',
    tr: 'gün',
    fa: 'روز',
  },
  notes_count_tpl: {
    ar: '{n} نوتات عطرية مدمجة في الهرم',
    en: '{n} pyramid notes included',
    fr: '{n} notes de pyramide incluses',
    es: '{n} notas de pirámide incluidas',
    it: '{n} note della piramide incluse',
    de: '{n} Pyramidennoten enthalten',
    ru: '{n} нот пирамиды включено',
    zh: '含 {n} 个金字塔香材',
    tr: '{n} piramit notası içerir',
    fa: '{n} نت عطری در هرم',
  },
  family_filter_title: {
    ar: 'تصفية حسب العائلة العطرية (Category Filter):',
    en: 'Filter by Olfactory Family (Category Filter):',
    fr: 'Filtrer par famille olfactive :',
    es: 'Filtrar por familia olfativa:',
    it: 'Filtra per famiglia olfattiva:',
    de: 'Nach Duftfamilie filtern:',
    ru: 'Фильтр по ольфакторному семейству:',
    zh: '按香调家族筛选：',
    tr: 'Koku ailesine göre filtrele:',
    fa: 'فیلتر بر اساس خانواده بویایی:',
  },
} satisfies Record<string, LText>;

export const FormulaLibrary: React.FC<FormulaLibraryProps> = ({
  currentLang = 'ar',
  savedFormulas,
  onLoadFormula,
  onDeleteFormula,
  onPrintFormula,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'custom' | 'presets'>('all');
  const [selectedFamily, setSelectedFamily] = useState<string>('all');

  const rtl = isRTL(currentLang);
  const isArabic = currentLang === 'ar';
  const L = makeT(currentLang, S);
  const ActionArrow = rtl ? ArrowLeft : ArrowRight;

  // Enrich formulas with resolved categories
  const enrichedFormulas = useMemo(() => {
    return savedFormulas.map((f) => ({
      ...f,
      resolvedCategory: detectFormulaCategory(f),
    }));
  }, [savedFormulas]);

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: enrichedFormulas.length };
    enrichedFormulas.forEach((f) => {
      counts[f.resolvedCategory] = (counts[f.resolvedCategory] || 0) + 1;
    });
    return counts;
  }, [enrichedFormulas]);

  const filtered = useMemo(() => {
    return enrichedFormulas.filter((f) => {
      // Query search
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        f.title.toLowerCase().includes(q) ||
        (f.titleEn || '').toLowerCase().includes(q) ||
        (f.author || '').toLowerCase().includes(q) ||
        (f.batchCode || '').toLowerCase().includes(q) ||
        (f.notes || '').toLowerCase().includes(q) ||
        (f.dateCreated || '').toLowerCase().includes(q) ||
        (f.createdAt || '').toLowerCase().includes(q) ||
        f.resolvedCategory.includes(q) ||
        (f.tags && f.tags.some((t) => t.toLowerCase().includes(q))) ||
        f.pyramidNotes.some((n) => n.nameAr.toLowerCase().includes(q) || n.nameEn.toLowerCase().includes(q));

      // Preset vs Custom tab
      const isPreset = CURATED_FORMULA_PRESETS.some((p) => p.id === f.id);
      if (activeTab === 'custom' && isPreset) return false;
      if (activeTab === 'presets' && !isPreset) return false;

      // Olfactory Family Filter
      if (selectedFamily !== 'all' && f.resolvedCategory !== selectedFamily) {
        return false;
      }

      return matchesQuery;
    });
  }, [enrichedFormulas, searchQuery, activeTab, selectedFamily]);

  const getCategoryDef = (catId: string): OlfactoryCategoryDef => {
    return (
      OLFACTORY_CATEGORIES.find((c) => c.id === catId) || {
        id: catId,
        labelAr: catId,
        labelEn: catId,
        emoji: '🧪',
        color: 'bg-amber-50 text-amber-900 border-amber-200',
        activeColor: 'bg-amber-900 text-white',
      }
    );
  };

  return (
    <div className="space-y-7" dir={rtl ? 'rtl' : 'ltr'}>
      {/* Section Header */}
      <div className="border-b border-stone-200/80 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-stone-900 font-serif-luxury flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-amber-700" />
              <span>{L('page_title')}</span>
            </h2>
            <p className="text-stone-500 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              {L('page_desc')}
            </p>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>{enrichedFormulas.length} {isArabic ? 'تركيبة موثقة' : 'Documented Formulas'}</span>
          </div>
        </div>
      </div>

      {/* Primary Filters (Search + Origin Tabs) */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5">
        {/* Search Input */}
        <div className="relative flex-1 max-w-lg">
          <Search className={`w-4 h-4 text-stone-400 absolute ${rtl ? 'right-3.5' : 'left-3.5'} top-3 pointer-events-none`} />
          <input
            type="text"
            placeholder={L('search_ph')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full ${rtl ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'} py-2.5 bg-white border border-stone-200/90 rounded-xl text-xs text-stone-900 focus:outline-none focus:border-amber-700 focus:ring-1 focus:ring-amber-200 shadow-2xs transition`}
          />
        </div>

        {/* Origin Tabs (All / Presets / Custom) */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl text-xs font-medium flex-wrap shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white text-stone-900 shadow-2xs font-bold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {fmt(L('all_formulas_tpl'), { n: savedFormulas.length })}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'presets'
                ? 'bg-white text-stone-900 shadow-2xs font-bold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {L('presets_tab')} ({CURATED_FORMULA_PRESETS.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'custom'
                ? 'bg-white text-stone-900 shadow-2xs font-bold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {L('custom_tab')} ({savedFormulas.filter((f) => !CURATED_FORMULA_PRESETS.some((p) => p.id === f.id)).length})
          </button>
        </div>
      </div>

      {/* Olfactory Category Filter Chips (Requested Feature) */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-3.5 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-stone-700 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-amber-700" />
            <span>{L('family_filter_title')}</span>
          </span>
          {selectedFamily !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedFamily('all')}
              className="text-[11px] font-semibold text-amber-800 hover:underline cursor-pointer"
            >
              {isArabic ? 'إلغاء التصفية' : 'Reset filter'}
            </button>
          )}
        </div>

        {/* Category Pills Carousel */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {OLFACTORY_CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            const isSelected = selectedFamily === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedFamily(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 flex items-center gap-1.5 transition-all cursor-pointer border ${
                  isSelected
                    ? `${cat.activeColor} shadow-xs border-transparent scale-102`
                    : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                }`}
              >
                <span>{cat.emoji}</span>
                <span>{isArabic ? cat.labelAr : cat.labelEn}</span>
                {count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Formula Cards Grid */}
      {filtered.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-stone-200 text-stone-400 text-sm space-y-3">
          <Bookmark className="w-10 h-10 mx-auto text-stone-300" />
          <p className="font-medium text-stone-600">
            {getCommonLabel('empty_library', currentLang)} - {getCommonLabel('empty_library_desc', currentLang)}
          </p>
          {(searchQuery || selectedFamily !== 'all' || activeTab !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedFamily('all');
                setActiveTab('all');
              }}
              className="px-4 py-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold transition cursor-pointer"
            >
              {isArabic ? 'عرض كل التركيبات' : 'Show All Formulas'}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((formula) => {
            const isPreset = CURATED_FORMULA_PRESETS.some((p) => p.id === formula.id);
            const catDef = getCategoryDef(formula.resolvedCategory);

            return (
              <div
                key={formula.id}
                className="bg-white rounded-3xl border border-stone-200/90 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden group hover:-translate-y-0.5"
              >
                <div className="p-5 sm:p-6 space-y-4">
                  {/* Top Meta: Batch Code, Date & Category Tag Badge */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-[11px] font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md">
                      {formula.batchCode || 'SHAM-STD'}
                    </span>

                    {/* Category Tag Badge */}
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1 shadow-2xs ${catDef.color}`}
                    >
                      <span>{catDef.emoji}</span>
                      <span>{isArabic ? catDef.labelAr.split(' ')[0] : catDef.labelEn}</span>
                    </span>
                  </div>

                  {/* Title & Author & Creation Date */}
                  <div>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <h3 className="font-bold text-stone-950 text-base font-serif-luxury group-hover:text-amber-800 transition-colors leading-snug">
                        {formula.title}
                      </h3>
                      {(formula.dateCreated || formula.createdAt) && (
                        <span
                          className="inline-flex items-center gap-1.5 text-[11px] font-mono-numbers text-stone-600 bg-amber-50/90 px-2.5 py-0.5 rounded-lg border border-amber-200/80 font-semibold shrink-0 shadow-2xs"
                          title={isArabic ? 'تاريخ إنشاء التركيبة (مسجل تلقائياً)' : 'Formula Creation Date (Auto-recorded)'}
                        >
                          <Calendar className="w-3.5 h-3.5 text-amber-700" />
                          <span>{formula.dateCreated || (formula.createdAt ? formula.createdAt.split('T')[0] : '')}</span>
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-amber-800 font-medium mt-1">
                      {L('perfumer')} {formula.author}
                    </div>
                  </div>

                  {/* Tags list if present */}
                  {formula.tags && formula.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {formula.tags.map((tg, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 text-[10px] font-medium"
                        >
                          #{tg}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Quick specs: Volume, Concentration, Maceration Days */}
                  <div className="grid grid-cols-2 gap-2 p-3 bg-stone-50/80 rounded-2xl text-xs font-mono-numbers border border-stone-100">
                    <div>
                      <span className="text-[10px] text-stone-400 block font-sans">
                        {L('volume_strength')}
                      </span>
                      <span className="font-bold text-stone-900">
                        {formula.formulation.bottleVolumeMl} ml · {formula.formulation.concentrationPercent}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 block font-sans">
                        {L('maceration')}
                      </span>
                      <span className="font-bold text-amber-900">
                        {formula.macerationDays} {L('days')}
                      </span>
                    </div>
                  </div>

                  {/* Notes description preview */}
                  {formula.notes && (
                    <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                      {formula.notes}
                    </p>
                  )}

                  {/* Pyramid count preview */}
                  <div className="flex items-center gap-2 text-xs text-stone-500 pt-1 border-t border-stone-100">
                    <Layers className="w-3.5 h-3.5 text-amber-700" />
                    <span>{fmt(L('notes_count_tpl'), { n: formula.pyramidNotes?.length || 0 })}</span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="p-4 bg-stone-50/80 border-t border-stone-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onLoadFormula(formula)}
                    className="flex-1 py-2 px-3 bg-stone-900 hover:bg-amber-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <span>{getCommonLabel('load_in_lab', currentLang)}</span>
                    <ActionArrow className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onPrintFormula(formula)}
                    className="p-2 bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-xl text-xs transition-colors cursor-pointer shadow-2xs"
                    title={getCommonLabel('print', currentLang)}
                  >
                    <Printer className="w-4 h-4 text-amber-800" />
                  </button>

                  {!isPreset && (
                    <button
                      type="button"
                      onClick={() => onDeleteFormula(formula.id)}
                      className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                      title={getCommonLabel('delete', currentLang)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
