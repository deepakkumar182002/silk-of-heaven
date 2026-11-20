import { useEffect, useState } from 'react';
import { imgUrl, trackOrder } from '../data.js';
import Icon from '../icons.jsx';
import Overlay from './Overlay.jsx';
import { LAST_ORDER_KEY } from './CartDrawer.jsx';

const STEPS = [
  ['new', 'Order received', 'Your request is with our tailor.'],
  ['contacted', 'Tailor contacted you', 'Measurements and details confirmed.'],
  ['stitching', 'Stitching in progress', 'Your garment is being made.'],
  ['ready', 'Ready', 'Quality-checked and packed.'],
  ['delivered', 'Delivered', 'Enjoy your new look!'],
];
const LABEL = Object.fromEntries([...STEPS.map(([k, l]) => [k, l]), ['cancelled', 'Cancelled']]);

const fmt = (d) =>
  new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function TrackOrder({ initial, onClose }) {
  const [form, setForm] = useState(() => {
    if (initial) return { orderNumber: initial.orderNumber, phone: initial.phone };
    try {
      const l = JSON.parse(localStorage.getItem(LAST_ORDER_KEY));
      if (l) return { orderNumber: l.orderNumber, phone: l.phone };
    } catch {
      /* ignore */
    }
    return { orderNumber: '', phone: '' };
  });
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lookup = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      setOrder(await trackOrder(form.orderNumber, form.phone));
    } catch (err) {
      setOrder(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // opened right after placing an order → show it straight away
  useEffect(() => {
    if (initial) lookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelled = order?.status === 'cancelled';
  const at = order ? STEPS.findIndex(([k]) => k === order.status) : -1;

  return (
    <Overlay title="Track your order" onClose={onClose}>
      <form className="track-form" onSubmit={lookup}>
        <label>
          <span>Order number</span>
          <input required placeholder="VL-261120-ABCD" value={form.orderNumber} onChange={(e) => setForm((f) => ({ ...f, orderNumber: e.target.value }))} />
        </label>
        <label>
          <span>Phone used for the order</span>
          <input required type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </label>
        <button className="shop-btn primary" disabled={busy}>{busy ? 'Looking…' : 'Track'}</button>
      </form>
      {error && <p className="shop-err" role="alert">{error}</p>}

      {order && (
        <div className="track">
          <div className="track-head">
            <div>
              <small>Order</small>
              <b>{order.orderNumber}</b>
            </div>
            <span className={'track-pill ' + order.status}>{LABEL[order.status]}</span>
          </div>

          {cancelled ? (
            <p className="shop-muted">This order was cancelled. Contact us if you think this is a mistake.</p>
          ) : (
            <ol className="track-steps">
              {STEPS.map(([k, title, sub], i) => (
                <li key={k} className={i < at ? 'done' : i === at ? 'now' : ''}>
                  <span className="track-dot">{i < at ? <Icon name="check" size={13} stroke={2.6} /> : i + 1}</span>
                  <div>
                    <b>{title}</b>
                    <small>{sub}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <h4>Items</h4>
          <ul className="track-items">
            {order.items.map((i, n) => (
              <li key={n}>
                <span className="cart-thumb" style={{ backgroundImage: `url("${imgUrl(i.image, 160)}")` }} />
                <div>
                  <b>{i.name}</b>
                  <small>{i.color} · {i.size} · ×{i.qty}</small>
                </div>
                <b>${i.unitPrice * i.qty}</b>
              </li>
            ))}
          </ul>
          <div className="cart-sum"><span>Total</span><b>${order.total}</b></div>

          <h4>Updates</h4>
          <ul className="track-log">
            {[...order.history].reverse().map((h, n) => (
              <li key={n}>
                <b>{LABEL[h.status] || h.status}</b>
                <small>{fmt(h.at)}</small>
                {h.note && <p>{h.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Overlay>
  );
}
