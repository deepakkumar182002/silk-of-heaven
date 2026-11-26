import { useCallback, useEffect, useState } from 'react';

/**
 * Path router (History API; Vercel rewrites every path to index.html). Real URLs so products and
 * pages can be shared and indexed by search engines:
 *   /shop                      shop (home)
 *   /shop/build                build within budget
 *   /fitting-room              the creator: see the dressing on your own model
 *   /product/<slug>-<id>       a product
 *   /account[/<tab>]           orders | wishlist | addresses | profile
 *   /account/orders/<number>   one order
 *   /pages/<key>               about, contact, shipping, returns, privacy, terms
 *   /reset-password?token=…    password reset link from the email
 * Old "#/shop"-style links still work (they are rewritten on load).
 */
export const ROUTES = {
  shop: '/shop',
  build: '/shop/build',
  fitting: '/fitting-room',
  account: '/account',
};

export const productPath = (p) =>
  `/product/${String(p.name || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item'}-${p.id}`;

function parse(pathname, search) {
  const p = pathname.replace(/\/+$/, '') || '/';
  let m;
  if (p === '/shop' || p === '/') return { name: 'shop', path: '/shop' };
  if (p === '/shop/build') return { name: 'build', path: p };
  if (p === '/fitting-room') return { name: 'fitting', path: p };
  if ((m = p.match(/^\/product\/(?:.*-)?([a-z0-9-]+)$/i))) return { name: 'product', path: p, id: m[1] };
  if ((m = p.match(/^\/account\/orders\/([A-Z0-9-]+)$/i))) return { name: 'account', path: p, tab: 'orders', order: m[1].toUpperCase() };
  if ((m = p.match(/^\/account(?:\/(orders|wishlist|addresses|profile))?$/))) return { name: 'account', path: p, tab: m[1] || 'orders' };
  if ((m = p.match(/^\/pages\/([a-z]+)$/))) return { name: 'page', path: p, key: m[1] };
  if (p === '/reset-password') return { name: 'reset', path: p, token: new URLSearchParams(search).get('token') || '' };
  return null;
}

const read = () => parse(window.location.pathname, window.location.search) || { name: 'shop', path: '/shop' };

const EVENT = 'vell:navigate';
export function navigate(path, { replace = false } = {}) {
  if (window.location.pathname + window.location.search === path) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.dispatchEvent(new Event(EVENT));
}

export default function useRoute() {
  const [route, setRoute] = useState(() => {
    // legacy hash links (#/shop, #/fitting-room)
    const h = window.location.hash.replace(/^#/, '');
    if (h.startsWith('/') && parse(h, '')) window.history.replaceState(null, '', h);
    return read();
  });

  useEffect(() => {
    const cur = read();
    if (window.location.pathname !== cur.path && !parse(window.location.pathname, window.location.search)) {
      window.history.replaceState(null, '', cur.path);
    }
    const sync = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  const go = useCallback((p, opts) => navigate(p, opts), []);
  return [route, go];
}

/** <a> that navigates without a page load (keeps real hrefs for SEO, new tab, copy link). */
export const linkProps = (path, before) => ({
  href: path,
  onClick: (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    before?.();
    navigate(path);
  },
});

// ---------------------------------------------------------------------------
// SEO: title, description, canonical and Open Graph tags for the current page
// ---------------------------------------------------------------------------
const meta = (attr, key, content) => {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content || '');
};
export function setSeo({ title, description = '', image = '', path = window.location.pathname }) {
  document.title = title;
  meta('name', 'description', description);
  meta('property', 'og:title', title);
  meta('property', 'og:description', description);
  meta('property', 'og:type', path.startsWith('/product/') ? 'product' : 'website');
  meta('property', 'og:url', window.location.origin + path);
  if (image) meta('property', 'og:image', image);
  meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = window.location.origin + path;
}
