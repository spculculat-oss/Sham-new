import { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Heart,
  Bookmark,
  Share2,
  FlaskConical,
  Film,
  Sparkles,
  Volume2,
  VolumeX,
  ArrowRight,
  Clock,
  Check,
} from 'lucide-react';
import { SCENE_CATALOG, resolveSceneSrc } from './scenes';
import { Card, Btn, tx, type Lang } from './ui';

interface WatchReel {
  id: string;
  titleAr: string;
  titleEn: string;
  creatorAr: string;
  creatorEn: string;
  handle: string;
  duration: string;
  scene: string;
  categoryAr: string;
  categoryEn: string;
  notesAr: string[];
  notesEn: string[];
  summaryAr: string;
  summaryEn: string;
  labTarget: string;
  likes: number;
}

const WATCH_REELS: WatchReel[] = [
  {
    id: 'reel_maceration',
    titleAr: 'أسرار التعتيق البارد للعطور الشرقية الفاخرة (14–16°م)',
    titleEn: 'Cold Maceration Secrets for Luxury Oriental Perfumes (14–16°C)',
    creatorAr: 'دار شام للعطور',
    creatorEn: 'Dar Sham House',
    handle: 'dar_sham',
    duration: '04:18',
    scene: 'scene:compounding',
    categoryAr: 'مختبر التعتيق',
    categoryEn: 'Maceration Lab',
    notesAr: ['عود كمبودي 25%', 'باتشولي إندونيسي 20%', 'أمبروكسان 15%'],
    notesEn: ['Cambodian Oud 25%', 'Indonesian Patchouli 20%', 'Ambroxan 15%'],
    summaryAr:
      'جولة مرئية داخل خزائن التعتيق الداكنة: كيف تنخفض حدة الكحول وتندمج الجزيئات الثقيلة خلال 45 يوماً دون فقدان قمة العطر.',
    summaryEn:
      'Step inside dark aging vaults: learn how alcohol sharpness softens and heavy molecules fuse over 45 days without top-note loss.',
    labTarget: '../maceration_simulator',
    likes: 342,
  },
  {
    id: 'reel_rose_distill',
    titleAr: 'التقطير البخاري المباشر لـ 50 كجم من الورد الجوري الدمشقي',
    titleEn: 'Live Steam Distillation of 50 kg Fresh Damask Rose Petals',
    creatorAr: 'م. نورهان الكردي',
    creatorEn: 'Eng. Nourhan Al-Kurdi',
    handle: 'nourhan_lab',
    duration: '06:05',
    scene: 'scene:rose',
    categoryAr: 'استخلاص وتقطير',
    categoryEn: 'Steam Distillation',
    notesAr: ['ورد دمشقي 35%', 'ياسمين بلدي 20%', 'مسك أبيض 12%'],
    notesEn: ['Damask Rose 35%', 'Jasmine 20%', 'White Musk 12%'],
    summaryAr:
      'ضبط ضغط البخار في الإنبيق النحاسي واستخلاص زيت الورد الصافي في الساعات الأولى من الفجر للحفاظ على الإسترات المتطايرة.',
    summaryEn:
      'Calibrating copper still steam flow at dawn to preserve delicate volatile esters inside pure Damask rose otto.',
    labTarget: '../pyramid',
    likes: 289,
  },
  {
    id: 'reel_hedione_sillage',
    titleAr: 'موازنة الهالة العطرية (Sillage): البرغموت مع الهيديون النقي',
    titleEn: 'Engineering Radiance: Bergamot & Pure Hedione Sillage Balance',
    creatorAr: 'الكابتن أحمد شاهين',
    creatorEn: 'Ahmed Shaheen',
    handle: 'ahmed_shaheen',
    duration: '03:42',
    scene: 'scene:niche',
    categoryAr: 'هندسة الفوحان',
    categoryEn: 'Sillage Engineering',
    notesAr: ['برغموت كالابريا 22%', 'هيديون نقي 25%', 'صندل ميسوري 20%'],
    notesEn: ['Calabrian Bergamot 22%', 'Pure Hedione 25%', 'Mysore Sandalwood 20%'],
    summaryAr:
      'لماذا يتضاعف الفوحان في الأجواء الدافئة عند ضبط نسبة الهيديون والإيزو إي سوبر؟ تجربة عملية بالرش والقياس المخبري.',
    summaryEn:
      'Why warm-weather projection doubles when Hedione and Iso E Super are calibrated right—live blotter & airflow demonstration.',
    labTarget: '../concentration',
    likes: 418,
  },
  {
    id: 'reel_oud_grading',
    titleAr: 'دليل فرز دهن العود الكمبودي والهندي وكشف الإضافات الخاملة',
    titleEn: 'Artisan Guide to Grading Aged Cambodian & Hindi Oud Oils',
    creatorAr: 'الشيخ طارق العتيبي',
    creatorEn: 'Tariq Al-Otaibi',
    handle: 'tariq_oud',
    duration: '05:29',
    scene: 'scene:harvest',
    categoryAr: 'ثقافة العود',
    categoryEn: 'Oud Mastery',
    notesAr: ['عود هندي كلاكاسي', 'لبان حوجري عماني', 'عنبر حوتي رمادي'],
    notesEn: ['Hindi Oud', 'Omani Frankincense', 'Grey Ambergris'],
    summaryAr:
      'مقارنة اللزوجة واللون واختبار ورقة الشم بين التعتيق الخشبي العميق والخلطات التجارية السريعة.',
    summaryEn:
      'Comparing viscosity, color depth, and blotter evolution between deep-aged natural oud and commercial blends.',
    labTarget: '../lab',
    likes: 512,
  },
];

