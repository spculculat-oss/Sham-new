/**
 * «ماسنجر شام» Live Call Signaling Server (/ws/messenger-calls).
 *
 * Server-authoritative WebSocket signaling for 1:1 and small-group WebRTC audio/video calls:
 * - Authenticates every WebSocket with the community Bearer session token.
 * - Verifies conversation membership and block rules against PostgreSQL/PGlite.
 * - Relays SDP offers/answers, ICE candidates, and mute/camera/screen-share telemetry.
 * - Logs call start, missed, declined, and ended duration markers into chat history.
 */
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { newId } from './crypto';
import type { Community } from './router';
import { isBlocked, publicUser, USER_COLUMNS, type Ctx } from './service';
import * as svc from './service';

export type CallMode = 'audio' | 'video';

interface ParticipantInfo {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
}

interface ActiveCall {
  callId: string;
  conversationId: string;
  isGroup: boolean;
  conversationTitle: string;
  mode: CallMode;
  callerId: string;
  participants: Map<string, ParticipantInfo>;
  acceptedIds: Set<string>;
  declinedIds: Set<string>;
  createdAt: number;
  connectedAt: number | null;
  systemLoggedEnd: boolean;
}

function sendWs(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function appendCallSystemMessage(ctx: Ctx, conversationId: string, senderId: string, text: string) {
  try {
    await ctx.sql.query(
      `INSERT INTO messages (id, conversation_id, sender_id, kind, body_enc) VALUES ($1, $2, $3, 'system', $4)`,
      [newId('msg'), conversationId, senderId, ctx.vault.seal(text)],
    );
    await ctx.sql.query(`UPDATE conversations SET last_at = clock_timestamp() WHERE id = $1`, [conversationId]);
  } catch (err) {
    console.warn('[messenger-calls] failed to log system call event:', err instanceof Error ? err.message : err);
  }
}

export function attachMessengerCallServer(server: HttpServer, community: Community) {
  const wss = new WebSocketServer({ noServer: true });
  const userSockets = new Map<string, Set<WebSocket>>();
  const socketToUser = new Map<WebSocket, ParticipantInfo>();
  const activeCalls = new Map<string, ActiveCall>();

  const broadcastToUser = (userId: string, payload: Record<string, unknown>, exceptSocket?: WebSocket) => {
    const sockets = userSockets.get(userId);
    if (!sockets) return;
    for (const sock of sockets) {
      if (sock !== exceptSocket) {
        sendWs(sock, payload);
      }
    }
  };

  const broadcastToCall = (call: ActiveCall, payload: Record<string, unknown>, exceptUserId?: string) => {
    for (const uid of call.participants.keys()) {
      if (uid === exceptUserId) continue;
      broadcastToUser(uid, payload);
    }
  };

  const finalizeCall = async (
    call: ActiveCall,
    reason: 'hangup' | 'missed' | 'declined' | 'disconnect',
    byUserId: string,
  ) => {
    if (!activeCalls.has(call.callId)) return;
    activeCalls.delete(call.callId);

    const durationSec = call.connectedAt
      ? Math.max(1, Math.round((Date.now() - call.connectedAt) / 1000))
      : 0;

    broadcastToCall(call, {
      type: 'call:ended',
      callId: call.callId,
      conversationId: call.conversationId,
      reason,
      byUserId,
      durationSec,
    });

    if (!call.systemLoggedEnd) {
      call.systemLoggedEnd = true;
      const ctx = await community.ready();
      if (ctx) {
        const marker =
          reason === 'declined'
            ? 'call_declined'
            : durationSec > 0
            ? `call_ended:${durationSec}`
            : 'call_missed';
        await appendCallSystemMessage(ctx, call.conversationId, call.callerId, marker);
      }
    }
  };

  server.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try {
      const url = new URL(request.url || '', 'http://localhost');
      pathname = url.pathname;
    } catch {
      return;
    }

    if (pathname !== '/ws/messenger-calls') {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', async (ws, request) => {
    let token = '';
    try {
      const url = new URL(request.url || '', 'http://localhost');
      token = (url.searchParams.get('token') || '').trim();
    } catch {
      token = '';
    }

    const ctx = await community.ready();
    const sessionUser = ctx && token ? await svc.authenticate(ctx, token) : undefined;
    if (!ctx || !sessionUser) {
      sendWs(ws, { type: 'error', code: 'UNAUTHENTICATED', message: 'Sign in required for Messenger calls.' });
      ws.close(4401, 'Unauthorized');
      return;
    }

    const [userRow] = await ctx.sql.query(
      `SELECT ${USER_COLUMNS} FROM ${svc.USER_FROM} WHERE u.id = $1`,
      [sessionUser.id],
    );
    const selfInfo: ParticipantInfo = userRow
      ? {
          id: userRow.id,
          name: userRow.name,
          handle: userRow.handle,
          avatar: userRow.avatar || null,
        }
      : {
          id: sessionUser.id,
          name: sessionUser.name,
          handle: sessionUser.handle,
          avatar: null,
        };

    socketToUser.set(ws, selfInfo);
    let set = userSockets.get(selfInfo.id);
    if (!set) {
      set = new Set();
      userSockets.set(selfInfo.id, set);
    }
    set.add(ws);

    sendWs(ws, { type: 'ready', userId: selfInfo.id });

    // If any active ringing call is waiting for this user, surface it right away
    for (const call of activeCalls.values()) {
      if (
        call.participants.has(selfInfo.id) &&
        call.callerId !== selfInfo.id &&
        !call.acceptedIds.has(selfInfo.id) &&
        !call.declinedIds.has(selfInfo.id) &&
        !call.connectedAt
      ) {
        const caller = call.participants.get(call.callerId);
        if (caller) {
          sendWs(ws, {
            type: 'call:incoming',
            callId: call.callId,
            conversationId: call.conversationId,
            mode: call.mode,
            caller,
            isGroup: call.isGroup,
            conversationTitle: call.conversationTitle,
          });
        }
      }
    }

    ws.on('message', async (raw) => {
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, any>;
      } catch {
        return;
      }

      const type = String(msg.type || '');
      const liveCtx = await community.ready();
      if (!liveCtx) return;

      if (type === 'presence:ping') {
        await liveCtx.sql
          .query(`UPDATE users SET last_seen = clock_timestamp() WHERE id = $1`, [selfInfo.id])
          .catch(() => {});
        sendWs(ws, { type: 'presence:pong', serverTime: new Date().toISOString() });
        return;
      }

      if (type === 'call:start') {
        const conversationId = String(msg.conversationId || '').trim();
        const mode: CallMode = msg.mode === 'video' ? 'video' : 'audio';
        if (!conversationId) {
          sendWs(ws, { type: 'call:error', code: 'INVALID_CONVERSATION' });
          return;
        }

        const [membership] = await liveCtx.sql.query(
          `SELECT mb.*, c.kind, c.title FROM members mb JOIN conversations c ON c.id = mb.conversation_id
           WHERE mb.conversation_id = $1 AND mb.user_id = $2 AND mb.left_at IS NULL`,
          [conversationId, selfInfo.id],
        );
        if (!membership) {
          sendWs(ws, { type: 'call:error', code: 'NOT_FOUND' });
          return;
        }

        const memberRows = await liveCtx.sql.query(
          `SELECT ${USER_COLUMNS} FROM members mb JOIN users u ON u.id = mb.user_id LEFT JOIN merchants m ON m.user_id = u.id
           WHERE mb.conversation_id = $1 AND mb.left_at IS NULL`,
          [conversationId],
        );

        const others = memberRows.filter((r) => r.id !== selfInfo.id);
        if (membership.kind === 'direct' && others[0]) {
          if (await isBlocked(liveCtx.sql, selfInfo.id, others[0].id)) {
            sendWs(ws, { type: 'call:error', code: 'BLOCKED' });
            return;
          }
          // Unhide direct chat if the peer had hidden it
          await liveCtx.sql.query(
            `UPDATE members SET left_at = NULL WHERE conversation_id = $1 AND user_id = $2`,
            [conversationId, others[0].id],
          );
        }

        // Prevent duplicate simultaneous call by same caller in same chat
        for (const existing of activeCalls.values()) {
          if (existing.conversationId === conversationId && existing.callerId === selfInfo.id) {
            await finalizeCall(existing, 'hangup', selfInfo.id);
          }
        }

        const participants = new Map<string, ParticipantInfo>();
        for (const row of memberRows) {
          const pub = publicUser(row);
          participants.set(pub.id, {
            id: pub.id,
            name: pub.name,
            handle: pub.handle,
            avatar: pub.avatar,
          });
        }
        if (!participants.has(selfInfo.id)) {
          participants.set(selfInfo.id, selfInfo);
        }

        const callId = newId('call');
        const call: ActiveCall = {
          callId,
          conversationId,
          isGroup: membership.kind === 'group',
          conversationTitle: membership.title || '',
          mode,
          callerId: selfInfo.id,
          participants,
          acceptedIds: new Set([selfInfo.id]),
          declinedIds: new Set(),
          createdAt: Date.now(),
          connectedAt: null,
          systemLoggedEnd: false,
        };
        activeCalls.set(callId, call);

        const onlinePeerIds = others
          .map((o) => String(o.id))
          .filter((uid) => (userSockets.get(uid)?.size || 0) > 0);

        await appendCallSystemMessage(liveCtx, conversationId, selfInfo.id, `call_started:${mode}`);

        sendWs(ws, {
          type: 'call:created',
          callId,
          conversationId,
          mode,
          isGroup: call.isGroup,
          conversationTitle: call.conversationTitle,
          onlinePeerIds,
          peers: others.map((o) => ({
            id: o.id,
            name: o.name,
            handle: o.handle,
            avatar: o.avatar || null,
          })),
        });

        for (const peer of others) {
          broadcastToUser(String(peer.id), {
            type: 'call:incoming',
            callId,
            conversationId,
            mode,
            caller: selfInfo,
            isGroup: call.isGroup,
            conversationTitle: call.conversationTitle,
          });
        }
        return;
      }

      if (type === 'call:accept') {
        const callId = String(msg.callId || '');
        const call = activeCalls.get(callId);
        if (!call || !call.participants.has(selfInfo.id)) {
          sendWs(ws, { type: 'call:ended', callId, reason: 'missed', durationSec: 0 });
          return;
        }
        call.acceptedIds.add(selfInfo.id);
        if (!call.connectedAt) call.connectedAt = Date.now();
        if (msg.mode === 'video' || msg.mode === 'audio') {
          // keep requested media preference for peer UI awareness
        }

        // Dismiss ringing popup on this user's other open tabs
        broadcastToUser(selfInfo.id, { type: 'call:dismiss', callId }, ws);

        // Notify all other accepted participants so WebRTC offer/answer handshake begins
        for (const uid of call.acceptedIds) {
          if (uid === selfInfo.id) continue;
          broadcastToUser(uid, {
            type: 'call:accepted',
            callId,
            conversationId: call.conversationId,
            mode: call.mode,
            peer: selfInfo,
          });
        }
        return;
      }

      if (type === 'call:decline') {
        const callId = String(msg.callId || '');
        const call = activeCalls.get(callId);
        if (!call || !call.participants.has(selfInfo.id)) return;
        call.declinedIds.add(selfInfo.id);
        broadcastToUser(selfInfo.id, { type: 'call:dismiss', callId }, ws);

        const remainingCallees = [...call.participants.keys()].filter(
          (uid) => uid !== call.callerId && !call.declinedIds.has(uid),
        );
        if (!call.isGroup || remainingCallees.length === 0) {
          await finalizeCall(call, 'declined', selfInfo.id);
        }
        return;
      }

      if (type === 'call:signal') {
        const callId = String(msg.callId || '');
        const toUserId = String(msg.toUserId || '');
        const signalType = String(msg.signalType || '');
        const call = activeCalls.get(callId);
        if (!call || !call.participants.has(selfInfo.id) || !call.participants.has(toUserId)) return;
        if (!['offer', 'answer', 'ice'].includes(signalType)) return;

        broadcastToUser(toUserId, {
          type: 'call:signal',
          callId,
          fromUserId: selfInfo.id,
          signalType,
          payload: msg.payload,
        });
        return;
      }

      if (type === 'call:media-state') {
        const callId = String(msg.callId || '');
        const call = activeCalls.get(callId);
        if (!call || !call.participants.has(selfInfo.id)) return;
        broadcastToCall(
          call,
          {
            type: 'call:media-state',
            callId,
            userId: selfInfo.id,
            audioMuted: Boolean(msg.audioMuted),
            videoOff: Boolean(msg.videoOff),
            screenSharing: Boolean(msg.screenSharing),
          },
          selfInfo.id,
        );
        return;
      }

      if (type === 'call:end') {
        const callId = String(msg.callId || '');
        const call = activeCalls.get(callId);
        if (!call || !call.participants.has(selfInfo.id)) return;
        await finalizeCall(call, call.connectedAt ? 'hangup' : 'missed', selfInfo.id);
      }
    });

    ws.on('close', async () => {
      const info = socketToUser.get(ws);
      socketToUser.delete(ws);
      if (!info) return;
      const setForUser = userSockets.get(info.id);
      if (setForUser) {
        setForUser.delete(ws);
        if (setForUser.size === 0) {
          userSockets.delete(info.id);
          // Clean up any active call where this user was caller or sole connected peer
          for (const call of activeCalls.values()) {
            if (!call.participants.has(info.id)) continue;
            if (call.callerId === info.id || (!call.isGroup && call.acceptedIds.has(info.id))) {
              await finalizeCall(call, 'disconnect', info.id);
            }
          }
        }
      }
    });
  });

  return wss;
}
