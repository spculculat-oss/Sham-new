import { useState } from 'react';
import {
  Users,
  Lock,
  Globe2,
  Plus,
  Search,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  Camera,
  Check,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { cx, resizeImage, type CommunityGroup, type GroupDetail } from './api';
import { type SessionState } from './session';
import { Avatar, Btn, Card, Empty, Sheet, Spinner, errorText, inputClass, tx, useLoad, type Lang } from './ui';
import { Composer, PostCard } from './SocialPortal';
import { SCENE_CATALOG, resolveSceneSrc } from './scenes';

const CATEGORIES = [
  { id: 'all', ar: 'الكل', en: 'All' },
  { id: 'oud', ar: 'العود والبخور', en: 'Oud & Incense' },
  { id: 'floral', ar: 'الزهور والورد', en: 'Florals & Rose' },
  { id: 'lab', ar: 'الكيمياء والمختبر', en: 'Perfumery Lab' },
  { id: 'niche', ar: 'عطور النيش', en: 'Niche & Artisan' },
  { id: 'trade', ar: 'الزيوت والتوريد', en: 'Oils & Trade' },
];

export function GroupsPage({
  lang,
  session,
  groupId,
  go,
  toast,
  onOpenMessenger,
}: {
  lang: Lang;
  session: SessionState;
  groupId?: string;
  go: (r: string) => void;
  toast: (s: string) => void;
  onOpenMessenger?: (userId: string) => void;
}) {
  if (groupId) {
    return (
      <SingleGroupView
        lang={lang}
        session={session}
        groupId={groupId}
        go={go}
        toast={toast}
        onOpenMessenger={onOpenMessenger}
      />
    );
  }
  return <GroupsDirectory lang={lang} session={session} go={go} toast={toast} />;
}

function GroupsDirectory({
  lang,
  session,
  go,
  toast,
}: {
  lang: Lang;
  session: SessionState;
  go: (r: string) => void;
  toast: (s: string) => void;
}) {
  const t = tx(lang);
  const { data, loading, reload } = useLoad(() => cx<CommunityGroup[]>('/community/groups'));
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [catInput, setCatInput] = useState('oud');
  const [privacy, setPrivacy] = useState<'public' | 'closed'>('public');
  const [cover, setCover] = useState<string>(SCENE_CATALOG[0].key);
  const [creating, setCreating] = useState(false);

  const list = (data || []).filter((g) => {
    if (tab === 'mine' && !g.joined) return false;
    if (category !== 'all' && g.category !== category) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (!`${g.name} ${g.description}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const toggleJoin = async (g: CommunityGroup) => {
    if (!session.me) {
      toast(t('سجّل دخولك أولاً للانضمام للمجموعات', 'Sign in to join groups'));
      go('login');
      return;
    }
    setBusyId(g.id);
    try {
      if (g.joined) {
        await cx(`/community/groups/${g.id}/join`, { method: 'DELETE' });
        toast(t('غادرت المجموعة', 'Left group'));
      } else {
        await cx(`/community/groups/${g.id}/join`, { body: {} });
        toast(t(`انضممت إلى «${g.name}» 🎉`, `Joined "${g.name}" 🎉`));
      }
      await reload(true);
    } catch (e) {
      toast(errorText(e, lang));
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session.me) {
      go('login');
      return;
    }
    setCreating(true);
    try {
      const created = await cx<CommunityGroup>('/community/groups', {
        body: {
          name: name.trim(),
          description: description.trim(),
          category: catInput,
          privacy,
          cover,
        },
      });
      setShowCreate(false);
      setName('');
      setDescription('');
      await reload(true);
      toast(t('تم إنشاء المجموعة بنجاح 🎊', 'Group created 🎊'));
      go(`groups/${created.id}`);
    } catch (err) {
      toast(errorText(err, lang));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <Card className="p-5 border-stone-200 bg-gradient-to-br from-white via-[#FBF9F5] to-amber-50/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-black text-stone-900">
              <Users className="h-5 w-5 text-amber-700" />
              {t('مجموعات صانعي العطور (Groups)', 'Perfumer Community Groups')}
            </h1>
            <p className="mt-1 text-xs text-stone-600">
              {t(
                'انضم لدوائر متخصصة في دهن العود، الورد الدمشقي، كيمياء المختبر، وورش النيش.',
                'Join specialized circles for Oud craft, Damask Rose distillation, Lab formulation, and Niche trade.'
              )}
            </p>
          </div>
          <Btn
            onClick={() => {
              if (!session.me) {
                toast(t('سجّل دخولك أولاً لإنشاء مجموعة', 'Sign in to create a group'));
                go('login');
                return;
              }
              setShowCreate(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t('إنشاء مجموعة جديدة', 'Create Group')}
          </Btn>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-stone-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`rounded-lg px-3 py-1.5 cursor-pointer transition ${
                tab === 'all' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
              }`}
            >
              {t('اكتشف المجموعات', 'Discover')}
            </button>
            <button
              type="button"
              onClick={() => setTab('mine')}
              className={`rounded-lg px-3 py-1.5 cursor-pointer transition ${
                tab === 'mine' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600'
              }`}
            >
              {t('مجموعاتي', 'Your Groups')}
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-stone-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('ابحث عن مجموعة…', 'Search groups…')}
              className={`${inputClass} ps-9 py-1.5 text-xs`}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                category === c.id
                  ? 'bg-stone-900 text-amber-300'
                  : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {lang === 'ar' ? c.ar : c.en}
            </button>
          ))}
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : !list.length ? (
        <Card>
          <Empty
            icon={<Users className="h-10 w-10 text-stone-300" />}
            title={t('لا توجد مجموعات مطابقة', 'No matching groups')}
            body={t('جرّب تصفية أخرى أو أنشئ مجموعتك المتخصصة الآن.', 'Try another filter or create your own group.')}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((g) => {
            const cat = CATEGORIES.find((c) => c.id === g.category);
            return (
              <Card key={g.id} className="overflow-hidden border-stone-200 flex flex-col">
                <div
                  onClick={() => go(`groups/${g.id}`)}
                  className="relative h-36 bg-stone-900 cursor-pointer overflow-hidden"
                >
                  <img
                    src={resolveSceneSrc(g.cover)}
                    alt={g.name}
                    className="h-full w-full object-cover transition duration-300 hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="absolute bottom-2.5 start-3 end-3 flex items-end justify-between text-white">
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300">
                        {g.privacy === 'closed' ? <Lock className="h-3 w-3" /> : <Globe2 className="h-3 w-3" />}
                        {g.privacy === 'closed' ? t('مجموعة مغلقة', 'Closed group') : t('مجموعة عامة', 'Public group')}
                        {cat && ` · ${lang === 'ar' ? cat.ar : cat.en}`}
                      </span>
                      <h3 className="truncate text-sm font-black">{g.name}</h3>
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between p-4 space-y-3">
                  <p className="line-clamp-2 text-xs leading-relaxed text-stone-600">{g.description || '—'}</p>

                  <div className="flex items-center justify-between text-[11px] font-semibold text-stone-500 tabular-nums border-t border-stone-100 pt-2.5">
                    <span>
                      {g.memberCount} {t('عضو', 'members')}
                    </span>
                    <span>
                      {g.postCount} {t('منشور', 'posts')}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Btn
                      small
                      variant="soft"
                      className="flex-1"
                      onClick={() => go(`groups/${g.id}`)}
                    >
                      {t('دخول المجموعة', 'Visit')}
                    </Btn>
                    {!(g.mine && g.joined) && (
                      <Btn
                        small
                        variant={g.joined ? 'ghost' : 'primary'}
                        busy={busyId === g.id}
                        onClick={() => void toggleJoin(g)}
                      >
                        {g.joined ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-700" />
                            {t('منضم', 'Joined')}
                          </>
                        ) : (
                          t('انضمام', 'Join')
                        )}
                      </Btn>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Sheet title={t('إنشاء مجموعة عطرية جديدة', 'Create a New Group')} onClose={() => setShowCreate(false)}>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">{t('اسم المجموعة', 'Group name')}</label>
              <input
                required
                minLength={3}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('مثال: مختبر أبحاث دهن العود الملكي', 'e.g. Artisanal Amber & Musk Guild')}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">{t('الوصف والهدف', 'Description')}</label>
              <textarea
                rows={3}
                maxLength={600}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('عرّف الأعضاء بنوع المناقشات والتركيبات داخل هذه المجموعة…', 'Describe what members share here…')}
                className={inputClass}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">{t('التخصص', 'Category')}</label>
                <select value={catInput} onChange={(e) => setCatInput(e.target.value)} className={inputClass}>
                  {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                    <option key={c.id} value={c.id}>
                      {lang === 'ar' ? c.ar : c.en}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-stone-700">{t('الخصوصية', 'Privacy')}</label>
                <select
                  value={privacy}
                  onChange={(e) => setPrivacy(e.target.value as 'public' | 'closed')}
                  className={inputClass}
                >
                  <option value="public">{t('عامة — يقرأها الجميع', 'Public — Anyone can view')}</option>
                  <option value="closed">{t('مغلقة — للأعضاء المنضمين فقط', 'Closed — Members only')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-stone-700">{t('صورة الغلاف', 'Cover photo')}</label>
              <div className="grid grid-cols-4 gap-2">
                {SCENE_CATALOG.slice(0, 4).map((sc) => (
                  <button
                    key={sc.key}
                    type="button"
                    onClick={() => setCover(sc.key)}
                    className={`overflow-hidden rounded-xl border-2 cursor-pointer ${
                      cover === sc.key ? 'border-amber-600 ring-2 ring-amber-300' : 'border-transparent'
                    }`}
                  >
                    <img src={sc.src} alt="" className="h-14 w-full object-cover" />
                  </button>
                ))}
              </div>
              <label className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 cursor-pointer hover:underline">
                <Camera className="h-3.5 w-3.5" />
                {t('أو رفع غلاف مخصص', 'Or upload custom cover')}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setCover(await resizeImage(f, 1200));
                  }}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Btn type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                {t('إلغاء', 'Cancel')}
              </Btn>
              <Btn type="submit" busy={creating} disabled={name.trim().length < 3}>
                {t('إنشاء المجموعة', 'Create Group')}
              </Btn>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}

function SingleGroupView({
  lang,
  session,
  groupId,
  go,
  toast,
  onOpenMessenger,
}: {
  lang: Lang;
  session: SessionState;
  groupId: string;
  go: (r: string) => void;
  toast: (s: string) => void;
  onOpenMessenger?: (userId: string) => void;
}) {
  const t = tx(lang);
  const { data, setData, loading, error, reload } = useLoad(
    () => cx<GroupDetail>(`/community/groups/${encodeURIComponent(groupId)}`),
    [groupId]
  );
  const [busyJoin, setBusyJoin] = useState(false);

  if (loading) return <Spinner />;
  if (error || !data) {
    return (
      <Card>
        <Empty
          title={errorText(error, lang)}
          action={
            <Btn small variant="soft" onClick={() => go('groups')}>
              {t('العودة للمجموعات', 'Back to Groups')}
            </Btn>
          }
        />
      </Card>
    );
  }

  const { group, locked, members, posts } = data;
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  const toggleJoin = async () => {
    if (!session.me) {
      toast(t('سجّل دخولك أولاً للانضمام', 'Sign in first'));
      go('login');
      return;
    }
    setBusyJoin(true);
    try {
      if (group.joined) {
        await cx(`/community/groups/${group.id}/join`, { method: 'DELETE' });
        toast(t('غادرت المجموعة', 'Left group'));
      } else {
        await cx(`/community/groups/${group.id}/join`, { body: {} });
        toast(t(`أصبحت عضواً في «${group.name}» 🎉`, `Joined "${group.name}" 🎉`));
      }
      await reload(true);
    } catch (e) {
      toast(errorText(e, lang));
    } finally {
      setBusyJoin(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => go('groups')}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-amber-800 cursor-pointer"
      >
        <BackIcon className="h-4 w-4" />
        {t('كل المجموعات', 'All Groups')}
      </button>

      {/* Group Hero */}
      <Card className="overflow-hidden border-stone-200 shadow-sm">
        <div className="relative h-48 sm:h-60 bg-stone-900">
          <img src={resolveSceneSrc(group.cover)} alt={group.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/35 to-transparent" />
          <div className="absolute bottom-4 start-5 end-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between text-white">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                {group.privacy === 'closed' ? <Lock className="h-3.5 w-3.5" /> : <Globe2 className="h-3.5 w-3.5" />}
                <span>{group.privacy === 'closed' ? t('مجموعة مغلقة', 'Closed group') : t('مجموعة عامة', 'Public group')}</span>
                <span>·</span>
                <span className="tabular-nums">
                  {group.memberCount} {t('عضو', 'members')}
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">{group.name}</h1>
              {group.description && (
                <p className="mt-1 max-w-2xl text-xs text-stone-200 line-clamp-2">{group.description}</p>
              )}
            </div>
            {!(group.mine && group.joined) && (
              <Btn
                variant={group.joined ? 'soft' : 'primary'}
                busy={busyJoin}
                onClick={() => void toggleJoin()}
                className="shrink-0"
              >
                {group.joined ? (
                  <>
                    <LogOut className="h-4 w-4" />
                    {t('مغادرة المجموعة', 'Leave Group')}
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    {t('انضمام للمجموعة', 'Join Group')}
                  </>
                )}
              </Btn>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Group Feed Column */}
        <div className="space-y-4">
          {locked ? (
            <Card className="p-6 text-center">
              <Empty
                icon={<Lock className="h-10 w-10 text-amber-700" />}
                title={t('مجموعة مغلقة للأعضاء فقط', 'Closed Group')}
                body={t(
                  'انضم إلى هذه المجموعة للاطلاع على التركيبات والنقاشات الحصرية والمشاركة مع أعضائها.',
                  'Join this group to view exclusive formulas, discussions, and post updates.'
                )}
                action={
                  <Btn busy={busyJoin} onClick={() => void toggleJoin()}>
                    <Plus className="h-4 w-4" />
                    {t('انضمام للمجموعة الآن', 'Join Group Now')}
                  </Btn>
                }
              />
            </Card>
          ) : (
            <>
              {group.joined ? (
                <Composer
                  lang={lang}
                  session={session}
                  toast={toast}
                  go={go}
                  groupId={group.id}
                  groupName={group.name}
                  onPosted={(p) => setData({ ...data, posts: [p, ...data.posts] })}
                />
              ) : (
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 bg-amber-50/50 border-amber-200">
                  <p className="text-xs font-bold text-amber-950">
                    {t('انضم للمجموعة لتتمكن من النشر والمشاركة مع الأعضاء.', 'Join this group to post and discuss with members.')}
                  </p>
                  <Btn small busy={busyJoin} onClick={() => void toggleJoin()}>
                    {t('انضمام', 'Join')}
                  </Btn>
                </Card>
              )}

              {posts.length === 0 ? (
                <Card>
                  <Empty
                    icon={<MessageSquare className="h-10 w-10 text-stone-300" />}
                    title={t('لا توجد منشورات بعد في المجموعة', 'No group posts yet')}
                    body={t('كن أول من يفتتح النقاش العطري داخل هذه المجموعة.', 'Start the first discussion in this group.')}
                  />
                </Card>
              ) : (
                posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    lang={lang}
                    go={go}
                    toast={toast}
                    onOpenMessenger={onOpenMessenger}
                    onCreated={(np) => setData({ ...data, posts: [np, ...data.posts] })}
                    onChange={(np) =>
                      setData({ ...data, posts: data.posts.map((x) => (x.id === np.id ? np : x)) })
                    }
                    onRemove={(id) =>
                      setData({ ...data, posts: data.posts.filter((x) => x.id !== id) })
                    }
                  />
                ))
              )}
            </>
          )}
        </div>

        {/* Right Info & Members Column */}
        <aside className="space-y-4">
          <Card className="p-4 space-y-3">
            <h3 className="text-xs font-black text-stone-900">{t('حول المجموعة', 'About Group')}</h3>
            <p className="text-xs leading-relaxed text-stone-600">{group.description || '—'}</p>
            <div className="space-y-1.5 border-t border-stone-100 pt-2.5 text-xs text-stone-600">
              <p className="flex items-center gap-2 font-semibold">
                {group.privacy === 'closed' ? <Lock className="h-3.5 w-3.5 text-amber-700" /> : <Globe2 className="h-3.5 w-3.5 text-emerald-700" />}
                {group.privacy === 'closed' ? t('مغلقة (للأعضاء فقط)', 'Closed (Members only)') : t('عامة (مفتوحة للجميع)', 'Public (Open)')}
              </p>
              {group.creator && (
                <button
                  type="button"
                  onClick={() => go(`u/${group.creator!.handle}`)}
                  className="flex items-center gap-2 text-xs text-stone-700 hover:text-amber-800 cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-700" />
                  <span>{t('المدير:', 'Admin:')} {group.creator.name}</span>
                </button>
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="text-xs font-black text-stone-900">
              {t('أعضاء المجموعة', 'Members')} ({group.memberCount})
            </h3>
            <div className="space-y-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => go(`u/${m.handle}`)}
                  className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-start hover:bg-stone-50 cursor-pointer"
                >
                  <Avatar user={m} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-stone-900">{m.name}</p>
                    <p className="truncate text-[10px] text-stone-500">
                      {m.groupRole === 'admin' ? t('مشرف المجموعة', 'Admin') : `@${m.handle}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
