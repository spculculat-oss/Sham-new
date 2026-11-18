import { useState, useEffect, useRef } from 'react';
import {
  X,
  Minimize2,
  Maximize2,
  Send,
  FlaskConical,
  Smile,
  ImagePlus,
  Check,
  CheckCheck,
  Sparkles,
} from 'lucide-react';
import { cx, type Message, type PublicUser } from './api';
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
  const endRef = useRef<HTMLDivElement>(null);

  // Load chat messages
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const view = await cx<{ messages: Message[]; otherUser?: PublicUser }>(
          `/community/chats/${chatId}`
        );
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

  const send = async () => {
    if (!text.trim() || busy) return;
    const content = text.trim();
    setText('');
    setBusy(true);
    try {
      const msg = await cx<Message>(`/community/chats/${chatId}/messages`, {
        body: { kind: 'text', text: content },
      });
      setMessages((prev) => [...prev, msg]);
    } catch {
      toast(t('تعذر إرسال الرسالة', 'Failed to send message'));
    } finally {
      setBusy(false);
    }
  };

  const recipientName = recipientUser?.name || t('المحادثة', 'Chat');

  if (minimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 end-6 z-50 flex cursor-pointer items-center gap-2.5 rounded-full border border-amber-200 bg-white p-2 shadow-xl transition hover:scale-105 hover:border-amber-400"
      >
        <span className="relative">
          {recipientUser ? (
            <Avatar user={recipientUser} size={38} ring />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-600 font-bold text-white">
              💬
            </span>
          )}
          <span className="absolute bottom-0 end-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
        </span>
        <span className="pe-2 text-xs font-bold text-stone-900">{recipientName}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 end-6 z-50 flex h-[440px] w-80 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl sm:w-[340px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-100 bg-stone-900 px-3.5 py-2.5 text-white">
        <div className="flex min-w-0 items-center gap-2">
          {recipientUser && <Avatar user={recipientUser} size={32} />}
          <div className="min-w-0">
            <h4 className="truncate text-xs font-bold text-white">{recipientName}</h4>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {t('متصل الآن', 'Active now')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-stone-300">
          <button
            type="button"
            title={t('تكبير للماسنجر الكامل', 'Expand to full Messenger')}
            onClick={() => onExpand(chatId)}
            className="rounded p-1 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t('تصغير', 'Minimize')}
            onClick={() => setMinimized(true)}
            className="rounded p-1 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={t('إغلاق', 'Close')}
            onClick={onClose}
            className="rounded p-1 hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 space-y-2.5 overflow-y-auto bg-stone-50/60 p-3 text-xs">
        {loading ? (
          <div className="py-12 text-center text-stone-400">...</div>
        ) : !messages.length ? (
          <div className="py-12 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-amber-500 opacity-60" />
            <p className="mt-2 text-xs font-bold text-stone-700">
              {t('ابدأ المحادثة الآن', 'Say hello!')}
            </p>
            <p className="mt-0.5 text-[11px] text-stone-400">
              {t('تبادل الخبرات والتركيبات العطرية', 'Share fragrance advice & formulas')}
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
                      ? 'bg-amber-700 text-white rounded-ee-none shadow-sm shadow-amber-900/10'
                      : 'bg-white text-stone-900 border border-stone-200/80 rounded-es-none shadow-sm'
                  }`}
                >
                  {m.kind === 'recipe' ? (
                    <div className="space-y-1">
                      <p className="flex items-center gap-1 font-bold text-amber-200">
                        <FlaskConical className="h-3.5 w-3.5" />
                        {m.text}
                      </p>
                      <p className="text-[10px] opacity-80">
                        {t('تركيبة عطرية مشاركة من المعمل', 'Shared fragrance formula')}
                      </p>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  )}
                </div>
                <span className="mt-0.5 flex items-center gap-1 px-1 text-[9px] text-stone-400">
                  {new Date(m.createdAt).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {isMe && <CheckCheck className="h-3 w-3 text-amber-600" />}
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

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
        className="flex items-center gap-1.5 border-t border-stone-100 bg-white p-2"
      >
        <button
          type="button"
          onClick={() => setShowEmoji((v) => !v)}
          className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100 cursor-pointer"
          title={t('إيموجي', 'Emoji')}
        >
          <Smile className="h-4 w-4" />
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('اكتب رسالة…', 'Type a message…')}
          className="flex-1 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-900 outline-none focus:border-amber-500 focus:bg-white"
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-700 text-white transition hover:bg-amber-800 disabled:opacity-40 cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
