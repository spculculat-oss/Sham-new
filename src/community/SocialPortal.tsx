/**
 * «سوشيال شام»: Facebook-style community hub infused with Dar Sham's luxury fragrance house identity.
 * 3-column classic Facebook layout:
 * - Left: Navigation shortcuts, perfumer profile preview, lab tools shortcuts
 * - Center: Stories carousel, Composer with scent-feeling picker & formula attachment, filter tabs, rich posts with Facebook reaction bar & recipe cards
 * - Right: Online contacts with 1-click docked messenger, trending salon topics, friend suggestions, featured creation
 */
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  FlaskConical,
  Globe2,
  ImagePlus,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Search,
  Send,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
  Share2,
  Bookmark,
  Sparkles,
  Flame,
  Award,
  ChevronRight,
  TrendingUp,
  MessageSquare,
  Smile,
  Eye,
  Sliders,
  Store,
  Layers,
  Heart,
  ExternalLink,
  Radio,
  Maximize2,
  RefreshCw,
  Trash2,
  Camera,
  ZoomIn,
  Crop,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Palette,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { cx, resizeImage, type Comment, type Notification, type Post, type PublicUser, type Recipe } from './api';
import { pulseNow, type SessionState } from './session';
import { Avatar, Btn, Card, Empty, Sheet, Spinner, errorText, inputClass, timeAgo, tx, useLoad, type Lang } from './ui';
import { StoriesBar } from './StoriesBar';
import { GeneralNewsPeriodic } from './GeneralNewsPeriodic';
import { ImageCropperModal } from './ImageCropperModal';

import labHarvestImg from '../assets/images/botanical_harvest_raw_1791968832488.jpg';
import labCompoundingImg from '../assets/images/perfume_lab_compounding_1791692420116.jpg';
import grasseRoseImg from '../assets/images/grasse_rose_harvest_1791696039244.jpg';
import luxuryFlaconImg from '../assets/images/hero_luxury_perfume_1791692409081.jpg';

export { ProfilePage } from './ProfilePage';

export const REACTIONS: { id: string; emoji: string; ar: string; en: string }[] = [
  { id: 'like', emoji: '👍', ar: 'أعجبني', en: 'Like' },
  { id: 'love', emoji: '❤️', ar: 'أحببته', en: 'Love' },
  { id: 'fire', emoji: '🔥', ar: 'فواح / نار', en: 'Fire' },
  { id: 'wow', emoji: '😮', ar: 'واو', en: 'Wow' },
  { id: 'haha', emoji: '😂', ar: 'هههه', en: 'Haha' },
  { id: 'sad', emoji: '😢', ar: 'حزين', en: 'Sad' },
];

export const SCENT_FEELINGS = [
  { id: 'fresh', icon: '🌿', ar: 'ينعش حواسه مع الحمضيات والبرغموت', en: 'feeling fresh with bergamot' },
  { id: 'oud', icon: '🪵', ar: 'يعيش أجواء الفخامة مع دهن العود المعتق', en: 'feeling regal with aged oud' },
  { id: 'rose', icon: '🌹', ar: 'يتأمل جمال الورد الدمشقي والياسمين', en: 'inspired by damask rose' },
  { id: 'warm', icon: '🔥', ar: 'يختبر تركيزاً شتوياً دافئاً بالعنبر والتوباكو', en: 'experimenting warm amber' },
  { id: 'lab', icon: '🧪', ar: 'في ورشة المعمل يوازن الهرم العطري', en: 'in lab balancing pyramid' },
  { id: 'question', icon: '💡', ar: 'يبحث عن مشورة في التعتيق والمثبتات', en: 'seeking maceration advice' },
];

type Go = (route: string) => void;
interface Props {
  lang: Lang;
  session: SessionState;
  go: Go;
  toast: (text: string) => void;
  onOpenMessenger?: (userId: string) => void;
}

/* ------------------------------------------------- Feed ------------------------------------------------- */

