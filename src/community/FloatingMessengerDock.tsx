import { useState, useEffect, useRef } from 'react';
import {
  X,
  Minimize2,
  Maximize2,
  Send,
  FlaskConical,
  Smile,
  CheckCheck,
  Sparkles,
  Loader2,
  Wand2,
} from 'lucide-react';
import { cx, type AiReplyAssistResult, type Message, type PublicUser } from './api';
import { Avatar, tx, type Lang } from './ui';

interface Props {
  lang: Lang;
  chatId: string;
  recipientUser?: PublicUser | null;
  onClose: () => void;
  onExpand: (chatId: string) => void;
  toast: (s: string) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '🧪', '🔥', '🌹', '✨', '😂', '👌'];

export function FloatingMessengerDock({
  lang,
  chatId,
  recipientUser,
  onClose,
  onExpand,
  toast,
}: Props) {
  const t = tx(lang);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const view = await cx<{ messages: Message[] }>(`/community/chats/${chatId}/messages`);
        if (active) {
          setMessages(view.messages || []);
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    };
    void load();
    const interval = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [chatId]);

  useEffect(() => {
    if (!minimized) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, minimized]);

  const send = async (overrideText?: string) => {
    const content = (overrideText ?? text).trim();
    if (!content || busy) return;
    if (!overrideText) setText('');
    setBusy(true);
    try {
      const msg = await cx<Message>(`/community/chats/${chatId}/messages`, {
        body: { kind: 'text', text: content },
      });
      setMessages((prev) => [...prev, msg]);
      setAiSuggestions([]);
    } catch {
      toast(t('تعذر إرسال الرسالة', 'Failed to send message'));
    } finally {
      setBusy(false);
    }
  };

  const askReplyAi = async (mode: 'suggest' | 'polish') => {
    setAiBusy(true);
    try {
      const recentMessages = messages.slice(-4).map((m) => ({
        sender: m.mine ? 'me' : recipientUser?.name || 'peer',
        text: m.text || (m.kind === 'recipe' ? 'shared recipe' : ''),
      }));
      const res = await cx<AiReplyAssistResult>('/community/ai/reply-assist', {
        body: { contextType: 'messenger', mode, draft: text, recentMessages, lang },
      });
      if (mode === 'polish' && res.polishedDraft) {
        setText(res.polishedDraft);
      } else {
        setAiSuggestions(res.suggestions || []);
      }
    } catch {
      toast(t('تعذر تشغيل مساعد الرد الذكي الآن', 'Smart reply unavailable right now'));
    } finally {
      setAiBusy(false);
    }
  };

  const recipientName = recipientUser?.name || t('المحادثة', 'Chat');

  if (minimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 end-6 z-50 flex cursor-pointer items-center gap-2.5 rounded-full border border-stone-200 bg-white p-2 shadow-xl transition hover:scale-[1.02] hover:border-amber-400"
      >
        <span className="relative">
          {recipientUser ? (
            <Avatar user={recipientUser} size={38} ring />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-800 font-bold text-white">
              💬
            </span>
          )}
        </span>
        <span className="pe-2 text-xs font-bold text-stone-900">{recipientName}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 end-6 z-50 flex h-[470px] w-80 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl sm:w-[350px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-800 bg-stone-900 px-3.5 py-2.5 text-white">
        <div className="flex min-w-0 items-center gap-2.5">
          {recipientUser && <Avatar user={recipientUser} size={32} />}
          <div className="min-w-0">
            <h4 className="truncate text-xs font-bold text-white">{recipientName}</h4>
            <span className="text-[10px] text-stone-300">
              {recipientUser?.online ? t('متصل الآن', 'Active now') : t('محادثة مشفّرة', 'Encrypted atelier chat')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-stone-300">
          <button
            type="button"
            title={t('تكبير للماسنجر الكامل', 'Expand to full Messenger')}
            onClick={() => onExpand(chatId)}
            className="rounded p-1.5 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t('تصغير', 'Minimize')}
            onClick={() => setMinimized(true)}
            className="rounded p-1.5 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t('إغلاق', 'Close')}
            onClick={onClose}
            className="rounded p-1.5 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 space-y-2.5 overflow-y-auto bg-[#FBF9F5] p-3 text-xs">
        {loading ? (
          <div className="py-12 text-center text-stone-400">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-amber-700" />
          </div>
        ) : !messages.length ? (
          <div className="py-10 text-center">
            <Sparkles className="mx-auto h-7 w-7 text-amber-700 opacity-70" />
            <p className="mt-2 text-xs font-bold text-stone-800">
              {t('ابدأ المحادثة الآن', 'Start the conversation')}
            </p>
            <p className="mt-0.5 text-[11px] text-stone-500">
              {t('تبادل الخبرات والتركيبات العطرية مع مساعد الرد الذكي', 'Exchange formulas with AI reply assist')}
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.mine;
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    isMe
                      ? 'bg-amber-800 text-white rounded-ee-none shadow-xs'
                      : 'bg-white text-stone-900 border border-stone-200/80 rounded-es-none shadow-xs'
                  }`}
                >
                  {m.kind === 'recipe' ? (
                    <div className="space-y-1">
                      <p className={`flex items-center gap-1 font-bold ${isMe ? 'text-amber-200' : 'text-amber-900'}`}>
                        <FlaskConical className="h-3.5 w-3.5" />
                        {m.text}
                      </p>
                      <p className="text-[10px] opacity-80">
                        {t('تركيبة عطرية مشاركة', 'Shared fragrance formula')}
                      </p>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  )}
                </div>
                <span className="mt-0.5 flex items-center gap-1 px-1 text-[9px] tabular-nums text-stone-400">
                  {new Date(m.createdAt).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {isMe && <CheckCheck className="h-3 w-3 text-amber-700" />}
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Smart AI Suggestions Strip */}
      {aiSuggestions.length > 0 && (
        <div className="border-t border-amber-200/80 bg-amber-50/70 px-2.5 py-2 space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-amber-950">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-700" />
              {t('اقتراحات شاهين للرد السريع', 'Smart reply suggestions')}
            </span>
            <button
              type="button"
              onClick={() => setAiSuggestions([])}
              className="text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {aiSuggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setText(s)}
                className="rounded-lg border border-amber-200/80 bg-white px-2.5 py-1.5 text-start text-[11px] font-medium text-stone-800 hover:bg-amber-100/60 transition cursor-pointer line-clamp-2"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Emoji picker drawer */}
      {showEmoji && (
        <div className="flex flex-wrap gap-1.5 border-t border-stone-200 bg-white p-2">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setText((prev) => prev + e);
                setShowEmoji(false);
              }}
              className="text-base transition hover:scale-125 cursor-pointer"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Chat Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-center gap-1 border-t border-stone-200 bg-white p-2"
      >
        <button
          type="button"
          disabled={aiBusy}
          onClick={() => void askReplyAi(text.trim() ? 'polish' : 'suggest')}
          className="rounded-full p-1.5 text-amber-800 hover:bg-amber-50 cursor-pointer shrink-0 disabled:opacity-50"
          title={text.trim() ? t('تحسين صياغة الرسالة بالذكاء', 'Polish draft with AI') : t('اقتراح ردود ذكية', 'Suggest smart replies')}
        >
          {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : text.trim() ? <Wand2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setShowEmoji((v) => !v)}
          className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100 cursor-pointer shrink-0"
          title={t('إيموجي', 'Emoji')}
        >
          <Smile className="h-4 w-4" />
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('اكتب رسالة…', 'Type a message…')}
          className="flex-1 min-w-0 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-900 outline-none focus:border-amber-600 focus:bg-white"
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-800 text-white transition hover:bg-amber-900 disabled:opacity-40 cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
