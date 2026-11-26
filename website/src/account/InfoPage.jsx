import { Fragment, useEffect, useState } from 'react';
import { PAGES, STORE, capi } from '../data.js';
import Icon from '../icons.jsx';
import { linkProps, setSeo } from '../useRoute.js';
import { StoreFooter, StoreHeader } from '../shop/StoreChrome.jsx';
import Overlay from '../shop/Overlay.jsx';
import { useAccount } from './account.jsx';
import { navigate } from '../useRoute.js';

/** Tiny formatter for the admin's page text: "## " heading, "- " list item, blank line = paragraph. */
function Text({ text }) {
  const blocks = String(text || '').split(/\n\s*\n/);
  return blocks.map((b, i) => {
    const lines = b.split('\n').filter((l) => l.trim());
    if (!lines.length) return null;
    if (lines[0].startsWith('## ')) {
      return (
        <Fragment key={i}>
          <h2>{lines[0].slice(3)}</h2>
          {lines.length > 1 && <Text text={lines.slice(1).join('\n')} />}
        </Fragment>
      );
    }
    if (lines.every((l) => l.trim().startsWith('- '))) {
      return (
        <ul key={i}>
          {lines.map((l, j) => (
            <li key={j}>{l.trim().slice(2)}</li>
          ))}
        </ul>
      );
    }
    return <p key={i}>{lines.join(' ')}</p>;
  });
}

export default function InfoPage({ route, cart, onOpenCart, onFittingRoom }) {
  const page = PAGES.find((p) => p.key === route.key);
  useEffect(() => {
    if (page) setSeo({ title: `${page.title} · ${STORE.name}`, description: page.text.replace(/[#\-\n]+/g, ' ').slice(0, 160) });
  }, [page]);
  return (
    <main className="store store-page" aria-label={page?.title || 'Page'}>
      <StoreHeader tab={null} cart={cart} onOpenCart={onOpenCart} onFittingRoom={onFittingRoom} />
      <div className="store-scroll">
        <div className="store-wrap info">
          <nav className="info-nav" aria-label="Information pages">
            {PAGES.map((p) => (
              <a key={p.key} className={p.key === route.key ? 'on' : ''} {...linkProps(`/pages/${p.key}`)}>
                {p.title}
              </a>
            ))}
          </nav>
          <article className="info-body">
            {page ? (
              <>
                <h1>{page.title}</h1>
                <Text text={page.text} />
                {page.key === 'contact' && <ContactForm />}
              </>
            ) : (
              <p className="shop-muted">This page does not exist.</p>
            )}
          </article>
        </div>
        <StoreFooter />
      </div>
    </main>
  );
}

function ContactForm() {
  const acc = useAccount();
  const me = acc.customer;
  const [f, setF] = useState({ name: me?.name || '', email: me?.email || '', phone: me?.phone || '', message: '' });
  const [state, setState] = useState(''); // '' | busy | sent
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const send = async (e) => {
    e.preventDefault();
    setState('busy');
    setError('');
    try {
      await capi('/api/public/contact', { method: 'POST', body: f });
      setState('sent');
    } catch (err) {
      setError(err.message);
      setState('');
    }
  };
  if (state === 'sent') {
    return (
      <p className="auth-info">
        <Icon name="check" size={15} /> Thanks, your message is on its way. We reply within one working day.
      </p>
    );
  }
  return (
    <form className="co info-form" onSubmit={send}>
      <h2>Send us a message</h2>
      <label>
        <span>Name</span>
        <input required value={f.name} onChange={set('name')} autoComplete="name" />
      </label>
      <div className="co-row">
        <label>
          <span>Email</span>
          <input type="email" value={f.email} onChange={set('email')} autoComplete="email" />
        </label>
        <label>
          <span>Phone</span>
          <input type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" />
        </label>
      </div>
      <label>
        <span>Message</span>
        <textarea required rows={4} maxLength={3000} value={f.message} onChange={set('message')} />
      </label>
      {error && <p className="shop-err">{error}</p>}
      <button className="shop-btn primary" disabled={state === 'busy'}>
        {state === 'busy' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}

/** /reset-password?token=… from the email: choose a new password, then you are logged in. */
export function ResetPassword({ token }) {
  const acc = useAccount();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = () => navigate('/shop', { replace: true });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await acc.signIn(await capi('/api/customer/auth/reset', { method: 'POST', body: { token, password: pw } }));
      navigate('/account', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Overlay title="Choose a new password" onClose={close}>
      <form className="co auth" onSubmit={submit}>
        {!token && <p className="shop-err">This link is incomplete. Ask for a new reset link from the login window.</p>}
        <label>
          <span>New password</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          <small className="shop-muted">At least 8 characters</small>
        </label>
        {error && <p className="shop-err">{error}</p>}
        <button className="shop-btn primary block" disabled={busy || !token}>
          {busy ? 'Saving…' : 'Save and log in'}
        </button>
      </form>
    </Overlay>
  );
}