export function SocialFeed({ lang, session, go, toast, onOpenMessenger }: Props) {
  const t = tx(lang);
  const [scope, setScope] = useState<'all' | 'friends' | 'recipes' | 'trending' | 'general-news'>('all');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [error, setError] = useState('');

  const me = session.me;

  const load = async (before?: string) => {
    setLoading(true);
    try {
      const queryScope = scope === 'friends' ? 'friends' : 'all';
      const list = await cx<Post[]>(
        `/community/feed?scope=${queryScope}${before ? `&before=${encodeURIComponent(before)}` : ''}`
      );
      let filtered = list;
      if (scope === 'recipes') {
        filtered = list.filter((p) => Boolean(p.recipe));
      } else if (scope === 'trending') {
        filtered = [...list].sort(
          (a, b) =>
            Object.values(b.reactions).reduce((s, n) => s + n, 0) +
            b.comments -
            (Object.values(a.reactions).reduce((s, n) => s + n, 0) + a.comments)
        );
      }
      setPosts((prev) => (before ? [...prev, ...filtered] : filtered));
      setMore(list.length >= 20);
      setError('');
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [scope]);

  const replace = (p: Post) => setPosts((list) => list.map((x) => (x.id === p.id ? p : x)));
  const remove = (id: string) => setPosts((list) => list.filter((x) => x.id !== id));

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Left Column (Desktop Shortcuts & Navigation) */}
      <aside className="hidden xl:block space-y-4">
        {/* User Card */}
        {me && (
          <Card className="p-4 space-y-3">
            <button
              type="button"
              onClick={() => go(`u/${me.handle}`)}
              className="flex items-center gap-3 text-start w-full cursor-pointer group"
            >
              <Avatar user={me} size={44} ring />
              <div className="min-w-0 flex-1">
                <p className="truncate font-black text-sm text-stone-900 group-hover:text-amber-800">
                  {me.name}
                </p>
                <p className="truncate text-xs text-stone-500">@{me.handle}</p>
              </div>
            </button>
            <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
              <span>{t('أصدقاء', 'Friends')} <b>{me.counts?.friends || 0}</b></span>
              <span>·</span>
              <span>{t('تركيبات', 'Formulas')} <b>{me.counts?.recipes || 0}</b></span>
            </div>
          </Card>
        )}

        {/* Facebook-style Left Navigation Menu */}
        <Card className="p-2 space-y-1">
          <button
            type="button"
            onClick={() => go('')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-amber-900 bg-amber-50 cursor-pointer"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-200 text-amber-900">
              📰
            </span>
            <span>{t('الموجز العام (الأخبار)', 'News Feed')}</span>
          </button>

          <button
            type="button"
            onClick={() => go('general-news')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold text-rose-950 bg-gradient-to-r from-rose-50 to-amber-50/50 border border-rose-200/60 hover:bg-rose-100/70 transition cursor-pointer shadow-2xs group"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-white shadow-xs">
              <Radio className="h-4 w-4 animate-pulse" />
            </span>
            <div className="flex-1 text-start">
              <div className="flex items-center gap-1.5">
                <span className="text-stone-900 font-extrabold group-hover:text-rose-900">
                  {t('أخبار العامة', 'General News')}
                </span>
                <span className="rounded-full bg-rose-600 px-1.5 py-0.2 text-[9px] text-white font-black animate-pulse">
                  دورية
                </span>
              </div>
              <p className="text-[10px] text-amber-900 font-medium">
                {t('النشرة الدورية الحية للمجتمع', 'Periodic Bulletin')}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => go('discussions')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-800">
              💬
            </span>
            <div className="flex-1 text-start">
              <span>{t('مجلس النقاش العام', 'Public Discussions')}</span>
            </div>
            <span className="rounded-full bg-rose-500 px-1.5 text-[9px] text-white font-black">جديد</span>
          </button>

          <button
            type="button"
            onClick={() => go('messenger')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
              ⚡
            </span>
            <span>{t('ماسنجر شام (المحادثات)', 'Messenger')}</span>
          </button>

          <button
            type="button"
            onClick={() => go('friends')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-800">
              👥
            </span>
            <span>{t('الأصدقاء والتواصل', 'Friends & Network')}</span>
          </button>

          <button
            type="button"
            onClick={() => go('me/recipes')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-800">
              🧪
            </span>
            <span>{t('مكتبة التركيبات والوصفات', 'Perfume Recipes')}</span>
          </button>

          <button
            type="button"
            onClick={() => go('stores')}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-800">
              🏪
            </span>
            <span>{t('سوق ومتاجر شام', 'Stores Marketplace')}</span>
          </button>
        </Card>

        {/* Shortcuts to Lab Tools */}
        <Card className="p-3.5 space-y-2.5">
          <p className="text-[11px] font-black text-stone-500 uppercase tracking-wider">
            {t('اختصارات المعمل السريعة', 'Lab Quick Tools')}
          </p>
          <div className="space-y-1 text-xs">
            <button
              type="button"
              onClick={() => go('../concentration')}
              className="flex w-full items-center gap-2 rounded-lg p-2 text-stone-700 hover:bg-stone-50 text-start cursor-pointer font-semibold"
            >
              <FlaskConical className="h-4 w-4 text-amber-600" />
              <span>{t('حاسبة التراكيز والزيوت', 'Concentration Calculator')}</span>
            </button>
            <button
              type="button"
              onClick={() => go('../maceration_simulator')}
              className="flex w-full items-center gap-2 rounded-lg p-2 text-stone-700 hover:bg-stone-50 text-start cursor-pointer font-semibold"
            >
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span>{t('محاكي التعتيق والمكيرولوجي', 'Maceration Simulator')}</span>
            </button>
            <button
              type="button"
              onClick={() => go('../pyramid')}
              className="flex w-full items-center gap-2 rounded-lg p-2 text-stone-700 hover:bg-stone-50 text-start cursor-pointer font-semibold"
            >
              <Layers className="h-4 w-4 text-sky-600" />
              <span>{t('الهرم العطري وتوزيع النوتات', 'Olfactory Pyramid')}</span>
            </button>
          </div>
        </Card>
      </aside>

      {/* Center Column: Stories, Composer, Feed Filter, Posts */}
      <div className="space-y-4 min-w-0">
        {/* Periodic Live Ticker Banner ("تيتل دوري") */}
        <GeneralNewsPeriodic lang={lang} go={go} toast={toast} compactTickerOnly />

        {/* Stories / Reels Carousel */}
        <StoriesBar
          lang={lang}
          currentUser={me || undefined}
          onOpenMessenger={onOpenMessenger}
        />

        {/* Facebook-style Post Composer */}
        <Composer
          lang={lang}
          session={session}
          onPosted={(p) => setPosts((list) => [p, ...list])}
          toast={toast}
          go={go}
        />

        {/* Feed Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {[
            { id: 'all', label: t('🌐 كل المجتمع', '🌐 Everyone') },
            { id: 'general-news', label: t('📡 أخبار العامة (دورية)', '📡 General News (Periodic)') },
            { id: 'friends', label: t('👥 الأصدقاء فقط', '👥 Friends') },
            { id: 'recipes', label: t('🧪 تركيبات المعمل', '🧪 Recipes') },
            { id: 'trending', label: t('🔥 الأكثر تفاعلاً', '🔥 Trending') },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScope(tab.id as any)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition cursor-pointer shrink-0 ${
                scope === tab.id
                  ? 'bg-amber-900 text-white shadow-sm'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

        {/* Posts Stream or General News View */}
        {scope === 'general-news' ? (
          <GeneralNewsPeriodic lang={lang} go={go} toast={toast} />
        ) : (
          <div className="space-y-4">
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                lang={lang}
                go={go}
                onChange={replace}
                onRemove={remove}
                toast={toast}
                onOpenMessenger={onOpenMessenger}
              />
            ))}
          </div>
        )}

        {loading && scope !== 'general-news' && <Spinner />}

        {!loading && scope !== 'general-news' && !posts.length && !error && (
          <Card>
            <Empty
              icon={<Users className="h-10 w-10 text-stone-300" />}
              title={t('لا توجد منشورات في هذا القسم حالياً', 'No posts in this section')}
              body={t(
                'شارك أول تجربة عطرية أو اطرح سؤالاً لزملائك في المعمل.',
                'Share your first scent formulation or ask your peers.'
              )}
            />
          </Card>
        )}

        {!loading && more && posts.length > 0 && (
          <Btn
            variant="soft"
            className="w-full py-3 font-bold"
            onClick={() => void load(posts[posts.length - 1].createdAt)}
          >
            {t('عرض المزيد من المنشورات', 'Load more posts')}
          </Btn>
        )}
      </div>

      {/* Right Column: Online Contacts, Friend Requests, Trending Salon */}
      <aside className="space-y-4">
        <PeoplePanel
          lang={lang}
          go={go}
          toast={toast}
          onOpenMessenger={onOpenMessenger}
        />
      </aside>
    </div>
  );
}

/* ------------------------------------------------- Composer ------------------------------------------------- */

const CURATED_LAB_PHOTOS = [
  { id: 'compounding', src: labCompoundingImg, titleAr: 'معمل خلط وتركيب العطور', titleEn: 'Perfume Compounding Lab' },
  { id: 'harvest', src: labHarvestImg, titleAr: 'حصاد المواد الخام والمستخلصات', titleEn: 'Botanical Harvest & Extracts' },
  { id: 'rose', src: grasseRoseImg, titleAr: 'موسم قطاف ورد غراس الطبيعي', titleEn: 'Grasse Rose Harvest' },
  { id: 'flacon', src: luxuryFlaconImg, titleAr: 'زجاجة عطر فاخرة بإضاءة سينمائية', titleEn: 'Luxury Crystal Flacon' },
];

export type CssFilterType = 'none' | 'grayscale' | 'warm' | 'bright';

export const CSS_FILTER_MAP: Record<CssFilterType, string> = {
  none: 'none',
  grayscale: 'grayscale(100%) contrast(108%)',
  warm: 'sepia(45%) saturate(140%) brightness(105%)',
  bright: 'brightness(120%) contrast(108%) saturate(110%)',
};

function Composer({
  lang,
  session,
  onPosted,
  toast,
  go,
}: {
  lang: Lang;
  session: SessionState;
  onPosted: (p: Post) => void;
  toast: (s: string) => void;
  go: Go;
}) {
  const t = tx(lang);
  const me = session.me;
  const [body, setBody] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ name: string; size: string } | null>(null);
  const [activeCssFilter, setActiveCssFilter] = useState<CssFilterType>('none');
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [showCropperModal, setShowCropperModal] = useState(false);
  const [showSampleGallery, setShowSampleGallery] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [pickRecipe, setPickRecipe] = useState(false);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [showFeelings, setShowFeelings] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  if (!me) {
    return (
      <Card className="p-4 text-center space-y-2">
        <p className="text-sm font-bold text-stone-800">
          {t('انضم إلى مجتمع دار شام للعطور', 'Join Dar Sham Perfumers Community')}
        </p>
        <p className="text-xs text-stone-500">
          {t('سجّل دخولك لمشاركة التركيبات والتفاعل مع صانعي العطور والماسنجر', 'Sign in to post recipes, interact and chat')}
        </p>
        <Btn small onClick={() => go('login')}>
          {t('تسجيل الدخول / إنشاء حساب', 'Sign in / Register')}
        </Btn>
      </Card>
    );
  }

  const handleImageFile = async (f: File) => {
    if (!f.type.startsWith('image/')) {
      toast(t('الملف المختار ليس صورة صالحة (يرجى اختيار JPG أو PNG)', 'Selected file is not an image (JPG/PNG)'));
      return;
    }
    try {
      const resized = await resizeImage(f);
      setImage(resized);
      const sizeKb = Math.round(f.size / 1024);
      const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
      setImageMeta({ name: f.name, size: sizeStr });
      setActiveCssFilter('none');
      setFlipH(false);
      setFlipV(false);
      setRotation(0);
      setShowSampleGallery(false);
      toast(t('تم تجهيز الصورة ومعاينتها قبل النشر بنجاح 📷', 'Image ready with preview before posting 📷'));
    } catch {
      toast(t('تعذر معالجة الصورة، يرجى تجربة صورة أخرى', 'Failed to process image'));
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) {
          e.preventDefault();
          await handleImageFile(f);
          break;
        }
      }
    }
  };

  const handleSelectSamplePhoto = async (sampleSrc: string, sampleTitle: string) => {
    setImage(sampleSrc);
    setImageMeta({ name: sampleTitle, size: t('صورة منتقاة من معمل شام', 'Curated Lab Photo') });
    setActiveCssFilter('none');
    setFlipH(false);
    setFlipV(false);
    setRotation(0);
    setShowSampleGallery(false);
    toast(t('تم إرفاق صورة المعمل بنجاح وتجهيز المعاينة 🌿', 'Lab photo attached with preview! 🌿'));
  };

  const handleQuickRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const handleQuickFlipH = () => {
    setFlipH((f) => !f);
  };

  const handleQuickFlipV = () => {
    setFlipV((f) => !f);
  };

  const handleResetEdits = () => {
    setActiveCssFilter('none');
    setFlipH(false);
    setFlipV(false);
    setRotation(0);
    toast(t('تمت إعادة ضبط التعديلات على الصورة', 'Edits reset to original'));
  };

  const handleOpenCropper = async () => {
    if (activeCssFilter !== 'none' || flipH || flipV || rotation !== 0) {
      if (image) {
        const baked = await bakeImageEdits(image);
        setImage(baked);
        setActiveCssFilter('none');
        setFlipH(false);
        setFlipV(false);
        setRotation(0);
      }
    }
    setShowCropperModal(true);
  };

  const bakeImageEdits = async (sourceUrl: string): Promise<string> => {
    if (activeCssFilter === 'none' && !flipH && !flipV && rotation === 0) {
      return sourceUrl;
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const isRotated90 = rotation % 180 !== 0;
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;
        const canvas = document.createElement('canvas');
        canvas.width = isRotated90 ? naturalH : naturalW;
        canvas.height = isRotated90 ? naturalW : naturalH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(sourceUrl);
          return;
        }

        const filterCss = CSS_FILTER_MAP[activeCssFilter];
        if (filterCss && filterCss !== 'none') {
          try {
            ctx.filter = filterCss;
          } catch {}
        }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.drawImage(img, -naturalW / 2, -naturalH / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(sourceUrl);
      img.src = sourceUrl;
    });
  };

  const submit = async () => {
    setBusy(true);
    try {
      const fullBody = feeling ? `[شعور: ${feeling}]\n\n${body}` : body;
      const finalImage = image ? await bakeImageEdits(image) : null;
      const post = await cx<Post>('/community/posts', {
        body: { body: fullBody, image: finalImage, visibility, recipeId: recipe?.id },
      });
      onPosted(post);
      setBody('');
      setImage(null);
      setImageMeta(null);
      setActiveCssFilter('none');
      setFlipH(false);
      setFlipV(false);
      setRotation(0);
      setRecipe(null);
      setFeeling(null);
      setShowZoomModal(false);
      toast(t('تم نشر المنشور في مجتمع شام 🎉', 'Post published! 🎉'));
    } catch (e) {
      toast(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      className={`relative p-4 shadow-sm border-stone-200 transition-all ${
        isDraggingOver ? 'ring-2 ring-amber-500 bg-amber-50/40' : ''
      }`}
      onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={(e: React.DragEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingOver(false);
        }
      }}
      onDrop={async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) await handleImageFile(f);
      }}
    >
      {/* Drag & Drop Indicator Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-amber-500 bg-amber-50/95 backdrop-blur-xs p-6 text-center pointer-events-none">
          <ImagePlus className="h-10 w-10 text-amber-600 animate-bounce mb-2" />
          <p className="text-sm font-black text-amber-900">
            {t('أفلت الصورة هنا لمعاينتها وإرفاقها بالمنشور', 'Drop image here to attach and preview')}
          </p>
          <p className="text-xs text-amber-700 mt-1">
            {t('يدعم JPG و PNG وصور العطور والمعمل', 'Supports JPG, PNG, and perfume lab photos')}
          </p>
        </div>
      )}

      <div className="flex gap-3 items-start">
        <Avatar user={me} size={44} ring />
        <div className="flex-1 min-w-0">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={handlePaste}
            rows={body ? 3 : 2}
            maxLength={5000}
            placeholder={t(
              `بم تفكّر اليوم يا ${me.name.split(' ')[0]}؟ شارك سر تركيبة، تجربة تعتيق، أو صورة معملك…`,
              `What's on your mind, ${me.name.split(' ')[0]}? Share a formula, maceration tip or lab photo…`
            )}
            className="w-full resize-none rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none focus:bg-white focus:ring-2 focus:ring-amber-200"
          />

          {feeling && (
            <div className="mt-2 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-900 font-semibold">
              <span>{feeling}</span>
              <button
                type="button"
                onClick={() => setFeeling(null)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Attached Image Preview Card with Editing Toolbar before Publishing */}
      {image && (
        <div className="relative mt-3 rounded-2xl overflow-hidden border border-amber-500/30 bg-stone-900 shadow-xs">
          {/* Top Bar with Preview Notice & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-stone-900 via-stone-800 to-amber-950 text-white border-b border-stone-800">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <Camera className="h-4 w-4 text-emerald-400" />
              <span>{t('معاينة الصورة المرفقة قبل النشر', 'Attached Image Preview Before Publishing')}</span>
              <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 text-[10px]">
                {t('جاهزة للنشر', 'Ready')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleOpenCropper()}
                title={t('قص وتعديل أبعاد الصورة', 'Crop & adjust dimensions')}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 text-amber-300 border border-amber-400/40 px-2.5 py-1 text-[11px] font-bold transition cursor-pointer shadow-xs"
              >
                <Crop className="h-3.5 w-3.5 text-amber-400" />
                <span>{t('قص وتعديل', 'Crop')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowZoomModal(true)}
                title={t('تكبير لمعاينة كاملة', 'Full size preview')}
                className="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 text-[11px] font-semibold text-white transition cursor-pointer"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('تكبير', 'Zoom')}</span>
              </button>
              <button
                type="button"
                onClick={() => file.current?.click()}
                title={t('تغيير الصورة', 'Change image')}
                className="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2 py-1 text-[11px] font-semibold text-white transition cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('تغيير', 'Replace')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setImage(null);
                  setImageMeta(null);
                  setActiveCssFilter('none');
                  setFlipH(false);
                  setFlipV(false);
                  setRotation(0);
                }}
                title={t('إزالة الصورة', 'Remove image')}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600/80 hover:bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('إزالة', 'Remove')}</span>
              </button>
            </div>
          </div>

          {/* Editing Toolbar directly above the image: CSS Filters Dropdown, Flip H/V & Rotate */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-stone-900/95 border-b border-stone-800 text-xs">
            {/* Dropdown Menu for CSS Filters (طبيعي، رمادي، دافئ، ساطع) */}
            <div className="flex items-center gap-2">
              <label htmlFor="composer-css-filter-select" className="flex items-center gap-1 text-[11px] text-amber-300 font-bold shrink-0">
                <Palette className="h-3.5 w-3.5 text-amber-400" />
                <span>{t('فلتر الصورة:', 'CSS Filter:')}</span>
              </label>
              <div className="relative">
                <select
                  id="composer-css-filter-select"
                  value={activeCssFilter}
                  onChange={(e) => setActiveCssFilter(e.target.value as CssFilterType)}
                  className="appearance-none rounded-lg bg-stone-800 hover:bg-stone-750 text-white text-xs font-semibold ps-2.5 pe-7 py-1 border border-stone-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition cursor-pointer"
                >
                  <option value="none">{t('طبيعي (بدون فلتر)', 'Normal (None)')}</option>
                  <option value="grayscale">{t('رمادي (أبيض وأسود)', 'Grayscale (B&W)')}</option>
                  <option value="warm">{t('دافئ (عنبري)', 'Warm (Amber)')}</option>
                  <option value="bright">{t('ساطع (إشراقة)', 'Bright (Vibrant)')}</option>
                </select>
                <ChevronDown className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
              </div>

              {activeCssFilter !== 'none' && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 font-medium hidden sm:inline-block">
                  {activeCssFilter === 'grayscale'
                    ? t('فلتر رمادي مفعّل', 'Grayscale Active')
                    : activeCssFilter === 'warm'
                    ? t('فلتر دافئ مفعّل', 'Warm Active')
                    : t('فلتر ساطع مفعّل', 'Bright Active')}
                </span>
              )}
            </div>

            {/* Quick Orientation & Flip Buttons: Flip H, Flip V, 90° Rotate */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Flip Horizontal */}
              <button
                type="button"
                onClick={handleQuickFlipH}
                title={t('قلب الصورة أفقياً (مرآة)', 'Flip horizontal (mirror)')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
                  flipH
                    ? 'bg-amber-500/25 border-amber-400/60 text-amber-300 shadow-xs'
                    : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
                }`}
              >
                <FlipHorizontal className={`h-3.5 w-3.5 ${flipH ? 'text-amber-400' : 'text-stone-300'}`} />
                <span>{t('قلب أفقي', 'Flip H')}</span>
              </button>

              {/* Flip Vertical */}
              <button
                type="button"
                onClick={handleQuickFlipV}
                title={t('قلب الصورة عمودياً (رأس على عقب)', 'Flip vertical')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
                  flipV
                    ? 'bg-amber-500/25 border-amber-400/60 text-amber-300 shadow-xs'
                    : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
                }`}
              >
                <FlipVertical className={`h-3.5 w-3.5 ${flipV ? 'text-amber-400' : 'text-stone-300'}`} />
                <span>{t('قلب رأسي', 'Flip V')}</span>
              </button>

              {/* Rotate 90° */}
              <button
                type="button"
                onClick={handleQuickRotate}
                title={t('تدوير الصورة 90 درجة مع عقارب الساعة', 'Rotate 90° clockwise')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
                  rotation !== 0
                    ? 'bg-amber-500/25 border-amber-400/60 text-amber-300 shadow-xs'
                    : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-200'
                }`}
              >
                <RotateCw className={`h-3.5 w-3.5 ${rotation !== 0 ? 'text-amber-400' : 'text-stone-300'}`} />
                <span>{rotation !== 0 ? `${rotation}°` : t('تدوير 90°', 'Rotate')}</span>
              </button>

              {/* Reset Edits if modified */}
              {(activeCssFilter !== 'none' || flipH || flipV || rotation !== 0) && (
                <button
                  type="button"
                  onClick={handleResetEdits}
                  title={t('إعادة ضبط الفلاتر والتدوير والقلب', 'Reset all edits')}
                  className="inline-flex items-center gap-1 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 px-2 py-1 text-xs text-stone-300 hover:text-white transition cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="hidden md:inline">{t('إعادة ضبط', 'Reset')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Interactive Image Display with Live CSS Filter and Transforms */}
          <div
            className="relative group cursor-pointer overflow-hidden bg-stone-950 flex items-center justify-center min-h-56 max-h-88"
            onClick={() => setShowZoomModal(true)}
          >
            <img
              src={image}
              alt="Attached preview"
              style={{
                filter: CSS_FILTER_MAP[activeCssFilter] || 'none',
                transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
              }}
              className="max-h-88 w-full object-contain transition duration-200 group-hover:opacity-95"
            />
            <div className="absolute inset-0 bg-stone-950/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
              <span className="bg-stone-900/90 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg backdrop-blur-xs flex items-center gap-1.5 border border-stone-700">
                <ZoomIn className="h-4 w-4 text-amber-400" />
                {t('انقر للمعاينة بالحجم الكامل قبل النشر', 'Click to view full preview')}
              </span>
            </div>
          </div>

          {/* Metadata Footer */}
          {imageMeta && (
            <div className="px-3 py-1.5 bg-stone-950 border-t border-stone-800/80 flex items-center justify-between text-[11px] text-stone-400">
              <span className="truncate max-w-[220px] sm:max-w-xs font-medium">📷 {imageMeta.name}</span>
              <div className="flex items-center gap-2">
                {activeCssFilter !== 'none' && (
                  <span className="text-[10px] text-amber-400 font-mono">
                    🎨 {activeCssFilter === 'grayscale' ? t('رمادي', 'Grayscale') : activeCssFilter === 'warm' ? t('دافئ', 'Warm') : t('ساطع', 'Bright')}
                  </span>
                )}
                {(flipH || flipV) && (
                  <span className="text-[10px] text-amber-400 font-mono">
                    ⇄ {flipH && flipV ? t('قلب H+V', 'H+V') : flipH ? t('قلب H', 'H') : t('قلب V', 'V')}
                  </span>
                )}
                {rotation !== 0 && (
                  <span className="text-[10px] text-amber-400 font-mono">
                    ⟳ {rotation}°
                  </span>
                )}
                <span className="text-stone-400 font-mono text-[10px] bg-stone-800 px-1.5 py-0.5 rounded border border-stone-700">
                  {imageMeta.size}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {recipe && (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-gradient-to-r from-amber-50 to-amber-100/50 p-3 text-sm border border-amber-200">
          <span className="flex items-center gap-2 font-bold text-amber-900">
            <FlaskConical className="h-4 w-4 text-amber-700" />
            {recipe.title}
          </span>
          <button
            type="button"
            onClick={() => setRecipe(null)}
            className="text-stone-400 hover:text-stone-700 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Scent feeling drawer */}
      {showFeelings && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-stone-100 pt-3">
          {SCENT_FEELINGS.map((sf) => (
            <button
              key={sf.id}
              type="button"
              onClick={() => {
                setFeeling(`${sf.icon} ${lang === 'ar' ? sf.ar : sf.en}`);
                setShowFeelings(false);
              }}
              className="flex items-center gap-2 rounded-xl p-2 text-start text-xs font-semibold text-stone-700 hover:bg-amber-50 hover:text-amber-900 transition cursor-pointer"
            >
              <span className="text-base">{sf.icon}</span>
              <span>{lang === 'ar' ? sf.ar : sf.en}</span>
            </button>
          ))}
        </div>
      )}

      {/* Curated Lab Sample Photos Drawer */}
      {showSampleGallery && (
        <div className="mt-3 border-t border-stone-100 pt-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-stone-800">
              {t('اختر صورة معمل عطرية منتقاة للمنشور:', 'Choose a curated lab photo for your post:')}
            </span>
            <button
              type="button"
              onClick={() => setShowSampleGallery(false)}
              className="text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CURATED_LAB_PHOTOS.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() =>
                  handleSelectSamplePhoto(
                    photo.src,
                    lang === 'ar' ? photo.titleAr : photo.titleEn
                  )
                }
                className="group relative rounded-xl overflow-hidden border border-stone-200 hover:border-amber-500 transition text-start cursor-pointer aspect-video bg-stone-100"
              >
                <img
                  src={photo.src}
                  alt={photo.titleEn}
                  className="w-full h-full object-cover group-hover:scale-105 transition"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-1.5">
                  <span className="text-[10px] text-white font-bold leading-tight line-clamp-1">
                    {lang === 'ar' ? photo.titleAr : photo.titleEn}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer Action Toolbar */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) await handleImageFile(f);
          }}
        />

        <Btn
          variant="ghost"
          small
          onClick={() => file.current?.click()}
          className={image ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : ''}
        >
          <ImagePlus className="h-4 w-4 text-emerald-600" />
          {image ? t('تغيير الصورة', 'Change Photo') : t('إرفاق صورة', 'Attach Photo')}
        </Btn>

        <Btn
          variant="ghost"
          small
          onClick={() => setShowSampleGallery((v) => !v)}
          className={showSampleGallery ? 'text-amber-800 bg-amber-50' : ''}
        >
          <Camera className="h-4 w-4 text-amber-600" />
          {t('صور المعمل الجاهزة', 'Lab Photos')}
        </Btn>

        <Btn variant="ghost" small onClick={() => setPickRecipe(true)}>
          <FlaskConical className="h-4 w-4 text-amber-600" />
          {t('شارك تركيبة', 'Recipe')}
        </Btn>

        <Btn
          variant="ghost"
          small
          onClick={() => setShowFeelings((v) => !v)}
          className={feeling ? 'text-amber-800 bg-amber-50' : ''}
        >
          <Smile className="h-4 w-4 text-rose-500" />
          {t('شعور / نوتة اليوم', 'Scent Feeling')}
        </Btn>

        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as 'public' | 'friends')}
          className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-700 outline-none"
        >
          <option value="public">🌍 {t('عام للجميع', 'Public')}</option>
          <option value="friends">👥 {t('الأصدقاء فقط', 'Friends only')}</option>
        </select>

        <Btn
          className="ms-auto"
          small
          busy={busy}
          disabled={!body.trim() && !image && !recipe && !feeling}
          onClick={() => void submit()}
        >
          <Send className="h-3.5 w-3.5" />
          {t('نشر المنشور', 'Post')}
        </Btn>
      </div>

      {/* Full Size Image Preview Modal */}
      {showZoomModal && image && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-fade-in"
          onClick={() => setShowZoomModal(false)}
        >
          <div
            className="relative max-w-3xl w-full bg-stone-900 rounded-3xl overflow-hidden shadow-2xl border border-stone-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-stone-800 text-white">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-bold">
                  {t('معاينة الصورة المرفقة قبل النشر', 'Attached Image Full Preview')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowZoomModal(false)}
                className="rounded-full p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-auto flex items-center justify-center p-3 bg-stone-950">
              <img
                src={image}
                alt="Full preview"
                style={{
                  filter: CSS_FILTER_MAP[activeCssFilter] || 'none',
                  transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                }}
                className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-md transition duration-200"
              />
            </div>

            <div className="p-4 bg-stone-900 flex flex-wrap items-center justify-between gap-3 border-t border-stone-800">
              <div className="text-xs text-stone-400">
                {imageMeta ? `${imageMeta.name} (${imageMeta.size})` : t('صورة مرفقة', 'Attached image')}
              </div>
              <div className="flex items-center gap-2">
                <Btn
                  variant="soft"
                  small
                  className="bg-amber-500/20 text-amber-300 border-amber-400/30 hover:bg-amber-500/30"
                  onClick={() => {
                    setShowZoomModal(false);
                    void handleOpenCropper();
                  }}
                >
                  <Crop className="h-3.5 w-3.5" />
                  {t('قص وتدوير الصورة', 'Crop & Rotate')}
                </Btn>
                <Btn
                  variant="ghost"
                  small
                  className="text-stone-300 hover:text-white"
                  onClick={() => setShowZoomModal(false)}
                >
                  {t('إغلاق المعاينة', 'Close Preview')}
                </Btn>
                <Btn
                  small
                  busy={busy}
                  onClick={() => {
                    setShowZoomModal(false);
                    void submit();
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                  {t('تأكيد ونشر المنشور', 'Confirm & Post')}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Cropper & Rotation Modal */}
      {showCropperModal && image && (
        <ImageCropperModal
          isOpen={showCropperModal}
          imageUrl={image}
          lang={lang}
          onClose={() => setShowCropperModal(false)}
          onApply={(croppedUrl) => {
            setImage(croppedUrl);
            setImageMeta((prev) => (prev ? { ...prev, size: t('صورة معدّلة', 'Edited image') } : null));
            toast(t('تم قص وتدوير الصورة وتحديث المعاينة بنجاح ✂️', 'Image cropped, rotated & updated! ✂️'));
          }}
        />
      )}

      {pickRecipe && (
        <RecipePicker
          lang={lang}
          onClose={() => setPickRecipe(false)}
          onPick={(r) => {
            setRecipe(r);
            setPickRecipe(false);
          }}
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------- Recipe Picker ------------------------------------------------- */

export function RecipePicker({
  lang,
  onClose,
  onPick,
}: {
  lang: Lang;
  onClose: () => void;
  onPick: (r: Recipe) => void;
}) {
  const t = tx(lang);
  const { data, loading } = useLoad(() => cx<Recipe[]>('/community/me/recipes'));
  return (
    <Sheet title={t('اختر تركيبة من مكتبتك العطرية', 'Pick a fragrance recipe')} onClose={onClose}>
      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty
          title={t('لا توجد تركيبات محفوظة بعد', 'No saved recipes')}
          body={t(
            'يمكنك حفظ تركيباتك من حاسبة المعمل أو «بوابتي».',
            'Save recipes from the lab calculator or your portal.'
          )}
        />
      ) : (
        <div className="space-y-2">
          {data.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick(r)}
              className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 p-3.5 text-start hover:border-amber-500 hover:bg-amber-50/40 transition cursor-pointer"
            >
              <FlaskConical className="h-5 w-5 text-amber-600" />
              <div>
                <span className="block font-bold text-sm text-stone-900">{r.title}</span>
                <span className="text-xs text-stone-500">{timeAgo(r.updatedAt, lang)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------- Post Card ------------------------------------------------- */

export function PostCard({
  post,
  lang,
  go,
  onChange,
  onRemove,
  toast,
  onOpenMessenger,
}: {
  post: Post;
  lang: Lang;
  go: Go;
  onChange: (p: Post) => void;
  onRemove: (id: string) => void;
  toast: (s: string) => void;
  onOpenMessenger?: (userId: string) => void;
}) {
  const t = tx(lang);
  const [showComments, setShowComments] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [picker, setPicker] = useState(false);

  const total = Object.values(post.reactions).reduce((s, n) => s + n, 0);
  const top = Object.entries(post.reactions)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => REACTIONS.find((r) => r.id === k)?.emoji);
  const mine = REACTIONS.find((r) => r.id === post.myReaction);

  const react = async (kind: string | null) => {
    setPicker(false);
    try {
      onChange(await cx<Post>(`/community/posts/${post.id}/react`, { body: { kind } }));
    } catch (e) {
      toast(errorText(e, lang));
    }
  };

  const save = async () => {
    try {
      onChange(
        await cx<Post>(`/community/posts/${post.id}`, { method: 'PATCH', body: { body: draft } })
      );
      setEditing(false);
    } catch (e) {
      toast(errorText(e, lang));
    }
  };

  const del = async () => {
    if (!confirm(t('حذف هذا المنشور نهائياً؟', 'Delete this post?'))) return;
    try {
      await cx(`/community/posts/${post.id}`, { method: 'DELETE' });
      onRemove(post.id);
    } catch (e) {
      toast(errorText(e, lang));
    }
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    toast(t('تم نسخ رابط المنشور بنجاح 📋', 'Post link copied! 📋'));
  };

  // Parse scent feeling tag if present at start of post
  const feelingMatch = post.body.match(/^\[شعور:\s*([^\]]+)\]\s*\n*/);
  const feelingTag = feelingMatch ? feelingMatch[1] : null;
  const cleanBody = feelingMatch ? post.body.slice(feelingMatch[0].length) : post.body;

  return (
    <Card className="overflow-hidden shadow-sm border-stone-200">
      {/* Post Header */}
      <div className="flex items-start gap-3 p-4 pb-2">
        <button
          type="button"
          onClick={() => go(`u/${post.author.handle}`)}
          className="cursor-pointer"
        >
          <Avatar user={post.author} size={44} ring />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => go(`u/${post.author.handle}`)}
              className="font-bold text-stone-900 hover:text-amber-800 cursor-pointer"
            >
              {post.author.name}
            </button>
            {post.author.craftLevel === 'master_lab' && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                🏛️ {t('معمل معتمد', 'Master Lab')}
              </span>
            )}
            {post.author.merchant && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                🏪 {post.author.merchant.storeName}
              </span>
            )}
          </div>
          <p className="flex items-center gap-1 text-[11px] text-stone-500">
            {timeAgo(post.createdAt, lang)}
            {post.editedAt && ` · ${t('معدّل', 'edited')}`} ·{' '}
            {post.visibility === 'public' ? (
              <Globe2 className="h-3 w-3" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
          </p>
        </div>

        {/* 3-dots Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menu && (
            <div className="absolute end-0 z-20 mt-1 w-48 overflow-hidden rounded-2xl border border-stone-200 bg-white text-xs shadow-xl">
              {post.mine ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(true);
                      setMenu(false);
                    }}
                    className="block w-full px-4 py-2.5 text-start hover:bg-stone-50 cursor-pointer font-semibold text-stone-700"
                  >
                    {t('تعديل المنشور', 'Edit Post')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleShare();
                      setMenu(false);
                    }}
                    className="block w-full px-4 py-2.5 text-start hover:bg-stone-50 cursor-pointer font-semibold text-stone-700"
                  >
                    {t('نسخ الرابط', 'Copy link')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void del()}
                    className="block w-full px-4 py-2.5 text-start text-rose-600 hover:bg-rose-50 cursor-pointer font-semibold border-t border-stone-100"
                  >
                    {t('حذف المنشور', 'Delete')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      handleShare();
                      setMenu(false);
                    }}
                    className="block w-full px-4 py-2.5 text-start hover:bg-stone-50 cursor-pointer font-semibold text-stone-700"
                  >
                    {t('نسخ الرابط', 'Copy link')}
                  </button>
                  {onOpenMessenger && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenMessenger(post.author.id);
                        setMenu(false);
                      }}
                      className="block w-full px-4 py-2.5 text-start hover:bg-stone-50 cursor-pointer font-semibold text-stone-700"
                    >
                      {t('مراسلة الناشر في الماسنجر', 'Message author')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      toast(t('وصل البلاغ لإدارة المنصة، شكراً لحرصك', 'Report received'));
                      setMenu(false);
                    }}
                    className="block w-full px-4 py-2.5 text-start hover:bg-stone-50 cursor-pointer font-semibold text-stone-700"
                  >
                    {t('إبلاغ الإدارة', 'Report')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scent feeling banner if tagged */}
      {feelingTag && (
        <div className="mx-4 mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900 border border-amber-200/80">
          <Sparkles className="h-3.5 w-3.5 text-amber-600" />
          <span>{feelingTag}</span>
        </div>
      )}

      {/* Post Text */}
      <div className="px-4">
        {editing ? (
          <div className="space-y-2">
            <textarea
              className={inputClass}
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <Btn small onClick={() => void save()}>
                {t('حفظ', 'Save')}
              </Btn>
              <Btn
                small
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft(post.body);
                }}
              >
                {t('إلغاء', 'Cancel')}
              </Btn>
            </div>
          </div>
        ) : (
          cleanBody && (
            <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-stone-800">
              {cleanBody.split(/(#[^\s#]+)/g).map((part, i) =>
                part.startsWith('#') ? (
                  <span key={i} className="font-bold text-amber-800 hover:underline cursor-pointer">
                    {part}
                  </span>
                ) : (
                  part
                )
              )}
            </p>
          )
        )}
      </div>

      {/* Fragrance Recipe Card Attachment */}
      {post.recipe && (
        <div className="mx-4 mt-3">
          <RecipeCard lang={lang} title={post.recipe.title} data={post.recipe.data} />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                toast(t('تم تحميل التركيبة في حاسبة المعمل بنجاح ✨', 'Formula loaded in Lab! ✨'));
                go('concentration');
              }}
              className="flex items-center gap-1.5 rounded-xl bg-amber-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-800 cursor-pointer shadow-sm"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              {t('استيراد للآلة الحاسبة', 'Import into Lab')}
            </button>
          </div>
        </div>
      )}

      {/* Attached Image */}
      {post.image && (
        <div className="mt-3 overflow-hidden bg-stone-100">
          <img
            src={post.image}
            alt=""
            loading="lazy"
            className="max-h-[520px] w-full object-cover transition hover:scale-[1.01]"
          />
        </div>
      )}

      {/* Reactions Summary & Comments Counter */}
      <div className="flex items-center justify-between px-4 py-2.5 text-xs text-stone-500 border-b border-stone-100">
        <div className="flex items-center gap-1.5">
          {total > 0 && (
            <>
              <span className="flex -space-x-1 rtl:space-x-reverse">{top.join(' ')}</span>
              <span className="font-semibold text-stone-700">{total}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {post.comments > 0 && (
            <button
              type="button"
              onClick={() => setShowComments(true)}
              className="hover:underline cursor-pointer"
            >
              {post.comments} {t('تعليق', 'comments')}
            </button>
          )}
          <button type="button" onClick={handleShare} className="hover:underline cursor-pointer">
            {t('مشاركة', 'share')}
          </button>
        </div>
      </div>

      {/* Facebook Reactions Toolbar */}
      <div className="relative grid grid-cols-3 text-xs font-bold text-stone-600">
        {/* Like / React Button */}
        <div
          className="relative"
          onMouseEnter={() => setPicker(true)}
          onMouseLeave={() => setPicker(false)}
        >
          <button
            type="button"
            onClick={() => void react(post.myReaction ? null : 'like')}
            className={`flex w-full items-center justify-center gap-1.5 py-2.5 hover:bg-stone-50 cursor-pointer ${
              mine ? 'text-amber-800 font-black' : ''
            }`}
          >
            <span className="text-base">{mine ? mine.emoji : '👍'}</span>
            <span>{mine ? (lang === 'ar' ? mine.ar : mine.en) : t('أعجبني', 'Like')}</span>
          </button>

          {/* Facebook Emoji Hover Bar */}
          {picker && (
            <div className="absolute -top-12 start-2 z-30 flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 shadow-2xl animate-in fade-in zoom-in-95">
              {REACTIONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  title={lang === 'ar' ? r.ar : r.en}
                  onClick={() => void react(r.id)}
                  className="text-2xl transition hover:scale-135 cursor-pointer transform duration-150"
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comment Button */}
        <button
          type="button"
          onClick={() => setShowComments((s) => !s)}
          className="flex items-center justify-center gap-1.5 py-2.5 hover:bg-stone-50 cursor-pointer"
        >
          <MessageCircle className="h-4 w-4" />
          <span>{t('تعليق', 'Comment')}</span>
        </button>

        {/* Share Button */}
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center justify-center gap-1.5 py-2.5 hover:bg-stone-50 cursor-pointer"
        >
          <Share2 className="h-4 w-4" />
          <span>{t('مشاركة', 'Share')}</span>
        </button>
      </div>

      {/* Comments Drawer */}
      {showComments && (
        <Comments
          post={post}
          lang={lang}
          go={go}
          toast={toast}
          onCount={(n) => onChange({ ...post, comments: n })}
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------- Recipe Card ------------------------------------------------- */

export function RecipeCard({
  lang,
  title,
  data,
}: {
  lang: Lang;
  title: string;
  data: Record<string, unknown>;
}) {
  const t = tx(lang);
  const d = data as {
    ingredients?: { name?: string; percent?: number; grams?: number }[];
    pyramidNotes?: { nameAr?: string; nameEn?: string; percentageOfOil?: number }[];
    formulation?: { concentrationPercent?: number; bottleVolumeMl?: number };
  };
  const lines = Array.isArray(d.pyramidNotes)
    ? d.pyramidNotes.slice(0, 8).map((n) => ({
        name: (lang === 'ar' ? n.nameAr : n.nameEn) || n.nameAr || n.nameEn,
        percent: n.percentageOfOil,
      }))
    : Array.isArray(d.ingredients)
    ? d.ingredients.slice(0, 8)
    : [];

  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/30 p-3.5 shadow-inner">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-black text-amber-950 text-sm">
          <FlaskConical className="h-4 w-4 text-amber-700" />
          {title}
        </p>
        {d.formulation?.concentrationPercent != null && (
          <span className="rounded-full bg-amber-200/60 px-2.5 py-0.5 text-[10px] font-bold text-amber-950">
            {t('تركيز', 'Concentration')} {d.formulation.concentrationPercent}% ·{' '}
            {d.formulation.bottleVolumeMl} ml
          </span>
        )}
      </div>

      {lines.length > 0 ? (
        <div className="mt-2.5 grid gap-1.5 text-xs text-stone-700 sm:grid-cols-2">
          {lines.map((l, i) => (
            <div
              key={i}
              className="flex justify-between items-center gap-2 rounded-xl bg-white/90 px-2.5 py-1.5 border border-stone-200/60"
            >
              <span className="font-semibold text-stone-800">{l.name}</span>
              <span className="font-mono font-bold text-amber-800">
                {l.percent != null ? `${l.percent}%` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-stone-500">
          {t('تركيبة محفوظة من مكتبة المعمل', 'Formula from member library')}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------- Comments ------------------------------------------------- */

function Comments({
  post,
  lang,
  go,
  toast,
  onCount,
}: {
  post: Post;
  lang: Lang;
  go: Go;
  toast: (s: string) => void;
  onCount: (n: number) => void;
}) {
  const t = tx(lang);
  const { data, setData, loading } = useLoad(
    () => cx<Comment[]>(`/community/posts/${post.id}/comments`),
    [post.id]
  );
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      const next = await cx<Comment[]>(`/community/posts/${post.id}/comments`, { body: { body } });
      setData(next);
      onCount(next.length);
      setBody('');
    } catch (e) {
      toast(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    try {
      await cx(`/community/comments/${id}`, { method: 'DELETE' });
      const next = (data || []).filter((c) => c.id !== id);
      setData(next);
      onCount(next.length);
    } catch (e) {
      toast(errorText(e, lang));
    }
  };

  return (
    <div className="space-y-3 border-t border-stone-100 bg-stone-50/50 p-4">
      {loading ? (
        <Spinner />
      ) : (
        (data || []).map((c) => (
          <div key={c.id} className="group flex gap-2.5 items-start">
            <button
              type="button"
              onClick={() => go(`u/${c.author.handle}`)}
              className="cursor-pointer shrink-0 mt-0.5"
            >
              <Avatar user={c.author} size={34} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="inline-block max-w-full rounded-2xl bg-white border border-stone-200/80 px-3.5 py-2 shadow-sm">
                <button
                  type="button"
                  onClick={() => go(`u/${c.author.handle}`)}
                  className="text-xs font-bold text-stone-900 hover:underline cursor-pointer block text-start"
                >
                  {c.author.name}
                </button>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-stone-800 mt-0.5">
                  {c.body}
                </p>
              </div>
              <div className="mt-1 flex items-center gap-3 px-2 text-[10px] text-stone-400">
                <span>{timeAgo(c.createdAt, lang)}</span>
                {(c.mine || post.mine) && (
                  <button
                    type="button"
                    onClick={() => void del(c.id)}
                    className="hover:text-rose-600 cursor-pointer font-semibold"
                  >
                    {t('حذف', 'Delete')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {/* Comment Input */}
      <form
        className="flex gap-2 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) void add();
        }}
      >
        <input
          className={`${inputClass} rounded-full text-xs py-2`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          placeholder={t('اكتب تعليقاً على منشور صانع العطور…', 'Write a comment…')}
        />
        <Btn type="submit" small busy={busy} disabled={!body.trim()} className="rounded-full">
          <Send className="h-3.5 w-3.5" />
        </Btn>
      </form>
    </div>
  );
}

/* ------------------------------------------------- People Panel (Right Sidebar) ------------------------------------------------- */

export function PeoplePanel({
  lang,
  go,
  toast,
  onOpenMessenger,
}: {
  lang: Lang;
  go: Go;
  toast: (s: string) => void;
  onOpenMessenger?: (userId: string) => void;
}) {
  const t = tx(lang);
  const friends = useLoad(() =>
    cx<{ friends: PublicUser[]; incoming: PublicUser[]; outgoing: PublicUser[] }>('/community/friends')
  );
  const suggestions = useLoad(() => cx<PublicUser[]>('/community/people/suggestions'));
  const [q, setQ] = useState('');
  const [found, setFound] = useState<PublicUser[] | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setFound(null);
      return;
    }
    const id = setTimeout(() => {
      void cx<PublicUser[]>(`/community/people?q=${encodeURIComponent(q.trim())}`)
        .then(setFound)
        .catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done);
      void friends.reload(true);
      void suggestions.reload(true);
      void pulseNow();
    } catch (e) {
      toast(errorText(e, lang));
    }
  };

  return (
    <>
      {/* People Search */}
      <Card className="p-3.5">
        <div className="relative">
          <Search className="absolute inset-y-0 start-3 my-auto h-4 w-4 text-stone-400" />
          <input
            className={`${inputClass} ps-9 py-2 text-xs`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('ابحث عن صناع العطور بالاسم أو المعرف…', 'Search perfumers…')}
          />
        </div>
        {found && (
          <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
            {found.length ? (
              found.map((u) => <PersonRow key={u.id} u={u} lang={lang} go={go} />)
            ) : (
              <p className="text-xs text-stone-500 py-2 text-center">{t('لا توجد نتائج', 'No results')}</p>
            )}
          </div>
        )}
      </Card>

      {/* Online Contacts & Friends (Active right now with green dot) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
          <h3 className="font-black text-xs text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {t('جهات الاتصال المتصلة الآن', 'Contacts Online')}
          </h3>
          <span className="text-[11px] text-stone-400">
            {(friends.data?.friends || []).filter((f) => f.online).length || (friends.data?.friends.length || 0)}
          </span>
        </div>

        <div className="space-y-2">
          {!friends.data?.friends.length ? (
            <p className="text-xs text-stone-500 py-2">
              {t('أضف أصدقاء لتراهم متصلين وتتواصل معهم فوراً.', 'Add friends to see them online.')}
            </p>
          ) : (
            friends.data.friends.slice(0, 8).map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-stone-50 transition cursor-pointer"
                onClick={() => (onOpenMessenger ? onOpenMessenger(u.id) : go(`messenger`))}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="relative">
                    <Avatar user={u} size={34} />
                    <span className="absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-stone-900">{u.name}</p>
                    <p className="truncate text-[10px] text-stone-400">@{u.handle}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenMessenger) onOpenMessenger(u.id);
                    else go('messenger');
                  }}
                  className="rounded-full p-1.5 text-stone-400 hover:bg-amber-100 hover:text-amber-900 cursor-pointer"
                  title={t('محادثة ماسنجر سريعة', 'Instant Chat')}
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Friend Requests */}
      {!!friends.data?.incoming.length && (
        <Card className="p-4 border-amber-300 bg-amber-50/30">
          <p className="mb-3 font-black text-xs text-amber-950 flex items-center justify-between">
            <span>{t('طلبات الصداقة الواردة', 'Friend requests')}</span>
            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
              {friends.data.incoming.length}
            </span>
          </p>
          <div className="space-y-3">
            {friends.data.incoming.map((u) => (
              <div key={u.id} className="space-y-2 rounded-xl bg-white p-2.5 border border-amber-200">
                <PersonRow u={u} lang={lang} go={go} />
                <div className="flex gap-2 pt-1">
                  <Btn
                    small
                    className="flex-1 text-[11px]"
                    onClick={() =>
                      void act(
                        () => cx(`/community/friends/${u.id}`, { body: {} }),
                        t('أصبحتم أصدقاء الآن 🎉', 'You are now friends 🎉')
                      )
                    }
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t('قبول', 'Accept')}
                  </Btn>
                  <Btn
                    small
                    variant="ghost"
                    className="flex-1 text-[11px]"
                    onClick={() =>
                      void act(
                        () => cx(`/community/friends/${u.id}`, { method: 'DELETE' }),
                        t('تم رفض الطلب', 'Declined')
                      )
                    }
                  >
                    {t('رفض', 'Decline')}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Trending Salon Topics */}
      <Card className="p-4 space-y-2.5">
        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
          <h3 className="font-black text-xs text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-amber-600" />
            {t('المناقشات الرائجة في الصالون', 'Trending Salon Topics')}
          </h3>
          <button
            type="button"
            onClick={() => go('discussions')}
            className="text-[10px] font-bold text-amber-800 hover:underline cursor-pointer"
          >
            {t('عرض الكل', 'View all')}
          </button>
        </div>

        <div className="space-y-2 text-xs">
          {[
            { tag: 'تعتيق_العود', title: 'المدة المثالية لتعتيق العطور الشرقية الثقيلة', replies: 6 },
            { tag: 'نقاء_المواد', title: 'طرق كشف العود الطبيعي والمغشوش بالزيوت الخاملة', replies: 4 },
            { tag: 'موازنة_الهرم', title: 'سر الفوحان الصيفي بين البرغموت والـ Hedione', replies: 8 },
          ].map((topic, i) => (
            <div
              key={i}
              onClick={() => go('discussions')}
              className="p-2 rounded-xl hover:bg-stone-50 transition cursor-pointer space-y-0.5"
            >
              <p className="font-bold text-stone-900 line-clamp-1">{topic.title}</p>
              <p className="text-[10px] text-stone-400 flex items-center justify-between">
                <span>#{topic.tag}</span>
                <span>{topic.replies} {t('ردود', 'replies')}</span>
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* People You May Know */}
      <Card className="p-4 space-y-3">
        <p className="font-black text-xs text-stone-900 uppercase tracking-wider">
          {t('صناع عطور قد تعرفهم', 'Perfumers you may know')}
        </p>
        {suggestions.loading ? (
          <Spinner />
        ) : !suggestions.data?.length ? (
          <p className="text-xs text-stone-500">
            {t('ستظهر الاقتراحات مع توسع مجتمع صانعي العطور.', 'Suggestions will appear.')}
          </p>
        ) : (
          <div className="space-y-2.5">
            {suggestions.data.slice(0, 5).map((u) => (
              <div key={u.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <PersonRow u={u} lang={lang} go={go} />
                </div>
                <Btn
                  small
                  variant="soft"
                  onClick={() =>
                    void act(
                      () => cx(`/community/friends/${u.id}`, { body: {} }),
                      t('تم إرسال طلب الصداقة ✨', 'Request sent ✨')
                    )
                  }
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </Btn>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Featured Perfume House Spotlight */}
      <Card className="overflow-hidden border-amber-300 bg-gradient-to-br from-amber-900 to-stone-900 p-4 text-white shadow-md">
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
          ✨ {t('عطر الأسبوع المختار من دار شام', 'Curated Creation of the Week')}
        </span>
        <h4 className="mt-1 text-sm font-black text-white">«سلطان العود والباتشولي الملكي»</h4>
        <p className="mt-1 text-[11px] leading-relaxed text-stone-300">
          {t(
            'تركيبة ملكية تعتمد على العود الكمبودي المعتق والباتشولي بتركيز 28% Extrait de Parfum.',
            'Royal formulation with aged Cambodian oud & Indonesian patchouli at 28% Extrait.'
          )}
        </p>
        <button
          type="button"
          onClick={() => go('stores')}
          className="mt-3 flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-amber-500 cursor-pointer"
        >
          <Store className="h-3.5 w-3.5" />
          {t('استكشف في متجر الدار', 'View in Store')}
        </button>
      </Card>
    </>
  );
}

export function PersonRow({ u, lang, go }: { u: PublicUser; lang: Lang; go: Go }) {
  const t = tx(lang);
  return (
    <button
      type="button"
      onClick={() => go(`u/${u.handle}`)}
      className="flex w-full min-w-0 items-center gap-2.5 text-start cursor-pointer group"
    >
      <Avatar user={u} size={38} />
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold text-stone-900 group-hover:text-amber-800">
          {u.name}
        </span>
        <span className="block truncate text-[10px] text-stone-500">
          @{u.handle}
          {u.mutual ? ` · ${u.mutual} ${t('صديق مشترك', 'mutual')}` : ''}
          {u.merchant ? ` · ${u.merchant.storeName}` : ''}
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------- Friends Page ------------------------------------------------- */

export function FriendsPage({
  lang,
  go,
  toast,
  onOpenMessenger,
}: Omit<Props, 'session'>) {
  const t = tx(lang);
  const { data, loading, reload } = useLoad(() =>
    cx<{ friends: PublicUser[]; incoming: PublicUser[]; outgoing: PublicUser[] }>('/community/friends')
  );
  const blocked = useLoad(() => cx<PublicUser[]>('/community/blocks'));

  if (loading) return <Spinner />;

  const section = (
    title: string,
    list: PublicUser[],
    extra: (u: PublicUser) => React.ReactNode
  ) => (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-stone-100 pb-2">
        <h3 className="font-black text-sm text-stone-900">
          {title} ({list.length})
        </h3>
      </div>
      {!list.length ? (
        <p className="text-xs text-stone-400 py-3 text-center">—</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-2.5 rounded-2xl border border-stone-100 bg-stone-50/50 p-2.5 hover:bg-white transition"
            >
              <div className="min-w-0 flex-1">
                <PersonRow u={u} lang={lang} go={go} />
              </div>
              {extra(u)}
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      void reload(true);
      void blocked.reload(true);
      void pulseNow();
    } catch (e) {
      toast(errorText(e, lang));
    }
  };

  return (
    <div className="space-y-4">
      {section(t('طلبات الصداقة الواردة', 'Incoming requests'), data?.incoming || [], (u) => (
        <div className="flex gap-1">
          <Btn
            small
            onClick={() =>
              void act(() => cx(`/community/friends/${u.id}`, { body: {} }))
            }
          >
            <UserCheck className="h-3.5 w-3.5" />
          </Btn>
          <Btn
            small
            variant="ghost"
            onClick={() =>
              void act(() => cx(`/community/friends/${u.id}`, { method: 'DELETE' }))
            }
          >
            <X className="h-3.5 w-3.5" />
          </Btn>
        </div>
      ))}

      {section(t('أصدقاء المنصة', 'Platform Friends'), data?.friends || [], (u) => (
        <div className="flex gap-1">
          <Btn
            small
            variant="soft"
            onClick={() => {
              if (onOpenMessenger) onOpenMessenger(u.id);
              else void act(async () => {
                const { id } = await cx<{ id: string }>('/community/chats/direct', {
                  body: { userId: u.id },
                });
                go(`messenger/${id}`);
              });
            }}
          >
            <MessageCircle className="h-4 w-4" />
          </Btn>
        </div>
      ))}

      {section(t('طلبات أرسلتها', 'Sent requests'), data?.outgoing || [], (u) => (
        <Btn
          small
          variant="ghost"
          onClick={() =>
            void act(() => cx(`/community/friends/${u.id}`, { method: 'DELETE' }))
          }
        >
          <X className="h-4 w-4" />
        </Btn>
      ))}

      {section(t('المحظورون', 'Blocked'), blocked.data || [], (u) => (
        <Btn
          small
          variant="ghost"
          onClick={() =>
            void act(() => cx(`/community/blocks/${u.id}`, { method: 'DELETE' }))
          }
        >
          {t('إلغاء الحظر', 'Unblock')}
        </Btn>
      ))}
    </div>
  );
}

/* ------------------------------------------------- Notifications Page ------------------------------------------------- */

export function NotificationsPage({ lang, go }: { lang: Lang; go: Go }) {
  const t = tx(lang);
  const { data, loading } = useLoad(() => cx<Notification[]>('/community/notifications'));

  useEffect(() => {
    void cx('/community/notifications/read', { body: {} })
      .then(() => pulseNow())
      .catch(() => {});
  }, []);

  const text = (n: Notification) => {
    const who = n.actor?.name || t('الإدارة', 'The administration');
    const map: Record<string, [string, string, string?]> = {
      friend_request: [`${who} أرسل لك طلب صداقة`, `${who} sent you a friend request`, n.actor ? `u/${n.actor.handle}` : 'friends'],
      friend_accepted: [`${who} قبل طلب صداقتك 🎉`, `${who} accepted your friend request 🎉`, n.actor ? `u/${n.actor.handle}` : 'friends'],
      reaction: [`${who} تفاعل مع منشورك العطري ✨`, `${who} reacted to your post ✨`, ''],
      comment: [`${who} علّق على منشورك 💬`, `${who} commented on your post 💬`, ''],
      order_paid: ['طلب جديد مدفوع في متجرك 🎉', 'A new paid order in your store 🎉', 'merchant/orders'],
      merchant_approved: ['تمت الموافقة على متجرك — مبروك! 🎉', 'Your store was approved 🎉', 'merchant'],
      merchant_rejected: ['الإدارة طلبت تعديلات على ملف متجرك', 'The administration asked for changes', 'merchant'],
      merchant_suspended: ['تم إيقاف متجرك مؤقتاً', 'Your store was suspended', 'merchant'],
      product_approved: ['تم نشر منتجك في المتجر ✅', 'Your product is live ✅', 'merchant/products'],
      product_rejected: ['منتجك يحتاج مراجعة', 'Your product needs changes', 'merchant/products'],
      order_shipped: [`طلبك ${n.ref} تم شحنه 🚚`, `Your order ${n.ref} shipped 🚚`, 'me/orders'],
      order_delivered: [`طلبك ${n.ref} تم تسليمه بنجاح ✅`, `Your order was delivered ✅`, 'me/orders'],
      order_cancelled: [`طلبك ${n.ref} تم إلغاؤه`, `Your order was cancelled`, 'me/orders'],
    };
    return map[n.kind] || [n.kind, n.kind, ''];
  };

  return (
    <Card className="divide-y divide-stone-100 shadow-sm border-stone-200">
      <div className="flex items-center gap-2 p-4 font-black text-stone-900">
        <Bell className="h-5 w-5 text-amber-600" />
        <span>{t('مركز الإشعارات والتنبيهات', 'Notifications Center')}</span>
      </div>
      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty title={t('لا توجد إشعارات جديدة', 'No notifications')} />
      ) : (
        data.map((n) => {
          const [ar, en, route] = text(n);
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => route && go(route)}
              className={`flex w-full items-center gap-3 p-4 text-start hover:bg-stone-50 cursor-pointer ${
                n.read ? '' : 'bg-amber-50/60'
              }`}
            >
              {n.actor ? (
                <Avatar user={n.actor} size={40} />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-lg">
                  🔔
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-xs sm:text-sm font-semibold text-stone-800">
                  {lang === 'ar' ? ar : en}
                </span>
                <span className="text-[11px] text-stone-400">{timeAgo(n.createdAt, lang)}</span>
              </span>
              {!n.read && <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />}
            </button>
          );
        })
      )}
    </Card>
  );
}
