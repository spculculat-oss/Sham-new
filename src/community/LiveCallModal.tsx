import { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  Phone,
  PhoneOff,
  Radio,
  Video,
  VideoOff,
} from 'lucide-react';
import { Avatar, tx, type Lang } from './ui';
import type { ActiveCallState, CallMode, IncomingCallOffer } from './useMessengerCall';

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function StreamMedia({
  stream,
  muted = false,
  className = '',
  mirror = false,
}: {
  stream: MediaStream | null | undefined;
  muted?: boolean;
  className?: string;
  mirror?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    void el.play().catch(() => {});
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={`${className} ${mirror ? '-scale-x-100' : ''}`}
    />
  );
}

export function IncomingCallBanner({
  lang,
  call,
  onAccept,
  onDecline,
}: {
  lang: Lang;
  call: IncomingCallOffer;
  onAccept: (mode?: CallMode) => void;
  onDecline: () => void;
}) {
  const t = tx(lang);

  return (
    <div className="fixed top-4 end-4 z-[70] w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-amber-500/50 bg-stone-950/95 p-4 text-white shadow-2xl backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <span className="absolute -inset-1 animate-ping rounded-full bg-amber-400/25" />
          <Avatar user={call.caller} size={48} ring />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            <span>
              {call.mode === 'video'
                ? t('مكالمة فيديو واردة', 'Incoming live video call')
                : t('مكالمة صوتية واردة', 'Incoming live voice call')}
            </span>
          </p>
          <p className="truncate text-sm font-black text-white">{call.caller.name}</p>
          <p className="truncate text-[11px] text-stone-400">
            {call.isGroup && call.conversationTitle ? call.conversationTitle : `@${call.caller.handle}`}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onAccept('audio')}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 cursor-pointer"
        >
          <Phone className="h-4 w-4" />
          <span>{t('رد صوتي', 'Audio')}</span>
        </button>

        {call.mode === 'video' && (
          <button
            type="button"
            onClick={() => onAccept('video')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-stone-950 transition hover:bg-amber-400 cursor-pointer"
          >
            <Video className="h-4 w-4" />
            <span>{t('فيديو', 'Video')}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onDecline}
          className="flex items-center justify-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-500 cursor-pointer"
          title={t('رفض', 'Decline')}
        >
          <PhoneOff className="h-4 w-4" />
          <span>{t('رفض', 'Decline')}</span>
        </button>
      </div>
    </div>
  );
}

export function LiveCallStage({
  lang,
  call,
  onEnd,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
}: {
  lang: Lang;
  call: ActiveCallState;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
}) {
  const t = tx(lang);
  const [elapsed, setElapsed] = useState(0);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const start = call.connectedAt || call.startedAt;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [call.connectedAt, call.startedAt]);

  const remoteEntries = Object.entries(call.remoteStreams);
  const primaryPeer = call.peers[0];
  const title =
    call.isGroup && call.conversationTitle
      ? call.conversationTitle
      : primaryPeer?.name || t('مكالمة ماسنجر شام', 'Sham Messenger Call');

  const statusText =
    call.status === 'connected'
      ? `${t('متصل مباشرة', 'Live')} · ${formatTimer(elapsed)}`
      : call.status === 'connecting'
      ? t('جاري الربط المباشر…', 'Connecting audio/video…')
      : call.onlinePeersCount === 0
      ? t('جاري الرنين (الطرف الآخر غير متصل الآن)…', 'Ringing (peer currently offline)…')
      : t('جاري الرنين… في انتظار الرد', 'Ringing… waiting for answer');

  const hasLocalVideo = Boolean(call.localStream?.getVideoTracks().some((tr) => tr.enabled)) && (!call.videoOff || call.screenSharing);

  if (compact) {
    return (
      <div className="fixed bottom-4 start-4 z-[70] flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-stone-950/95 px-4 py-3 text-white shadow-2xl backdrop-blur-md">
        {primaryPeer && <Avatar user={primaryPeer} size={36} ring />}
        <div className="min-w-0">
          <p className="max-w-[160px] truncate text-xs font-bold text-white">{title}</p>
          <p className="font-mono text-[11px] tabular-nums text-amber-400">{statusText}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleMute}
            className={`rounded-full p-2 cursor-pointer ${call.audioMuted ? 'bg-rose-600 text-white' : 'bg-stone-800 text-stone-200 hover:bg-stone-700'}`}
            title={call.audioMuted ? t('تشغيل المايك', 'Unmute') : t('كتم المايك', 'Mute')}
          >
            {call.audioMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setCompact(false)}
            className="rounded-full bg-stone-800 p-2 text-stone-200 hover:bg-stone-700 cursor-pointer"
            title={t('تكبير نافذة المكالمة', 'Expand call')}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onEnd}
            className="rounded-full bg-rose-600 p-2 text-white hover:bg-rose-500 cursor-pointer"
            title={t('إنهاء المكالمة', 'End call')}
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
        {/* Keep remote audio playing while minimized */}
        <div className="hidden">
          {remoteEntries.map(([uid, stream]) => (
            <StreamMedia key={uid} stream={stream} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-6">
      <div className="relative flex h-[min(86vh,680px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-amber-500/35 bg-gradient-to-b from-stone-900 via-stone-950 to-black text-white shadow-2xl">
        {/* Top Call Bar */}
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              {call.mode === 'video' ? <Video className="h-4.5 w-4.5" /> : <Phone className="h-4.5 w-4.5" />}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black text-white sm:text-base">{title}</h3>
              <p className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-amber-300">
                <Radio className={`h-3 w-3 ${call.status === 'connected' ? 'text-emerald-400' : 'animate-pulse text-amber-400'}`} />
                <span>{statusText}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCompact(true)}
            className="rounded-xl border border-white/15 bg-white/5 p-2 text-stone-300 hover:bg-white/10 hover:text-white cursor-pointer"
            title={t('تصغير المكالمة', 'Minimize')}
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </header>

        {/* Main Media Stage */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
          {remoteEntries.length > 0 ? (
            <div
              className={`grid h-full w-full gap-3 ${
                remoteEntries.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
              }`}
            >
              {remoteEntries.map(([uid, stream]) => {
                const peerInfo = call.peers.find((p) => p.id === uid) || primaryPeer;
                const peerState = call.peerMediaState[uid];
                const hasRemoteVideo =
                  stream.getVideoTracks().some((tr) => tr.enabled && tr.readyState === 'live') &&
                  !peerState?.videoOff;

                return (
                  <div
                    key={uid}
                    className="relative flex h-full min-h-[220px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-stone-900/90"
                  >
                    <StreamMedia
                      stream={stream}
                      className={hasRemoteVideo ? 'h-full w-full object-cover' : 'h-0 w-0 opacity-0'}
                    />
                    {!hasRemoteVideo && (
                      <div className="flex flex-col items-center gap-3 text-center">
                        <div className="relative">
                          <span className="absolute -inset-3 rounded-full border border-amber-400/25 animate-pulse" />
                          {peerInfo && <Avatar user={peerInfo} size={88} ring />}
                        </div>
                        <p className="text-base font-bold text-white">{peerInfo?.name || title}</p>
                        <p className="text-xs text-stone-400">{t('مكالمة صوتية مشفّرة', 'Live encrypted audio')}</p>
                      </div>
                    )}

                    <div className="absolute bottom-3 start-3 flex items-center gap-2 rounded-lg bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur-xs">
                      <span className="font-semibold">{peerInfo?.name || title}</span>
                      {peerState?.audioMuted && <MicOff className="h-3.5 w-3.5 text-rose-400" />}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="relative">
                <span className="absolute -inset-4 rounded-full border border-amber-500/30 animate-ping" />
                <span className="absolute -inset-2 rounded-full border border-amber-400/40" />
                {primaryPeer ? (
                  <Avatar user={primaryPeer} size={108} ring />
                ) : (
                  <span className="flex h-24 w-24 items-center justify-center rounded-full bg-amber-900/40 text-amber-300">
                    <Phone className="h-10 w-10" />
                  </span>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-lg font-black text-white">{title}</p>
                <p className="text-xs text-stone-400">{statusText}</p>
              </div>
            </div>
          )}

          {/* Local Camera Picture-in-Picture */}
          {hasLocalVideo && call.localStream && (
            <div className="absolute bottom-5 end-5 z-20 h-32 w-44 overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-black shadow-xl sm:h-36 sm:w-52">
              <StreamMedia
                stream={call.localStream}
                muted
                mirror={!call.screenSharing}
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-1.5 start-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {t('أنت', 'You')}
              </span>
            </div>
          )}
        </div>

        {/* Bottom Controls Bar */}
        <footer className="flex items-center justify-center gap-3 border-t border-white/10 bg-stone-950/90 px-4 py-4">
          <button
            type="button"
            onClick={onToggleMute}
            className={`flex h-12 items-center gap-2 rounded-2xl px-4 text-xs font-bold transition cursor-pointer ${
              call.audioMuted
                ? 'bg-rose-600/20 text-rose-300 border border-rose-500/50 hover:bg-rose-600/30'
                : 'bg-stone-800 text-stone-100 hover:bg-stone-700'
            }`}
          >
            {call.audioMuted ? <MicOff className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
            <span className="hidden sm:inline">
              {call.audioMuted ? t('إلغاء الكتم', 'Unmute') : t('كتم الصوت', 'Mute')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void onToggleCamera()}
            className={`flex h-12 items-center gap-2 rounded-2xl px-4 text-xs font-bold transition cursor-pointer ${
              call.videoOff
                ? 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                : 'bg-amber-500/20 text-amber-300 border border-amber-400/50 hover:bg-amber-500/30'
            }`}
          >
            {call.videoOff ? <VideoOff className="h-4.5 w-4.5" /> : <Video className="h-4.5 w-4.5" />}
            <span className="hidden sm:inline">
              {call.videoOff ? t('تشغيل الكاميرا', 'Camera On') : t('إيقاف الكاميرا', 'Camera Off')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void onToggleScreenShare()}
            className={`flex h-12 items-center gap-2 rounded-2xl px-4 text-xs font-bold transition cursor-pointer ${
              call.screenSharing
                ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/50'
                : 'bg-stone-800 text-stone-100 hover:bg-stone-700'
            }`}
          >
            <MonitorUp className="h-4.5 w-4.5" />
            <span className="hidden sm:inline">
              {call.screenSharing ? t('إيقاف المشاركة', 'Stop Share') : t('مشاركة الشاشة', 'Share Screen')}
            </span>
          </button>

          <button
            type="button"
            onClick={onEnd}
            className="flex h-12 items-center gap-2 rounded-2xl bg-rose-600 px-5 text-xs font-black text-white shadow-lg shadow-rose-900/40 transition hover:bg-rose-500 cursor-pointer"
          >
            <PhoneOff className="h-4.5 w-4.5" />
            <span>{t('إنهاء', 'End Call')}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