export function WatchPage({
  lang,
  go,
  toast,
}: {
  lang: Lang;
  go: (route: string) => void;
  toast: (text: string) => void;
}) {
  const t = tx(lang);
  const [activeId, setActiveId] = useState(WATCH_REELS[0].id);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(18);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const current = WATCH_REELS.find((r) => r.id === activeId) || WATCH_REELS[0];

  useEffect(() => {
    setProgress(12);
    setPlaying(true);
  }, [activeId]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + 2));
    }, 500);
    return () => clearInterval(id);
  }, [playing]);

  const toggleLike = (id: string) => {
    setLikedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleSave = (id: string) => {
    const adding = !savedIds.includes(id);
    setSavedIds((prev) => (adding ? [...prev, id] : prev.filter((x) => x !== id)));
    toast(adding ? t('تم حفظ الحلقة في قائمتك', 'Saved to watchlist') : t('تمت الإزالة من المحفوظات', 'Removed'));
  };

  const isLiked = likedIds.includes(current.id);
  const isSaved = savedIds.includes(current.id);

  return (
    <div className="space-y-4">
      <Card className="p-4 border-stone-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => go('')}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 cursor-pointer"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-black text-stone-900 flex items-center gap-2">
              <Film className="h-5 w-5 text-amber-700" />
              {t('فيديو وريلز معمل شام (Watch)', 'Sham Atelier Watch & Reels')}
            </h1>
            <p className="text-xs text-stone-500">
              {t('شروحات التعتيق، التقطير الحي، ومقارنات الزيوت العطرية النادرة.', 'Visual workshops on maceration, distillation & raw oils.')}
            </p>
          </div>
        </div>
        <span className="text-xs font-bold text-amber-800">
          {WATCH_REELS.length} {t('حلقات مختبرية', 'Atelier Reels')}
        </span>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main Video Stage */}
        <Card className="overflow-hidden border-stone-200 bg-stone-950 text-white">
          <div className="relative aspect-video w-full overflow-hidden bg-stone-900">
            <img
              src={resolveSceneSrc(current.scene)}
              alt={lang === 'ar' ? current.titleAr : current.titleEn}
              className={`h-full w-full object-cover transition-transform duration-700 ${
                playing ? 'scale-105 brightness-90' : 'scale-100 brightness-75'
              }`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/50" />

            {/* Top Overlay */}
            <div className="absolute top-3 start-3 end-3 flex items-center justify-between">
              <span className="rounded-full bg-amber-600/90 px-3 py-1 text-[11px] font-bold text-white shadow">
                {lang === 'ar' ? current.categoryAr : current.categoryEn}
              </span>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="rounded-full bg-black/55 p-2 text-white hover:bg-black/80 cursor-pointer backdrop-blur-xs"
                title={muted ? t('إلغاء الكتم', 'Unmute') : t('كتم', 'Mute')}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>

            {/* Center Play/Pause Overlay */}
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/90 text-stone-950 shadow-2xl transition hover:scale-105 cursor-pointer"
            >
              {playing ? <Pause className="h-7 w-7 fill-current" /> : <Play className="h-7 w-7 fill-current ms-0.5" />}
            </button>

            {/* Bottom Player Controls */}
            <div className="absolute bottom-0 inset-x-0 p-4 space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-amber-200 tabular-nums">
                  {playing ? t('قيد العرض', 'Playing') : t('متوقف', 'Paused')}
                </span>
                <div
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
                    setProgress(pct);
                  }}
                  className="h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/25"
                >
                  <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <span className="flex items-center gap-1 text-[11px] font-mono text-stone-300 tabular-nums">
                  <Clock className="h-3 w-3" />
                  {current.duration}
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4 bg-white text-stone-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-lg font-black text-stone-900">
                  {lang === 'ar' ? current.titleAr : current.titleEn}
                </h2>
                <button
                  type="button"
                  onClick={() => go(`u/${current.handle}`)}
                  className="text-xs font-bold text-amber-800 hover:underline cursor-pointer"
                >
                  {lang === 'ar' ? current.creatorAr : current.creatorEn} · @{current.handle}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleLike(current.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    isLiked ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${isLiked ? 'fill-rose-600 text-rose-600' : ''}`} />
                  <span className="tabular-nums">{current.likes + (isLiked ? 1 : 0)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSave(current.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    isSaved ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-amber-600' : ''}`} />
                  {isSaved ? t('محفوظ', 'Saved') : t('حفظ', 'Save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(window.location.href);
                    toast(t('تم نسخ رابط الحلقة 📋', 'Reel link copied 📋'));
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
                >
                  <Share2 className="h-4 w-4" />
                  {t('مشاركة', 'Share')}
                </button>
              </div>
            </div>

            <p className="text-xs sm:text-sm leading-relaxed text-stone-600">
              {lang === 'ar' ? current.summaryAr : current.summaryEn}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-amber-700" />
                  {t('النوتات الأساسية في التجربة:', 'Key Notes Featured:')}
                </span>
                <p className="text-xs font-bold text-stone-800">
                  {(lang === 'ar' ? current.notesAr : current.notesEn).join(' · ')}
                </p>
              </div>
              <Btn small onClick={() => go(current.labTarget)}>
                <FlaskConical className="h-4 w-4" />
                {t('تطبيق في المختبر الآن', 'Try in Lab')}
              </Btn>
            </div>
          </div>
        </Card>

        {/* Up Next Playlist */}
        <Card className="p-3.5 space-y-3 h-fit border-stone-200">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <h3 className="font-black text-xs text-stone-900">
              {t('الحلقات التالية من المعمل', 'Up Next in Watch')}
            </h3>
            <span className="text-[10px] font-semibold text-stone-400 tabular-nums">
              {WATCH_REELS.length} {t('فيديو', 'videos')}
            </span>
          </div>
          <div className="space-y-2.5">
            {WATCH_REELS.map((reel) => {
              const active = reel.id === current.id;
              return (
                <button
                  key={reel.id}
                  type="button"
                  onClick={() => setActiveId(reel.id)}
                  className={`flex w-full gap-2.5 rounded-2xl border p-2 text-start transition cursor-pointer ${
                    active ? 'border-amber-600 bg-amber-50/70' : 'border-stone-200/80 bg-white hover:bg-stone-50'
                  }`}
                >
                  <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-900">
                    <img
                      src={resolveSceneSrc(reel.scene)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-1 end-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">
                      {reel.duration}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-2 text-xs font-bold text-stone-900 leading-snug">
                      {lang === 'ar' ? reel.titleAr : reel.titleEn}
                    </p>
                    <p className="text-[10px] text-stone-500">
                      {lang === 'ar' ? reel.creatorAr : reel.creatorEn}
                      {active ? ` · ${t('يُعرض الآن', 'Playing')}` : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
