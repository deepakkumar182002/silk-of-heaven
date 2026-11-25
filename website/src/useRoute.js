import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal hash router (no dependency): works on any static host and survives refresh.
 *   #/shop          -> shop, all items (home / default)
 *   #/shop/build    -> shop, build within budget
 *   #/fitting-room  -> the VELL creator, to see the dressing on your own model
 */
export const ROUTES = {
  shop: '/shop',
  build: '/shop/build',
  fitting: '/fitting-room',
};
const KNOWN = new Set(Object.values(ROUTES));
const HOME = ROUTES.shop;

const read = () => {
  const p = window.location.hash.replace(/^#/, '').replace(/\/+$/, '') || HOME;
  return KNOWN.has(p) ? p : HOME;
};

export function navigate(path, { replace = false } = {}) {
  const url = '#' + path;
  if (window.location.hash === url) return;
  if (replace) {
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = path;
  }
}

export default function useRoute() {
  const [path, setPath] = useState(read);

  useEffect(() => {
    // normalise unknown / empty hashes to the home route without adding a history entry
    if (window.location.hash !== '#' + read()) navigate(read(), { replace: true });
    const sync = () => {
      setPath(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const go = useCallback((p, opts) => navigate(p, opts), []);
  return [path, go];
}
