/**
 * Real-time WebRTC + WebSocket signaling hook for «ماسنجر شام» live audio & video calls.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, isStaticHosting } from '../utils/api';
import { getSessionToken, type PublicUser } from './api';
import type { SessionState } from './session';
import { tx, type Lang } from './ui';

export type CallMode = 'audio' | 'video';

export interface CallPeerInfo {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
}

export interface IncomingCallOffer {
  callId: string;
  conversationId: string;
  mode: CallMode;
  caller: CallPeerInfo;
  isGroup: boolean;
  conversationTitle: string;
}

export interface PeerMediaState {
  audioMuted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
}

export interface ActiveCallState {
  callId: string;
  conversationId: string;
  mode: CallMode;
  direction: 'outgoing' | 'incoming';
  status: 'ringing' | 'connecting' | 'connected';
  isGroup: boolean;
  conversationTitle: string;
  peers: CallPeerInfo[];
  onlinePeersCount: number;
  startedAt: number;
  connectedAt: number | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  peerMediaState: Record<string, PeerMediaState>;
  audioMuted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function wsCallUrl(token: string): string {
  const base = API_BASE
    ? API_BASE.replace(/^http/i, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  return `${base}/ws/messenger-calls?token=${encodeURIComponent(token)}`;
}

/** Gentle synthesized Web Audio chime for ringing / outgoing dial tone (no external mp3 dependencies). */
function startRingTone(kind: 'incoming' | 'outgoing'): () => void {
  if (typeof window === 'undefined') return () => {};
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let ctx: AudioContext | null = null;

  const playPulse = () => {
    if (stopped) return;
    try {
      ctx ||= new Ctx();
      if (ctx.state === 'suspended') void ctx.resume();
      const now = ctx.currentTime;
      const freqs = kind === 'incoming' ? [523.25, 659.25] : [440, 480];
      freqs.forEach((freq, idx) => {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);
        gain.gain.setValueAtTime(0.0001, now + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.045, now + idx * 0.14 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.36);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.38);
      });
    } catch {
      // Ignore autoplay restriction until user interacts
    }
  };

  playPulse();
  timer = setInterval(playPulse, kind === 'incoming' ? 2200 : 2800);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
    }
  };
}

