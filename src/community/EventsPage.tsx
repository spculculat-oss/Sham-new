import { useState } from 'react';
import {
  Calendar,
  MapPin,
  Radio,
  Star,
  CheckCircle2,
  Plus,
  Users,
  X,
  ArrowRight,
} from 'lucide-react';
import {
  cx,
  type CommunityEvent,
} from './api';
import type { SessionState } from './session';
import { SCENE_CATALOG, resolveSceneSrc } from './scenes';
import { Avatar, Btn, Card, Empty, Sheet, Spinner, errorText, inputClass, tx, useLoad, type Lang } from './ui';

const EVENT_CATS = [
  { id: 'workshop', ar: 'ورشة تركيب', en: 'Blending Workshop' },
  { id: 'live', ar: 'بث مباشر', en: 'Live Stream' },
  { id: 'meetup', ar: 'لقاء عطارين', en: 'Perfumer Meetup' },
  { id: 'auction', ar: 'عرض وتقييم', en: 'Curated Showcase' },
  { id: 'launch', ar: 'إصدار وموسم', en: 'Harvest & Launch' },
];

export function EventsPage({
  lang,
  session,
  go,
  toast,
}: {
  lang: Lang;
  session: SessionState;
  go: (route: string) => void;
  toast: (text: string) => void;
}) {
  const t = tx(lang);
  const [filter, setFilter] = useState<'all' | 'mine' | 'online'>('all');
  const { data, setData, loading, error, reload } = useLoad(
    () => cx<CommunityEvent[]>(`/community/events?filter=${filter}`),
    [filter]
  );

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date(Date.now() + 3 * 86_400_000);
    return d.toISOString().slice(0, 16);
  });
  const [category, setCategory] = useState('workshop');
  const [cover, setCover] = useState('scene:exhibition');
  const [busy, setBusy] = useState(false);

  const handleRsvp = async (evt: CommunityEvent, nextStatus: 'going' | 'interested') => {
    if (!session.me) {
      toast(t('سجّل دخولك أولاً لتأكيد الحضور', 'Sign in first to RSVP'));
      go('login');
      return;
    }
    const target = evt.myRsvp === nextStatus ? null : nextStatus;
    try {
      const res = await cx<{ id: string; goingCount: number; interestedCount: number; myRsvp: 'going' | 'interested' | null }>(
        `/community/events/${evt.id}/rsvp`,
        { body: { status: target } }
      );
      setData(
        (data || []).map((item) =>
          item.id === evt.id
            ? { ...item, goingCount: res.goingCount, interestedCount: res.interestedCount, myRsvp: res.myRsvp }
            : item
        )
      );
      if (target === 'going') toast(t('تم تسجيل حضورك في الفعالية ✅', 'Marked as Going ✅'));
      else if (target === 'interested') toast(t('أُضيفت الفعالية لاهتماماتك ⭐', 'Marked as Interested ⭐'));
      else toast(t('تم إلغاء التذكير', 'RSVP cleared'));
    } catch (e) {
      toast(errorText(e, lang));
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const created = await cx<CommunityEvent>('/community/events', {
        body: {
          title: title.trim(),
          description: description.trim(),
          location: location.trim(),
          isOnline,
          startsAt: new Date(startsAt).toISOString(),
          category,
          cover,
        },
      });
      setData([created, ...(data || [])]);
      setShowCreate(false);
      setTitle('');
      setDescription('');
      setLocation('');
      toast(t('تم نشر الفعالية بنجاح 🎉', 'Event published 🎉'));
    } catch (e) {
      toast(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return {
      month: d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'short' }),
      day: d.getDate(),
      full: d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <Card className="p-5 border-stone-200 bg-gradient-to-br from-white via-amber-50/35 to-stone-50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go('')}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100 cursor-pointer"
                title={t('العودة للموجز', 'Back to feed')}
              >
                <ArrowRight className="h-4 w-4" />
              </button>
              <h1 className="text-xl font-black text-stone-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-700" />
                {t('فعاليات وورش مجتمع شام', 'Sham Community Events')}
              </h1>
            </div>
            <p className="text-xs text-stone-600">
              {t(
                'انضم لورش البث المباشر، لقاءات التذوق، ومواسم تقطير الورد والعود في منطقتك.',
                'Join live blending workshops, oud tastings, and distillation festivals.'
              )}
            </p>
          </div>
          <Btn
            small
            onClick={() => {
              if (!session.me) {
                toast(t('سجّل دخولك لإنشاء فعالية', 'Sign in to host an event'));
                go('login');
                return;
              }
              setShowCreate(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t('إنشاء فعالية', 'Create Event')}
          </Btn>
        </div>

        {/* Filter Tabs */}
        <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: t('كل الفعاليات القادمة', 'All Upcoming') },
            { id: 'online', label: t('بث مباشر وأونلاين', 'Online & Live') },
            { id: 'mine', label: t('فعالياتي وحجوزاتي', 'My Events') },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as typeof filter)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-stone-900 text-amber-300'
                  : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {Boolean(error) && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{errorText(error, lang)}</p>}

      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <Card>
          <Empty
            icon={<Calendar className="h-10 w-10 text-stone-300" />}
            title={t('لا توجد فعاليات مطابقة حالياً', 'No events match this filter')}
            action={
              <Btn small variant="soft" onClick={() => void reload()}>
                {t('تحديث', 'Refresh')}
              </Btn>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((evt) => {
            const d = formatDate(evt.startsAt);
            const cat = EVENT_CATS.find((c) => c.id === evt.category);
            return (
              <Card key={evt.id} className="flex flex-col overflow-hidden border-stone-200 hover:shadow-md transition">
                <div className="relative h-40 w-full bg-stone-900">
                  <img
                    src={resolveSceneSrc(evt.cover)}
                    alt={evt.title}
                    className="h-full w-full object-cover brightness-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/25" />

                  {/* Calendar Date Stamp */}
                  <div className="absolute top-3 start-3 flex flex-col items-center justify-center rounded-xl bg-white/95 px-2.5 py-1.5 text-center shadow">
                    <span className="text-[10px] font-bold text-rose-700 uppercase">{d.month}</span>
                    <span className="text-base font-black leading-none text-stone-900 tabular-nums">{d.day}</span>
                  </div>

                  {evt.isOnline && (
                    <span className="absolute top-3 end-3 inline-flex items-center gap-1 rounded-full bg-rose-600/90 px-2.5 py-1 text-[10px] font-bold text-white shadow">
                      <Radio className="h-3 w-3" />
                      {t('بث أونلاين', 'Live Online')}
                    </span>
                  )}

                  <div className="absolute bottom-2.5 start-3 end-3 text-[11px] font-bold text-amber-300">
                    {cat ? (lang === 'ar' ? cat.ar : cat.en) : evt.category}
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-amber-800">{d.full}</p>
                    <h3 className="font-black text-sm text-stone-900 leading-snug">{evt.title}</h3>
                    {evt.description && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-stone-600">{evt.description}</p>
                    )}
                    <p className="flex items-center gap-1.5 text-[11px] text-stone-500 pt-1">
                      <MapPin className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                      <span className="truncate">{evt.location}</span>
                    </p>
                  </div>

                  <div className="space-y-2.5 pt-2 border-t border-stone-100">
                    <div className="flex items-center justify-between text-[11px] text-stone-500 tabular-nums">
                      <button
                        type="button"
                        onClick={() => go(`u/${evt.creator.handle}`)}
                        className="flex items-center gap-1.5 hover:text-amber-800 cursor-pointer"
                      >
                        <Avatar user={evt.creator} size={22} />
                        <span className="font-semibold text-stone-700 truncate max-w-[130px]">{evt.creator.name}</span>
                      </button>
                      <span className="flex items-center gap-1 font-semibold">
                        <Users className="h-3.5 w-3.5 text-stone-400" />
                        {evt.goingCount} {t('سيحضر', 'going')} · {evt.interestedCount} {t('مهتم', 'interested')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRsvp(evt, 'interested')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold transition cursor-pointer ${
                          evt.myRsvp === 'interested'
                            ? 'border-amber-600 bg-amber-50 text-amber-900'
                            : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        <Star className={`h-3.5 w-3.5 ${evt.myRsvp === 'interested' ? 'fill-amber-500 text-amber-600' : ''}`} />
                        {t('مهتم', 'Interested')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRsvp(evt, 'going')}
                        className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition cursor-pointer ${
                          evt.myRsvp === 'going'
                            ? 'bg-emerald-700 text-white shadow-xs'
                            : 'bg-stone-900 text-white hover:bg-stone-800'
                        }`}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {evt.myRsvp === 'going' ? t('سأحضر ✓', 'Going ✓') : t('تأكيد الحضور', 'Going')}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Event Modal */}
      {showCreate && (
        <Sheet title={t('إنشاء فعالية عطرية جديدة', 'Create Perfumery Event')} onClose={() => setShowCreate(false)}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">{t('عنوان الفعالية', 'Event Title')}</label>
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('مثال: ورشة تصميم عطر صيفي بالبرغموت', 'e.g. Summer Bergamot Blending Workshop')}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">{t('التاريخ والوقت', 'Date & Time')}</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">{t('التصنيف', 'Category')}</label>
                <select
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {EVENT_CATS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {lang === 'ar' ? c.ar : c.en}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs">
              <input
                id="evt-online-chk"
                type="checkbox"
                checked={isOnline}
                onChange={(e) => setIsOnline(e.target.checked)}
                className="h-4 w-4 accent-amber-700"
              />
              <label htmlFor="evt-online-chk" className="font-bold text-stone-800 cursor-pointer">
                {t('فعالية أونلاين / بث مباشر عبر مجتمع شام', 'Online event / live broadcast')}
              </label>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">{t('المكان أو رابط القاعة', 'Location / Venue')}</label>
              <input
                className={inputClass}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={isOnline ? t('بث مباشر — معمل شام', 'Live Atelier Room') : t('المدينة — اسم القاعة', 'City — Venue')}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">{t('صورة الغلاف', 'Cover Scene')}</label>
              <div className="grid grid-cols-4 gap-2">
                {SCENE_CATALOG.slice(0, 4).map((sc) => (
                  <button
                    key={sc.key}
                    type="button"
                    onClick={() => setCover(sc.key)}
                    className={`relative aspect-video overflow-hidden rounded-xl border-2 cursor-pointer ${
                      cover === sc.key ? 'border-amber-700 ring-2 ring-amber-200' : 'border-stone-200 opacity-75'
                    }`}
                  >
                    <img src={sc.src} alt={sc.en} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">{t('التفاصيل والمحاور', 'Description')}</label>
              <textarea
                rows={3}
                className={inputClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('ما الذي سيتعلمه أو يختبره الحضور؟', 'What will participants experience?')}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Btn className="flex-1" busy={busy} disabled={!title.trim()} onClick={() => void handleCreate()}>
                {t('نشر الفعالية الآن', 'Publish Event')}
              </Btn>
              <Btn variant="ghost" onClick={() => setShowCreate(false)}>
                {t('إلغاء', 'Cancel')}
              </Btn>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
