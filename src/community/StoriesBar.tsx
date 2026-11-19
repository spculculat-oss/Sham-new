import { useState, useEffect } from 'react';
import { Plus, X, ChevronRight, ChevronLeft, Send, Sparkles, Eye, Loader2 } from 'lucide-react';
import { Avatar, tx, type Lang } from './ui';
import { cx, type AiComposeResult, type PublicUser } from './api';

import heroLuxuryImg from '../assets/images/hero_luxury_perfume_1791692409081.jpg';
import grasseRoseImg from '../assets/images/grasse_rose_harvest_1791696039244.jpg';
import labCompoundingImg from '../assets/images/perfume_lab_compounding_1791692420116.jpg';
import nicheRevealImg from '../assets/images/niche_perfume_reveal_1791968798991.jpg';
import botanicalHarvestImg from '../assets/images/botanical_harvest_raw_1791968832488.jpg';

export interface StoryItem {
  id: string;
  user: Pick<PublicUser, 'id' | 'name' | 'handle' | 'avatar' | 'online'>;
  title: string;
  image: string;
  caption: string;
  timeAgo: string;
  views: number;
  scentTag?: string;
}

const STORY_SCENES = [
  { id: 'compounding', src: labCompoundingImg, labelAr: 'المعمل والتركيب', labelEn: 'Blending Bench' },
  { id: 'rose', src: grasseRoseImg, labelAr: 'قطاف الورد', labelEn: 'Rose Harvest' },
  { id: 'niche', src: nicheRevealImg, labelAr: 'إصدار نيش', labelEn: 'Niche Reveal' },
  { id: 'flacon', src: heroLuxuryImg, labelAr: 'زجاجة ملكية', labelEn: 'Crystal Flacon' },
];

const DEFAULT_STORIES: StoryItem[] = [
  {
    id: 's_dar_sham',
    user: {
      id: 'u_dar_sham',
      name: 'دار شام للعطور',
      handle: 'dar_sham',
      avatar: heroLuxuryImg,
      online: true,
    },
    title: 'تعتيق موسم الخريف',
    image: labCompoundingImg,
    caption: 'خلطة العود المعتق مع الباتشولي الملكي بدأت مرحلة التعتيق البارد على 15°م لصناعة اندماج مخملي عميق.',
    timeAgo: 'منذ ساعتين',
    views: 184,
    scentTag: 'عود كمبودي · باتشولي',
  },
  {
    id: 's_nourhan',
    user: {
      id: 'u_nourhan',
      name: 'م. نورهان الكردي',
      handle: 'nourhan_lab',
      avatar: grasseRoseImg,
      online: true,
    },
    title: 'تقطير الورد الدمشقي',
    image: grasseRoseImg,
    caption: 'أول قطرات الزيت العطري الصافي من مقطرة الورد الجوري الطازج بنقاء 100% واستخلاص هادئ بالبخار.',
    timeAgo: 'منذ 4 ساعات',
    views: 240,
    scentTag: 'ورد دمشقي نقي',
  },
  {
    id: 's_ahmed',
    user: {
      id: 'u_ahmed_shaheen',
      name: 'أحمد شاهين',
      handle: 'ahmed_shaheen',
      avatar: nicheRevealImg,
      online: true,
    },
    title: 'هالة الفوحان المتوازن',
    image: nicheRevealImg,
    caption: 'موازنة الـ Hedione بنسبة 6% مع البرغموت الإيطالي لرفع الانتشار العطري إلى 8 ساعات متواصلة.',
    timeAgo: 'منذ 6 ساعات',
    views: 312,
    scentTag: 'برغموت · هيديون · مسك',
  },
  {
    id: 's_tariq',
    user: {
      id: 'u_tariq_oud',
      name: 'طارق العتيبي',
      handle: 'tariq_oud',
      avatar: botanicalHarvestImg,
      online: false,
    },
    title: 'خشب العود واللبان',
    image: botanicalHarvestImg,
    caption: 'فرز المواد الراتنجية والأخشاب النادرة قبل التحضير والتعتيق في قوارير زجاجية معتمة.',
    timeAgo: 'منذ 10 ساعات',
    views: 420,
    scentTag: 'عود هندي · لبان عماني',
  },
];

