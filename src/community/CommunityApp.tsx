/**
 * «مجتمع شام» — Facebook-style community hub for fragrance artisans, master perfumers, and enthusiasts.
 * Features:
 * - Facebook-style top header with global search, central nav icons, notifications and messenger badges
 * - Public fragrance discussions salon (مجلس النقاش العام)
 * - Prestige Facebook-style user profile pages (صفحات المستخدمين)
 * - Full Messenger and floating docked instant chat (الماسنجر والدك العائم)
 * - Seamless friend networking, reactions, and formula sharing
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
  Wrench,
  Search,
  MessageSquare,
  Sparkles,
  FlaskConical,
  Coffee,
  Plus,
  Radio,
} from 'lucide-react';
import HubAuth from './HubAuth';
import MerchantPortal from './MerchantPortal';
import Messenger from './Messenger';
import { FriendsPage, NotificationsPage, SocialFeed } from './SocialPortal';
import { ProfilePage } from './ProfilePage';
import { DiscussionsPage } from './DiscussionsPage';
import { FloatingMessengerDock } from './FloatingMessengerDock';
import { StoreDirectory, StorePage } from './Stores';
import { GeneralNewsPeriodic } from './GeneralNewsPeriodic';
import UserPortal from './UserPortal';
import { signIn, signOut, useSession } from './session';
import { Avatar, Badge, Btn, Card, Empty, Spinner, Toast, tx, type Lang } from './ui';
import { cx, type PublicUser } from './api';

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

  // Global search state in top Facebook bar
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUser[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Floating Messenger Dock state
  const [dockChatId, setDockChatId] = useState<string | null>(null);
  const [dockRecipient, setDockRecipient] = useState<PublicUser | null>(null);

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

  // Handle global search in Facebook bar
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(() => {
      cx<PublicUser[]>(`/community/people?q=${encodeURIComponent(searchQuery.trim())}`)
        .then((res) => {
          setSearchResults(res || []);
          setIsSearching(false);
        })
        .catch(() => {
          setSearchResults([]);
          setIsSearching(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Open docked instant chat with any user
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
      // Look up user details
      const targetUser = await cx<{ user: PublicUser }>(`/community/people?q=${userId}`).catch(() => null);
      setDockChatId(res.id);
      setDockRecipient(targetUser ? targetUser.user : null);
    } catch {
      go('messenger');
    }
  };

  const pulse = session.pulse;

  // Central Facebook-style navigation tabs
  const tabs = [
    { id: 'social', label: t('الموجز', 'Feed'), icon: <Home className="h-5 w-5" /> },
    {
      id: 'general-news',
      label: t('أخبار العامة', 'General News'),
      icon: <Radio className="h-5 w-5 text-rose-600 animate-pulse" />,
      badge: t('دورية', 'Live'),
    },
    {
      id: 'discussions',
      label: t('مجلس النقاش العام', 'Salon'),
      icon: <Coffee className="h-5 w-5" />,
    },
    {
      id: 'messenger',
      label: t('الماسنجر', 'Messenger'),
      icon: <MessageCircle className="h-5 w-5" />,
      badge: pulse?.messages,
    },
    {
      id: 'friends',
      label: t('الأصدقاء', 'Friends'),
      icon: <Users className="h-5 w-5" />,
      badge: pulse?.requests,
    },
    { id: 'stores', label: t('متاجر شام', 'Stores'), icon: <Store className="h-5 w-5" /> },
    { id: 'me', label: t('بوابتي', 'My Portal'), icon: <User className="h-5 w-5" /> },
  ];

  const active =
    !page || page === 'social'
      ? 'social'
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

  // 1-Click Quick Demo Login for testing
  const handleQuickDemoLogin = async () => {
    try {
      setToast(t('جاري تسجيل الدخول بحساب الكابتن أحمد شاهين…', 'Signing in as Ahmed Shaheen…'));
      await signIn('ahmed@dar-sham.perfume', 'Sham123456');
      setToast(t('أهلاً بك! تم تسجيل الدخول كصانع عطور في مجتمع شام 🎉', 'Welcome to Sham Community! 🎉'));
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
    body = <Messenger lang={lang} session={session} chatId={a} go={go} toast={setToast} />;
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
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-[85vh] bg-stone-100/70 pb-16">
      {/* Facebook-style Top Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2 sm:px-4">
          {/* Left: Brand & Search */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => go('')}
              className="flex items-center gap-2 font-black text-stone-900 cursor-pointer"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-600 to-amber-900 text-white shadow-sm shadow-amber-900/20">
                <Users className="h-5 w-5" />
              </span>
              <div className="hidden sm:block text-start leading-tight">
                <span className="block text-sm font-black text-stone-900">
                  {t('مجتمع دار شام', 'Sham Community')}
                </span>
                <span className="block text-[10px] font-semibold text-amber-800">
                  {t('ملتقى صناع العطور', 'Perfumers Social Hub')}
                </span>
              </div>
            </button>

            {/* Global Search Bar */}
            <div className="relative hidden md:block w-56 lg:w-72">
              <Search className="absolute inset-y-0 start-3 my-auto h-4 w-4 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('بحث عن صانع عطور أو موضوع…', 'Search community…')}
                className="w-full rounded-full border border-stone-200 bg-stone-100/80 py-2 ps-9 pe-4 text-xs text-stone-900 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-200"
              />

              {/* Search Autocomplete Dropdown */}
              {searchResults && (
                <div className="absolute top-full start-0 z-50 mt-1.5 w-80 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
                  <div className="p-2 space-y-1">
                    {!searchResults.length ? (
                      <p className="p-3 text-center text-xs text-stone-500">
                        {t('لا توجد نتائج مطابقة', 'No perfumers found')}
                      </p>
                    ) : (
                      searchResults.map((u) => (
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
                          <Avatar user={u} size={34} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-stone-900">{u.name}</p>
                            <p className="truncate text-[10px] text-stone-400">@{u.handle}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Center: Facebook-style Primary Navigation Icons */}
          <div className="flex items-center gap-1 sm:gap-2">
            {tabs.map((tab) => {
              const isActive = active === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  title={tab.label}
                  onClick={() => go(tab.id === 'social' ? '' : tab.id)}
                  className={`relative flex h-11 items-center justify-center rounded-xl px-3 transition cursor-pointer sm:px-5 ${
                    isActive
                      ? 'border-b-2 border-amber-600 text-amber-900 bg-amber-50/60'
                      : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                >
                  {tab.icon}
                  {Boolean(tab.badge) && (
                    <span className="absolute top-1.5 end-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white shadow">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: User Profile, Notifications, Quick Actions */}
          <div className="flex items-center gap-1.5 shrink-0 sm:gap-2">
            {member ? (
              <>
                <button
                  type="button"
                  onClick={() => go('notifications')}
                  title={t('الإشعارات', 'Notifications')}
                  className="relative rounded-full p-2 text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  <Bell className="h-5 w-5" />
                  {Boolean((pulse?.notifications || 0) + (pulse?.requests || 0)) && (
                    <span className="absolute top-1 end-1 h-2.5 w-2.5 rounded-full bg-rose-600 ring-2 ring-white" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => go(`u/${member.handle}`)}
                  className="flex items-center gap-2 rounded-full p-1 pe-2 hover:bg-stone-100 cursor-pointer"
                  title={member.name}
                >
                  <Avatar user={member} size={34} ring />
                  <span className="hidden lg:inline text-xs font-bold text-stone-800">
                    {member.name.split(' ')[0]}
                  </span>
                </button>

                <button
                  type="button"
                  title={t('تسجيل الخروج', 'Sign out')}
                  onClick={() => void signOut().then(() => go(''))}
                  className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleQuickDemoLogin}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition cursor-pointer shadow-sm"
                  title={t('دخول سريع بحساب تجريبي كصانع عطور', 'Quick Demo Perfumer Login')}
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-700" />
                  <span>{t('تجربة بحساب صانع عطور', 'Demo Perfumer')}</span>
                </button>
                <Btn small onClick={() => go('login')}>
                  {t('تسجيل الدخول', 'Sign in')}
                </Btn>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-2 py-4 sm:px-4">{body}</main>

      {/* Floating Messenger Docked Chatbox (Facebook Chat Heads) */}
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
          toast={setToast}
        />
      )}

      {toast && <Toast text={toast} onDone={() => setToast('')} />}
    </div>
  );
}

function NotReady({ lang, offline }: { lang: Lang; offline: boolean }) {
  const t = tx(lang);
  return (
    <div className="mx-auto max-w-2xl px-3 py-10">
      <Card className="p-6 text-center">
        <Empty
          icon={<Users className="h-12 w-12 text-amber-600" />}
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
