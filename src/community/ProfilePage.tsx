import { useState } from 'react';
import {
  UserPlus,
  UserCheck,
  MessageCircle,
  Share2,
  Calendar,
  MapPin,
  Sparkles,
  FlaskConical,
  Award,
  Users,
  Image as ImageIcon,
  BookOpen,
  Edit3,
  Clock,
  ShieldCheck,
  Star,
  Camera,
} from 'lucide-react';
import {
  cx,
  resizeImage,
  type AiProfileInsight,
  type Post,
  type PublicUser,
} from './api';
import { Avatar, Btn, Card, Empty, Sheet, Spinner, errorText, timeAgo, tx, useLoad, type Lang } from './ui';
import { PostCard, RecipeCard } from './SocialPortal';
import { pulseNow, refreshSession } from './session';
import { SCENE_CATALOG, resolveSceneSrc } from './scenes';

import heroLuxuryImg from '../assets/images/hero_luxury_perfume_1791692409081.jpg';
import grasseRoseImg from '../assets/images/grasse_rose_harvest_1791696039244.jpg';
import labCompoundingImg from '../assets/images/perfume_lab_compounding_1791692420116.jpg';
import nicheRevealImg from '../assets/images/niche_perfume_reveal_1791968798991.jpg';
import botanicalHarvestImg from '../assets/images/botanical_harvest_raw_1791968832488.jpg';
import exhibitionImg from '../assets/images/luxury_perfume_exhibition_1791696134494.jpg';
import pyramidImg from '../assets/images/perfume_ingredients_pyramid_1791692429360.jpg';

interface ProfileData {
  user: PublicUser;
  relation: 'self' | 'friends' | 'requested' | 'incoming' | 'blocked' | 'none';
  counts: { friends: number; posts: number; recipes: number };
  posts: Post[];
  friendsList?: PublicUser[];
  recipes: { id: string; title: string; data: Record<string, unknown>; updatedAt: string }[];
}

interface Props {
  handle: string;
  lang: Lang;
  go: (route: string) => void;
  toast: (s: string) => void;
  onOpenMessenger?: (userId: string) => void;
}

const PRESET_COVERS: Record<string, string> = {
  u_dar_sham: heroLuxuryImg,
  u_ahmed_shaheen: nicheRevealImg,
  u_nourhan: grasseRoseImg,
  u_tariq_oud: botanicalHarvestImg,
  u_layla_scents: exhibitionImg,
};

const DEFAULT_COVER = labCompoundingImg;

