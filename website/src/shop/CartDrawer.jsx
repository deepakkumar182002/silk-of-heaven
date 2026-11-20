import { useState } from 'react';
import { placeOrder } from '../data.js';
import Icon from '../icons.jsx';
import Overlay from './Overlay.jsx';

const PROFILE_KEY = 'vell_customer_v1';
export const LAST_ORDER_KEY = 'vell_last_order_v1';

const loadProfile = () => {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
  } catch {
    return {};
  }
};

const measureText = (m) =>
  m
    ? Object.entries(m)
        .map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${v}`)
        .join(' · ') + ' cm'
    : '';

export default function CartDrawer({ cart, onClose, onEdit, onTrack }) {
  const [step, setStep] = useState('cart'); // cart → details → done
  const [done, setDone] = useState(null);

  if (step === 'done' && done) {
    return <Done order={done} onClose={onClose} onTrack={() => onTrack(done.orderNumber, done.phone)} />;
  }

  if (step === 'details') {
    return (
      <Checkout
        cart={cart}
        onBack={() => setStep('cart')}
        onClose={onClose}
        onPlaced={(order) => {
          setDone(order);
          cart.clear();
          setStep('done');
        }}
      />
    );
  }

  const empty = cart.items.length === 0;
  return (
    <Overlay
      variant="drawer"
      title={`Your cart${cart.count ? ` · ${cart.count}` : ''}`}
      onClose={onClose}
      footer={
        !empty && (
          <>
            <div className="cart-sum">
              <span>Subtotal</span>
              <b>${cart.subtotal}</b>
            </div>
            <button className="shop-btn primary block" onClick={() => setStep('details')}>
              Place order
            </button>
          </>
        )
      }
    >
      {empty ? (
        <div className="shop-empty">
          <Icon name="cart" size={34} />
          <h3>Your cart is empty</h3>
          <p>Open a look, choose a garment, then pick colour and size to order it stitched for you.</p>
          <button className="shop-btn" onClick={onClose}>Browse looks</button>
        </div>
      ) : (
        <>
          <ul className="cart-list">
            {cart.items.map((it) => (
              <li key={it.cid} className="cart-line">
                <span className="cart-thumb" style={{ backgroundImage: `url("${it.image}")` }} />
                <div className="cart-info">
                  <b>{it.name}</b>
                  <small>
                    <i className="dot" style={{ background: it.colorHex || '#9aa0a6' }} />
                    {it.color} · Size {it.size}
                  </small>
                  {it.measurements && <small className="cart-meas">{measureText(it.measurements)}</small>}
                  {it.notes && <small className="cart-note">“{it.notes}”</small>}
                  <div className="cart-ctl">
                    <span className="mini-qty">
                      <button onClick={() => cart.setQty(it.cid, it.qty - 1)} disabled={it.qty <= 1} aria-label="Decrease quantity">
                        <Icon name="minus" size={13} stroke={2.2} />
                      </button>
                      {it.qty}
                      <button onClick={() => cart.setQty(it.cid, it.qty + 1)} disabled={it.qty >= 10} aria-label="Increase quantity">
                        <Icon name="plus" size={13} stroke={2.2} />
                      </button>
                    </span>
                    <button className="ps-link" onClick={() => onEdit(it)}>
                      <Icon name="pencil" size={13} /> Edit
                    </button>
                    <button className="ps-link danger" onClick={() => cart.remove(it.cid)}>
                      <Icon name="trash" size={13} /> Remove
                    </button>
                  </div>
                </div>
                <b className="cart-price">${it.price * it.qty}</b>
              </li>
            ))}
          </ul>
          <div className="cart-info-box">
            <Icon name="scissors" size={18} />
            <p>
              Each garment is stitched by our tailor. After you place the order, they will <b>contact you to confirm measurements</b> and
              then start work. Estimated time: about <b>{cart.leadDays + 3} days</b> from confirmation.
            </p>
          </div>
        </>
      )}
    </Overlay>
  );
}

function Checkout({ cart, onBack, onClose, onPlaced }) {
  const saved = loadProfile();
  const [f, setF] = useState({
    name: saved.name || '',
    phone: saved.phone || '',
    email: saved.email || '',
    contactPref: saved.contactPref || 'phone',
    line1: saved.line1 || '',
    line2: saved.line2 || '',
    city: saved.city || '',
    state: saved.state || '',
    pincode: saved.pincode || '',
    country: saved.country || '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { notes, ...profile } = f;
      const res = await placeOrder({
        customer: { name: f.name, phone: f.phone, email: f.email, contactPref: f.contactPref },
        address: { line1: f.line1, line2: f.line2, city: f.city, state: f.state, pincode: f.pincode, country: f.country },
        notes,
        items: cart.items.map((i) => ({
          lookId: i.lookId,
          group: i.group,
          pieceId: i.pieceId,
          name: i.name,
          color: i.color,
          size: i.size,
          qty: i.qty,
          measurements: i.measurements,
          notes: i.notes,
        })),
      });
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ orderNumber: res.orderNumber, phone: f.phone }));
      } catch {
        /* ignore */
      }
      onPlaced({ ...res, phone: f.phone, name: f.name, pref: f.contactPref });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay
      variant="drawer"
      title="Your details"
      onClose={onClose}
      footer={
        <>
          <div className="cart-sum">
            <span>{cart.count} item{cart.count === 1 ? '' : 's'}</span>
            <b>${cart.subtotal}</b>
          </div>
          <button className="shop-btn primary block" form="checkout-form" disabled={busy}>
            {busy ? 'Placing order…' : 'Confirm order'}
          </button>
        </>
      }
    >
      <button className="ps-link back" onClick={onBack}>
        <Icon name="chev" size={14} style={{ transform: 'rotate(90deg)' }} /> Back to cart
      </button>

      <form id="checkout-form" className="co" onSubmit={submit}>
        <fieldset>
          <legend>Contact</legend>
          <label>
            <span>Full name</span>
            <input required autoComplete="name" value={f.name} onChange={set('name')} />
          </label>
          <div className="co-row">
            <label>
              <span>Phone</span>
              <input required type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={set('phone')} />
            </label>
            <label>
              <span>Email <em>optional</em></span>
              <input type="email" autoComplete="email" value={f.email} onChange={set('email')} />
            </label>
          </div>
          <div className="co-pref" role="radiogroup" aria-label="How should the tailor contact you?">
            <span>Tailor should contact me by</span>
            {[['phone', 'Call'], ['whatsapp', 'WhatsApp'], ['email', 'Email']].map(([k, label]) => (
              <button
                type="button"
                key={k}
                role="radio"
                aria-checked={f.contactPref === k}
                className={f.contactPref === k ? 'on' : ''}
                onClick={() => setF((x) => ({ ...x, contactPref: k }))}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Delivery address</legend>
          <label>
            <span>Address</span>
            <input required autoComplete="address-line1" value={f.line1} onChange={set('line1')} placeholder="House / street" />
          </label>
          <label>
            <span>Area / landmark <em>optional</em></span>
            <input autoComplete="address-line2" value={f.line2} onChange={set('line2')} />
          </label>
          <div className="co-row">
            <label>
              <span>City</span>
              <input required autoComplete="address-level2" value={f.city} onChange={set('city')} />
            </label>
            <label>
              <span>State</span>
              <input autoComplete="address-level1" value={f.state} onChange={set('state')} />
            </label>
          </div>
          <div className="co-row">
            <label>
              <span>PIN / ZIP</span>
              <input autoComplete="postal-code" inputMode="numeric" value={f.pincode} onChange={set('pincode')} />
            </label>
            <label>
              <span>Country</span>
              <input autoComplete="country-name" value={f.country} onChange={set('country')} />
            </label>
          </div>
        </fieldset>

        <label>
          <span>Anything else for the tailor? <em>optional</em></span>
          <textarea rows={2} maxLength={800} value={f.notes} onChange={set('notes')} placeholder="e.g. needed before 30th, call after 6 pm" />
        </label>

        <p className="shop-muted small">No payment now. Your tailor confirms details and the final price with you first.</p>
        {error && <p className="shop-err" role="alert">{error}</p>}
      </form>
    </Overlay>
  );
}

function Done({ order, onClose, onTrack }) {
  const [copied, setCopied] = useState(false);
  const via = { phone: 'call you', whatsapp: 'message you on WhatsApp', email: 'email you' }[order.pref] || 'contact you';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <Overlay variant="modal" title="Order placed" onClose={onClose}>
      <div className="done">
        <span className="done-check">
          <Icon name="check" size={30} stroke={2.4} />
        </span>
        <h3>Thank you, {order.name.split(' ')[0]}!</h3>
        <p>Your stitching request has reached our tailor.</p>
        <button className="done-num" onClick={copy} aria-label="Copy order number">
          <span>Order number</span>
          <b>{order.orderNumber}</b>
          <em>
            <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Tap to copy'}
          </em>
        </button>
        <ol className="done-steps">
          <li><b>1</b> The tailor will {via} to confirm measurements.</li>
          <li><b>2</b> Stitching starts once everything is confirmed.</li>
          <li><b>3</b> You can follow progress any time with your order number and phone.</li>
        </ol>
        <div className="done-actions">
          <button className="shop-btn primary" onClick={onTrack}>
            <Icon name="receipt" size={16} /> Track order
          </button>
          <button className="shop-btn" onClick={onClose}>Keep browsing</button>
        </div>
      </div>
    </Overlay>
  );
}
