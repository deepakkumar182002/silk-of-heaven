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

async function post(path, files, timeout = 60_000) {
  const form = new FormData();
  for (const [name, buf] of Object.entries(files)) form.append(name, new Blob([buf]), `${name}.png`);
  let res;
  try {
    res = await fetch(`${env.face.url}${path}`, { method: 'POST', body: form, headers: auth(), signal: AbortSignal.timeout(timeout) });
  } catch {
    health = { at: 0, ok: false };
    throw fail('The face service is not running, so this cannot be checked right now.', 503);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw fail('Face service rejected the API (FACE_SERVICE_TOKEN does not match).', 502);
  if (res.status === 422) throw fail(data.message || 'No face found in the image.', 422);
  if (!res.ok) throw fail(data.message || 'Face service error', 502);
  return data;
}

/** Face box of a base model / look on the 1360×2048 canvas, or null when the service is not available. */
export async function detectFace(imageBuf) {
  if (!imageBuf || !(await localFaceUp())) return null;
  try {
    return (await post('/detect', { image: imageBuf }, 30_000)).face || null;
  } catch {
    return null;
  }
}

/**
 * Scale + shift `imageBuf` (a cut-out) so its face sits exactly where the face of `baseBuf` is.
 * Resolves { png: Buffer, scale, dx, dy, offBefore, offAfter } (offsets in canvas px).
 */
export async function alignToBody({ baseBuf, imageBuf }) {
  if (!(await localFaceUp())) throw fail('Auto-align needs the face service (face-service/). Start it and try again.', 503);
  const out = await post('/align', { base: baseBuf, image: imageBuf });
  return { ...out, png: Buffer.from(String(out.image).split(',')[1], 'base64') };
}
