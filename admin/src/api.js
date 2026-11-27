export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5050').replace(/\/$/, '');
export const SITE_URL = import.meta.env.VITE_SITE_URL || 'http://localhost:5173';

const TOKEN_KEY = 'vell_admin_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error(`Cannot reach the API at ${API_URL}. Is the backend running?`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/auth/login') onUnauthorized();
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export const uploadImage = (file, folder) => {
  const form = new FormData();
  form.append('file', file);
  return api(`/api/upload?folder=${encodeURIComponent(folder)}`, { method: 'POST', form });
};

/**
 * Upload straight from the browser to Cloudinary with a signature from the API. Used for videos and
 * big GIFs (a serverless API only accepts ~4 MB). Resolves { url, publicId, type: 'image' | 'video' }.
 */
export async function uploadMedia(file, folder, onProgress) {
  const sign = await api(`/api/upload/sign?folder=${encodeURIComponent(folder)}`);
  const form = new FormData();
  for (const [k, v] of Object.entries(sign.fields)) form.append(k, v);
  form.append('file', file);
  const data = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', sign.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    xhr.send(form);
  });
  return { url: data.secure_url, publicId: data.public_id, type: data.resource_type === 'video' ? 'video' : 'image', width: data.width, height: data.height };
}

// Resized preview URLs (mirrors the website's logic)
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/';
export const imgUrl = (url, w) => {
  if (!url) return '';
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/f_auto,q_auto,w_${w}/`);
  }
  if (url.startsWith(CDN)) {
    return 'https://images.higgs.ai/?default=1&output=webp&url=' + encodeURIComponent(url) + '&w=' + w + '&q=85';
  }
  return url;
};

/**
 * Avatar window on the 1360×2048 canvas around a body's face box (found by the face service).
 * Without a face box: the original model's 360×360 window at (500, 46). Same maths as the website.
 */
export const cropBox = (face) =>
  face?.w ? { x: face.x + face.w / 2 - face.w * 1.265, y: face.y + face.h / 2 - face.w * 1.535, s: face.w * 2.53 } : { x: 500, y: 46, s: 360 };

export const faceCrop = (url, size, face) => {
  const c = cropBox(face);
  const k = size / c.s;
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${1360 * k}px ${2048 * k}px`,
    backgroundPosition: `${-c.x * k}px ${-c.y * k}px`,
    backgroundRepeat: 'no-repeat',
  };
};

export const AUDIENCES = [
  ['women', 'Women'],
  ['men', 'Men'],
  ['kids', 'Kids'],
];