export function ProfilePage({ handle, lang, go, toast, onOpenMessenger }: Props) {
  const t = tx(lang);
  const { data, setData, loading, error, reload } = useLoad(
    () => cx<ProfileData>(`/community/profile/${encodeURIComponent(handle)}`),
    [handle]
  );
  const aiInsight = useLoad(
    () => cx<AiProfileInsight>(`/community/ai/profile/${encodeURIComponent(handle)}?lang=${lang}`),
    [handle, lang]
  );
  const [activeTab, setActiveTab] = useState<'timeline' | 'about' | 'recipes' | 'friends' | 'photos'>('timeline');
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverDraft, setCoverDraft] = useState('');
  const [savingCover, setSavingCover] = useState(false);
  const [pokeBusy, setPokeBusy] = useState(false);

  if (loading) return <Spinner />;
  if (error || !data) return <Card><Empty title={errorText(error, lang)} /></Card>;

  const u = data.user;
  const isMe = data.relation === 'self';
  const coverUrl = u.cover ? resolveSceneSrc(u.cover) : PRESET_COVERS[u.id] || DEFAULT_COVER;
  const friendsList = data.friendsList || [];
  const postPhotos = data.posts.filter((p) => Boolean(p.image)).map((p) => p.image!);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) toast(done);
      void reload(true);
      void pulseNow();
    } catch (e) {
      toast(errorText(e, lang));
    }
  };

  const saveCover = async () => {
    if (!coverDraft) return;
    setSavingCover(true);
    try {
      await cx('/community/me', { method: 'PATCH', body: { cover: coverDraft } });
      setShowCoverModal(false);
      await reload(true);
      void refreshSession();
      toast(t('تم تحديث صورة الغلاف بنجاح ✨', 'Profile cover updated ✨'));
    } catch (e) {
      toast(errorText(e, lang));
    } finally {
      setSavingCover(false);
    }
  };

  const sendPoke = async () => {
    setPokeBusy(true);
    try {
      await cx(`/community/poke/${u.id}`, { body: {} });
      toast(t(`أرسلت تحية عطرية إلى ${u.name} 👋`, `You waved at ${u.name} 👋`));
    } catch (e) {
      toast(errorText(e, lang));
    } finally {
      setPokeBusy(false);
    }
  };

  const handleMessage = async () => {
    try {
      const { id } = await cx<{ id: string }>('/community/chats/direct', { body: { userId: u.id } });
      if (onOpenMessenger) {
        onOpenMessenger(u.id);
      } else {
        go(`messenger/${id}`);
      }
    } catch (e) {
      toast(errorText(e, lang));
    }
  };

  const craftTitle = {
    master_lab: t('كبير أنوف ومعمل معتمد', 'Master Lab Perfumer'),
    perfumer: t('صانع عطور محترف', 'Professional Perfumer'),
    hobbyist: t('هاوٍ شغوف بتركيب العطور', 'Passionate Fragrance Artisan'),
  }[u.craftLevel] || t('عضو مجتمع شام', 'Community Member');

  return (
    <div className="space-y-4">
      {/* Facebook Grand Cover Banner */}
      <Card className="overflow-hidden border-stone-200 shadow-md">
        <div className="relative h-44 w-full bg-stone-900 sm:h-64 md:h-72">
          <img src={coverUrl} alt="" className="h-full w-full object-cover brightness-90" />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-black/30" />
          {isMe && (
            <button
              type="button"
              onClick={() => {
                setCoverDraft(u.cover || SCENE_CATALOG[0].key);
                setShowCoverModal(true);
              }}
              className="absolute end-4 bottom-4 flex items-center gap-1.5 rounded-xl bg-white/85 px-3 py-1.5 text-xs font-bold text-stone-900 backdrop-blur shadow hover:bg-white cursor-pointer"
            >
              <Camera className="h-3.5 w-3.5" />
              {t('تعديل صورة الغلاف', 'Edit cover')}
            </button>
          )}
        </div>

        {/* Profile Info Bar */}
        <div className="px-4 pb-4 sm:px-6">
          <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end">
            {/* Avatar overlapping cover */}
            <div className="relative shrink-0 self-center sm:self-start">
              <span className="inline-block rounded-full border-4 border-white shadow-xl ring-2 ring-amber-400">
                <Avatar user={u} size={112} />
              </span>
              {u.online && (
                <span className="absolute bottom-2 end-2 h-4 w-4 rounded-full border-2 border-white bg-emerald-500" />
              )}
            </div>

            {/* Identity details */}
            <div className="min-w-0 flex-1 text-center sm:text-start pb-1">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h1 className="text-2xl font-black text-stone-900 sm:text-3xl">{u.name}</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-700" />
                  {craftTitle}
                </span>
                {u.merchant && (
                  <button
                    type="button"
                    onClick={() => go(`store/${u.merchant!.slug}`)}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-900 hover:bg-emerald-200 cursor-pointer"
                  >
                    🏪 {u.merchant.storeName}
                  </button>
                )}
              </div>

              <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-stone-500 sm:justify-start">
                <span className="font-semibold text-stone-700">@{u.handle}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {data.counts.friends} {t('صديق', 'friends')}
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <FlaskConical className="h-3 w-3 text-amber-600" />
                  {data.counts.recipes} {t('تركيبات', 'formulas')}
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-rose-500" />
                  {u.country || t('الشرق الأوسط', 'Middle East')}
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {u.online ? (
                    <span className="font-bold text-emerald-600">{t('متصل الآن', 'Active now')}</span>
                  ) : (
                    `${t('آخر ظهور', 'last seen')} ${timeAgo(u.lastSeen, lang)}`
                  )}
                </span>
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2 pb-1 sm:justify-end">
              {data.relation === 'self' && (
                <Btn variant="soft" onClick={() => go('me/profile')}>
                  <Edit3 className="h-4 w-4" />
                  {t('تعديل الملف الشخصي', 'Edit Profile')}
                </Btn>
              )}
              {data.relation === 'none' && (
                <Btn onClick={() => void act(() => cx(`/community/friends/${u.id}`, { body: {} }), t('تم إرسال طلب الصداقة ✨', 'Request sent ✨'))}>
                  <UserPlus className="h-4 w-4" />
                  {t('إضافة صديق', 'Add Friend')}
                </Btn>
              )}
              {data.relation === 'requested' && (
                <Btn variant="soft" onClick={() => void act(() => cx(`/community/friends/${u.id}`, { method: 'DELETE' }), t('تم إلغاء الطلب', 'Request cancelled'))}>
                  {t('إلغاء طلب الصداقة', 'Cancel Request')}
                </Btn>
              )}
              {data.relation === 'incoming' && (
                <Btn onClick={() => void act(() => cx(`/community/friends/${u.id}`, { body: {} }), t('أصبحتم أصدقاء الآن 🎉', 'Now friends 🎉'))}>
                  <UserCheck className="h-4 w-4" />
                  {t('قبول الصداقة', 'Accept Request')}
                </Btn>
              )}
              {data.relation === 'friends' && (
                <Btn
                  variant="soft"
                  onClick={() => {
                    if (confirm(t('إلغاء الصداقة مع هذا الحساب؟', 'Unfriend this account?'))) {
                      void act(() => cx(`/community/friends/${u.id}`, { method: 'DELETE' }));
                    }
                  }}
                >
                  <UserCheck className="h-4 w-4 text-emerald-700" />
                  {t('أصدقاء', 'Friends')}
                </Btn>
              )}
              {data.relation !== 'self' && data.relation !== 'blocked' && (
                <>
                  <Btn variant="dark" onClick={() => void handleMessage()}>
                    <MessageCircle className="h-4 w-4" />
                    {t('مراسلة عبر ماسنجر', 'Messenger')}
                  </Btn>
                  <Btn variant="soft" busy={pokeBusy} onClick={() => void sendPoke()}>
                    <span>👋</span>
                    {t('تحية', 'Wave')}
                  </Btn>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  toast(t('تم نسخ رابط الصفحة الشخصية بنجاح 📋', 'Profile link copied! 📋'));
                }}
                className="flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5" />
                {t('مشاركة', 'Share')}
              </button>
            </div>
          </div>

          {/* User Bio */}
          {u.bio && (
            <p className="mt-4 rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-700 sm:text-sm">
              {u.bio}
            </p>
          )}
        </div>

        {/* Facebook-style Profile Navigation Tabs */}
        <div className="flex border-t border-stone-100 bg-stone-50/50 px-2 text-xs font-bold sm:px-6">
          {[
            { id: 'timeline', label: t('اليوميات والمنشورات', 'Timeline'), icon: BookOpen, count: data.counts.posts },
            { id: 'about', label: t('حول صانع العطور', 'About'), icon: Sparkles },
            { id: 'recipes', label: t('مكتبة التركيبات', 'Formulas'), icon: FlaskConical, count: data.recipes.length },
            { id: 'friends', label: t('الأصدقاء', 'Friends'), icon: Users, count: data.counts.friends },
            { id: 'photos', label: t('معرض الصور', 'Photos'), icon: ImageIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3.5 transition cursor-pointer sm:px-4 ${
                  isActive
                    ? 'border-amber-600 text-amber-900 bg-white'
                    : 'border-transparent text-stone-500 hover:text-stone-900'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-amber-600' : 'text-stone-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="ms-1 rounded-full bg-stone-200 px-1.5 py-0.2 text-[10px] text-stone-700">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Tab Body */}
      {activeTab === 'timeline' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Left Intro Column */}
          <div className="space-y-4">
            <Card className="p-4 space-y-3">
              <h3 className="font-black text-stone-900">{t('نبذة ومعلومات', 'Intro')}</h3>
              <div className="space-y-2 text-xs text-stone-600">
                <p className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-600" />
                  <span>{craftTitle}</span>
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-rose-500" />
                  <span>{t('الموقع:', 'Location:')} {u.country || t('الشرق الأوسط', 'Middle East')}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-sky-500" />
                  <span>{t('انضم إلى مجتمع شام في', 'Joined Sham in')} 2026</span>
                </p>
              </div>
            </Card>

            {/* AI Olfactory Signature Card */}
            <Card className="p-4 space-y-2.5 border-amber-200/80 bg-amber-50/30">
              <div className="flex items-center gap-1.5 font-black text-amber-950 text-xs sm:text-sm">
                <Sparkles className="h-4 w-4 text-amber-700" />
                <span>{t('البصمة العطرية بالذكاء', 'AI Olfactory Signature')}</span>
              </div>
              {aiInsight.data ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-stone-900">{aiInsight.data.headline}</p>
                  <p className="text-xs leading-relaxed text-stone-700">{aiInsight.data.summary}</p>
                  {aiInsight.data.topNotes.length > 0 && (
                    <p className="text-[11px] font-semibold text-amber-900">
                      {aiInsight.data.topNotes.join(' · ')}
                    </p>
                  )}
                  <p className="pt-1 border-t border-amber-200/60 text-[11px] text-stone-600">
                    {aiInsight.data.collabIdea}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-stone-500">
                  {t('عود كمبودي معتق · برغموت إيطالي · ورد دمشقي · أمبروكسان', 'Aged Cambodian Oud · Italian Bergamot · Damask Rose · Ambroxan')}
                </p>
              )}
            </Card>

            {/* Quick Mutual Friends Preview */}
            <Card className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-stone-900 text-xs sm:text-sm">{t('الأصدقاء', 'Friends')}</h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('friends')}
                  className="text-xs font-bold text-amber-800 hover:underline cursor-pointer tabular-nums"
                >
                  {data.counts.friends}
                </button>
              </div>
              {!friendsList.length ? (
                <p className="text-xs text-stone-500">{t('لا يوجد أصدقاء ظاهرون بعد.', 'No friends shown yet.')}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {friendsList.slice(0, 6).map((friend) => (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() => go(`u/${friend.handle}`)}
                      className="flex flex-col items-center text-center cursor-pointer group"
                    >
                      <Avatar user={friend} size={48} />
                      <span className="mt-1 w-full truncate text-[10px] font-bold text-stone-800 group-hover:text-amber-800">
                        {friend.name.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Timeline Posts */}
          <div className="space-y-4">
            {!data.posts.length ? (
              <Card>
                <Empty
                  icon={<BookOpen className="h-10 w-10 text-stone-300" />}
                  title={t('لا توجد منشورات ظاهرة حالياً', 'No posts visible')}
                  body={t('لم ينشر هذا العضو أي منشورات بعد، أو أنها متاحة لأصدقائه فقط.', 'No posts shared yet or visible to friends only.')}
                />
              </Card>
            ) : (
              data.posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  lang={lang}
                  go={go}
                  toast={toast}
                  onChange={(np) =>
                    setData({
                      ...data,
                      posts: data.posts.map((x) => (x.id === np.id ? np : x)),
                    })
                  }
                  onRemove={(id) =>
                    setData({
                      ...data,
                      posts: data.posts.filter((x) => x.id !== id),
                    })
                  }
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab: About */}
      {activeTab === 'about' && (
        <Card className="p-6 space-y-6">
          <div className="border-b border-stone-100 pb-4">
            <h3 className="text-lg font-black text-stone-900">
              {t('الملف الفني لصانع العطور', 'Perfumer Artistic Profile')}
            </h3>
            <p className="mt-1 text-xs text-stone-500">
              {t('سجل الخبرات والتخصصات في الكيمياء العطرية وتركيب الزيوت', 'Background, expertise and laboratory specs')}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-1">
              <span className="text-xs font-bold text-stone-500">{t('المستوى والخبرة', 'Craft Level')}</span>
              <p className="text-sm font-black text-stone-900">{craftTitle}</p>
              <p className="text-xs text-stone-500">{t('خبرة عملية في موازنة النوتات والتعتيق الدقيق', 'Hands-on compounding & aging')}</p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-1">
              <span className="text-xs font-bold text-stone-500">{t('العائلات العطرية الأساسية', 'Main Olfactory Families')}</span>
              <p className="text-sm font-black text-stone-900">{t('العطور الشرقية والنيش والأخشاب النادرة', 'Oriental, Niche & Precious Woods')}</p>
              <p className="text-xs text-stone-500">{t('تركيز عالي على جودة الزيوت الطبيعية والمستخلصات النقية', 'High natural ingredients focus')}</p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-1">
              <span className="text-xs font-bold text-stone-500">{t('أدوات ومعدات المعمل المفضلة', 'Lab Equipment')}</span>
              <p className="text-sm font-black text-stone-900">{t('ميزان دقيق 0.01g ومحاكي التعتيق بالموجات الصوتية', 'Precision scale 0.01g & Ultrasonic macerator')}</p>
              <p className="text-xs text-stone-500">{t('استخدام برامج وحاسبات دار شام القياسية', 'Utilizes Dar Sham precision lab suite')}</p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-1">
              <span className="text-xs font-bold text-stone-500">{t('أوسمة التميز المجتمعي', 'Community Endorsements')}</span>
              <p className="flex items-center gap-1 text-sm font-black text-amber-800">
                <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                {t('صانع عطور موثوق ومتميز في مجتمع شام', 'Trusted Perfume House Artisan')}
              </p>
              <p className="text-xs text-stone-500">{t('معتمد في مراجعات الأهرام العطرية والتركيبات', 'Vetted in olfactory pyramid critiques')}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Tab: Recipes */}
      {activeTab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-stone-900">
              {t('التركيبات العطرية المشتركة', 'Shared Fragrance Formulas')} ({data.recipes.length})
            </h3>
            <span className="text-xs text-stone-500">
              {t('يمكنك فحص الهرم العطري وتحميل أي تركيبة مباشرة إلى الآلة الحاسبة', 'Load any formula directly into lab')}
            </span>
          </div>

          {!data.recipes.length ? (
            <Card>
              <Empty
                icon={<FlaskConical className="h-10 w-10 text-stone-300" />}
                title={t('لا توجد تركيبات منشورة حالياً', 'No shared recipes yet')}
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.recipes.map((r) => (
                <Card key={r.id} className="p-4 space-y-3 border-amber-200/80 hover:shadow-md transition">
                  <RecipeCard lang={lang} title={r.title} data={r.data} />
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        toast(t('تم فتح التركيبة في حاسبة المعمل بنجاح ✨', 'Loaded into Lab Calculator! ✨'));
                        go('concentration');
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-amber-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-800 cursor-pointer"
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                      {t('استيراد للآلة الحاسبة', 'Import to Lab')}
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Friends */}
      {activeTab === 'friends' && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h3 className="font-black text-stone-900">
              {t('شبكة الأصدقاء وصناع العطور', 'Friends & Perfumer Network')} ({data.counts.friends})
            </h3>
            <span className="text-xs text-stone-400">{t('المتصلون باللون الأخضر', 'Active in green')}</span>
          </div>

          {!friendsList.length ? (
            <Empty
              icon={<Users className="h-10 w-10 text-stone-300" />}
              title={t('لا يوجد أصدقاء حتى الآن', 'No friends yet')}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {friendsList.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center justify-between gap-2.5 rounded-2xl border border-stone-200 bg-stone-50/50 p-3 hover:bg-white transition"
                >
                  <button
                    type="button"
                    onClick={() => go(`u/${friend.handle}`)}
                    className="flex min-w-0 items-center gap-2.5 text-start cursor-pointer"
                  >
                    <Avatar user={friend} size={42} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-stone-900">{friend.name}</p>
                      <p className="truncate text-[10px] text-stone-500">@{friend.handle}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => (onOpenMessenger ? onOpenMessenger(friend.id) : go('messenger'))}
                    className="rounded-full bg-white p-2 text-stone-600 shadow-sm hover:bg-amber-100 hover:text-amber-900 cursor-pointer"
                    title={t('مراسلة', 'Message')}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Tab: Photos */}
      {activeTab === 'photos' && (
        <Card className="p-5 space-y-4">
          <h3 className="font-black text-stone-900">
            {t('معرض صور المعمل والمنشورات', 'Perfumer Lab & Post Gallery')}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {(postPhotos.length > 0
              ? postPhotos
              : [
                  heroLuxuryImg,
                  labCompoundingImg,
                  grasseRoseImg,
                  nicheRevealImg,
                  botanicalHarvestImg,
                  exhibitionImg,
                  pyramidImg,
                ]
            ).map((img, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-2xl bg-stone-100">
                <img
                  src={img}
                  alt={t('صورة معمل عطور', 'Perfume atelier photo')}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Profile Cover Picker Modal */}
      {showCoverModal && (
        <Sheet title={t('تغيير صورة الغلاف الشخصي', 'Update Profile Cover')} onClose={() => setShowCoverModal(false)}>
          <div className="space-y-4">
            <div className="h-36 overflow-hidden rounded-2xl bg-stone-900">
              <img src={resolveSceneSrc(coverDraft)} alt="" className="h-full w-full object-cover" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {SCENE_CATALOG.map((sc) => (
                <button
                  key={sc.key}
                  type="button"
                  onClick={() => setCoverDraft(sc.key)}
                  className={`relative overflow-hidden rounded-xl border-2 cursor-pointer ${
                    coverDraft === sc.key ? 'border-amber-600 ring-2 ring-amber-300' : 'border-transparent'
                  }`}
                >
                  <img src={sc.src} alt="" className="h-16 w-full object-cover" />
                  <span className="block bg-white/95 py-1 text-[10px] font-bold text-stone-800">
                    {lang === 'ar' ? sc.ar : sc.en}
                  </span>
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-800 cursor-pointer hover:bg-amber-50">
              <Camera className="h-4 w-4 text-amber-700" />
              {t('أو اختر صورة غلاف من جهازك', 'Or upload a custom image')}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setCoverDraft(await resizeImage(f, 1280));
                }}
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <Btn variant="ghost" onClick={() => setShowCoverModal(false)}>
                {t('إلغاء', 'Cancel')}
              </Btn>
              <Btn busy={savingCover} onClick={() => void saveCover()}>
                {t('حفظ الغلاف', 'Save Cover')}
              </Btn>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
