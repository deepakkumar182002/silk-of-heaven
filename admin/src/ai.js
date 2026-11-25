import { api } from './api.js';

/** AI try-on helpers (Gemini via the VELL API). */
export const aiStatus = () => api('/api/admin/ai/status');

const form = (files, fields) => {
  const f = new FormData();
  (files || []).forEach((file) => f.append('photos', file));
  Object.entries(fields).forEach(([k, v]) => v !== undefined && v !== null && f.append(k, String(v)));
  return f;
};

/** Dress photo(s) → base model wearing the dress. Resolves { url, publicId, photo, warning }. */
export const aiLook = (files, { notes = '', keepFace = true, baseUrl } = {}) =>
  api('/api/admin/ai/look', { method: 'POST', form: form(files, { notes, keepFace, baseUrl }) });

/** Item photo(s) (or an already uploaded photoUrl) + look image → mix & match layer. */
export const aiLayer = ({ files, photoUrl, lookImage, slot, name, notes }) =>
  api('/api/admin/ai/layer', { method: 'POST', form: form(files, { photoUrl, lookImage, slot, name, notes }) });

/** Any look → the same model in plain basics (to use as AI base model). */
export const aiBase = (fromUrl) => api('/api/admin/ai/base', { method: 'POST', body: { fromUrl } });

/** "red_silk-saree (2).jpg" → "Red silk saree" */
export const nameFromFile = (file) => {
  const s = (file?.name || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\(\d+\)|copy|img|dsc|photo|image/gi, ' ')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s && !/^\d+$/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
};

/** Run async tasks with limited concurrency. */
export async function runQueue(items, worker, concurrency = 2) {
  let i = 0;
  const next = async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
}

export const SLOT_GROUP = {
  bottom: 'bottoms',
  top: 'tops',
  full: 'full',
  shoes: 'shoes',
  outer: 'tops',
  drape: 'acc',
  jewellery: 'acc',
  bag: 'acc',
  head: 'acc',
};
