/**
 * «مجتمع شام» — Luxury atelier social community hub for fragrance artisans, master perfumers, and enthusiasts.
 * Surpasses traditional social networks with integrated Olfactory AI Intelligence across search, composition,
 * post analysis, smart replies, salon synthesis, and artisan matchmaking.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Home,
  LogOut,
  MessageCircle,
  Store,
  User,
  Users,
  Search,
  Sparkles,
  Coffee,
  Radio,
  FlaskConical,
  Loader2,
  X,
  ArrowUpRight,
  Compass,
  Layers,
  Calendar,
  Film,
} from 'lucide-react';
import HubAuth from './HubAuth';
import MerchantPortal from './MerchantPortal';
import Messenger from './Messenger';
import { FriendsPage, NotificationsPage, SocialFeed } from './SocialPortal';
import { ProfilePage } from './ProfilePage';
import { DiscussionsPage } from './DiscussionsPage';
import { GroupsPage } from './GroupsPage';
import { EventsPage } from './EventsPage';
import { WatchPage } from './WatchPage';
import { FloatingMessengerDock } from './FloatingMessengerDock';
import { IncomingCallBanner, LiveCallStage } from './LiveCallModal';
import { useMessengerCall } from './useMessengerCall';
import { StoreDirectory, StorePage } from './Stores';
import { GeneralNewsPeriodic } from './GeneralNewsPeriodic';
import UserPortal from './UserPortal';
import { signIn, signOut, useSession } from './session';
import { Avatar, Btn, Card, Empty, Sheet, Spinner, Toast, tx, type Lang } from './ui';
import {
  cx,
  type AiComposeResult,
  type AiMatchmakingResult,
  type AiSearchResult,
  type PublicUser,
} from './api';

export default function CommunityApp({
  lang: siteLang,
  route,
  navigate,
  onSignedIn,
}: {
  lang: string;
  route: string;
  navigate: (tab: string) => void;
  onSignedIn?: () => void;
}) {
  const lang: Lang = siteLang === 'ar' ? 'ar' : 'en';
  const t = tx(lang);
  const session = useSession();
  const [toast, setToast] = useState('');
  const call = useMessengerCall(session, lang, setToast);

  // AI Smart Omnibar search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AiSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Floating Messenger Dock state
  const [dockChatId, setDockChatId] = useState<string | null>(null);
  const [dockRecipient, setDockRecipient] = useState<PublicUser | null>(null);

  // Community AI Concierge Sheet
  const [showAiConcierge, setShowAiConcierge] = useState(false);

  const go = useCallback(
    (r: string) => {
      navigate(r ? `community/${r}` : 'community');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [navigate]
  );

  const parts = route.split('/').filter(Boolean);
  const [page, a] = parts;
  const member = session.status === 'member' && session.me;

  useEffect(() => {
    if (member) onSignedIn?.();
  }, [member, onSignedIn]);

  // Smart Omnibar Search (people + posts + recipes + AI synthesis)
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      cx<AiSearchResult>('/community/ai/search', { body: { query: q, lang } })
        .then((res) => {
          setSearchResults(res || null);
          setIsSearching(false);
        })
        .catch(() => {
          setSearchResults(null);
          setIsSearching(false);
        });
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery, lang]);

  const openDockChat = async (userId: string) => {
    if (!member) {
      setToast(t('سجّل دخولك لتتمكن من استخدام الماسنجر والمراسلة', 'Please sign in to use Messenger'));
      go('login');
      return;
    }
    try {
      const res = await cx<{ id: string }>(`/community/chats/direct`, {
        body: { userId },
      });
      const matches = await cx<PublicUser[]>(`/community/people?q=${encodeURIComponent(userId)}`).catch(() => []);
      setDockChatId(res.id);
      setDockRecipient(Array.isArray(matches) && matches[0] ? matches[0] : null);
    } catch {
      go('messenger');
    }
  };

  const pulse = session.pulse;

  const tabs = [
    { id: 'social', label: t('الموجز', 'Feed'), icon: <Home className="h-[18px] w-[18px]" /> },
    { id: 'watch', label: t('فيديو', 'Watch'), icon: <Film className="h-[18px] w-[18px]" /> },
    { id: 'groups', label: t('المجموعات', 'Groups'), icon: <Layers className="h-[18px] w-[18px]" /> },
    { id: 'events', label: t('الفعاليات', 'Events'), icon: <Calendar className="h-[18px] w-[18px]" /> },
    {
      id: 'general-news',
      label: t('الأخبار', 'News'),
      icon: <Radio className="h-[18px] w-[18px] text-rose-600" />,
      dot: true,
    },
    { id: 'discussions', label: t('الصالون', 'Salon'), icon: <Coffee className="h-[18px] w-[18px]" /> },
    {
      id: 'messenger',
      label: t('الماسنجر', 'Messenger'),
      icon: <MessageCircle className="h-[18px] w-[18px]" />,
      badge: pulse?.messages,
    },
    {
      id: 'friends',
      label: t('الأصدقاء', 'Friends'),
      icon: <Users className="h-[18px] w-[18px]" />,
      badge: pulse?.requests,
    },
    { id: 'stores', label: t('المتاجر', 'Stores'), icon: <Store className="h-[18px] w-[18px]" /> },
    { id: 'me', label: t('بوابتي', 'Portal'), icon: <User className="h-[18px] w-[18px]" /> },
  ];

  const active =
    !page || page === 'social'
      ? 'social'
      : page === 'watch'
      ? 'watch'
      : page === 'groups'
      ? 'groups'
      : page === 'events'
      ? 'events'
      : page === 'general-news' || page === 'news'
      ? 'general-news'
      : page === 'discussions'
      ? 'discussions'
      : page === 'u'
      ? 'social'
      : page === 'friends'
      ? 'friends'
      : page === 'store'
      ? 'stores'
      : page;

  const handleQuickDemoLogin = async () => {
    try {
      setToast(t('جاري تسجيل الدخول بحساب أحمد شاهين…', 'Signing in as Ahmed Shaheen…'));
      await signIn('ahmed@dar-sham.perfume', 'Sham123456');
      setToast(t('أهلاً بك في مجتمع دار شام العطري ✨', 'Welcome to Sham Atelier Community ✨'));
      go('');
    } catch {
      setToast(t('يرجى استخدام نموذج تسجيل الدخول', 'Please use the login form'));
      go('login');
    }
  };

  let body: React.ReactNode;
  if (session.status === 'loading') {
    body = <Spinner />;
  } else if (session.status === 'disabled' || session.status === 'offline') {
    body = <NotReady lang={lang} offline={session.status === 'offline'} />;
  } else if (page === 'stores') {
    body = <StoreDirectory lang={lang} go={go} />;
  } else if (page === 'store' && a) {
    body = <StorePage lang={lang} go={go} slug={a} />;
  } else if (page === 'groups') {
    body = <GroupsPage lang={lang} session={session} groupId={a} go={go} toast={setToast} onOpenMessenger={openDockChat} />;
  } else if (page === 'events') {
    body = <EventsPage lang={lang} session={session} go={go} toast={setToast} />;
  } else if (page === 'watch') {
    body = <WatchPage lang={lang} go={go} toast={setToast} />;
  } else if (page === 'general-news' || page === 'news') {
    body = <GeneralNewsPeriodic lang={lang} go={go} toast={setToast} />;
  } else if (page === 'discussions') {
    body = <DiscussionsPage lang={lang} go={go} toast={setToast} onOpenMessenger={openDockChat} />;
  } else if (page === 'u' && a) {
    body = <ProfilePage handle={a} lang={lang} go={go} toast={setToast} onOpenMessenger={openDockChat} />;
  } else if (page === 'login' || page === 'join') {
    body = (
      <HubAuth
        lang={lang}
        initial={page === 'join' ? 'register' : 'login'}
        onDone={(merchant) => go(merchant ? 'merchant' : 'social')}
      />
    );
  } else if (!member && (page === 'messenger' || page === 'me' || page === 'merchant')) {
    body = (
      <HubAuth
        lang={lang}
        initial="login"
        onDone={(merchant) => go(merchant ? 'merchant' : 'social')}
      />
    );
  } else if (page === 'messenger') {
    body = <Messenger lang={lang} session={session} chatId={a} go={go} toast={setToast} onStartCall={call.startCall} />;
  } else if (page === 'me') {
    body = <UserPortal lang={lang} session={session} section={a} go={go} toast={setToast} />;
  } else if (page === 'merchant') {
    body = <MerchantPortal lang={lang} session={session} section={a} go={go} toast={setToast} />;
  } else if (page === 'notifications') {
    body = <NotificationsPage lang={lang} go={go} />;
  } else if (page === 'friends') {
    body = <FriendsPage lang={lang} go={go} toast={setToast} onOpenMessenger={openDockChat} />;
  } else {
    body = (
      <SocialFeed
        lang={lang}
        session={session}
        go={go}
        toast={setToast}
        onOpenMessenger={openDockChat}
      />
    );
  }

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-[85vh] bg-[#FBF9F5] pb-16">
      {/* Atelier Top Command Header */}
      <header className="sticky top-0 z-40 border-b border-stone-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-3 py-2 sm:px-5">
          {/* Zone 1: Brand + Smart Omnibar */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => go('')}
              className="flex items-center gap-2.5 text-stone-900 cursor-pointer shrink-0"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 text-amber-300 shadow-xs">
                <FlaskConical className="h-4.5 w-4.5" />
              </span>
              <span className="hidden sm:block text-sm font-black tracking-tight text-stone-900 whitespace-nowrap">
                {t('مجتمع دار شام', 'Sham Community')}
              </span>
            </button>

            {/* AI Smart Omnibar Search */}
            <div className="relative hidden md:block w-52 lg:w-60 xl:w-64">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('ابحث في العطور، التركيبات، أو اسأل الذكاء…', 'Search community or ask AI…')}
                className="w-full rounded-xl border border-stone-200 bg-stone-50/90 py-2 ps-9 pe-8 text-xs text-stone-900 outline-none transition focus:border-amber-600 focus:bg-white focus:ring-2 focus:ring-amber-200"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults(null);
                  }}
                  className="absolute inset-y-0 end-2.5 my-auto text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-700" /> : <X className="h-3.5 w-3.5" />}
                </button>
              )}

              {/* Omnibar Dropdown with AI Synthesis */}
              {searchQuery.trim().length >= 2 && (isSearching || searchResults) && (
                <div className="absolute top-full start-0 z-50 mt-1.5 w-[360px] max-w-[92vw] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
                  {isSearching && !searchResults ? (
                    <div className="flex items-center justify-center gap-2 p-5 text-xs text-stone-500">
                      <Loader2 className="h-4 w-4 animate-spin text-amber-700" />
                      <span>{t('جاري البحث والتحليل الذكي…', 'Searching community knowledge…')}</span>
                    </div>
                  ) : searchResults ? (
                    <div className="max-h-[420px] overflow-y-auto divide-y divide-stone-100">
                      {searchResults.answer && (
                        <div className="bg-amber-50/60 p-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-900">
                            <Sparkles className="h-3.5 w-3.5 text-amber-700" />
                            <span>{t('خلاصة شاهين الذكية', 'Sham Smart Summary')}</span>
                          </div>
                          <p className="text-xs leading-relaxed text-stone-800">{searchResults.answer}</p>
                        </div>
                      )}

                      {searchResults.people.length > 0 && (
                        <div className="p-2">
                          <p className="px-2 py-1 text-[10px] font-bold text-stone-400">
                            {t('صناع العطور والأعضاء', 'Artisans')}
                          </p>
                          {searchResults.people.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                go(`u/${u.handle}`);
                                setSearchQuery('');
                                setSearchResults(null);
                              }}
                              className="flex w-full items-center gap-2.5 rounded-xl p-2 text-start hover:bg-stone-50 cursor-pointer"
                            >
                              <Avatar user={u} size={32} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-bold text-stone-900">{u.name}</span>
                                <span className="block truncate text-[10px] text-stone-400">@{u.handle}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.recipes.length > 0 && (
                        <div className="p-2">
                          <p className="px-2 py-1 text-[10px] font-bold text-stone-400">
                            {t('تركيبات المعمل', 'Shared Formulas')}
                          </p>
                          {searchResults.recipes.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                go(`u/${r.ownerHandle}`);
                                setSearchQuery('');
                                setSearchResults(null);
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-xl p-2 text-start hover:bg-stone-50 cursor-pointer"
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <FlaskConical className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                                <span className="truncate text-xs font-semibold text-stone-800">{r.title}</span>
                              </span>
                              <span className="text-[10px] text-stone-400 shrink-0">{r.ownerName.split(' ')[0]}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {searchResults.posts.length > 0 && (
                        <div className="p-2">
                          <p className="px-2 py-1 text-[10px] font-bold text-stone-400">
                            {t('تدوينات ذات صلة', 'Related Posts')}
                          </p>
                          {searchResults.posts.slice(0, 3).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                go(`u/${p.author.handle}`);
                                setSearchQuery('');
                                setSearchResults(null);
                              }}
                              className="block w-full rounded-xl p-2 text-start hover:bg-stone-50 cursor-pointer"
                            >
                              <p className="text-[11px] font-bold text-stone-900">{p.author.name}</p>
                              <p className="line-clamp-2 text-[11px] text-stone-600">{p.body}</p>
                            </button>
                          ))}
                        </div>
                      )}

                      {!searchResults.people.length && !searchResults.recipes.length && !searchResults.posts.length && (
                        <div className="p-3 text-center text-xs text-stone-500">
                          {t('لم نعثر على منشورات مطابقة مباشرة، جرّب المساعد الذكي.', 'No direct matches — try the AI Concierge.')}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Zone 2: Clean Single-Line Nav Tabs */}
          <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const isActive = active === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  title={tab.label}
                  onClick={() => go(tab.id === 'social' ? '' : tab.id)}
                  className={`relative flex h-10 items-center justify-center gap-1 rounded-xl px-2 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 sm:px-2.5 2xl:px-3 ${
                    isActive
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                >
                  {tab.icon}
                  <span className="hidden 2xl:inline">{tab.label}</span>
                  {Boolean(tab.badge) && (
                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: AI Copilot, Notifications, Profile */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowAiConcierge(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100 transition cursor-pointer whitespace-nowrap shrink-0"
              title={t('مساعد شاهين الذكي للمجتمع', 'Sham AI Community Assistant')}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-700" />
              <span className="hidden sm:inline">{t('ذكاء المجتمع', 'Community AI')}</span>
            </button>

            {member ? (
              <>
                <button
                  type="button"
                  onClick={() => go('notifications')}
                  title={t('الإشعارات', 'Notifications')}
                  className="relative rounded-xl p-2 text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  <Bell className="h-4.5 w-4.5" />
                  {Boolean((pulse?.notifications || 0) + (pulse?.requests || 0)) && (
                    <span className="absolute top-1.5 end-1.5 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-white" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => go(`u/${member.handle}`)}
                  className="flex items-center gap-2 rounded-xl p-1 pe-2 hover:bg-stone-100 cursor-pointer"
                  title={member.name}
                >
                  <Avatar user={member} size={32} ring />
                  <span className="hidden xl:inline text-xs font-bold text-stone-800 whitespace-nowrap">
                    {member.name.split(' ')[0]}
                  </span>
                </button>

                <button
                  type="button"
                  title={t('تسجيل الخروج', 'Sign out')}
                  onClick={() => void signOut().then(() => go(''))}
                  className="rounded-xl p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleQuickDemoLogin}
                  className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-50 transition cursor-pointer whitespace-nowrap"
                >
                  <span>{t('دخول تجريبي', 'Demo')}</span>
                </button>
                <Btn small onClick={() => go('login')}>
                  {t('دخول', 'Sign in')}
                </Btn>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-2.5 py-4 sm:px-5">{body}</main>

      {/* Floating Messenger Dock */}
      {dockChatId && (
        <FloatingMessengerDock
          lang={lang}
          chatId={dockChatId}
          recipientUser={dockRecipient}
          onClose={() => {
            setDockChatId(null);
            setDockRecipient(null);
          }}
          onExpand={(cid) => {
            setDockChatId(null);
            go(`messenger/${cid}`);
          }}
          onStartCall={(cid, mode, peer) => void call.startCall(cid, mode, peer)}
          toast={setToast}
        />
      )}

      {/* Live Messenger Incoming Call Banner */}
      {call.incomingCall && (
        <IncomingCallBanner
          lang={lang}
          call={call.incomingCall}
          onAccept={(mode) => void call.acceptIncomingCall(mode)}
          onDecline={call.declineIncomingCall}
        />
      )}

      {/* Active Live Audio / Video Call Stage */}
      {call.activeCall && (
        <LiveCallStage
          lang={lang}
          call={call.activeCall}
          onEnd={call.endCall}
          onToggleMute={call.toggleMute}
          onToggleCamera={call.toggleCamera}
          onToggleScreenShare={call.toggleScreenShare}
        />
      )}

      {/* Community AI Concierge Sheet */}
      {showAiConcierge && (
        <CommunityAiConcierge
          lang={lang}
          onClose={() => setShowAiConcierge(false)}
          onOpenProfile={(handle) => {
            setShowAiConcierge(false);
            go(`u/${handle}`);
          }}
          onOpenMessenger={(userId) => {
            setShowAiConcierge(false);
            void openDockChat(userId);
          }}
          onUseDraft={(text) => {
            try {
              localStorage.setItem('sham_composer_prefill', JSON.stringify({ content: text, tag: 'ai' }));
              window.dispatchEvent(new Event('sham-composer-prefill'));
            } catch {}
            setShowAiConcierge(false);
            go('');
            setToast(t('تم إرسال المسودة إلى مربع النشر بنجاح ✨', 'Draft sent to your post composer ✨'));
          }}
        />
      )}

      {toast && <Toast text={toast} onDone={() => setToast('')} />}
    </div>
  );
}

/* ------------------------------------------- AI Concierge Modal ------------------------------------------- */

function CommunityAiConcierge({
  lang,
  onClose,
  onOpenProfile,
  onOpenMessenger,
  onUseDraft,
}: {
  lang: Lang;
  onClose: () => void;
  onOpenProfile: (handle: string) => void;
  onOpenMessenger: (userId: string) => void;
  onUseDraft: (text: string) => void;
}) {
  const t = tx(lang);
  const [tab, setTab] = useState<'ask' | 'draft' | 'match'>('ask');

  // Ask State
  const [q, setQ] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askRes, setAskRes] = useState<AiSearchResult | null>(null);

  // Draft State
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<'luxury' | 'scientific' | 'warm'>('luxury');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftRes, setDraftRes] = useState<AiComposeResult | null>(null);

  // Match State
  const [matches, setMatches] = useState<AiMatchmakingResult | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  useEffect(() => {
    if (tab === 'match' && !matches && !matchLoading) {
      setMatchLoading(true);
      cx<AiMatchmakingResult>(`/community/ai/matchmaking?lang=${lang}`)
        .then(setMatches)
        .catch(() => {})
        .finally(() => setMatchLoading(false));
    }
  }, [tab, matches, matchLoading, lang]);

  const runSearch = async () => {
    if (q.trim().length < 2) return;
    setAskLoading(true);
    try {
      setAskRes(await cx<AiSearchResult>('/community/ai/search', { body: { query: q.trim(), lang } }));
    } finally {
      setAskLoading(false);
    }
  };

  const runDraft = async () => {
    if (!topic.trim()) return;
    setDraftLoading(true);
    try {
      setDraftRes(
        await cx<AiComposeResult>('/community/ai/compose', {
          body: { mode: 'draft', topic: topic.trim(), tone, lang },
        })
      );
    } finally {
      setDraftLoading(false);
    }
  };

  return (
    <Sheet title={t('✨ المساعد الذكي لمجتمع دار شام', 'Sham Community AI Concierge')} onClose={onClose} wide>
      <div className="space-y-4">
        {/* Segmented Control */}
        <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-1">
          {[
            { id: 'ask', label: t('🔍 استشارة والبحث في المجتمع', 'Ask & Search Community') },
            { id: 'draft', label: t('✍️ صياغة منشور احترافي', 'Draft Post') },
            { id: 'match', label: t('🤝 توافق صانعي العطور', 'Artisan Matchmaking') },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as 'ask' | 'draft' | 'match')}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                tab === item.id ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'ask' && (
          <div className="space-y-3">
            <p className="text-xs text-stone-600">
              {t(
                'اسأل عن التعتيق، النوتات، دهن العود، أو ابحث عن خبرات الأعضاء والتركيبات المنشورة.',
                'Ask about maceration, fragrance notes, or synthesize member posts & recipes.'
              )}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
                placeholder={t('مثال: كيف أثبّت نوتات الحمضيات مع العود؟', 'e.g. Oud and saffron blend tips')}
                className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-600 focus:bg-white"
              />
              <Btn small busy={askLoading} disabled={q.trim().length < 2} onClick={() => void runSearch()}>
                <Sparkles className="h-3.5 w-3.5" />
                {t('تحليل والبحث', 'Search')}
              </Btn>
            </div>
            {askRes && (
              <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
                <p className="text-xs leading-relaxed text-stone-900 font-medium">{askRes.answer}</p>
                {askRes.posts.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-stone-200/80">
                    <span className="text-[11px] font-bold text-stone-500">
                      {t('مشاركات الأعضاء المرتبطة:', 'Relevant Member Posts:')}
                    </span>
                    {askRes.posts.slice(0, 3).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onOpenProfile(p.author.handle)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl bg-white p-2.5 text-start border border-stone-200 hover:border-amber-400 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <span className="block text-[11px] font-bold text-stone-900">{p.author.name}</span>
                          <span className="block truncate text-[11px] text-stone-600">{p.body}</span>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-amber-700 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'draft' && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t('ما موضوع منشورك أو تجربتك المعملية؟', 'What is your post or trial about?')}
                className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-600 focus:bg-white"
              />
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as 'luxury' | 'scientific' | 'warm')}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-800 outline-none"
              >
                <option value="luxury">{t('أسلوب دار عطور فاخرة', 'Atelier Editorial')}</option>
                <option value="scientific">{t('أسلوب علمي مخبري', 'Lab Scientific')}</option>
                <option value="warm">{t('حواري ودود للمجتمع', 'Warm Community')}</option>
              </select>
            </div>
            <Btn small busy={draftLoading} disabled={!topic.trim()} onClick={() => void runDraft()}>
              <Sparkles className="h-3.5 w-3.5" />
              {t('إنشاء المسودة الآن', 'Generate Draft')}
            </Btn>
            {draftRes?.result && (
              <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-stone-900">{draftRes.result}</p>
                <div className="flex justify-end">
                  <Btn small onClick={() => onUseDraft(draftRes.result)}>
                    {t('نقل إلى محرر المنشورات', 'Send to Composer')}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'match' && (
          <div className="space-y-3">
            {matchLoading ? (
              <Spinner />
            ) : !matches?.matches.length ? (
              <Empty
                icon={<Compass className="h-9 w-9 text-stone-400" />}
                title={t('جميع الصانعين المتاحين في شبكتك بالفعل', 'You are connected with available makers')}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {matches.matches.map((m) => (
                  <div key={m.user.id} className="rounded-2xl border border-stone-200 bg-stone-50/60 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={m.user} size={40} />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onOpenProfile(m.user.handle)}
                          className="block truncate text-xs font-black text-stone-900 hover:text-amber-800 cursor-pointer"
                        >
                          {m.user.name}
                        </button>
                        <p className="truncate text-[11px] text-stone-500">{m.sharedCircle}</p>
                      </div>
                    </div>
                    <p className="text-[11px] leading-relaxed text-stone-700">{m.reason}</p>
                    <p className="text-[10px] font-medium text-amber-900">
                      {m.sharedInterests.join(' · ')}
                    </p>
                    <div className="flex gap-1.5 pt-1">
                      <Btn small variant="soft" className="flex-1" onClick={() => onOpenProfile(m.user.handle)}>
                        {t('الملف الشخصي', 'Profile')}
                      </Btn>
                      <Btn small variant="dark" onClick={() => onOpenMessenger(m.user.id)}>
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function NotReady({ lang, offline }: { lang: Lang; offline: boolean }) {
  const t = tx(lang);
  return (
    <div className="mx-auto max-w-2xl px-3 py-10">
      <Card className="p-6 text-center">
        <Empty
          icon={<Users className="h-12 w-12 text-amber-700" />}
          title={
            offline
              ? t('لا يوجد اتصال بالسيرفر حالياً', 'Cannot reach the server right now')
              : t('مجتمع شام قيد التهيئة', 'Sham Community is starting up')
          }
          body={
            offline
              ? t('تأكد من الاتصال بالإنترنت وجرّب ثانية.', 'Check your connection and retry.')
              : t('يتم إعداد قاعدة البيانات والخدمات السحابية. يرجى التحديث بعد لحظات.', 'Starting database services.')
          }
          action={
            <Btn variant="soft" onClick={() => window.location.reload()}>
              {t('تحديث الصفحة', 'Refresh')}
            </Btn>
          }
        />
      </Card>
    </div>
  );
}
