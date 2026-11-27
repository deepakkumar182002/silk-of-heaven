import { useEffect, useRef, useState } from 'react';
import { api, imgUrl } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Field, ImageUpload, Spinner, useToast } from '../components/ui.jsx';

/**
 * Notifications to website visitors: saved in the website's bell (with image + description) and sent
 * as a browser push to everyone who allowed notifications. Order updates are sent automatically.
 */
const BLANK = { title: '', body: '', image: '', imagePublicId: '', link: '', audience: 'all', recipients: [] };
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const nameOf = (c) => c.name || c.email || (c.phone ? `+91 ${c.phone}` : 'Customer');

export default function Notifications() {
  const [form, setForm] = useState(BLANK);
  const [picked, setPicked] = useState([]); // chosen customers (objects, for the chips)
  const [list, setList] = useState(null);
  const [push, setPush] = useState(null);
  const [type, setType] = useState('custom');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const load = (t = type) =>
    api(`/api/admin/notifications?type=${t}`)
      .then((d) => {
        setList(d.items);
        setPush(d.push);
      })
      .catch((e) => toast(e.message, 'err'));
  useEffect(() => {
    setList(null);
    load(type);
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const send = async () => {
    setError('');
    if (!form.title.trim()) return setError('Write a title');
    if (form.audience === 'selected' && !picked.length) return setError('Choose at least one customer');
    const who = form.audience === 'all' ? 'everyone' : `${picked.length} customer${picked.length > 1 ? 's' : ''}`;
    if (!window.confirm(`Send this notification to ${who}? It cannot be unsent.`)) return;
    setBusy(true);
    try {
      const n = await api('/api/admin/notifications', { method: 'POST', body: { ...form, recipients: picked.map((c) => c._id) } });
      toast(`Sent${n.push?.sent ? ` · push delivered to ${n.push.sent} browser${n.push.sent > 1 ? 's' : ''}` : ''}`);
      setForm(BLANK);
      setPicked([]);
      if (type === 'custom') setList((l) => [n, ...(l || [])]);
      else setType('custom');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (n) => {
    if (!window.confirm('Delete this notification? It disappears from the website bell (a push already shown stays on devices).')) return;
    try {
      await api(`/api/admin/notifications/${n._id}`, { method: 'DELETE' });
      setList((l) => l.filter((x) => x._id !== n._id));
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  return (
    <>
      <PageHead title="Notifications" sub="Send offers and news to your customers. They appear in the bell on the website and as a phone / computer notification for everyone who allowed them." />

      {push && (
        <div className={'nt-push card' + (push.enabled ? '' : ' off')}>
          <Icon name="megaphone" size={18} />
          {push.enabled ? (
            <span>
              <b>{push.subscribers}</b> browser{push.subscribers === 1 ? '' : 's'} get push notifications ({push.loggedIn} logged in). Order updates are sent to customers automatically.
            </span>
          ) : (
            <span>Browser push is off (VAPID keys are missing on the server). Notifications still show in the website bell.</span>
          )}
        </div>
      )}

      <div className="nt-grid">
        <div className="card pad form-grid">
          <h3 className="nt-h">New notification</h3>
          <Field label="Title">
            <input value={form.title} maxLength={120} onChange={set('title')} placeholder="Weekend sale: 30% off sarees" />
          </Field>
          <Field label="Description" hint="Shown in full when the customer opens the notification">
            <textarea rows={4} value={form.body} maxLength={1000} onChange={set('body')} placeholder="Use code SILK30 at checkout. Valid till Sunday midnight." />
          </Field>
          <Field label="Image (optional)" hint="Wide images look best, about 1200 × 600">
            <ImageUpload value={form.image} folder="notifications" previewClass="landscape" onChange={(m) => setForm((f) => ({ ...f, image: m.url, imagePublicId: m.publicId || '' }))} />
          </Field>
          <Field label="Link (optional)" hint="Opens when the notification is tapped: /shop, /product/…, /pages/… or https://…">
            <input value={form.link} onChange={set('link')} placeholder="/shop" />
          </Field>
          <Field label="Send to">
            <div className="seg">
              <button type="button" className={form.audience === 'all' ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, audience: 'all' }))}>
                All users
              </button>
              <button type="button" className={form.audience === 'selected' ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, audience: 'selected' }))}>
                Chosen customers
              </button>
            </div>
          </Field>
          {form.audience === 'selected' && <CustomerPicker picked={picked} setPicked={setPicked} />}
          {error && <p className="err">{error}</p>}
          <div className="nt-send">
            <button className="btn primary" onClick={send} disabled={busy}>
              {busy ? <Spinner /> : <Icon name="megaphone" size={17} />} Send now
            </button>
          </div>
        </div>

        <div className="nt-preview">
          <small className="hint">Preview</small>
          <div className="nt-os">
            <span className="nt-os-icon">S</span>
            <div>
              <b>{form.title || 'Your title'}</b>
              <p>{form.body || 'Your description'}</p>
              {form.image && <img src={imgUrl(form.image, 600)} alt="" />}
            </div>
          </div>
          <small className="hint">Phone / computer notification. In the website bell the full image and description show when it is opened.</small>
        </div>
      </div>

      <div className="nt-hist-head">
        <h3 className="nt-h">History</h3>
        <div className="seg">
          <button className={type === 'custom' ? 'on' : ''} onClick={() => setType('custom')}>
            Sent by you
          </button>
          <button className={type === 'order' ? 'on' : ''} onClick={() => setType('order')}>
            Order updates
          </button>
        </div>
      </div>
      {!list ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : !list.length ? (
        <Empty icon="megaphone" title="Nothing sent yet">
          <p>{type === 'custom' ? 'Your notifications will be listed here.' : 'Order confirmations and status updates appear here.'}</p>
        </Empty>
      ) : (
        <div className="list card">
          {list.map((n) => (
            <div key={n._id} className="list-row nt-row">
              <div className="list-main">
                <span className="promo-thumb">{n.image ? <img src={imgUrl(n.image, 240)} alt="" /> : <Icon name="megaphone" size={20} />}</span>
                <div>
                  <b>{n.title}</b>
                  {n.body && <small>{n.body}</small>}
                  <small>
                    {when(n.createdAt)} · {n.audience === 'all' ? 'All users' : n.recipients.map(nameOf).slice(0, 3).join(', ') + (n.recipients.length > 3 ? ` +${n.recipients.length - 3}` : '')}
                    {' · '}push {n.push?.sent || 0} sent{n.push?.failed ? `, ${n.push.failed} failed` : ''}
                    {n.link ? ` · → ${n.link}` : ''}
                  </small>
                </div>
              </div>
              <div className="list-actions">
                <button className="icon-btn danger" onClick={() => remove(n)} aria-label="Delete">
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Search customers by name, email or phone and tick the ones to notify. */
function CustomerPicker({ picked, setPicked }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const t = useRef(0);
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      api(`/api/admin/customers${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        .then((l) => setFound(l.filter((c) => !c.blocked).slice(0, 40)))
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t.current);
  }, [q]);
  const has = (c) => picked.some((p) => p._id === c._id);
  const toggle = (c) => setPicked((l) => (has(c) ? l.filter((p) => p._id !== c._id) : [...l, c]));

  return (
    <div className="nt-pick">
      {picked.length > 0 && (
        <div className="nt-chips">
          {picked.map((c) => (
            <span key={c._id} className="tag-s">
              {nameOf(c)}
              <button onClick={() => toggle(c)} aria-label={`Remove ${nameOf(c)}`}>
                <Icon name="x" size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers by name, email or phone" />
      <div className="nt-found">
        {!found ? (
          <Spinner />
        ) : !found.length ? (
          <small className="hint">No customers found</small>
        ) : (
          found.map((c) => (
            <label key={c._id} className="nt-cust">
              <input type="checkbox" checked={has(c)} onChange={() => toggle(c)} />
              <span>
                <b>{nameOf(c)}</b>
                <small>{[c.email, c.phone && `+91 ${c.phone}`, `${c.orders} order${c.orders === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</small>
              </span>
            </label>
          ))
        )}
      </div>
      {found?.length > 1 && (
        <button className="link-btn nt-all" onClick={() => setPicked((l) => [...l, ...found.filter((c) => !l.some((p) => p._id === c._id))])}>
          Select all {found.length} shown
        </button>
      )}
    </div>
  );
}
