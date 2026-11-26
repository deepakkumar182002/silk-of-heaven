import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TOKEN_KEY, capi, getCustomerToken } from '../data.js';

const Ctx = createContext(null);
const WISH_KEY = 'vell_wishlist_v1';

const readWish = () => {
  try {
    const v = JSON.parse(localStorage.getItem(WISH_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const store = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  } catch {
    /* private mode */
  }
};

/**
 * Customer account for the whole website: who is logged in, login / logout, the auth dialog,
 * and the wishlist (kept in the browser for guests, merged into the account after login).
 */
export function AccountProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [ready, setReady] = useState(!getCustomerToken());
  const [authOpen, setAuthOpen] = useState(null); // null | { reason, then }
  const [wish, setWish] = useState(readWish);
  const wishRef = useRef(wish);
  wishRef.current = wish;

  const syncWish = useCallback(async (list) => {
    if (!getCustomerToken()) return;
    try {
      const r = await capi('/api/customer/me/wishlist', { method: 'PUT', body: { items: list } });
      setCustomer(r.customer);
    } catch {
      /* keep local copy */
    }
  }, []);

  const signIn = useCallback(
    async ({ token, customer: c }) => {
      store(TOKEN_KEY, token);
      setCustomer(c);
      // guest wishlist + account wishlist
      const merged = [...(c.wishlist || []), ...wishRef.current].filter((w, i, a) => a.findIndex((x) => x.pieceId === w.pieceId) === i);
      setWish(merged);
      store(WISH_KEY, merged);
      if (merged.length !== (c.wishlist || []).length) await syncWish(merged);
      const then = authOpen?.then;
      setAuthOpen(null);
      then?.(c);
    },
    [authOpen, syncWish]
  );

  const signOut = useCallback(() => {
    store(TOKEN_KEY, null);
    setCustomer(null);
  }, []);

  // restore the session
  useEffect(() => {
    if (!getCustomerToken()) return;
    capi('/api/customer/me')
      .then((r) => {
        setCustomer(r.customer);
        const merged = [...(r.customer.wishlist || []), ...wishRef.current].filter((w, i, a) => a.findIndex((x) => x.pieceId === w.pieceId) === i);
        setWish(merged);
      })
      .catch((e) => e.status === 401 && signOut())
      .finally(() => setReady(true));
    const out = () => signOut();
    window.addEventListener('vell:logout', out);
    return () => window.removeEventListener('vell:logout', out);
  }, [signOut]);

  const toggleWish = useCallback(
    (p) => {
      const has = wishRef.current.some((w) => w.pieceId === p.pieceId);
      const next = has ? wishRef.current.filter((w) => w.pieceId !== p.pieceId) : [{ lookId: p.lookId, group: p.group, pieceId: p.pieceId }, ...wishRef.current];
      setWish(next);
      store(WISH_KEY, next);
      syncWish(next);
      return !has;
    },
    [syncWish]
  );

  const value = useMemo(
    () => ({
      customer,
      ready,
      setCustomer,
      signIn,
      signOut,
      /** opens the login dialog; `then(customer)` runs after a successful login */
      requireLogin: (reason, then) => (customer ? then?.(customer) : setAuthOpen({ reason, then })),
      openAuth: (reason = '') => setAuthOpen({ reason }),
      closeAuth: () => setAuthOpen(null),
      authOpen,
      wish,
      isWished: (pieceId) => wish.some((w) => w.pieceId === pieceId),
      toggleWish,
    }),
    [customer, ready, signIn, signOut, authOpen, wish, toggleWish]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAccount = () => useContext(Ctx);

// ---------------------------------------------------------------------------
// Google sign-in (Firebase Auth), loaded only when the button is used
// ---------------------------------------------------------------------------
const FB = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const googleConfigured = () => !!(FB.apiKey && FB.authDomain && FB.projectId);

export async function googleIdToken() {
  const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup, signOut }] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  const app = getApps()[0] || initializeApp(FB);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  const token = await cred.user.getIdToken();
  signOut(auth).catch(() => {}); // our own session takes over
  return token;
}