export function StoriesBar({
  lang,
  currentUser,
  onOpenMessenger,
}: {
  lang: Lang;
  currentUser?: { name: string; avatar?: string | null };
  onOpenMessenger?: (userId: string) => void;
}) {
  const t = tx(lang);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [showAddStory, setShowAddStory] = useState(false);
  const [stories, setStories] = useState<StoryItem[]>(DEFAULT_STORIES);

  // New story modal state
  const [newTitle, setNewTitle] = useState('');
  const [newCaption, setNewCaption] = useState('');
  const [newScentTag, setNewScentTag] = useState('');
  const [newImage, setNewImage] = useState(STORY_SCENES[0].src);
  const [aiBusy, setAiBusy] = useState(false);

  const activeStory = activeStoryIndex !== null ? stories[activeStoryIndex] : null;

  useEffect(() => {
    if (activeStoryIndex === null) return;
    const timer = setTimeout(() => {
      if (activeStoryIndex < stories.length - 1) {
        setActiveStoryIndex((prev) => (prev !== null ? prev + 1 : null));
      } else {
        setActiveStoryIndex(null);
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeStoryIndex, stories.length]);

  const handleAiStoryCraft = async () => {
    setAiBusy(true);
    try {
      const res = await cx<AiComposeResult>('/community/ai/compose', {
        body: {
          mode: 'story_prompt',
          topic: `${newTitle} ${newScentTag}`.trim(),
          text: newCaption,
          lang,
        },
      });
      if (res.storyMeta) {
        if (!newTitle.trim()) setNewTitle(res.storyMeta.title);
        if (!newScentTag.trim()) setNewScentTag(res.storyMeta.scentTag);
        setNewCaption(res.storyMeta.caption);
      } else if (res.result) {
        setNewCaption(res.result);
      }
    } catch {
      // ignore gracefully
    } finally {
      setAiBusy(false);
    }
  };

  const handleCreateStory = () => {
    if (!newCaption.trim()) return;
    const newStory: StoryItem = {
      id: `s_user_${Date.now()}`,
      user: {
        id: 'me',
        name: currentUser?.name || t('أنت', 'You'),
        handle: 'me',
        avatar: currentUser?.avatar || null,
        online: true,
      },
      title: newTitle.trim() || t('تجربة معملية', 'Atelier Study'),
      image: newImage,
      caption: newCaption.trim(),
      timeAgo: t('الآن', 'Just now'),
      views: 1,
      scentTag: newScentTag.trim() || undefined,
    };
    setStories([newStory, ...stories]);
    setShowAddStory(false);
    setNewTitle('');
    setNewCaption('');
    setNewScentTag('');
  };

  return (
    <>
      <div className="relative flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
        {/* Create Story Card */}
        <button
          type="button"
          onClick={() => setShowAddStory(true)}
          className="group relative flex h-44 w-32 shrink-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-[0_1px_2px_rgba(24,20,18,0.04)] transition hover:border-amber-500 text-center"
        >
          <div className="relative h-28 w-full overflow-hidden bg-stone-100">
            {currentUser?.avatar ? (
              <img
                src={currentUser.avatar}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            ) : (
              <img
                src={labCompoundingImg}
                alt=""
                className="h-full w-full object-cover brightness-90 transition duration-300 group-hover:scale-105"
              />
            )}
            <div className="absolute inset-0 bg-stone-950/20 group-hover:bg-stone-950/10 transition" />
          </div>
          <div className="relative flex flex-1 flex-col items-center justify-center bg-white px-2">
            <span className="-mt-5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-amber-800 text-white shadow transition group-hover:bg-amber-900">
              <Plus className="h-4 w-4" />
            </span>
            <span className="mt-1 text-[11px] font-bold text-stone-900 whitespace-nowrap">
              {t('إضافة قصة', 'Add Story')}
            </span>
          </div>
        </button>

        {/* Stories List */}
        {stories.map((story, idx) => (
          <button
            key={story.id}
            type="button"
            onClick={() => setActiveStoryIndex(idx)}
            className="group relative flex h-44 w-32 shrink-0 cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-stone-200/80 shadow-[0_1px_2px_rgba(24,20,18,0.05)] transition hover:border-amber-400 text-start"
          >
            <img
              src={story.image}
              alt={story.title}
              className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/85" />

            {/* Story Top: Avatar */}
            <div className="relative z-10 p-2.5">
              <span className="inline-block rounded-full ring-2 ring-amber-400 ring-offset-2 ring-offset-stone-900">
                <Avatar user={story.user} size={32} />
              </span>
            </div>

            {/* Story Bottom */}
            <div className="relative z-10 p-2.5 space-y-0.5">
              <p className="line-clamp-2 text-xs font-bold leading-snug text-white drop-shadow">
                {story.title}
              </p>
              <span className="block truncate text-[10px] text-amber-200/90 font-medium">
                {story.user.name.split(' ')[0]} {story.scentTag ? `· ${story.scentTag}` : ''}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Story Viewer Modal */}
      {activeStory && activeStoryIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/90 p-4 backdrop-blur-md">
          <div className="relative flex h-[85vh] max-h-[700px] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-stone-900 shadow-2xl border border-stone-800">
            <img
              src={activeStory.image}
              alt={activeStory.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/75" />

            {/* Progress Bars */}
            <div className="relative z-20 flex gap-1 p-3">
              {stories.map((s, i) => (
                <div
                  key={s.id}
                  className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
                >
                  <div
                    className={`h-full bg-amber-400 transition-all ${
                      i <= activeStoryIndex ? 'w-full' : 'w-0'
                    }`}
                  />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="relative z-20 flex items-center justify-between px-3.5 py-1">
              <div className="flex items-center gap-2">
                <Avatar user={activeStory.user} size={34} ring />
                <div>
                  <p className="text-sm font-bold text-white">{activeStory.user.name}</p>
                  <p className="text-[11px] text-stone-300">{activeStory.timeAgo}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveStoryIndex(null)}
                className="rounded-full bg-white/15 p-2 text-white transition hover:bg-white/30 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Navigation arrows */}
            <div className="relative z-10 flex flex-1 items-center justify-between px-2">
              <button
                type="button"
                onClick={() =>
                  setActiveStoryIndex((prev) =>
                    prev !== null && prev > 0 ? prev - 1 : 0
                  )
                }
                className="rounded-full bg-black/40 p-2 text-white hover:bg-black/65 cursor-pointer"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveStoryIndex((prev) =>
                    prev !== null && prev < stories.length - 1 ? prev + 1 : null
                  )
                }
                className="rounded-full bg-black/40 p-2 text-white hover:bg-black/65 cursor-pointer"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>

            {/* Footer */}
            <div className="relative z-20 space-y-2.5 p-4">
              {activeStory.scentTag && (
                <p className="text-xs font-semibold text-amber-300">
                  {activeStory.scentTag}
                </p>
              )}
              <h3 className="text-lg font-black text-white">{activeStory.title}</h3>
              <p className="text-sm leading-relaxed text-stone-200">
                {activeStory.caption}
              </p>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveStoryIndex(null);
                    if (onOpenMessenger && activeStory.user.id !== 'me') {
                      onOpenMessenger(activeStory.user.id);
                    }
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/20 py-2.5 text-xs font-bold text-white backdrop-blur hover:bg-white/30 cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                  {t('رد في الماسنجر', 'Reply in Messenger')}
                </button>
                <span className="flex items-center gap-1 text-xs tabular-nums text-stone-300">
                  <Eye className="h-3.5 w-3.5" />
                  {activeStory.views}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Story Modal */}
      {showAddStory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-black text-stone-900">
                {t('نشر قصة معملية جديدة', 'Publish Atelier Story')}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddStory(false)}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Scene Selector */}
              <div>
                <span className="mb-1.5 block text-xs font-bold text-stone-700">
                  {t('خلفية القصة من المعمل', 'Story Scene')}
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {STORY_SCENES.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setNewImage(sc.src)}
                      className={`relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition cursor-pointer ${
                        newImage === sc.src ? 'border-amber-700 ring-2 ring-amber-200' : 'border-stone-200 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img src={sc.src} alt={sc.labelEn} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  {t('عنوان القصة', 'Story title')}
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t('مثال: تعتيق العود الكمبودي', 'e.g. Aged Oud Maceration')}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  {t('النوتة أو التناغم العطري', 'Key notes / accord')}
                </label>
                <input
                  type="text"
                  value={newScentTag}
                  onChange={(e) => setNewScentTag(e.target.value)}
                  placeholder={t('مثال: ورد طائفي + صندل', 'e.g. Taif Rose + Sandalwood')}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700">
                    {t('نص القصة', 'Story caption')}
                  </label>
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => void handleAiStoryCraft()}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100 transition cursor-pointer disabled:opacity-50"
                  >
                    {aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-amber-700" />}
                    <span>{t('صياغة بالذكاء', 'Draft with AI')}</span>
                  </button>
                </div>
                <textarea
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  rows={3}
                  placeholder={t(
                    'اكتب تفاصيل التجربة أو الفوحان أو التعتيق…',
                    'Write details about your formulation, maceration or drydown…'
                  )}
                  className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={!newCaption.trim()}
                  onClick={handleCreateStory}
                  className="flex-1 rounded-xl bg-amber-800 py-2.5 text-sm font-bold text-white transition hover:bg-amber-900 disabled:opacity-50 cursor-pointer"
                >
                  {t('نشر القصة الآن', 'Publish Story')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddStory(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
