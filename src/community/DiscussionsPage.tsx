import { useState } from 'react';
import {
  MessageSquare,
  HelpCircle,
  Sparkles,
  Flame,
  CheckCircle2,
  ThumbsUp,
  Share2,
  Plus,
  Search,
  Filter,
  X,
  Send,
  FlaskConical,
  Coffee,
  Bookmark,
  ChevronUp,
} from 'lucide-react';
import { Avatar, Btn, Card, tx, type Lang } from './ui';
import type { PublicUser } from './api';

export interface DiscussionThread {
  id: string;
  author: Pick<PublicUser, 'id' | 'name' | 'handle' | 'avatar' | 'craftLevel' | 'online'>;
  category: string;
  categoryName: { ar: string; en: string };
  title: string;
  content: string;
  tags: string[];
  upvotes: number;
  userVoted?: boolean;
  repliesCount: number;
  solved?: boolean;
  pinned?: boolean;
  createdAt: string;
  replies: DiscussionReply[];
}

export interface DiscussionReply {
  id: string;
  author: Pick<PublicUser, 'id' | 'name' | 'handle' | 'avatar' | 'craftLevel'>;
  content: string;
  upvotes: number;
  isAccepted?: boolean;
  createdAt: string;
}

const CATEGORIES = [
  { id: 'all', icon: '🌟', ar: 'كل النقاشات', en: 'All Topics' },
  { id: 'maceration', icon: '🔬', ar: 'تقنيات المعمل والتعتيق', en: 'Lab & Maceration' },
  { id: 'materials', icon: '🌿', ar: 'المواد الخام والزيوت النادرة', en: 'Raw Materials & Oils' },
  { id: 'cafe', icon: '☕', ar: 'قهوة العطارين واستشارات حرة', en: 'Artisan Cafe' },
  { id: 'review', icon: '💡', ar: 'نقد وتحليل التركيبات العطرية', en: 'Formula Reviews' },
  { id: 'sourcing', icon: '🛒', ar: 'مصادر الشراء والزجاجات والتغليف', en: 'Sourcing & Bottles' },
];

