import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  X,
  ChevronRight,
  ChevronLeft,
  Send,
  Sparkles,
  Eye,
  Loader2,
  ImagePlus,
  Trash2,
} from 'lucide-react';
import { Avatar, timeAgo, tx, type Lang } from './ui';
import {
  cx,
  getSessionToken,
  resizeImage,
  type AiComposeResult,
  type StoryRecord,
} from './api';
import { SCENE_CATALOG, resolveSceneSrc } from './scenes';

const STORY_REACT_EMOJIS = ['❤️', '🔥', '😮', '👍', '🌹'] as const;

export function StoriesBar({
  lang,
  currentUser,
  onOpenMessenger,
  toast,
}: {
  lang: Lang;
  currentUser?: { id?: string; name: string; avatar?: string | null };
  onOpenMessenger?: (userId: string) => void;
  toast?: (text: string) => void;
}) {
  const t = tx(lang);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [showAddStory, setShowAddStory] = useState(false);
  const [stories, setStories] = useState<StoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // New story modal state
  const [newTitle, setNewTitle] = useState('');
  const [newCaption, setNewCaption] = useState('');
  const [newScentTag, setNewScentTag] = useState('');
  const [newImage, setNewImage] = useState<string>('scene:compounding');
  const [aiBusy, setAiBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadStories = async () => {
    try {
      const list = await cx<StoryRecord[]>('/community/stories');
      setStories(Array.isArray(list) ? list : []);
    } catch {
      setStories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStories();
  }, [currentUser?.id]);

  const activeStory = activeStoryIndex !== null ? stories[activeStoryIndex] : null;

  // Record view when active story opens
  useEffect(() => {
    if (!activeStory || !getSessionToken()) return;
    if (activeStory.viewedByMe) return;
    cx<{ id: string; views: number; reactions: Record<string, number>; myReaction: string }>(
      `/community/stories/${activeStory.id}/react`,
      { body: {} }
    )
      .then((res) => {
        setStories((prev) =>
          prev.map((s) =>
            s.id === activeStory.id
              ? { ...s, views: res.views, viewedByMe: true, reactions: res.reactions }
              : s
          )
        );
      })
      .catch(() => {});
  }, [activeStory?.id]);

  useEffect(() => {
    if (activeStoryIndex === null) return;
    const timer = setTimeout(() => {
      if (activeStoryIndex < stories.length - 1) {
        setActiveStoryIndex((prev) => (prev !== null ? prev + 1 : null));
      } else {
        setActiveStoryIndex(null);
      }
    }, 6500);
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

  const handleUploadImage = async (file: File) => {
    try {
      const resized = await resizeImage(file, 960, 0.82);
      setNewImage(resized);
    } catch {
      toast?.(t('تعذر معالجة الصورة المختارة', 'Could not read image'));
    }
  };

  const handleCreateStory = async () => {
    if (!newCaption.trim() && !newTitle.trim()) return;
    if (!getSessionToken()) {
      toast?.(t('سجّل دخولك أولاً لنشر قصة', 'Sign in first to publish a story'));
      return;
    }
    setPublishing(true);
    try {
      const next = await cx<StoryRecord[]>('/community/stories', {
        body: {
          title: newTitle.trim() || t('تجربة معملية', 'Atelier Study'),
          caption: newCaption.trim(),
          scentTag: newScentTag.trim(),
          image: newImage,
        },
      });
      setStories(next);
      setShowAddStory(false);
      setNewTitle('');
      setNewCaption('');
      setNewScentTag('');
      setNewImage('scene:compounding');
      toast?.(t('تم نشر قصتك في مجتمع شام لمدة 24 ساعة ✨', 'Your 24h story is live ✨'));
    } catch {
      toast?.(t('تعذر نشر القصة، حاول مرة أخرى', 'Failed to publish story'));
    } finally {
      setPublishing(false);
    }
  };

  const handleReactStory = async (storyId: string, emoji: string) => {
    if (!getSessionToken()) {
      toast?.(t('سجّل دخولك للتفاعل مع القصص', 'Sign in to react to stories'));
      return;
    }
    try {
      const nextReaction = activeStory?.myReaction === emoji ? '' : emoji;
      const res = await cx<{ id: string; views: number; reactions: Record<string, number>; myReaction: string }>(
        `/community/stories/${storyId}/react`,
        { body: { reaction: nextReaction } }
      );
      setStories((prev) =>
        prev.map((s) =>
          s.id === storyId
            ? { ...s, views: res.views, myReaction: res.myReaction, reactions: res.reactions, viewedByMe: true }
            : s
        )
      );
    } catch {
      // ignore
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    try {
      await cx(`/community/stories/${storyId}`, { method: 'DELETE' });
      setStories((prev) => prev.filter((s) => s.id !== storyId));
      setActiveStoryIndex(null);
      toast?.(t('تم حذف القصة', 'Story deleted'));
    } catch {
      toast?.(t('تعذر حذف القصة', 'Could not delete story'));
    }
  };

  return (
    <>
      <div className="relative flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
        {/* Create Story Card */}
        <button
          type="button"
          onClick={() => {
            if (!currentUser) {
              toast?.(t('سجّل دخولك أولاً لإضافة قصة معملية', 'Please sign in first to add a story'));
              return;
            }
            setShowAddStory(true);
          }}
          className="group relative flex h-44 w-32 shrink-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-[0_1px_2px_rgba(24,20,18,0.04)] transition hover:border-amber-500 text-center"
        >
          <div className="relative h-28 w-full overflow-hidden bg-stone-100">
            <img
              src={currentUser?.avatar || resolveSceneSrc('scene:compounding')}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover brightness-95 transition duration-300 group-hover:scale-105"
            />
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
        {!loading &&
          stories.map((story, idx) => (
            <button
              key={story.id}
              type="button"
              onClick={() => setActiveStoryIndex(idx)}
              className="group relative flex h-44 w-32 shrink-0 cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-stone-200/80 shadow-[0_1px_2px_rgba(24,20,18,0.05)] transition hover:border-amber-400 text-start"
            >
              <img
                src={resolveSceneSrc(story.image)}
                alt={story.title}
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/85" />

              {/* Story Top: Avatar */}
              <div className="relative z-10 flex items-center justify-between p-2.5">
                <span
                  className={`inline-block rounded-full ring-2 ring-offset-2 ring-offset-stone-900 ${
                    story.viewedByMe ? 'ring-stone-400' : 'ring-amber-400'
                  }`}
                >
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
              src={resolveSceneSrc(activeStory.image)}
              alt={activeStory.title}
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/75" />

            {/* Progress Bars */}
            <div className="relative z-20 flex gap-1 p-3">
              {stories.map((s, i) => (
                <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
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
              <div className="flex items-center gap-2 min-w-0">
                <Avatar user={activeStory.user} size={34} ring />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{activeStory.user.name}</p>
                  <p className="text-[11px] text-stone-300">{timeAgo(activeStory.createdAt, lang)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {activeStory.mine && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteStory(activeStory.id)}
                    title={t('حذف القصة', 'Delete story')}
                    className="rounded-full bg-rose-600/80 p-2 text-white transition hover:bg-rose-600 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveStoryIndex(null)}
                  className="rounded-full bg-white/15 p-2 text-white transition hover:bg-white/30 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Navigation arrows */}
            <div className="relative z-10 flex flex-1 items-center justify-between px-2">
              <button
                type="button"
                onClick={() =>
                  setActiveStoryIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : 0))
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
                <p className="text-xs font-semibold text-amber-300">{activeStory.scentTag}</p>
              )}
              <h3 className="text-lg font-black text-white">{activeStory.title}</h3>
              <p className="text-sm leading-relaxed text-stone-200">{activeStory.caption}</p>

              {/* Story Quick Reactions */}
              <div className="flex items-center justify-between gap-1 rounded-2xl bg-black/45 px-2.5 py-1.5 backdrop-blur-sm">
                <div className="flex items-center gap-1">
                  {STORY_REACT_EMOJIS.map((emoji) => {
                    const count = activeStory.reactions?.[emoji] || 0;
                    const chosen = activeStory.myReaction === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void handleReactStory(activeStory.id, emoji)}
                        className={`flex items-center gap-0.5 rounded-full px-2 py-1 text-sm transition cursor-pointer ${
                          chosen ? 'bg-amber-500/40 ring-1 ring-amber-300 scale-110' : 'hover:bg-white/15'
                        }`}
                      >
                        <span>{emoji}</span>
                        {count > 0 && (
                          <span className="text-[10px] font-bold text-white tabular-nums">{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <span className="flex items-center gap-1 text-xs tabular-nums text-stone-300 px-1">
                  <Eye className="h-3.5 w-3.5" />
                  {activeStory.views}
                </span>
              </div>

              {!activeStory.mine && (
                <button
                  type="button"
                  onClick={() => {
                    const uid = activeStory.user.id;
                    setActiveStoryIndex(null);
                    if (onOpenMessenger) onOpenMessenger(uid);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/20 py-2.5 text-xs font-bold text-white backdrop-blur hover:bg-white/30 cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                  {t('رد في الماسنجر', 'Reply in Messenger')}
                </button>
              )}
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
                {t('نشر قصة معملية جديدة (24 ساعة)', 'Publish 24h Atelier Story')}
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
              {/* Scene Selector + Custom Upload */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-700">
                    {t('خلفية القصة أو ارفع صورة', 'Story Scene or Upload Photo')}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void handleUploadImage(f);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-bold text-stone-800 hover:bg-stone-100 cursor-pointer"
                  >
                    <ImagePlus className="h-3.5 w-3.5 text-emerald-700" />
                    {t('رفع صورة خاصة', 'Upload Photo')}
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {SCENE_CATALOG.slice(0, 4).map((sc) => (
                    <button
                      key={sc.key}
                      type="button"
                      onClick={() => setNewImage(sc.key)}
                      className={`relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition cursor-pointer ${
                        newImage === sc.key ? 'border-amber-700 ring-2 ring-amber-200' : 'border-stone-200 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img src={sc.src} alt={sc.en} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
                {newImage.startsWith('data:image/') && (
                  <p className="mt-1.5 text-[11px] font-bold text-emerald-700">
                    ✓ {t('تم إرفاق صورتك الخاصة بنجاح', 'Custom photo attached')}
                  </p>
                )}
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
                  disabled={(!newCaption.trim() && !newTitle.trim()) || publishing}
                  onClick={() => void handleCreateStory()}
                  className="flex-1 rounded-xl bg-amber-800 py-2.5 text-sm font-bold text-white transition hover:bg-amber-900 disabled:opacity-50 cursor-pointer"
                >
                  {publishing ? t('جاري النشر…', 'Publishing…') : t('نشر القصة الآن', 'Publish Story')}
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
