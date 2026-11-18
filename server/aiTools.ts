import express from 'express';
import { GoogleGenAI } from '@google/genai';

export function createAiToolsRouter() {
  const router = express.Router();

  // Initialize GoogleGenAI SDK with environment key and required User-Agent
  const getAi = () => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured on server');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
  };

  /**
   * Audio Transcription using model: gemini-3.5-transcribe
   * Accepts base64 encoded audio from browser microphone
   */
  router.post('/ai/transcribe', async (req, res) => {
    try {
      const { audio, mimeType } = req.body || {};
      if (!audio || typeof audio !== 'string') {
        res.status(400).json({ error: 'Missing audio base64 payload', code: 'INVALID_AUDIO' });
        return;
      }

      // Clean base64 header if included (data:audio/...;base64,)
      const cleanBase64 = audio.includes(',') ? audio.split(',')[1] : audio;
      const detectedMime = mimeType || 'audio/webm';

      const ai = getAi();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            text: 'Transcribe this audio recording verbatim in its original spoken language (Arabic, English, French, etc.). Output only the exact transcribed text without introductions or formatting tags.',
          },
          {
            inlineData: {
              data: cleanBase64,
              mimeType: detectedMime,
            },
          },
        ],
      });

      const transcription = (response.text || '').trim();
      res.json({
        success: true,
        model: 'gemini-3.5-transcribe',
        transcription,
      });
    } catch (error: any) {
      console.error('[AI Tools] Transcribe error:', error);
      const isQuota = error?.status === 429 || /RESOURCE_EXHAUSTED/i.test(error?.message || '');
      res.status(isQuota ? 429 : 500).json({
        error: isQuota ? 'Transcription quota exceeded. Please retry shortly.' : 'Failed to transcribe audio',
        code: isQuota ? 'RATE_LIMITED' : 'TRANSCRIBE_ERROR',
        details: error?.message || String(error),
      });
    }
  });

  /**
   * Music Generation using Lyria models:
   * - lyria-3-clip-preview: Short clips (up to 30s)
   * - lyria-3-pro-preview: Full-length tracks
   */
  router.post('/ai/music', async (req, res) => {
    try {
      const { prompt, duration = 'clip', scentName, scentNotes } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing music prompt', code: 'INVALID_PROMPT' });
        return;
      }

      const modelName = duration === 'full' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
      const ai = getAi();

      // Enriched prompt with fragrance mood if provided
      let fullPrompt = prompt.trim();
      if (scentName || scentNotes) {
        fullPrompt = `A rich, atmospheric instrumental piece inspired by the luxury fragrance "${scentName || 'Signature Scent'}". Olfactory notes: ${scentNotes || 'Oud, Amber, Damask Rose'}. Mood and style: ${prompt}`;
      }

      console.log(`[AI Tools] Generating music with ${modelName} for prompt:`, fullPrompt.slice(0, 100));

      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: fullPrompt,
      });

      let audioBase64 = '';
      let lyrics = '';
      let mimeType = 'audio/wav';

      for await (const chunk of responseStream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;

        for (const part of parts) {
          if (part.inlineData?.data) {
            if (!audioBase64 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioBase64 += part.inlineData.data;
          }
          if (part.text && !lyrics) {
            lyrics = part.text;
          }
        }
      }

      if (!audioBase64) {
        throw new Error('No audio returned by Lyria music model');
      }

      res.json({
        success: true,
        model: modelName,
        audioBase64,
        mimeType,
        lyrics,
        duration: duration === 'full' ? 'full_track' : '30s_clip',
      });
    } catch (error: any) {
      console.error('[AI Tools] Music generation error:', error);
      const isPaidKeyIssue =
        error?.status === 403 ||
        error?.status === 400 ||
        error?.status === 429 ||
        /PERMISSION_DENIED|RESOURCE_EXHAUSTED|API_KEY_INVALID|paid/i.test(error?.message || '');

      res.status(isPaidKeyIssue ? 402 : 500).json({
        error: isPaidKeyIssue
          ? 'Lyria music generation models (lyria-3-clip-preview / lyria-3-pro-preview) require a billing-enabled Gemini API key.'
          : 'Failed to generate music',
        code: isPaidKeyIssue ? 'PAID_KEY_REQUIRED' : 'MUSIC_GENERATION_FAILED',
        details: error?.message || String(error),
      });
    }
  });

  /**
   * Neural Text-to-Speech using model: gemini-3.8-flash-lite-tts
   * Returns WAV audio (24kHz mono 16-bit) encoded in base64.
   */
  router.post('/ai/tts', async (req, res) => {
    try {
      const { text, language = 'ar', voice = 'Charon' } = req.body || {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Missing text for speech synthesis', code: 'INVALID_TEXT' });
        return;
      }

      // Clean markdown & code fences for natural speech cadence
      const cleanText = text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[*_`#>|]/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2400);

      if (!cleanText) {
        res.status(400).json({ error: 'No speakable text found', code: 'INVALID_TEXT' });
        return;
      }

      const allowedVoices = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
      const voiceName = allowedVoices.has(String(voice)) ? String(voice) : 'Charon';

      const ai = getAi();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: language === 'ar' || language === 'fa'
                    ? 'Warm, authoritative master perfumer mentor, clear and unhurried articulation'
                    : 'Warm, articulate master perfumer advisor, calm and refined pacing',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error('No audio data returned by speech synthesis model');
      }

      res.json({
        success: true,
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
      });
    } catch (error: any) {
      console.error('[AI Tools] TTS error:', error);
      const isQuota = error?.status === 429 || /RESOURCE_EXHAUSTED/i.test(error?.message || '');
      res.status(isQuota ? 429 : 500).json({
        error: isQuota ? 'Speech synthesis quota exceeded. Please retry shortly.' : 'Failed to synthesize speech',
        code: isQuota ? 'RATE_LIMITED' : 'TTS_ERROR',
      });
    }
  });

  return router;
}