export function useMessengerCall(session: SessionState, lang: Lang, toast: (msg: string) => void) {
  const t = tx(lang);
  const [wsReady, setWsReady] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallOffer | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const activeCallRef = useRef<ActiveCallState | null>(null);
  const incomingRef = useRef<IncomingCallOffer | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const stopRingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    incomingRef.current = incomingCall;
  }, [incomingCall]);

  const stopRing = useCallback(() => {
    if (stopRingRef.current) {
      stopRingRef.current();
      stopRingRef.current = null;
    }
  }, []);

  const cleanupMediaAndPeers = useCallback(() => {
    stopRing();
    for (const pc of pcsRef.current.values()) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {}
    }
    pcsRef.current.clear();
    pendingIceRef.current.clear();

    const cur = activeCallRef.current;
    cur?.localStream?.getTracks().forEach((tr) => {
      try {
        tr.stop();
      } catch {}
    });
    cameraTrackRef.current?.stop();
    cameraTrackRef.current = null;
    screenStreamRef.current?.getTracks().forEach((tr) => {
      try {
        tr.stop();
      } catch {}
    });
    screenStreamRef.current = null;
  }, [stopRing]);

  const sendWs = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const createPeerConnection = useCallback(
    (callId: string, peerId: string): RTCPeerConnection => {
      const existing = pcsRef.current.get(peerId);
      if (existing) {
        try {
          existing.close();
        } catch {}
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcsRef.current.set(peerId, pc);

      const localStream = activeCallRef.current?.localStream;
      if (localStream) {
        for (const track of localStream.getTracks()) {
          pc.addTrack(track, localStream);
        }
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendWs({
            type: 'call:signal',
            callId,
            toUserId: peerId,
            signalType: 'ice',
            payload: e.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (e) => {
        const stream = e.streams[0] || new MediaStream([e.track]);
        setActiveCall((prev) => {
          if (!prev || prev.callId !== callId) return prev;
          return {
            ...prev,
            status: 'connected',
            connectedAt: prev.connectedAt || Date.now(),
            remoteStreams: { ...prev.remoteStreams, [peerId]: stream },
          };
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          stopRing();
          setActiveCall((prev) =>
            prev && prev.callId === callId
              ? { ...prev, status: 'connected', connectedAt: prev.connectedAt || Date.now() }
              : prev,
          );
        }
      };

      return pc;
    },
    [sendWs, stopRing],
  );

  const acquireLocalStream = useCallback(
    async (mode: CallMode): Promise<{ stream: MediaStream; videoEnabled: boolean }> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('NO_MEDIA_DEVICES');
      }
      if (mode === 'video') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          });
          cameraTrackRef.current = stream.getVideoTracks()[0] || null;
          return { stream, videoEnabled: true };
        } catch {
          // Camera unavailable/denied — try audio-only fallback cleanly
          const audioOnly = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          toast(t('تعذر فتح الكاميرا — تم المتابعة بالصوت فقط', 'Camera unavailable — continuing with audio'));
          return { stream: audioOnly, videoEnabled: false };
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      return { stream, videoEnabled: false };
    },
    [t, toast],
  );

  // Connect signaling WebSocket whenever community member is signed in
  useEffect(() => {
    if (session.status !== 'member' || isStaticHosting) {
      setWsReady(false);
      return;
    }
    const token = getSessionToken();
    if (!token) return;

    let closedByEffect = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let attempt = 0;

    const connect = () => {
      if (closedByEffect) return;
      const ws = new WebSocket(wsCallUrl(token));
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setWsReady(true);
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'presence:ping' }));
          }
        }, 25_000);
      };

      ws.onmessage = async (event) => {
        let msg: Record<string, any>;
        try {
          msg = JSON.parse(String(event.data || '{}')) as Record<string, any>;
        } catch {
          return;
        }

        const type = String(msg.type || '');

        if (type === 'call:incoming') {
          if (activeCallRef.current) {
            // Busy in another call: auto-decline gently
            ws.send(JSON.stringify({ type: 'call:decline', callId: msg.callId }));
            return;
          }
          setIncomingCall({
            callId: String(msg.callId),
            conversationId: String(msg.conversationId),
            mode: msg.mode === 'video' ? 'video' : 'audio',
            caller: msg.caller as CallPeerInfo,
            isGroup: Boolean(msg.isGroup),
            conversationTitle: String(msg.conversationTitle || ''),
          });
          stopRing();
          stopRingRef.current = startRingTone('incoming');
          return;
        }

        if (type === 'call:dismiss') {
          if (incomingRef.current?.callId === msg.callId) {
            stopRing();
            setIncomingCall(null);
          }
          return;
        }

        if (type === 'call:created') {
          const onlineCount = Array.isArray(msg.onlinePeerIds) ? msg.onlinePeerIds.length : 0;
          setActiveCall((prev) =>
            prev && prev.conversationId === msg.conversationId
              ? {
                  ...prev,
                  callId: String(msg.callId),
                  peers: Array.isArray(msg.peers) ? (msg.peers as CallPeerInfo[]) : prev.peers,
                  onlinePeersCount: onlineCount,
                }
              : prev,
          );
          if (onlineCount === 0) {
            toast(t('الطرف الآخر غير متصل الآن — بانتظار دخوله', 'Peer is currently offline — waiting to join'));
          }
          return;
        }

        if (type === 'call:accepted') {
          const cur = activeCallRef.current;
          const peer = msg.peer as CallPeerInfo | undefined;
          if (!cur || cur.callId !== msg.callId || !peer) return;
          stopRing();
          setActiveCall((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'connecting',
                  connectedAt: prev.connectedAt || Date.now(),
                  peers: prev.peers.some((p) => p.id === peer.id) ? prev.peers : [...prev.peers, peer],
                }
              : prev,
          );
          // Caller creates offer to the accepting peer
          try {
            const pc = createPeerConnection(cur.callId, peer.id);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(
              JSON.stringify({
                type: 'call:signal',
                callId: cur.callId,
                toUserId: peer.id,
                signalType: 'offer',
                payload: offer,
              }),
            );
          } catch (err) {
            console.error('[messenger-call] offer failed:', err);
          }
          return;
        }

        if (type === 'call:signal') {
          const cur = activeCallRef.current;
          const fromUserId = String(msg.fromUserId || '');
          const signalType = String(msg.signalType || '');
          if (!cur || cur.callId !== msg.callId || !fromUserId) return;

          if (signalType === 'offer') {
            try {
              const pc = pcsRef.current.get(fromUserId) || createPeerConnection(cur.callId, fromUserId);
              await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
              const queued = pendingIceRef.current.get(fromUserId) || [];
              pendingIceRef.current.delete(fromUserId);
              for (const cand of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              }
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws.send(
                JSON.stringify({
                  type: 'call:signal',
                  callId: cur.callId,
                  toUserId: fromUserId,
                  signalType: 'answer',
                  payload: answer,
                }),
              );
            } catch (err) {
              console.error('[messenger-call] answer failed:', err);
            }
          } else if (signalType === 'answer') {
            const pc = pcsRef.current.get(fromUserId);
            if (!pc) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
              const queued = pendingIceRef.current.get(fromUserId) || [];
              pendingIceRef.current.delete(fromUserId);
              for (const cand of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
              }
            } catch (err) {
              console.error('[messenger-call] remote answer failed:', err);
            }
          } else if (signalType === 'ice') {
            const pc = pcsRef.current.get(fromUserId);
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(msg.payload)).catch(() => {});
            } else {
              const list = pendingIceRef.current.get(fromUserId) || [];
              list.push(msg.payload);
              pendingIceRef.current.set(fromUserId, list);
            }
          }
          return;
        }

        if (type === 'call:media-state') {
          const cur = activeCallRef.current;
          if (!cur || cur.callId !== msg.callId) return;
          const uid = String(msg.userId || '');
          setActiveCall((prev) =>
            prev
              ? {
                  ...prev,
                  peerMediaState: {
                    ...prev.peerMediaState,
                    [uid]: {
                      audioMuted: Boolean(msg.audioMuted),
                      videoOff: Boolean(msg.videoOff),
                      screenSharing: Boolean(msg.screenSharing),
                    },
                  },
                }
              : prev,
          );
          return;
        }

        if (type === 'call:ended') {
          if (incomingRef.current?.callId === msg.callId) {
            stopRing();
            setIncomingCall(null);
          }
          if (activeCallRef.current?.callId === msg.callId) {
            cleanupMediaAndPeers();
            setActiveCall(null);
            const reason = String(msg.reason || 'hangup');
            const sec = Number(msg.durationSec || 0);
            if (reason === 'declined') {
              toast(t('تم رفض المكالمة', 'Call declined'));
            } else if (reason === 'missed') {
              toast(t('لم يتم الرد على المكالمة', 'Call unanswered'));
            } else if (sec > 0) {
              toast(t(`انتهت المكالمة (${sec} ث)`, `Call ended (${sec}s)`));
            } else {
              toast(t('انتهت المكالمة', 'Call ended'));
            }
          }
          return;
        }

        if (type === 'call:error') {
          cleanupMediaAndPeers();
          setActiveCall(null);
          toast(
            msg.code === 'BLOCKED'
              ? t('لا يمكن الاتصال بهذا الحساب', 'Cannot call this account')
              : t('تعذر بدء المكالمة الآن', 'Unable to place call right now'),
          );
        }
      };

      ws.onclose = () => {
        setWsReady(false);
        if (pingTimer) clearInterval(pingTimer);
        if (!closedByEffect) {
          attempt += 1;
          const delay = Math.min(10_000, 1200 * attempt);
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsReady(false);
    };
  }, [session.status, cleanupMediaAndPeers, createPeerConnection, stopRing, t, toast]);

  // Cleanup active call when component unmounts
  useEffect(() => () => cleanupMediaAndPeers(), [cleanupMediaAndPeers]);

  const startCall = useCallback(
    async (
      conversationId: string,
      mode: CallMode,
      peerPreview?: PublicUser | null,
      meta?: { isGroup?: boolean; title?: string },
    ) => {
      if (activeCallRef.current) {
        toast(t('لديك مكالمة جارية بالفعل', 'You already have an active call'));
        return;
      }
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        toast(t('جاري الاتصال بخادم المكالمات المباشرة، حاول خلال ثوانٍ', 'Connecting to call server, try again in a second'));
        return;
      }

      try {
        const { stream, videoEnabled } = await acquireLocalStream(mode);
        const tempId = `pending_${Date.now()}`;
        const initialPeers: CallPeerInfo[] = peerPreview
          ? [{ id: peerPreview.id, name: peerPreview.name, handle: peerPreview.handle, avatar: peerPreview.avatar }]
          : [];

        setActiveCall({
          callId: tempId,
          conversationId,
          mode,
          direction: 'outgoing',
          status: 'ringing',
          isGroup: Boolean(meta?.isGroup),
          conversationTitle: meta?.title || '',
          peers: initialPeers,
          onlinePeersCount: 1,
          startedAt: Date.now(),
          connectedAt: null,
          localStream: stream,
          remoteStreams: {},
          peerMediaState: {},
          audioMuted: false,
          videoOff: !videoEnabled,
          screenSharing: false,
        });

        stopRing();
        stopRingRef.current = startRingTone('outgoing');

        sendWs({ type: 'call:start', conversationId, mode });
      } catch {
        toast(t('يرجى السماح بالوصول للميكروفون لإجراء المكالمة', 'Please allow microphone access to start a live call'));
      }
    },
    [acquireLocalStream, sendWs, stopRing, t, toast],
  );

  const acceptIncomingCall = useCallback(
    async (overrideMode?: CallMode) => {
      const offer = incomingRef.current;
      if (!offer) return;
      const mode = overrideMode || offer.mode;
      stopRing();

      try {
        const { stream, videoEnabled } = await acquireLocalStream(mode);
        setIncomingCall(null);
        setActiveCall({
          callId: offer.callId,
          conversationId: offer.conversationId,
          mode,
          direction: 'incoming',
          status: 'connecting',
          isGroup: offer.isGroup,
          conversationTitle: offer.conversationTitle,
          peers: [offer.caller],
          onlinePeersCount: 1,
          startedAt: Date.now(),
          connectedAt: Date.now(),
          localStream: stream,
          remoteStreams: {},
          peerMediaState: {},
          audioMuted: false,
          videoOff: !videoEnabled,
          screenSharing: false,
        });

        sendWs({ type: 'call:accept', callId: offer.callId, mode });
      } catch {
        toast(t('تعذر الوصول للميكروفون للرد على المكالمة', 'Microphone access is required to answer'));
      }
    },
    [acquireLocalStream, sendWs, stopRing, t, toast],
  );

  const declineIncomingCall = useCallback(() => {
    const offer = incomingRef.current;
    if (!offer) return;
    stopRing();
    setIncomingCall(null);
    sendWs({ type: 'call:decline', callId: offer.callId });
  }, [sendWs, stopRing]);

  const endCall = useCallback(() => {
    const cur = activeCallRef.current;
    if (!cur) return;
    sendWs({ type: 'call:end', callId: cur.callId });
    cleanupMediaAndPeers();
    setActiveCall(null);
  }, [cleanupMediaAndPeers, sendWs]);

  const syncMediaState = useCallback(
    (audioMuted: boolean, videoOff: boolean, screenSharing: boolean) => {
      const cur = activeCallRef.current;
      if (!cur) return;
      sendWs({
        type: 'call:media-state',
        callId: cur.callId,
        audioMuted,
        videoOff,
        screenSharing,
      });
    },
    [sendWs],
  );

  const toggleMute = useCallback(() => {
    const cur = activeCallRef.current;
    if (!cur?.localStream) return;
    const nextMuted = !cur.audioMuted;
    cur.localStream.getAudioTracks().forEach((tr) => {
      tr.enabled = !nextMuted;
    });
    setActiveCall((prev) => (prev ? { ...prev, audioMuted: nextMuted } : prev));
    syncMediaState(nextMuted, cur.videoOff, cur.screenSharing);
  }, [syncMediaState]);

  const toggleCamera = useCallback(async () => {
    const cur = activeCallRef.current;
    if (!cur?.localStream) return;

    const existingVideo = cur.localStream.getVideoTracks()[0];
    if (existingVideo) {
      const nextOff = !cur.videoOff;
      existingVideo.enabled = !nextOff;
      setActiveCall((prev) => (prev ? { ...prev, videoOff: nextOff, mode: nextOff ? prev.mode : 'video' } : prev));
      syncMediaState(cur.audioMuted, nextOff, cur.screenSharing);
      return;
    }

    // Upgrade audio-only call by acquiring camera
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      const camTrack = camStream.getVideoTracks()[0];
      if (!camTrack) return;
      cameraTrackRef.current = camTrack;
      cur.localStream.addTrack(camTrack);
      for (const [peerId, pc] of pcsRef.current.entries()) {
        pc.addTrack(camTrack, cur.localStream);
        if (pc.signalingState === 'stable') {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendWs({ type: 'call:signal', callId: cur.callId, toUserId: peerId, signalType: 'offer', payload: offer });
        }
      }
      setActiveCall((prev) => (prev ? { ...prev, videoOff: false, mode: 'video' } : prev));
      syncMediaState(cur.audioMuted, false, cur.screenSharing);
    } catch {
      toast(t('تعذر تشغيل الكاميرا على هذا الجهاز', 'Camera unavailable on this device'));
    }
  }, [sendWs, syncMediaState, t, toast]);

  const toggleScreenShare = useCallback(async () => {
    const cur = activeCallRef.current;
    if (!cur?.localStream) return;

    if (cur.screenSharing) {
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current = null;
      const cam = cameraTrackRef.current;
      for (const pc of pcsRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(cam || null);
      }
      setActiveCall((prev) => (prev ? { ...prev, screenSharing: false } : prev));
      syncMediaState(cur.audioMuted, cur.videoOff, false);
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast(t('مشاركة الشاشة غير مدعومة في هذا المتصفح', 'Screen sharing not supported in this browser'));
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = display.getVideoTracks()[0];
      if (!screenTrack) return;
      screenStreamRef.current = display;
      for (const [peerId, pc] of pcsRef.current.entries()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, cur.localStream);
          if (pc.signalingState === 'stable') {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendWs({ type: 'call:signal', callId: cur.callId, toUserId: peerId, signalType: 'offer', payload: offer });
          }
        }
      }
      screenTrack.onended = () => {
        if (activeCallRef.current?.screenSharing) {
          void toggleScreenShare();
        }
      };
      setActiveCall((prev) => (prev ? { ...prev, screenSharing: true, mode: 'video' } : prev));
      syncMediaState(cur.audioMuted, cur.videoOff, true);
    } catch {
      // User cancelled screen share picker
    }
  }, [sendWs, syncMediaState, t, toast]);

  return {
    wsReady,
    incomingCall,
    activeCall,
    startCall,
    acceptIncomingCall,
    declineIncomingCall,
    endCall,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
  };
}
