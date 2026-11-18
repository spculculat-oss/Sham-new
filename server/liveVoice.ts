import type { Server as HttpServer } from 'node:http';
import { GoogleGenAI, Modality } from '@google/genai';
import { WebSocketServer, type WebSocket } from 'ws';

const LIVE_MODEL = 'gemini-3.8-live';
const ALLOWED_VOICES = new Set(['Charon', 'Kore', 'Zephyr', 'Puck', 'Fenrir']);

function buildLiveSystemInstruction(lang: string): string {
  const isAr = lang === 'ar';
  return isAr
    ? `أنت «الخبير شاهين»، شيخ العطارين في منصة «صمم عطرك مع شام». تتحدث في مكالمة صوتية مباشرة باللغة العربية الفصيحة الواضحة أو اللهجة البيضاء المفهومة.
قواعد أساسية:
- قدّم إجابات صوتية مركزة، دافئة، وعملية حول تركيب العطور، التراكيز (Extrait / EDP / EDT)، حسابات الكحول والمثبتات، والنوتات العطرية.
- لا تذكر أبداً أسماء شركات أو نماذج ذكاء اصطناعي؛ هويتك هي «الخبير شاهين» فقط.
- تحدّث بجمل طبيعية قصيرة نسبياً تناسب الحوار الصوتي المباشر.`
    : `You are "Master Perfumer Shahin" from "Design Your Perfume with Sham". You are speaking in a live real-time voice consultation in language "${lang}".
Core rules:
- Give warm, focused, practical spoken perfumery advice on concentrations, accords, alcohol dilution, maceration, and raw materials.
- Never mention AI model names or vendors; your sole identity is Master Perfumer Shahin.
- Keep spoken responses conversational, clear, and concise for natural back-and-forth voice dialogue.`;
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/**
 * Attaches a WebSocket upgrade bridge at `/ws/live` bridging browser PCM audio
 * (16kHz input / 24kHz output) to @google/genai `gemini-3.8-live`.
 */
export function attachLiveVoiceServer(
  server: HttpServer,
  env: Record<string, string | undefined> = process.env,
) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try {
      const url = new URL(request.url || '', 'http://localhost');
      pathname = url.pathname;
    } catch {
      return;
    }

    if (pathname !== '/ws/live') {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', async (ws, request) => {
    let closed = false;
    let liveSession: any = null;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      try {
        liveSession?.close?.();
      } catch {
        // Ignore session close errors on teardown
      }
      liveSession = null;
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
        try {
          ws.close();
        } catch {
          // Ignore socket close error
        }
      }
    };

    const apiKey = (env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      sendJson(ws, {
        type: 'error',
        code: 'NOT_CONFIGURED',
        message: 'Live voice service is not configured on the server.',
      });
      cleanup();
      return;
    }

    let voiceName = 'Charon';
    let lang = 'ar';
    try {
      const url = new URL(request.url || '', 'http://localhost');
      const requestedVoice = url.searchParams.get('voice') || 'Charon';
      if (ALLOWED_VOICES.has(requestedVoice)) {
        voiceName = requestedVoice;
      }
      const requestedLang = (url.searchParams.get('lang') || 'ar').trim().slice(0, 12);
      if (requestedLang) {
        lang = requestedLang;
      }
    } catch {
      // keep defaults
    }

    ws.on('close', cleanup);
    ws.on('error', cleanup);

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      liveSession = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: buildLiveSystemInstruction(lang),
        },
        callbacks: {
          onopen: () => {
            sendJson(ws, { type: 'ready', voice: voiceName, lang });
          },
          onmessage: (msg: any) => {
            if (closed || ws.readyState !== ws.OPEN) return;
            const sc = msg?.serverContent;
            if (!sc) return;

            if (sc.interrupted) {
              sendJson(ws, { type: 'interrupted' });
            }
            if (sc.inputTranscription?.text) {
              sendJson(ws, { type: 'inputTranscript', text: sc.inputTranscription.text });
            }
            if (sc.outputTranscription?.text) {
              sendJson(ws, { type: 'outputTranscript', text: sc.outputTranscription.text });
            }
            const parts = sc.modelTurn?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (part?.inlineData?.data && String(part.inlineData.mimeType || '').startsWith('audio/')) {
                  sendJson(ws, {
                    type: 'audio',
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                  });
                }
              }
            }
            if (sc.turnComplete) {
              sendJson(ws, { type: 'turnComplete' });
            }
          },
          onerror: (err: any) => {
            console.error('[Live Voice] Session error:', err?.message || err);
            sendJson(ws, {
              type: 'error',
              code: 'LIVE_SESSION_ERROR',
              message: lang === 'ar'
                ? 'تعذر استمرار الجلسة الصوتية المباشرة، يرجى إعادة المحاولة.'
                : 'Live voice session encountered an error.',
            });
            cleanup();
          },
          onclose: () => {
            cleanup();
          },
        },
      });
    } catch (error: any) {
      const msg = String(error?.message || error || '');
      const isQuota = error?.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg);
      console.error('[Live Voice] Connect failed:', msg.slice(0, 200));
      sendJson(ws, {
        type: 'error',
        code: isQuota ? 'QUOTA_EXHAUSTED' : 'LIVE_CONNECT_FAILED',
        message: isQuota
          ? (lang === 'ar' ? 'تم استهلاك الحصة المؤقتة، حاول بعد قليل.' : 'Voice quota reached temporarily.')
          : (lang === 'ar' ? 'تعذر بدء المكالمة الصوتية المباشرة.' : 'Unable to start live voice session.'),
      });
      cleanup();
      return;
    }

    ws.on('message', (raw) => {
      if (closed || !liveSession) return;
      try {
        const parsed = JSON.parse(raw.toString()) as {
          type?: string;
          data?: string;
          text?: string;
        };
        if (parsed.type === 'audio' && typeof parsed.data === 'string' && parsed.data) {
          liveSession.sendRealtimeInput({
            audio: {
              data: parsed.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (parsed.type === 'audioStreamEnd') {
          liveSession.sendRealtimeInput({ audioStreamEnd: true });
        } else if (parsed.type === 'text' && typeof parsed.text === 'string' && parsed.text.trim()) {
          liveSession.sendRealtimeInput({ text: parsed.text.trim().slice(0, 1500) });
        }
      } catch {
        // Ignore malformed client frames cleanly
      }
    });
  });

  return wss;
}
