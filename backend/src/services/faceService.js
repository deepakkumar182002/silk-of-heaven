import { env } from '../config/env.js';
import { aiEnabled } from './gemini.js';

/**
 * Free local face swap: the Python face service (face-service/, MediaPipe + OpenCV).
 * The Node API forwards the selfie + base model to it; nothing is stored.
 */
const fail = (message, status = 502) => Object.assign(new Error(message), { status, expose: true });
const auth = () => (env.face.token ? { 'x-face-token': env.face.token } : {});

let health = { at: 0, ok: false };
export async function localFaceUp() {
  if (env.face.engine === 'gemini') return false;
  if (Date.now() - health.at < (health.ok ? 20_000 : 5_000)) return health.ok; // re-check soon after a failure
  let ok = false;
  try {
    const r = await fetch(`${env.face.url}/health`, { signal: AbortSignal.timeout(4000) }); // an online service can be slower than localhost
    ok = r.ok;
  } catch {
    ok = false;
  }
  health = { at: Date.now(), ok };
  return ok;
}

/** Which engine will handle a face swap right now: 'local' | 'gemini' | null. */
export async function faceEngine() {
  if (env.face.engine !== 'gemini' && (await localFaceUp())) return 'local';
  if (env.face.engine !== 'local' && aiEnabled()) return 'gemini';
  return null;
}

export async function localSwap({ selfie, baseBuf }) {
  const form = new FormData();
  form.append('photo', new Blob([selfie]), 'photo.jpg');
  form.append('base', new Blob([baseBuf]), 'base.png');
  let res;
  try {
    res = await fetch(`${env.face.url}/swap`, { method: 'POST', body: form, headers: auth(), signal: AbortSignal.timeout(60_000) });
  } catch {
    health = { at: 0, ok: false };
    throw fail('Face preview service is not running. Please try again later.', 503);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw fail('Face preview service rejected the API (FACE_SERVICE_TOKEN does not match).', 502);
  if (res.status === 422) throw fail(data.message || 'Please use a clear, front-facing photo.', 422);
  if (!res.ok || !data.image) throw fail(data.message || 'Face preview failed. Please try another photo.', 502);
  return data;
}