const INITIAL_THREADS: DiscussionThread[] = [
  {
    id: 'disc_1',
    author: {
      id: 'u_ahmed_shaheen',
      name: 'الكابتن أحمد شاهين — خبير العطور',
      handle: 'ahmed_shaheen',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      craftLevel: 'perfumer',
      online: true,
    },
    category: 'maceration',
    categoryName: { ar: 'تقنيات المعمل والتعتيق', en: 'Lab & Maceration' },
    title: 'نقاش فني: ما هي المدة المثالية لتعتيق العطور الشرقية الثقيلة؟ (عود، عنبر، مسك)',
    content:
      'الكثير من صناع العطور يتساءلون هل التعتيق لمدة شهرين كافٍ للزيوت الراتنجية مثل العود الكمبودي واللبان الجاوي؟ من واقع تجارب المعمل، أجد أن التعتيق البارد على 15 درجة مئوية لمدة 60 يوماً يعطي اندماجاً هيدروجينياً متفوقاً يمنع انفصال الزيوت عند التبريد. ما هي خبرتكم في هذا الصدد؟',
    tags: ['تعتيق_العطور', 'دهن_العود', 'الكيمياء_العطرية'],
    upvotes: 42,
    repliesCount: 6,
    solved: true,
    pinned: true,
    createdAt: 'منذ يومين',
    replies: [
      {
        id: 'rep_1',
        author: {
          id: 'u_dar_sham',
          name: 'دار شام للعطور — الحساب الرسمي',
          handle: 'dar_sham',
          avatar: 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=200&auto=format&fit=crop&q=80',
          craftLevel: 'master_lab',
        },
        content:
          'نؤيد تماماً ما تفضل به الكابتن أحمد. في دار شام، نترك دفعات العود والباتشولي حتى 75 يوماً مع تقليب أسبوعي هادئ بالموجات الصوتية (Ultrasonic Sonication) لضمان تفكك الجزيئات الكبيرة وتجانسها مع الإيثانول.',
        upvotes: 28,
        isAccepted: true,
        createdAt: 'منذ يوم',
      },
      {
        id: 'rep_2',
        author: {
          id: 'u_tariq_oud',
          name: 'الشيخ طارق العتيبي — خبير العود المعتق',
          handle: 'tariq_oud',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
          craftLevel: 'perfumer',
        },
        content:
          'بالنسبة للأخشاب المعتقة تحديداً، الزجاج العسلي المعزول عن الأشعة فوق البنفسجية هو السر الأهم. أي تعرض للضوء أثناء التعتيق يفسد النوتات العليا.',
        upvotes: 19,
        createdAt: 'منذ 18 ساعة',
      },
    ],
  },
  {
    id: 'disc_2',
    author: {
      id: 'u_nourhan',
      name: 'م. نورهان الكردي — خبيرة التقطير',
      handle: 'nourhan_lab',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80',
      craftLevel: 'perfumer',
      online: true,
    },
    category: 'materials',
    categoryName: { ar: 'المواد الخام والزيوت النادرة', en: 'Raw Materials & Oils' },
    title: 'كيف تفرق بين دهن العود الطبيعي الصافي والمغشوش بالدوبروبيلين أو الزيوت المعدنية؟',
    content:
      'نظراً لانتشار الزيوت المخلوطة بمذيب DPG أو الزيوت الخاملة التي تقتل الفوحان الطبيعي، إليكم اختبار قطرة الماء واختبار التبخير على ورقة الشم (Smelling Strip): العود الطبيعي يترك هالة عطرية متصاعدة تدوم أياماً دون رائحة بلاستيكية أو دهنية ثقيلة.',
    tags: ['غش_الزيوت', 'فحص_العود', 'نقاء_المواد'],
    upvotes: 56,
    repliesCount: 4,
    solved: false,
    pinned: true,
    createdAt: 'منذ 3 أيام',
    replies: [
      {
        id: 'rep_3',
        author: {
          id: 'u_layla_scents',
          name: 'ليلى الأندلسي',
          handle: 'layla_scents',
          avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
          craftLevel: 'hobbyist',
        },
        content:
          'اختبار ميزان الكثافة ومعامل الانكسار الضوئي (Refractometer) ساعدني جداً في كشف الزيوت المغشوشة بالزيوت المعدنية. شكراً على التوضيح المفصل!',
        upvotes: 11,
        createdAt: 'منذ يومين',
      },
    ],
  },
  {
    id: 'disc_3',
    author: {
      id: 'u_layla_scents',
      name: 'ليلى الأندلسي — هاوية تركيبات النيش',
      handle: 'layla_scents',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
      craftLevel: 'hobbyist',
      online: false,
    },
    category: 'review',
    categoryName: { ar: 'نقد وتحليل التركيبات العطرية', en: 'Formula Reviews' },
    title: 'مراجعة تركيبة عطر خريفي: برغموت + هيل + زعفران + توباكو وعنبر',
    content:
      'صممت تركيبة بنسبة زيت 24% وأشعر أن نوتة الهيل تسيطر في أول 15 دقيقة بشكل زائد يغطي على نعومة الزعفران. هل أقوم بتقليل الهيل من 8% إلى 4% أم أرفع نسبة البرغموت لتفتيح المقدمة؟ أنصحكم بتجربة الحاسبة في الموقع لتعديل النسب.',
    tags: ['استشارة_تركيب', 'توباكو_وعنبر', 'موازنة_الهرم'],
    upvotes: 23,
    repliesCount: 3,
    solved: false,
    pinned: false,
    createdAt: 'منذ 4 ساعات',
    replies: [],
  },
  {
    id: 'disc_4',
    author: {
      id: 'u_tariq_oud',
      name: 'الشيخ طارق العتيبي — خبير العود المعتق',
      handle: 'tariq_oud',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      craftLevel: 'perfumer',
      online: false,
    },
    category: 'cafe',
    categoryName: { ar: 'قهوة العطارين واستشارات حرة', en: 'Artisan Cafe' },
    title: 'سؤال الأسبوع: ما هو العطر الكلاسيكي الذي تعتبره مرجعاً في ثبات النوتات الخشبية؟',
    content:
      'عبر تاريخ صناعة العطور، هناك عطور أسطورية أرست معايير الثبات مثل عطور الشيبر القديمة وعطور الفوجير الخشبية. ما هو العطر الذي كان ملهمك الأول لدخول عالم صناعة العطور؟',
    tags: ['تاريخ_العطور', 'إلهام_العطارين', 'قهوة_الصالون'],
    upvotes: 35,
    repliesCount: 8,
    solved: false,
    pinned: false,
    createdAt: 'منذ 5 أيام',
    replies: [],
  },
];

