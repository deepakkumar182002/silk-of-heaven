import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_URL, api, getToken, imgUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Modal, Spinner, useToast } from '../components/ui.jsx';

export const STATUS = {
  new: 'New',
  contacted: 'Contacted',
  stitching: 'Stitching',
  ready: 'Ready / packed',
  shipped: 'Shipped (courier)',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const ALL_STATUS = { ...STATUS, awaiting_payment: 'Awaiting payment' };
// shop orders: pack → courier or own delivery partner → delivered.
// stitching orders (a customer's own dress): confirm details → stitch → ready → delivery.
const isStitch = (o) => o.kind === 'stitching' || ['contacted', 'stitching'].includes(o.status);
const ownDelivery = (o) => !!o.delivery?.boy || o.status === 'out_for_delivery';
const flowOf = (o) => [
  'new',
  ...(isStitch(o) ? ['contacted', 'stitching'] : []),
  'ready',
  ownDelivery(o) ? 'out_for_delivery' : 'shipped',
  'delivered',
];
// what the single big action button does at each step
const nextOf = (o) => {
  if (o.status === 'new') return isStitch(o) ? ['contacted', 'Details confirmed', 'phone'] : ['ready', 'Packed, ready to dispatch', 'box'];
  if (o.status === 'contacted') return ['stitching', 'Start stitching', 'scissors'];
  if (o.status === 'stitching') return ['ready', 'Mark as ready', 'box'];
  if (o.status === 'ready') return o.delivery?.boy ? null : ['shipped', 'Shipped by courier', 'box'];
  if (o.status === 'shipped' || o.status === 'out_for_delivery') return ['delivered', 'Mark as delivered', 'check'];
  return null;
};
const NEXT_HINT = {
  new: 'Shop order: pack it and mark it ready. Stitching order: call the customer, confirm the details and measurements first.',
  contacted: 'Once measurements and details are confirmed, start the stitching.',
  stitching: 'When the dress is finished and checked, mark the order ready.',
  ready: 'Give it to a delivery partner below (they update it from their phone), or send it by courier with a tracking number.',
  shipped: 'When the parcel is delivered, mark it delivered. Cash on delivery: also mark the payment received.',
  out_for_delivery: 'The delivery partner marks it delivered and collects cash for COD orders.',
};
const PAY = { unpaid: 'Unpaid', pending: 'Payment pending', paid: 'Paid', failed: 'Failed', refunded: 'Refunded', partially_refunded: 'Part refunded' };
const payLabel = (o) => (o.payment?.method === 'cod' ? `COD · ${PAY[o.payment.status] || o.payment.status}` : o.payment?.method === 'razorpay' ? `Online · ${PAY[o.payment.status]}` : PAY[o.payment?.status] || '');

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
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
export const Pill = ({ s }) => <span className={'pill-s s-' + s}>{ALL_STATUS[s] || s}</span>;

export default function Orders() {
  const { admin } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'all';
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [kind, setKind] = useState('all');
  const [data, setData] = useState(null);
  const [openId, setOpenId] = useState(() => params.get('open'));
  const toast = useToast();

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (status === 'returns') qs.set('returns', '1');
    else if (status !== 'all') qs.set('status', status);
    if (q.trim()) qs.set('q', q.trim());
    if (mine) qs.set('mine', '1');
    if (kind !== 'all') qs.set('kind', kind);
    return api('/api/admin/orders?' + qs)
      .then(setData)
      .catch((e) => toast(e.message, 'err'));
  }, [status, q, mine, kind, toast]);

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
      <PageHead title="Orders" sub="Paid online or cash on delivery orders. Confirm details, pack or stitch, ship, then mark delivered.">
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </PageHead>

      <div className="status-tabs" role="tablist">
        {[['all', 'All', total - (counts.awaiting_payment || 0)], ...Object.entries(STATUS).map(([k, l]) => [k, l, counts[k] || 0]), ['returns', 'Returns', '']].map(([k, label, n]) => (
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
        <div className="seg">
          {[
            ['all', 'All'],
            ['shop', 'Shop orders'],
            ['stitching', 'Stitching'],
          ].map(([k, l]) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {l}
            </button>
          ))}
        </div>
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
                <small>
                  {o.kind === 'stitching' ? <span className="kind-tag">Stitching</span> : null}
                  {ago(o.createdAt)}
                </small>
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
              <div className="or-total">
                <b>{money(o.total)}</b>
                <small className={'pay-s p-' + o.payment?.status}>{payLabel(o)}</small>
              </div>
              <div className="or-state">
                <Pill s={o.status} />
                <small>{o.delivery?.boy ? `🛵 ${o.delivery.boy.name}` : o.assignedTo ? o.assignedTo.name : 'Unassigned'}</small>
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
  const [tracking, setTracking] = useState({ carrier: '', number: '', url: '' });
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
      apply(await api(`/api/admin/orders/${id}/status`, { method: 'PUT', body: { status, note: msg, ...(status === 'shipped' ? { tracking } : {}) } }));
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

  const invoice = () =>
    run(async () => {
      const res = await fetch(`${API_URL}/api/admin/orders/${id}/invoice`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Invoice not available');
      window.open(URL.createObjectURL(await res.blob()), '_blank');
    });
  const markPaid = (paid) =>
    run(async () => {
      apply(await api(`/api/admin/orders/${id}/payment`, { method: 'PUT', body: { status: paid ? 'paid' : 'unpaid' } }));
      toast(paid ? 'Payment marked as received' : 'Payment marked as not received');
    });
  const refund = () => {
    const left = Math.round((o.total - (o.payment?.refunded || 0)) * 100) / 100;
    const v = window.prompt(
      `Refund how much? Up to ₹${left}.${o.payment?.method === 'razorpay' ? ' It goes back to the customer through Razorpay.' : ' Record a refund you paid yourself (UPI / bank).'}`,
      String(left)
    );
    if (!v) return;
    run(async () => {
      apply(await api(`/api/admin/orders/${id}/refund`, { method: 'POST', body: { amount: Number(v), note: 'Refund by admin' } }));
      toast('Refund recorded');
    });
  };
  const setReturn = (r, status) => {
    let refundAmount;
    if (status === 'refunded') {
      const v = window.prompt('Refund amount for this return (₹):', String(r.items.reduce((n, x) => n + (o.items.find((i) => i._id === x.item)?.unitPrice || 0) * x.qty, 0)));
      if (!v) return;
      refundAmount = Number(v);
    }
    const note = status === 'rejected' ? window.prompt('Reason shown to the customer:', '') ?? '' : undefined;
    run(async () => {
      apply(await api(`/api/admin/orders/${id}/returns/${r._id}`, { method: 'PUT', body: { status, note, refundAmount } }));
      toast(`Return ${status}`);
    });
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`);
    } catch {
      toast('Could not copy', 'err');
    }
  };

  const next = o && nextOf(o);
  const FLOW = o ? flowOf(o) : [];
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
                  href={`https://wa.me/${phoneDigits.length === 10 ? '91' + phoneDigits : phoneDigits}?text=${encodeURIComponent(`Hi ${o.customer.name.split(' ')[0]}, this is Silk of Heaven about your order ${o.orderNumber}.`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="chat" size={17} /> WhatsApp
                </a>
                {o.customer.email && (
                  <a className={'btn' + (o.customer.contactPref === 'email' ? ' primary' : '')} href={`mailto:${o.customer.email}?subject=${encodeURIComponent(`Your Silk of Heaven order ${o.orderNumber}`)}`}>
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
                Items to make · {o.items.reduce((n, i) => n + i.qty, 0)} {isStitch(o) && <span className="muted">({stitchItems.length} to stitch)</span>}
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
              <dl className="od-sum">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{money(o.subtotal)}</dd>
                </div>
                {o.discount > 0 && (
                  <div>
                    <dt>Coupon {o.couponCode}</dt>
                    <dd>−{money(o.discount)}</dd>
                  </div>
                )}
                <div>
                  <dt>Shipping</dt>
                  <dd>{o.shipping ? money(o.shipping) : 'Free'}</dd>
                </div>
                {o.codFee > 0 && (
                  <div>
                    <dt>COD fee</dt>
                    <dd>{money(o.codFee)}</dd>
                  </div>
                )}
                <div className="muted">
                  <dt>
                    GST {o.taxRate}%{o.taxIncluded ? ' (included)' : ''}
                  </dt>
                  <dd>{money(o.tax)}</dd>
                </div>
                <div className="od-total">
                  <dt>Total</dt>
                  <dd>{money(o.total)}</dd>
                </div>
                {o.payment?.refunded > 0 && (
                  <div>
                    <dt>Refunded</dt>
                    <dd>−{money(o.payment.refunded)}</dd>
                  </div>
                )}
              </dl>
            </section>

            {o.returns?.length > 0 && (
              <section>
                <h4 className="section-title">Returns</h4>
                {o.returns.map((r) => (
                  <div key={r._id} className="od-card od-return">
                    <div className="od-item-top">
                      <b>{r.items.map((x) => `${x.qty} × ${x.name}`).join(', ')}</b>
                      <span className={'pill-s r-' + r.status}>{r.status}</span>
                    </div>
                    <small className="muted">
                      {when(r.requestedAt)} · {r.reason}
                      {r.details ? ` · “${r.details}”` : ''}
                      {r.refundAmount ? ` · refunded ${money(r.refundAmount)}` : ''}
                    </small>
                    {me?.role === 'admin' && !['rejected', 'refunded'].includes(r.status) && (
                      <div className="row-actions">
                        {r.status === 'requested' && (
                          <button className="btn sm primary" disabled={busy} onClick={() => setReturn(r, 'approved')}>
                            Approve
                          </button>
                        )}
                        {r.status === 'requested' && (
                          <button className="btn sm" disabled={busy} onClick={() => setReturn(r, 'rejected')}>
                            Reject
                          </button>
                        )}
                        {r.status === 'approved' && (
                          <button className="btn sm" disabled={busy} onClick={() => setReturn(r, 'received')}>
                            Item received (back in stock)
                          </button>
                        )}
                        {['approved', 'received'].includes(r.status) && (
                          <button className="btn sm primary" disabled={busy} onClick={() => setReturn(r, 'refunded')}>
                            Refund
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}
          </div>

          {/* ---------------- right: workflow ---------------- */}
          <aside className="od-side">
            <section className="od-card">
              <h4 className="section-title">Payment</h4>
              <p className="od-pay">
                <span className={'pay-s p-' + o.payment?.status}>{payLabel(o)}</span>
                {o.payment?.razorpayPaymentId && <small className="muted">{o.payment.razorpayPaymentId}</small>}
              </p>
              <div className="row-actions wrap">
                {o.invoiceNumber && (
                  <button className="btn sm" onClick={invoice} disabled={busy}>
                    <Icon name="orders" size={15} /> Invoice {o.invoiceNumber}
                  </button>
                )}
                {me?.role === 'admin' && o.payment?.method === 'cod' && o.status !== 'cancelled' && (
                  <button className="btn sm" onClick={() => markPaid(o.payment.status !== 'paid')} disabled={busy}>
                    {o.payment.status === 'paid' ? 'Mark not received' : 'Cash received'}
                  </button>
                )}
                {me?.role === 'admin' && ['paid', 'partially_refunded'].includes(o.payment?.status) && (
                  <button className="btn sm" onClick={refund} disabled={busy}>
                    Refund…
                  </button>
                )}
              </div>
              {o.payment?.refunds?.length > 0 && (
                <ul className="notes">
                  {o.payment.refunds.map((r, i) => (
                    <li key={i}>
                      {money(r.amount)} refunded{r.id && r.id !== 'manual' ? ` · ${r.id}` : ' (manual)'}
                      <small>{when(r.at)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </section>

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
                  {next?.[0] === 'shipped' && (
                    <div className="row2">
                      <input placeholder="Courier (e.g. Delhivery)" value={tracking.carrier} onChange={(e) => setTracking((t) => ({ ...t, carrier: e.target.value }))} />
                      <input placeholder="Tracking number" value={tracking.number} onChange={(e) => setTracking((t) => ({ ...t, number: e.target.value }))} />
                      <input placeholder="Tracking link (optional)" value={tracking.url} onChange={(e) => setTracking((t) => ({ ...t, url: e.target.value }))} style={{ gridColumn: '1 / -1' }} />
                    </div>
                  )}
                  {next && (
                    <button className="btn primary block" disabled={busy} onClick={() => setStatus(next[0])}>
                      {busy ? <Spinner /> : <><Icon name={next[2]} size={17} /> {next[1]}</>}
                    </button>
                  )}
                  <button
                    className="btn danger-outline block"
                    disabled={busy}
                    onClick={() =>
                      window.confirm(
                        o.payment?.status === 'paid' && o.payment.method === 'razorpay'
                          ? 'Cancel this order? Stock goes back and the full payment is refunded through Razorpay.'
                          : 'Cancel this order? Stock goes back and the customer is told by email.'
                      ) && setStatus('cancelled')
                    }
                  >
                    Cancel order
                  </button>
                </>
              )}

            </section>

            <DeliveryBox o={o} me={me} staff={staff} busy={busy} run={run} reload={async () => apply(await api(`/api/admin/orders/${id}`))} />

            {o.stitchRequest && (
              <section className="od-card">
                <h4 className="section-title">Stitching request {o.stitchRequest.number}</h4>
                <p className="muted small">
                  {o.stitchRequest.garment} · fabric: {o.stitchRequest.fabricSource === 'store' ? 'from the store' : "customer's own"}
                  {o.stitchRequest.measureVisit ? ' · tailor takes measurements' : ''}
                </p>
                <a className="btn sm" href={`/stitching?open=${o.stitchRequest._id}`}>
                  Open the request (photos, measurements)
                </a>
              </section>
            )}

            <section className="od-card">
              <label className="field">
                <span className="field-label">Assigned tailor</span>
                <select value={o.assignedTo?._id || ''} onChange={(e) => assign(e.target.value)} disabled={busy}>
                  <option value="">Unassigned</option>
                  {staff.filter((s) => s.role !== 'delivery').map((s) => (
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
                    <b>{ALL_STATUS[h.status] || h.status}</b>
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

/** Own delivery partner for this order: assign / change, and what the partner did. */
function DeliveryBox({ o, me, staff, busy, run, reload }) {
  const toast = useToast();
  if (me?.role !== 'admin' || ['cancelled', 'awaiting_payment'].includes(o.status)) return null;
  const partners = staff.filter((s) => s.role === 'delivery' && s.phoneVerified);
  const d = o.delivery || {};
  const assign = (boy) =>
    run(async () => {
      await api(`/api/admin/delivery/orders/${o._id}/assign`, { method: 'PUT', body: { boy: boy || null } });
      await reload();
      toast(boy ? 'Delivery partner assigned' : 'Delivery partner removed');
    });
  return (
    <section className="od-card">
      <h4 className="section-title">Delivery partner</h4>
      {o.status === 'delivered' ? (
        <p className="muted small">
          {d.boy ? `Delivered by ${d.boy.name}` : 'Delivered'}
          {d.codCollected ? ` · collected ${money(d.codCollected)} cash` : ''}
          {d.rating ? ` · rated ${d.rating}/5${d.ratingNote ? ` “${d.ratingNote}”` : ''}` : ''}
        </p>
      ) : (
        <label className="field">
          <select value={d.boy?._id || ''} onChange={(e) => assign(e.target.value)} disabled={busy || o.status === 'out_for_delivery'}>
            <option value="">{partners.length ? 'Not assigned (courier or later)' : 'No verified delivery partners yet (Team)'}</option>
            {partners.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} · {s.phone}
              </option>
            ))}
          </select>
        </label>
      )}
      {d.boy && (
        <ul className="notes">
          {d.assignedAt && <li>Assigned<small>{when(d.assignedAt)}</small></li>}
          {d.pickedAt && <li>Picked up<small>{when(d.pickedAt)}</small></li>}
          {d.outAt && <li>Out for delivery<small>{when(d.outAt)}</small></li>}
          {(d.attempts || []).map((a, i) => (
            <li key={i}>
              Not delivered: {a.note}
              <small>{when(a.at)}</small>
            </li>
          ))}
          {d.deliveredAt && <li>Delivered<small>{when(d.deliveredAt)}</small></li>}
        </ul>
      )}
    </section>
  );
}
