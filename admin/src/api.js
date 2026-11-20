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

// Same face crop the website uses for avatars: 360×360 window of a 1360×2048 cut-out at (500, 46)
export const faceCrop = (url, size) => {
  const k = size / 360;
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${1360 * k}px ${2048 * k}px`,
    backgroundPosition: `${-500 * k}px ${-46 * k}px`,
    backgroundRepeat: 'no-repeat',
  };
};