export function DiscussionsPage({
  lang,
  go,
  toast,
  onOpenMessenger,
}: {
  lang: Lang;
  go: (route: string) => void;
  toast: (s: string) => void;
  onOpenMessenger?: (userId: string) => void;
}) {
  const t = tx(lang);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [threads, setThreads] = useState<DiscussionThread[]>(INITIAL_THREADS);
  const [activeThread, setActiveThread] = useState<DiscussionThread | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New discussion form
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('maceration');
  const [newTags, setNewTags] = useState('');

  // Reply input
  const [replyText, setReplyText] = useState('');

  const filtered = threads.filter((th) => {
    const matchCat = category === 'all' || th.category === category;
    const matchSearch =
      !search.trim() ||
      th.title.toLowerCase().includes(search.toLowerCase()) ||
      th.content.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleUpvote = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setThreads((prev) =>
      prev.map((th) => {
        if (th.id !== id) return th;
        const voted = th.userVoted;
        return {
          ...th,
          upvotes: voted ? th.upvotes - 1 : th.upvotes + 1,
          userVoted: !voted,
        };
      })
    );
    if (activeThread?.id === id) {
      setActiveThread((prev) =>
        prev
          ? {
              ...prev,
              upvotes: prev.userVoted ? prev.upvotes - 1 : prev.upvotes + 1,
              userVoted: !prev.userVoted,
            }
          : null
      );
    }
  };

  const handleCreateDiscussion = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    const catObj = CATEGORIES.find((c) => c.id === newCategory) || CATEGORIES[1];
    const newTh: DiscussionThread = {
      id: `disc_${Date.now()}`,
      author: {
        id: 'me',
        name: t('أنت (صانع عطور)', 'You (Perfumer)'),
        handle: 'me',
        avatar: null,
        craftLevel: 'perfumer',
        online: true,
      },
      category: newCategory,
      categoryName: { ar: catObj.ar, en: catObj.en },
      title: newTitle.trim(),
      content: newContent.trim(),
      tags: newTags
        .split(',')
        .map((s) => s.trim().replace(/^#/, ''))
        .filter(Boolean),
      upvotes: 1,
      userVoted: true,
      repliesCount: 0,
      createdAt: t('الآن', 'Just now'),
      replies: [],
    };
    setThreads([newTh, ...threads]);
    setShowCreateModal(false);
    setNewTitle('');
    setNewContent('');
    setNewTags('');
    toast(t('تم نشر موضوع النقاش في الصالون العطري 🎉', 'Discussion published! 🎉'));
  };

  const handleAddReply = () => {
    if (!replyText.trim() || !activeThread) return;
    const newRep: DiscussionReply = {
      id: `rep_${Date.now()}`,
      author: {
        id: 'me',
        name: t('أنت', 'You'),
        handle: 'me',
        avatar: null,
        craftLevel: 'perfumer',
      },
      content: replyText.trim(),
      upvotes: 0,
      createdAt: t('الآن', 'Just now'),
    };
    const updated = {
      ...activeThread,
      replies: [...activeThread.replies, newRep],
      repliesCount: activeThread.repliesCount + 1,
    };
    setActiveThread(updated);
    setThreads((prev) => prev.map((th) => (th.id === updated.id ? updated : th)));
    setReplyText('');
    toast(t('تمت إضافة ردك على النقاش 💬', 'Reply added 💬'));
  };

  return (
    <div className="space-y-4">
      {/* Salon Header Hero */}
      <Card className="relative overflow-hidden border-amber-200 bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900 p-6 text-white shadow-md">
        <div className="relative z-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-500/30">
              <Coffee className="h-3.5 w-3.5 text-amber-400" />
              {t('مجلس النقاش العام والأسئلة العطرية', 'Public Fragrance Salon & Forum')}
            </span>
            <h1 className="text-2xl font-black text-white sm:text-3xl">
              {t('صالون دار شام لصناع وخبراء العطور', 'Sham Perfumers Salon & Discussions')}
            </h1>
            <p className="max-w-2xl text-xs leading-relaxed text-stone-300 sm:text-sm">
              {t(
                'مساحة للنقاش الحر وتبادل الخبرات بين صانعي العطور، حل مشكلات التعتيق والفوحان، مراجعة تركيبات الأعضاء، والتعرف على مصادر المواد الخام الموثوقة.',
                'Open discussion space for perfume artisans to exchange trade secrets, solve maceration and sillage issues, critique formulas, and discover vetted raw material sources.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-700 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:scale-105 hover:from-amber-500 hover:to-amber-600 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {t('طرح سؤال أو بدء نقاش جديد', 'Start a discussion / Ask question')}
          </button>
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
                category === cat.id
                  ? 'bg-amber-800 text-white shadow-sm'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{lang === 'ar' ? cat.ar : cat.en}</span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="absolute inset-y-0 start-3 my-auto h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('بحث في مواضيع الصالون…', 'Search discussions…')}
            className="w-full rounded-xl border border-stone-200 bg-white py-2 ps-9 pe-3 text-xs text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
        </div>
      </div>

      {/* Discussion List */}
      <div className="space-y-3">
        {!filtered.length ? (
          <Card className="p-8 text-center text-stone-500">
            <MessageSquare className="mx-auto h-12 w-12 text-stone-300" />
            <p className="mt-2 text-sm font-bold text-stone-700">
              {t('لا توجد نقاشات تطابق بحثك', 'No discussions found')}
            </p>
            <p className="mt-1 text-xs text-stone-400">
              {t('كن أول من يطرح سؤالاً في هذا القسم!', 'Be the first to start a conversation here!')}
            </p>
          </Card>
        ) : (
          filtered.map((th) => (
            <Card
              key={th.id}
              onClick={() => setActiveThread(th)}
              className={`group flex cursor-pointer gap-4 p-4 transition hover:border-amber-300 hover:shadow-md ${
                th.pinned ? 'border-amber-300/80 bg-amber-50/20' : ''
              }`}
            >
              {/* Upvote Column */}
              <div
                onClick={(e) => handleUpvote(th.id, e)}
                className={`flex h-20 w-12 shrink-0 flex-col items-center justify-center rounded-xl border transition ${
                  th.userVoted
                    ? 'border-amber-400 bg-amber-100/70 text-amber-900'
                    : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100 hover:border-amber-300'
                }`}
              >
                <ChevronUp className="h-5 w-5" />
                <span className="text-xs font-black">{th.upvotes}</span>
                <span className="text-[9px] text-stone-400">{t('صوت', 'votes')}</span>
              </div>

              {/* Main Content */}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {th.pinned && (
                    <span className="flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      📌 {t('مثبّت من الخبراء', 'Pinned')}
                    </span>
                  )}
                  <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                    {lang === 'ar' ? th.categoryName.ar : th.categoryName.en}
                  </span>
                  {th.solved && (
                    <span className="flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" />
                      {t('إجابة معتمدة', 'Solved')}
                    </span>
                  )}
                  <span className="ms-auto text-[11px] text-stone-400">{th.createdAt}</span>
                </div>

                <h3 className="text-base font-bold text-stone-900 group-hover:text-amber-800">
                  {th.title}
                </h3>
                <p className="line-clamp-2 text-xs leading-relaxed text-stone-600">
                  {th.content}
                </p>

                {/* Tags and Footer info */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-100">
                  <div className="flex flex-wrap gap-1.5">
                    {th.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-stone-500">
                    <span className="flex items-center gap-1.5">
                      <Avatar user={th.author} size={22} />
                      <span className="font-semibold text-stone-800">
                        {th.author.name.split(' ')[0]}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 font-bold text-amber-800">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {th.repliesCount} {t('ردود', 'replies')}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Thread Details Modal */}
      {activeThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 p-3 sm:p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                  {lang === 'ar'
                    ? activeThread.categoryName.ar
                    : activeThread.categoryName.en}
                </span>
                <span className="text-xs text-stone-400">{activeThread.createdAt}</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveThread(null)}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Thread Content */}
            <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
              {/* Question / Post */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar user={activeThread.author} size={44} ring />
                    <div>
                      <h4 className="font-bold text-stone-900">
                        {activeThread.author.name}
                      </h4>
                      <p className="text-[11px] text-stone-500">
                        @{activeThread.author.handle} · {t('صانع عطور', 'Perfumer')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpvote(activeThread.id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                      activeThread.userVoted
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    <ChevronUp className="h-4 w-4" />
                    <span>
                      {activeThread.upvotes} {t('صوت مفيد', 'Helpful')}
                    </span>
                  </button>
                </div>

                <h2 className="text-lg font-black text-stone-900 sm:text-xl">
                  {activeThread.title}
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
                  {activeThread.content}
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  {activeThread.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Replies Section */}
              <div className="space-y-3 border-t border-stone-200 pt-5">
                <h3 className="flex items-center gap-2 font-black text-stone-900">
                  <MessageSquare className="h-4 w-4 text-amber-600" />
                  {t('إجابات ومشاركات صانعي العطور', 'Artisan Answers & Replies')} (
                  {activeThread.replies.length})
                </h3>

                {!activeThread.replies.length ? (
                  <p className="rounded-xl bg-stone-50 p-4 text-center text-xs text-stone-500">
                    {t(
                      'لا توجد إجابات بعد. كن أول من يشارك خبرته في هذا النقاش!',
                      'No replies yet. Be the first to share your expert perspective!'
                    )}
                  </p>
                ) : (
                  activeThread.replies.map((rep) => (
                    <div
                      key={rep.id}
                      className={`rounded-2xl border p-4 ${
                        rep.isAccepted
                          ? 'border-emerald-300 bg-emerald-50/30'
                          : 'border-stone-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Avatar user={rep.author} size={34} />
                          <div>
                            <span className="block text-xs font-bold text-stone-900">
                              {rep.author.name}
                            </span>
                            <span className="text-[10px] text-stone-400">
                              {rep.createdAt}
                            </span>
                          </div>
                        </div>

                        {rep.isAccepted && (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t('إجابة مقبولة من السائل', 'Accepted Solution')}
                          </span>
                        )}
                      </div>

                      <p className="mt-2.5 whitespace-pre-wrap text-xs leading-relaxed text-stone-800 sm:text-sm">
                        {rep.content}
                      </p>

                      <div className="mt-3 flex items-center gap-2 pt-2 border-t border-stone-100">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-[11px] font-semibold text-stone-500 hover:text-amber-800 cursor-pointer"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                          <span>
                            {rep.upvotes} {t('مفيد', 'Helpful')}
                          </span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Reply Composer Box */}
            <div className="border-t border-stone-200 bg-stone-50 p-3 sm:p-4">
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={2}
                  placeholder={t(
                    'اكتب إجابتك أو خبرتك لمساعدة صانع العطور…',
                    'Write your advice or answer to help fellow perfumers…'
                  )}
                  className="flex-1 resize-none rounded-xl border border-stone-200 bg-white p-2.5 text-xs text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                />
                <button
                  type="button"
                  disabled={!replyText.trim()}
                  onClick={handleAddReply}
                  className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-800 disabled:opacity-40 cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t('إرسال الرد', 'Reply')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start Discussion Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-black text-stone-900 sm:text-lg">
                {t('طرح سؤال أو موضوع نقاش في الصالون العطري', 'Start New Discussion in Salon')}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="mb-1 block font-bold text-stone-700">
                  {t('قسم النقاش', 'Category')}
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-900 outline-none focus:border-amber-500 focus:bg-white"
                >
                  {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {lang === 'ar' ? c.ar : c.en}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-bold text-stone-700">
                  {t('عنوان السؤال أو النقاش بوضوح', 'Discussion Title')}
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={t(
                    'مثال: ما هو أفضل تركيز للعود مع الورد؟ أو تجربة في الفوحان…',
                    'e.g. Best ratio for Oud and Rose? Or sillage advice…'
                  )}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-stone-700">
                  {t('تفاصيل الموضوع أو السؤال والخبرة المطلوب الاستفسار عنها', 'Details & Context')}
                </label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                  placeholder={t(
                    'اشرح تجربتك، المشكلة التي تواجهها في المعمل، أو فكرة التركيبة التي تود مناقشتها مع زملائك…',
                    'Describe your formulation experiment, lab challenge, or topic you want to discuss…'
                  )}
                  className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-900 outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-stone-700">
                  {t('كلمات دلالية / هاشتاجات (مفصولة بفواصل)', 'Tags (comma separated)')}
                </label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder={t('مثال: تعتيق, عود, برغموت, فوحان', 'e.g. Maceration, Oud, Bergamot, Sillage')}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-900 outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  disabled={!newTitle.trim() || !newContent.trim()}
                  onClick={handleCreateDiscussion}
                  className="flex-1 rounded-xl bg-amber-700 py-2.5 font-bold text-white transition hover:bg-amber-800 disabled:opacity-50 cursor-pointer"
                >
                  {t('نشر النقاش الآن في الصالون ✨', 'Publish Discussion ✨')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2.5 font-semibold text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
