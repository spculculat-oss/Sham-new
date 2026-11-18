import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { RateLimiter, clientKey } from './core/rateLimit';

export interface GroundedPlace {
  title: string;
  uri: string;
  placeId?: string;
  reviewSnippets?: string[];
}

export function getGoogleMapsApiKey(env: Record<string, string | undefined> = process.env): string {
  return (env.VITE_GOOGLE_MAPS_API_KEY || env.GOOGLE_MAPS_API_KEY || '').trim();
}

export function createMapsRouter(env: Record<string, string | undefined> = process.env) {
  const router = express.Router();
  const groundingLimiter = new RateLimiter(20, 60_000);

  /**
   * Exposes the browser Maps API key configured in the server environment when
   * build-time VITE_GOOGLE_MAPS_API_KEY isn't baked into import.meta.env.
   */
  router.get('/maps/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const apiKey = getGoogleMapsApiKey(env);
    res.json({
      configured: Boolean(apiKey),
      apiKey,
    });
  });

  /**
   * Maps Grounding endpoint using @google/genai + gemini-4-hydrogen with { googleMaps: {} }.
   * Never sets responseMimeType or responseSchema (disallowed with Maps grounding).
   */
  router.post('/maps/grounding', async (req, res) => {
    try {
      if (!groundingLimiter.allow(clientKey(req))) {
        res.status(429).json({
          error: 'Too many location discovery requests. Please wait a moment.',
          code: 'QUOTA_EXHAUSTED',
        });
        return;
      }

      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ error: 'A JSON object body is required', code: 'INVALID_REQUEST' });
        return;
      }

      const rawQuery = typeof body.query === 'string' ? body.query.trim() : '';
      if (!rawQuery) {
        res.status(400).json({ error: 'Search query is required', code: 'INVALID_QUERY' });
        return;
      }
      if (rawQuery.length > 500) {
        res.status(400).json({ error: 'Query exceeds 500 characters', code: 'QUERY_TOO_LONG' });
        return;
      }

      const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) && body.lat >= -90 && body.lat <= 90
        ? body.lat
        : undefined;
      const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) && body.lng >= -180 && body.lng <= 180
        ? body.lng
        : undefined;
      const language = typeof body.language === 'string' && body.language.trim()
        ? body.language.trim().slice(0, 12)
        : 'ar';

      const geminiKey = (env.GEMINI_API_KEY || '').trim();
      if (!geminiKey) {
        res.status(503).json({
          error: 'Location discovery service is not configured yet.',
          code: 'NOT_CONFIGURED',
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const promptLanguageHint = language === 'ar'
        ? 'أجب باللغة العربية بأسلوب خبير العطور شاهين (دون ذكر أسماء شركات تقنية)، واذكر تفاصيل الأماكن المناسبة لعالم العطور والخامات.'
        : `Answer in language (${language}) as Master Perfumer Shahin, highlighting perfumery relevance and botanical/house details.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `${promptLanguageHint}\n\nQuery: ${rawQuery}`,
        config: {
          tools: [{ googleMaps: {} }],
          ...(lat !== undefined && lng !== undefined
            ? {
                toolConfig: {
                  retrievalConfig: {
                    latLng: { latitude: lat, longitude: lng },
                  },
                },
              }
            : {}),
        },
      });

      const answer = (response.text || '').trim();
      const metadata = response.candidates?.[0]?.groundingMetadata as any;
      const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];

      const seen = new Set<string>();
      const places: GroundedPlace[] = [];
      for (const ch of chunks) {
        const mapsInfo = ch?.maps;
        if (!mapsInfo?.uri) continue;
        const uri = String(mapsInfo.uri);
        if (seen.has(uri)) continue;
        seen.add(uri);
        const snippets: string[] = [];
        const rawSnippets = mapsInfo.placeAnswerSources?.reviewSnippets;
        if (Array.isArray(rawSnippets)) {
          for (const s of rawSnippets) {
            const text = typeof s === 'string' ? s : s?.content || s?.text;
            if (typeof text === 'string' && text.trim()) snippets.push(text.trim());
          }
        }
        places.push({
          title: String(mapsInfo.title || 'Google Maps Place'),
          uri,
          placeId: mapsInfo.placeId ? String(mapsInfo.placeId) : undefined,
          ...(snippets.length ? { reviewSnippets: snippets.slice(0, 3) } : {}),
        });
      }

      res.json({
        success: true,
        answer,
        places,
        widgetContextToken: metadata?.googleMapsWidgetContextToken || undefined,
      });
    } catch (error: any) {
      const msg = String(error?.message || error || '');
      const status = error?.status;
      const isQuota = status === 429 || /RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|quota/i.test(msg);
      console.error('[Maps Grounding] Error:', msg.slice(0, 200));
      res.status(isQuota ? 429 : 500).json({
        error: isQuota
          ? 'Maps discovery quota exceeded temporarily. Please retry shortly.'
          : 'Failed to ground location query.',
        code: isQuota ? 'QUOTA_EXHAUSTED' : 'MAPS_GROUNDING_ERROR',
      });
    }
  });

  return router;
}
