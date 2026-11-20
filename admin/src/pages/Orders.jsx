import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, imgUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Modal, Spinner, useToast } from '../components/ui.jsx';

export const STATUS = {
  new: 'New',
  contacted: 'Contacted',
  stitching: 'Stitching',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const FLOW = ['new', 'contacted', 'stitching', 'ready', 'delivered'];
// what the single big action button does at each step
const NEXT = {
  new: ['contacted', 'Mark as contacted', 'phone'],
  contacted: ['stitching', 'Start stitching', 'scissors'],
  stitching: ['ready', 'Mark as ready', 'box'],
  ready: ['delivered', 'Mark as delivered', 'check'],
};
const NEXT_HINT = {
  new: 'Call, WhatsApp or email the customer first, confirm measurements, then mark them as contacted.',
  contacted: 'Once measurements and details are confirmed, start the stitching.',
  stitching: 'When the garments are finished and checked, mark the order ready.',
  ready: 'After handing over / dispatching, mark it delivered.',
};

const money = (n) => `$${Number(n || 0).toLocaleString()}`;
const when = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const ago = (d) => {
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};
const digits = (s) => String(s || '').replace(/\D/g, '');
export const Pill = ({ s }) => <span className={'pill-s s-' + s}>{STATUS[s] || s}</span>;

export default function Orders() {
  const { admin } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'all';
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(null);
  const toast = useToast();

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (status !== 'all') qs.set('status', status);
    if (q.trim()) qs.set('q', q.trim());
    if (mine) qs.set('mine', '1');
    return api('/api/admin/orders?' + qs)
      .then(setData)
      .catch((e) => toast(e.message, 'err'));
  }, [status, q, mine, toast]);

  // debounce search, refresh in the background
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useEffect(() => {
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, [load]);

  const setStatus = (s) => setParams(s === 'all' ? {} : { status: s }, { replace: true });
  const counts = data?.counts || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const updated = (order) => {
    setData((d) => d && { ...d, orders: d.orders.map((o) => (o._id === order._id ? order : o)) });
    window.dispatchEvent(new Event('orders-changed'));
    load();
  };

  return (
    <>
      <PageHead title="Orders" sub="Stitching requests from customers. Contact the customer, confirm details, then move the order forward.">
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </PageHead>

      <div className="status-tabs" role="tablist">
        {[['all', 'All', total], ...Object.entries(STATUS).map(([k, l]) => [k, l, counts[k] || 0])].map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={status === k} className={(status === k ? 'on ' : '') + 'st-' + k} onClick={() => setStatus(k)}>
            {label} <b>{n}</b>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input placeholder="Search order no., name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Assigned to me
        </label>
      </div>

      {!data ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : data.orders.length === 0 ? (
        <Empty icon="orders" title={q || status !== 'all' || mine ? 'No orders match' : 'No orders yet'}>
          <p>New stitching requests from the website will appear here.</p>
        </Empty>
      ) : (
        <div className="order-list">
          {data.orders.map((o) => (
            <button key={o._id} className={'order-row card' + (o.status === 'new' ? ' is-new' : '')} onClick={() => setOpenId(o._id)}>
              <div className="or-main">
                <b className="or-no">{o.orderNumber}</b>
                <small>{ago(o.createdAt)}</small>
              </div>
              <div className="or-cust">
                <b>{o.customer.name}</b>
                <small>{o.customer.phone}</small>
              </div>
              <div className="or-items">
                <span>
                  {o.items.reduce((n, i) => n + i.qty, 0)} item{o.items.reduce((n, i) => n + i.qty, 0) === 1 ? '' : 's'}
                </span>
                <small>{o.items.map((i) => i.name).join(', ')}</small>
              </div>
              <b className="or-total">{money(o.total)}</b>
              <div className="or-state">
                <Pill s={o.status} />
                <small>{o.assignedTo ? o.assignedTo.name : 'Unassigned'}</small>
              </div>
            </button>
          ))}
        </div>
      )}

      {openId && <OrderDetail id={openId} me={admin} onClose={() => setOpenId(null)} onChanged={updated} onDeleted={() => { setOpenId(null); load(); window.dispatchEvent(new Event('orders-changed')); }} />}
    </>
  );
}

function OrderDetail({ id, me, onClose, onChanged, onDeleted }) {
  const [o, setO] = useState(null);
  const [staff, setStaff] = useState([]);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    Promise.all([api(`/api/admin/orders/${id}`), api('/api/admin/orders/staff')])
      .then(([order, s]) => {
        setO(order);
        setStaff(s);
      })
      .catch((e) => {
        toast(e.message, 'err');
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const apply = (order) => {
    setO(order);
    onChanged(order);
  };

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status) =>
    run(async () => {
      apply(await api(`/api/admin/orders/${id}/status`, { method: 'PUT', body: { status, note: msg } }));
      setMsg('');
      toast(`Order marked ${STATUS[status].toLowerCase()}`);
    });

  const assign = (assignedTo) =>
    run(async () => {
      apply(await api(`/api/admin/orders/${id}/assign`, { method: 'PUT', body: { assignedTo: assignedTo || null } }));
      toast('Assignment saved');
    });

  const addNote = () =>
    run(async () => {
      if (!note.trim()) return;
      apply(await api(`/api/admin/orders/${id}/notes`, { method: 'POST', body: { text: note } }));
      setNote('');
    });

  const remove = () =>
    run(async () => {
      if (!window.confirm(`Delete order ${o.orderNumber} permanently?`)) return;
      await api(`/api/admin/orders/${id}`, { method: 'DELETE' });
      toast('Order deleted');
      onDeleted();
    });

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      toast('Could not copy', 'err');
    }
  };

  const next = o && NEXT[o.status];
  const stepIdx = o ? FLOW.indexOf(o.status) : -1;
  const done = o && (o.status === 'delivered' || o.status === 'cancelled');
  const addr = o ? [o.address.line1, o.address.line2, [o.address.city, o.address.state].filter(Boolean).join(', '), [o.address.pincode, o.address.country].filter(Boolean).join(' ')].filter(Boolean).join('\n') : '';
  const phoneDigits = o ? digits(o.customer.phone) : '';
  const stitchItems = o ? o.items.filter((i) => i.madeToOrder) : [];

  return (
    <Modal wide title={o ? `Order ${o.orderNumber}` : 'Order'} onClose={onClose}>
      {!o ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : (
        <div className="od">
          {/* ---------------- left: who + what ---------------- */}
          <div className="od-main">
            <section className="od-card">
              <div className="od-cust-head">
                <div>
                  <h3>{o.customer.name}</h3>
                  <small className="muted">
                    Ordered {when(o.createdAt)} · prefers <b className="pref">{{ phone: 'a phone call', whatsapp: 'WhatsApp', email: 'email' }[o.customer.contactPref]}</b>
                  </small>
                </div>
                <Pill s={o.status} />
              </div>
              <div className="contact-btns">
                <a className={'btn' + (o.customer.contactPref === 'phone' ? ' primary' : '')} href={`tel:${o.customer.phone.replace(/[^\d+]/g, '')}`}>
                  <Icon name="phone" size={17} /> Call {o.customer.phone}
                </a>
                <a
                  className={'btn' + (o.customer.contactPref === 'whatsapp' ? ' primary' : '')}
                  href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hi ${o.customer.name.split(' ')[0]}, this is VELL about your order ${o.orderNumber}.`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="chat" size={17} /> WhatsApp
                </a>
                {o.customer.email && (
                  <a className={'btn' + (o.customer.contactPref === 'email' ? ' primary' : '')} href={`mailto:${o.customer.email}?subject=${encodeURIComponent(`Your VELL order ${o.orderNumber}`)}`}>
                    <Icon name="mail" size={17} /> Email
                  </a>
                )}
              </div>
              <div className="od-addr">
                <pre>{addr}</pre>
                <button className="icon-btn" onClick={() => copy(addr, 'Address')} aria-label="Copy address">
                  <Icon name="copy" size={17} />
                </button>
              </div>
              {o.notes && (
                <div className="od-note">
                  <small>Customer note</small>
                  {o.notes}
                </div>
              )}
            </section>

            <section>
              <h4 className="section-title">
                Items to make · {o.items.reduce((n, i) => n + i.qty, 0)} <span className="muted">({stitchItems.length} to stitch)</span>
              </h4>
              <div className="od-items">
                {o.items.map((i) => (
                  <div key={i._id} className="od-item card">
                    <span className="od-thumb" style={{ backgroundImage: `url("${imgUrl(i.image, 240)}")` }} />
                    <div className="od-item-main">
                      <div className="od-item-top">
                        <b>{i.name}</b>
                        <span>
                          {money(i.unitPrice)} × {i.qty} = <b>{money(i.unitPrice * i.qty)}</b>
                        </span>
                      </div>
                      <div className="od-tags">
                        <span className="tag-s">
                          <i style={{ background: i.colorHex || '#9aa0a6' }} /> {i.color}
                        </span>
                        <span className="tag-s strong">Size {i.size}</span>
                        <span className={'tag-s ' + (i.madeToOrder ? 'mto' : '')}>
                          <Icon name={i.madeToOrder ? 'scissors' : 'box'} size={13} /> {i.madeToOrder ? `Stitch · ~${i.leadTimeDays} d` : 'Ready-made'}
                        </span>
                      </div>
                      <small className="muted">
                        From “{i.lookName}”{i.fabric ? ` · ${i.fabric}` : ''}
                      </small>
                      {i.measurements && (
                        <div className="od-meas">
                          <Icon name="ruler" size={15} />
                          {Object.entries(i.measurements).map(([k, v]) => (
                            <span key={k}>
                              {k} <b>{v}</b>
                            </span>
                          ))}
                          <small>cm</small>
                        </div>
                      )}
                      {i.notes && <div className="od-note small">“{i.notes}”</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="od-total">
                <span>Total (pay after confirmation)</span>
                <b>{money(o.total)}</b>
              </div>
            </section>
          </div>

          {/* ---------------- right: workflow ---------------- */}
          <aside className="od-side">
            <section className="od-card">
              <h4 className="section-title">Progress</h4>
              {o.status === 'cancelled' ? (
                <p className="muted">This order was cancelled.</p>
              ) : (
                <ol className="stepper">
                  {FLOW.map((s, i) => (
                    <li key={s} className={i < stepIdx ? 'done' : i === stepIdx ? 'now' : ''}>
                      <span>{i < stepIdx ? <Icon name="check" size={13} stroke={2.6} /> : i + 1}</span>
                      {STATUS[s]}
                    </li>
                  ))}
                </ol>
              )}

              {!done && (
                <>
                  {next && <p className="muted small hint-box">{NEXT_HINT[o.status]}</p>}
                  <label className="field">
                    <span className="field-label">Message to customer (shown on their tracking page)</span>
                    <textarea rows={2} maxLength={400} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Optional, e.g. “Measurements confirmed, stitching starts today.”" />
                  </label>
                  {next && (
                    <button className="btn primary block" disabled={busy} onClick={() => setStatus(next[0])}>
                      {busy ? <Spinner /> : <><Icon name={next[2]} size={17} /> {next[1]}</>}
                    </button>
                  )}
                  <button
                    className="btn danger-outline block"
                    disabled={busy}
                    onClick={() => window.confirm('Cancel this order? The customer will see it as cancelled.') && setStatus('cancelled')}
                  >
                    Cancel order
                  </button>
                </>
              )}
              {o.status === 'cancelled' && (
                <button className="btn block" disabled={busy} onClick={() => setStatus('new')}>
                  Re-open order
                </button>
              )}
            </section>

            <section className="od-card">
              <label className="field">
                <span className="field-label">Assigned tailor</span>
                <select value={o.assignedTo?._id || ''} onChange={(e) => assign(e.target.value)} disabled={busy}>
                  <option value="">Unassigned</option>
                  {staff.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name} ({s.role}){s._id === me?._id ? ' — me' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="od-card">
              <h4 className="section-title">Internal notes <span className="muted">(staff only)</span></h4>
              {o.internalNotes.length === 0 && <p className="muted small">No notes yet.</p>}
              <ul className="notes">
                {o.internalNotes.map((n) => (
                  <li key={n._id}>
                    {n.text}
                    <small>
                      {n.by} · {when(n.at)}
                    </small>
                  </li>
                ))}
              </ul>
              <div className="note-add">
                <input value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} placeholder="Add a note…" />
                <button className="btn" onClick={addNote} disabled={busy || !note.trim()}>
                  Add
                </button>
              </div>
            </section>

            <section className="od-card">
              <h4 className="section-title">History</h4>
              <ul className="timeline">
                {[...o.history].reverse().map((h, i) => (
                  <li key={i}>
                    <b>{STATUS[h.status] || h.status}</b>
                    <small>
                      {when(h.at)} · {h.by}
                    </small>
                    {h.note && <p>{h.note}</p>}
                  </li>
                ))}
              </ul>
            </section>

            {me?.role === 'admin' && (
              <button className="btn danger-outline block" onClick={remove} disabled={busy}>
                <Icon name="trash" size={16} /> Delete order
              </button>
            )}
          </aside>
        </div>
      )}
    </Modal>
  );
}
