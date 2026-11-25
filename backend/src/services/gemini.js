import { env } from '../config/env.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const aiEnabled = () => Boolean(env.gemini.apiKey);

const fail = (message, status = 502) => Object.assign(new Error(message), { status, expose: true });

/**
 * One image-generation call to Gemini.
 * parts: array of strings (text) or { buffer, mime } (images), in prompt order.
 * Returns the first generated image as a Buffer.
 */
export async function generateImage(parts, { aspectRatio } = {}) {
  if (!aiEnabled()) throw fail('AI is not configured. Add GEMINI_API_KEY to backend/.env and restart the API.', 503);

  const body = {
    contents: [
      {
        role: 'user',
        parts: parts.map((p) =>
          typeof p === 'string' ? { text: p } : { inline_data: { mime_type: p.mime || 'image/png', data: p.buffer.toString('base64') } }
        ),
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
    },
  };

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(env.gemini.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.gemini.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      lastErr = fail(e.name === 'TimeoutError' ? 'The AI took too long to answer. Please try again.' : 'Cannot reach the AI service.');
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `AI request failed (${res.status})`;
      if (res.status === 429) {
        // Free tier has a quota of 0 for image models: retrying never helps, billing is needed
        if (/free_tier/i.test(msg) && /limit:\s*0\b/.test(msg)) {
          throw fail(
            `Your Gemini API key is on the Free tier, which does not include image generation (${env.gemini.model}). Turn on billing for this key's project in Google AI Studio (API keys → Set up billing), then try again.`,
            402
          );
        }
        const wait = msg.match(/retry in ([\dhms.]+)/i)?.[1];
        lastErr = fail(`Gemini quota reached${wait ? ` (resets in ${wait.replace(/\.\d+s$/, 's')})` : ''}. Please try again later.`, 429);
        if (wait && /h/.test(wait)) throw lastErr; // daily limit: retrying now is pointless
        continue;
      }
      lastErr = fail(msg, 502);
      if (res.status >= 500) continue; // one retry for transient errors
      throw lastErr;
    }
    const cand = data.candidates?.[0];
    const img = cand?.content?.parts?.find((p) => p.inlineData?.data || p.inline_data?.data);
    if (img) return Buffer.from((img.inlineData || img.inline_data).data, 'base64');

    const reason = data.promptFeedback?.blockReason || cand?.finishReason;
    const text = cand?.content?.parts?.find((p) => p.text)?.text;
    throw fail(
      reason && reason !== 'STOP'
        ? `The AI declined this image (${reason}). Try a different photo.`
        : text
          ? `The AI did not return an image: ${text.slice(0, 200)}`
          : 'The AI did not return an image. Please try again.',
      422
    );
  }
  throw lastErr;
}
