import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { capi, imgUrl } from '../data.js';
import Icon from '../icons.jsx';
import Overlay from '../shop/Overlay.jsx';
import { openPromoLink } from '../shop/Promos.jsx';
import { useAccount } from './account.jsx';

/**
 * Notifications: the bell (offers for everyone + this customer's order updates, with image and
 * description) and browser push (service worker /sw.js, Web Push with the API's public key).
 */
const SEEN_KEY = 'soh_notif_seen'; // time the bell was last opened (unread badge)
const ASKED_KEY = 'soh_push_asked'; // "Not now" on the push prompt
const Ctx = createContext(null);

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const read = (k) => {
  try {
    return Number(localStorage.getItem(k)) || 0;
  } catch {
    return 0;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    /* ignore */
  }
};
const keyBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export function NotifyProvider({ children }) {
  const acc = useAccount();
  const me = acc.customer?._id || '';
  const [items, setItems] = useState([]);
  const [pushKey, setPushKey] = useState('');
  const [seenAt, setSeenAt] = useState(() => read(SEEN_KEY));
  const [panel, setPanel] = useState(null); // null | { id? }
  const [perm, setPerm] = useState(() => (supported() ? Notification.permission : 'unsupported'));
  const [subscribed, setSubscribed] = useState(false);
  const reg = useRef(null);

  const load = useCallback(
    () =>
      capi('/api/public/notifications')
        .then((d) => {
          setItems(d.items || []);
          setPushKey(d.push?.publicKey || '');
          return d.items || [];
        })
        .catch(() => []),
    []
  );

  const openPanel = useCallback((id) => {
    setPanel({ id: id || '' });
    const now = Date.now();
    setSeenAt(now);
    write(SEEN_KEY, now);
  }, []);

  // load on start, after login / logout, every 2 minutes while the tab is visible
  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), 120_000);
    return () => clearInterval(t);
  }, [load, me]);

  // opened from a push (?n=<id>), then clean the address bar
  useEffect(() => {
    const u = new URL(window.location.href);
    const id = u.searchParams.get('n');
    if (!id) return;
    u.searchParams.delete('n');
    window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    load().then(() => openPanel(id));
  }, [load, openPanel]);

  // service worker: register, know if this browser is subscribed, listen to pushes
  useEffect(() => {
    if (!supported()) return undefined;
    let alive = true;
    navigator.serviceWorker
      .register('/sw.js')
      .then(async (r) => {
        reg.current = r;
        const sub = await r.pushManager.getSubscription();
        if (alive) setSubscribed(!!sub);
      })
      .catch(() => {});
    const msg = (e) => {
      if (e.data?.type === 'soh:notification') load();
      if (e.data?.type === 'soh:open') load().then(() => openPanel(e.data.id));
    };
    navigator.serviceWorker.addEventListener('message', msg);
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener('message', msg);
    };
  }, [load, openPanel]);

  // link this browser's subscription to the customer after login (order updates reach them)
  useEffect(() => {
    if (!me || !subscribed || !reg.current) return;
    reg.current.pushManager.getSubscription().then((sub) => sub && capi('/api/public/notifications/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } }).catch(() => {}));
  }, [me, subscribed]);

  const enablePush = useCallback(async () => {
    if (!supported() || !pushKey) throw new Error('This browser cannot show notifications. On iPhone, add this site to your Home Screen first.');
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser settings for this site.');
    const r = reg.current || (await navigator.serviceWorker.register('/sw.js'));
    reg.current = r;
    await navigator.serviceWorker.ready;
    const sub = (await r.pushManager.getSubscription()) || (await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) }));
    await capi('/api/public/notifications/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
    setSubscribed(true);
  }, [pushKey]);

  const disablePush = useCallback(async () => {
    const sub = await reg.current?.pushManager.getSubscription();
    if (sub) {
      await capi('/api/public/notifications/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    setSubscribed(false);
  }, []);

  const unread = items.filter((n) => new Date(n.at).getTime() > seenAt).length;
  const value = useMemo(
    () => ({
      items,
      unread,
      seenAt,
      panel,
      openPanel,
      closePanel: () => setPanel(null),
      push: { available: supported() && !!pushKey, perm, subscribed, enable: enablePush, disable: disablePush },
    }),
    [items, unread, seenAt, panel, openPanel, perm, subscribed, pushKey, enablePush, disablePush]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNotify = () => useContext(Ctx);

/** Bell with the unread count (store header). */
export function NotificationBell({ className = 'store-ibtn' }) {
  const n = useNotify();
  if (!n) return null;
  return (
    <button className={className} onClick={() => n.openPanel()} aria-label={n.unread ? `Notifications, ${n.unread} new` : 'Notifications'}>
      <Icon name="bell" size={20} />
      {n.unread > 0 && <span className="store-badge">{n.unread > 9 ? '9+' : n.unread}</span>}
    </button>
  );
}

const ago = (d) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** The list, and one notification opened with its full image and description. */
export function NotificationPanel() {
  const n = useNotify();
  const [openId, setOpenId] = useState(n?.panel?.id || '');
  const [lastSeen] = useState(() => read(SEEN_KEY) || 0);
  const [pushMsg, setPushMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setOpenId(n?.panel?.id || ''), [n?.panel?.id]);
  if (!n?.panel) return null;

  const item = n.items.find((x) => String(x.id) === String(openId));
  const go = (link) => {
    n.closePanel();
    openPromoLink(link);
  };
  const turnOn = async () => {
    setBusy(true);
    setPushMsg('');
    try {
      await n.push.enable();
      setPushMsg('Done! You will get offers and order updates here.');
    } catch (e) {
      setPushMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay variant="drawer" title={item ? 'Notification' : 'Notifications'} onClose={n.closePanel} label="Notifications">
      {item ? (
        <article className="nt-detail">
          <button className="nt-back" onClick={() => setOpenId('')}>
            <Icon name="chevRight" size={16} /> All notifications
          </button>
          {item.image && <img className="nt-detail-img" src={imgUrl(item.image, 900)} alt="" />}
          <h3>{item.title}</h3>
          <time>{ago(item.at)}</time>
          {item.body && <p>{item.body}</p>}
          {item.link && (
            <button className="shop-btn primary block" onClick={() => go(item.link)}>
              {item.type === 'order' ? 'View order' : 'Show more'} <Icon name="chevRight" size={16} />
            </button>
          )}
        </article>
      ) : (
        <div className="nt-list">
          {n.push.available && !n.push.subscribed && (
            <div className="nt-pushcard">
              <Icon name="bell" size={20} />
              <div>
                <b>Get offers and order updates</b>
                <small>{n.push.perm === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser settings.' : 'We will notify you on this device, even when the site is closed.'}</small>
                {pushMsg && <small className="nt-pushmsg">{pushMsg}</small>}
              </div>
              {n.push.perm !== 'denied' && (
                <button className="shop-btn primary" onClick={turnOn} disabled={busy}>
                  {busy ? <span className="fc-spin" /> : 'Turn on'}
                </button>
              )}
            </div>
          )}
          {!n.items.length ? (
            <div className="nt-empty">
              <Icon name="bell" size={30} />
              <p>No notifications yet. Offers and your order updates will show up here.</p>
            </div>
          ) : (
            n.items.map((x) => (
              <button key={x.id} className="nt-item" onClick={() => setOpenId(String(x.id))}>
                <span className={'nt-thumb' + (x.image ? '' : ' icon')}>{x.image ? <img src={imgUrl(x.image, 200)} alt="" /> : <Icon name={x.type === 'order' ? 'box' : 'bell'} size={20} />}</span>
                <span className="nt-text">
                  <b>{x.title}</b>
                  {x.body && <small>{x.body}</small>}
                  <time>{ago(x.at)}</time>
                </span>
                {new Date(x.at).getTime() > lastSeen && <i className="nt-dot" aria-label="New" />}
              </button>
            ))
          )}
          {n.push.subscribed && (
            <button className="ps-link nt-off" onClick={() => n.push.disable()}>
              Turn off notifications on this device
            </button>
          )}
        </div>
      )}
    </Overlay>
  );
}

/**
 * A small, polite prompt to allow push: once per visit after 25 s on the site, never while a dialog
 * or the offer popup is open; "Not now" hides it for 14 days.
 */
export function PushPrompt({ blocked }) {
  const n = useNotify();
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');
  const ready = n?.push.available && !n.push.subscribed && n.push.perm === 'default' && Date.now() - read(ASKED_KEY) > 14 * 86400e3;
  useEffect(() => {
    if (!ready || show) return undefined;
    let shown = false;
    try {
      shown = sessionStorage.getItem('soh_push_prompted') === '1';
    } catch {
      /* ignore */
    }
    if (shown) return undefined;
    const t = setInterval(() => {
      if (document.hidden || document.querySelector('.pp-back, .shop-back')) return;
      clearInterval(t);
      try {
        sessionStorage.setItem('soh_push_prompted', '1');
      } catch {
        /* ignore */
      }
      setShow(true);
    }, 25_000);
    return () => clearInterval(t);
  }, [ready, show]);

  if (!show || blocked || !n?.push.available || n.push.subscribed) return null;
  const later = () => {
    write(ASKED_KEY, Date.now());
    setShow(false);
  };
  return (
    <div className="nt-prompt" role="dialog" aria-label="Allow notifications">
      <span className="nt-prompt-icon">
        <Icon name="bell" size={20} />
      </span>
      <div>
        <b>Don’t miss an offer</b>
        <small>{msg || 'Get sale alerts and order updates on this device.'}</small>
      </div>
      <div className="nt-prompt-btns">
        <button className="nt-later" onClick={later}>
          Not now
        </button>
        <button
          className="nt-allow"
          onClick={async () => {
            try {
              await n.push.enable();
              setShow(false);
            } catch (e) {
              setMsg(e.message);
              write(ASKED_KEY, Date.now());
            }
          }}
        >
          Allow
        </button>
      </div>
    </div>
  );
}
