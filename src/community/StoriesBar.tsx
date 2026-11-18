import { useState, useEffect } from 'react';
import { Plus, X, ChevronRight, ChevronLeft, Heart, Send, Sparkles, Eye } from 'lucide-react';
import { Avatar, tx, type Lang } from './ui';
import type { PublicUser } from './api';

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

const DEFAULT_STORIES: StoryItem[] = [
  {
    id: 's_dar_sham',
    user: {
      id: 'u_dar_sham',
      name: 'دار شام للعطور',
      handle: 'dar_sham',
      avatar: 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=200&auto=format&fit=crop&q=80',
      online: true,
    },
    title: 'تعتيق موسم الخريف',
    image: 'https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?w=800&auto=format&fit=crop&q=80',
    caption: 'خلطة العود المعتق مع الباتشولي الملكي بدأت مرحلة التعتيق البارد 🍂 رائحة المعمل تسحر القلوب!',
    timeAgo: 'منذ ساعتين',
    views: 184,
    scentTag: 'عود كمبودي + باتشولي',
  },
  {
    id: 's_nourhan',
    user: {
      id: 'u_nourhan',
      name: 'م. نورهان الكردي',
      handle: 'nourhan_lab',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80',
      online: true,
    },
    title: 'تقطير الورد الدمشقي',
    image: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&auto=format&fit=crop&q=80',
    caption: 'أول قطرات الزيت العطري الصافي من مقطرة الورد الجوري الطازج 🌹 النقاء والتركيز لا يوصفان.',
    timeAgo: 'منذ 4 ساعات',
    views: 240,
    scentTag: 'ورد دمشقي نقي 100%',
  },
  {
    id: 's_ahmed',
    user: {
      id: 'u_ahmed_shaheen',
      name: 'الكابتن أحمد شاهين',
      handle: 'ahmed_shaheen',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      online: true,
    },
    title: 'هالة الفوحان السحرية',
    image: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&auto=format&fit=crop&q=80',
    caption: 'تجربة موازنة الـ Hedione مع البرغموت الإيطالي لإنتاج انتشار عطري يدوم 8 ساعات متواصلة ✨',
    timeAgo: 'منذ 6 ساعات',
    views: 312,
    scentTag: 'برغموت + هيديون + مسك',
  },
  {
    id: 's_tariq',
    user: {
      id: 'u_tariq_oud',
      name: 'الشيخ طارق العتيبي',
      handle: 'tariq_oud',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      online: false,
    },
    title: 'كسر العود الكلاكاسي',
    image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=800&auto=format&fit=crop&q=80',
    caption: 'قطعة عود هندي كلاكاسي نادرة تزبد بالدهن الطبيعي.. تجربة تذوب الحواس في مجلس العطور 🪵',
    timeAgo: 'منذ 10 ساعات',
    views: 420,
    scentTag: 'عود هندي دبل سوبر',
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

  const activeStory = activeStoryIndex !== null ? stories[activeStoryIndex] : null;

  // Auto advance story progress
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
      title: newTitle.trim() || t('تجربة عطرية', 'Scent experience'),
      image: 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=800&auto=format&fit=crop&q=80',
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
      <div className="relative mb-4 flex items-center gap-2.5 overflow-x-auto pb-2 pt-1 no-scrollbar">
        {/* Create Story Card */}
        <div
          onClick={() => setShowAddStory(true)}
          className="group relative flex h-48 w-32 shrink-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
        >
          <div className="relative h-32 w-full overflow-hidden bg-stone-100">
            {currentUser?.avatar ? (
              <img
                src={currentUser.avatar}
                alt=""
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-500 to-amber-800 text-3xl font-black text-white">
                {currentUser?.name?.[0] || '✨'}
              </div>
            )}
            <div className="absolute inset-0 bg-stone-900/10 group-hover:bg-transparent" />
          </div>
          <div className="relative flex flex-1 flex-col items-center justify-center bg-white px-1 text-center">
            <span className="-mt-5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-amber-600 text-white shadow transition group-hover:bg-amber-700">
              <Plus className="h-5 w-5" />
            </span>
            <span className="mt-1 text-[11px] font-bold text-stone-900">
              {t('إضافة قصة', 'Add story')}
            </span>
          </div>
        </div>

        {/* Stories List */}
        {stories.map((story, idx) => (
          <div
            key={story.id}
            onClick={() => setActiveStoryIndex(idx)}
            className="group relative flex h-48 w-32 shrink-0 cursor-pointer flex-col justify-between overflow-hidden rounded-2xl shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            <img
              src={story.image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-stone-900/50 via-transparent to-stone-950/85" />

            {/* Story Top: User Avatar with gold ring */}
            <div className="relative z-10 p-2.5">
              <span className="inline-block rounded-full ring-2 ring-amber-400 ring-offset-2 ring-offset-stone-900">
                <Avatar user={story.user} size={36} />
              </span>
            </div>

            {/* Story Bottom: Caption & Scent badge */}
            <div className="relative z-10 p-2.5">
              {story.scentTag && (
                <span className="mb-1 inline-block max-w-full truncate rounded-md bg-amber-500/80 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                  {story.scentTag}
                </span>
              )}
              <p className="line-clamp-2 text-xs font-bold leading-tight text-white drop-shadow">
                {story.title}
              </p>
              <span className="mt-0.5 block text-[10px] text-stone-300">
                {story.user.name.split(' ')[0]}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Story Viewer Modal */}
      {activeStory && activeStoryIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/90 p-4 backdrop-blur-md">
          <div className="relative flex h-[85vh] max-h-[720px] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-stone-900 shadow-2xl">
            {/* Story Image */}
            <img
              src={activeStory.image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-stone-950/80" />

            {/* Progress Bars */}
            <div className="relative z-20 flex gap-1 p-3">
              {stories.map((s, i) => (
                <div
                  key={s.id}
                  className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
                >
                  <div
                    className={`h-full bg-amber-400 transition-all ${
                      i < activeStoryIndex
                        ? 'w-full'
                        : i === activeStoryIndex
                        ? 'w-full animate-[progress_6s_linear]'
                        : 'w-0'
                    }`}
                  />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="relative z-20 flex items-center justify-between px-3 py-1">
              <div className="flex items-center gap-2">
                <Avatar user={activeStory.user} size={36} ring />
                <div>
                  <p className="text-sm font-bold text-white">{activeStory.user.name}</p>
                  <p className="text-[11px] text-stone-300">{activeStory.timeAgo}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveStoryIndex(null)}
                className="rounded-full bg-white/20 p-2 text-white transition hover:bg-white/40 cursor-pointer"
              >
                <X className="h-5 w-5" />
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
                className="rounded-full bg-black/40 p-2 text-white hover:bg-black/60 cursor-pointer"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveStoryIndex((prev) =>
                    prev !== null && prev < stories.length - 1
                      ? prev + 1
                      : null
                  )
                }
                className="rounded-full bg-black/40 p-2 text-white hover:bg-black/60 cursor-pointer"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            </div>

            {/* Footer / Caption */}
            <div className="relative z-20 space-y-3 p-4">
              {activeStory.scentTag && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-600/90 px-3 py-1 text-xs font-bold text-white shadow">
                  <Sparkles className="h-3.5 w-3.5" />
                  {activeStory.scentTag}
                </span>
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
                  {t('رد برسالة في الماسنجر', 'Reply in Messenger')}
                </button>
                <span className="flex items-center gap-1 text-xs text-stone-400">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-black text-stone-900">
                {t('نشر قصة عطرية جديدة', 'Share new fragrance story')}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddStory(false)}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  {t('عنوان القصة أو التجربة', 'Story title')}
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t(
                    'مثال: تجربة تعتيق العود، أول قطفة ياسمين…',
                    'e.g. Macerating oud, first jasmine drops…'
                  )}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  {t('نوتة أو مادة القصة', 'Scent note or ingredient')}
                </label>
                <input
                  type="text"
                  value={newScentTag}
                  onChange={(e) => setNewScentTag(e.target.value)}
                  placeholder={t('مثال: ورد طائفي + صندل', 'e.g. Taif Rose + Sandalwood')}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">
                  {t('ما الذي تود مشاركته مع صناع العطور؟', 'What do you want to share?')}
                </label>
                <textarea
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  rows={3}
                  placeholder={t(
                    'اكتب تفاصيل التجربة أو سر الفوحان أو التعتيق…',
                    'Write details about your formulation, maceration or scent test…'
                  )}
                  className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={!newCaption.trim()}
                  onClick={handleCreateStory}
                  className="flex-1 rounded-xl bg-amber-700 py-2.5 text-sm font-bold text-white transition hover:bg-amber-800 disabled:opacity-50 cursor-pointer"
                >
                  {t('نشر القصة الآن ✨', 'Publish story now ✨')}
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
