import { useEffect, useMemo, useRef, useState } from 'react';
import { SHOP, capi, money } from '../data.js';
import Icon from '../icons.jsx';
import Overlay from './Overlay.jsx';
import { useAccount } from '../account/account.jsx';

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

const linesFor = (items) =>
  items.map((i) => ({
    lookId: i.lookId,
    group: i.group,
    pieceId: i.pieceId,
    name: i.name,
    color: i.color,
    size: i.size,
    qty: i.qty,
    measurements: i.measurements,
    notes: i.notes,
  }));

/** Razorpay Checkout script, loaded once when needed. */
let rzpLoading = null;
export const loadRazorpay = () =>
  (rzpLoading ??= new Promise((res, rej) => {
    if (window.Razorpay) return res(window.Razorpay);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => res(window.Razorpay);
    s.onerror = () => {
      rzpLoading = null;
      rej(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.body.appendChild(s);
  }));

export default function CartDrawer({ cart, onClose, onEdit, onTrack, onViewOrder }) {
  const [step, setStep] = useState('cart'); // cart → details → done
  const [done, setDone] = useState(null);

  if (step === 'done' && done) {
    return <Done order={done} onClose={onClose} onTrack={() => onTrack(done.orderNumber, done.phone)} onViewOrder={onViewOrder} />;
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
  const freeLeft = SHOP.freeShippingOver ? SHOP.freeShippingOver - cart.subtotal : 0;
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
              <b>{money(cart.subtotal)}</b>
            </div>
            <small className="shop-muted cart-tax">
              {SHOP.pricesIncludeTax ? 'Prices include GST.' : `GST ${SHOP.gstRate}% added at checkout.`} Shipping{' '}
              {freeLeft > 0 ? `${money(SHOP.shippingFee)} (free above ${money(SHOP.freeShippingOver)})` : 'free'}.
            </small>
            <button className="shop-btn primary block" onClick={() => setStep('details')}>
              Checkout
            </button>
          </>
        )
      }
    >
      {empty ? (
        <div className="shop-empty">
          <Icon name="cart" size={34} />
          <h3>Your cart is empty</h3>
          <p>Open a look, choose a garment, then pick colour and size.</p>
          <button className="shop-btn" onClick={onClose}>
            Browse looks
          </button>
        </div>
      ) : (
        <>
          {freeLeft > 0 && (
            <p className="cart-free">
              Add {money(freeLeft)} more for <b>free shipping</b>
              <i style={{ '--p': `${Math.min(100, (cart.subtotal / SHOP.freeShippingOver) * 100)}%` }} />
            </p>
          )}
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
                <b className="cart-price">{money(it.price * it.qty)}</b>
              </li>
            ))}
          </ul>
          {cart.items.some((i) => i.madeToOrder) && (
            <div className="cart-info-box">
              <Icon name="scissors" size={18} />
              <p>
                Made-to-order garments are stitched by our tailor, who <b>contacts you to confirm measurements</b> first. Estimated time: about{' '}
                <b>{cart.leadDays + 3} days</b> from confirmation.
              </p>
            </div>
          )}
        </>
      )}
    </Overlay>
  );
}

// ---------------------------------------------------------------------------
// Checkout: contact, address, coupon, payment
// ---------------------------------------------------------------------------
function Checkout({ cart, onBack, onClose, onPlaced }) {
  const acc = useAccount();
  const me = acc.customer;
  const saved = loadProfile();
  const addresses = me?.addresses || [];
  const def = addresses.find((a) => a.isDefault) || addresses[0];
  const fromAddress = (a) => ({ line1: a.line1, line2: a.line2 || '', city: a.city, state: a.state || '', pincode: a.pincode || '', country: a.country || 'India' });
  const [f, setF] = useState(() => ({
    name: me?.name || def?.name || saved.name || '',
    phone: me?.phone || def?.phone || saved.phone || '',
    email: me?.email || saved.email || '',
    contactPref: saved.contactPref === 'phone' ? 'phone' : 'email',
    ...(def ? fromAddress(def) : { line1: saved.line1 || '', line2: saved.line2 || '', city: saved.city || '', state: saved.state || '', pincode: saved.pincode || '', country: saved.country || 'India' }),
    notes: '',
  }));
  const [addrId, setAddrId] = useState(def?._id || 'new');
  const [saveAddress, setSaveAddress] = useState(true);
  const [method, setMethod] = useState(SHOP.online ? 'razorpay' : 'cod');
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState('');
  const [quote, setQuote] = useState(null);
  const [qErr, setQErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const lines = useMemo(() => linesFor(cart.items), [cart.items]);
  const seq = useRef(0);

  // live price: coupon, shipping, GST, COD fee
  useEffect(() => {
    const n = ++seq.current;
    capi('/api/public/checkout/quote', { method: 'POST', body: { items: lines, couponCode: applied, method } })
      .then((q) => n === seq.current && (setQuote(q), setQErr('')))
      .catch((e) => n === seq.current && setQErr(e.message));
  }, [lines, applied, method]);

  // login happened while this was open → fill in the account details
  useEffect(() => {
    if (!me) return;
    setF((x) => ({ ...x, name: x.name || me.name || '', phone: x.phone || me.phone || '', email: x.email || me.email || '' }));
  }, [me]);

  const pickAddress = (a) => {
    setAddrId(a ? a._id : 'new');
    setF((x) => ({ ...x, ...(a ? fromAddress(a) : { line1: '', line2: '', city: '', state: '', pincode: '', country: 'India' }) }));
  };

  const payOnline = async (r) => {
    const Razorpay = await loadRazorpay();
    return new Promise((resolve, reject) => {
      const rz = new Razorpay({
        key: r.razorpay.key,
        order_id: r.razorpay.orderId,
        amount: r.razorpay.amount,
        currency: r.razorpay.currency,
        name: r.razorpay.name,
        description: r.razorpay.description,
        prefill: r.razorpay.prefill,
        theme: { color: '#1d1b20' },
        handler: async (resp) => {
          try {
            resolve(await capi('/api/public/checkout/verify', { method: 'POST', body: resp }));
          } catch (e) {
            reject(e);
          }
        },
        modal: {
          ondismiss: () => {
            capi('/api/public/checkout/cancel', { method: 'POST', body: { razorpay_order_id: r.razorpay.orderId } }).catch(() => {});
            reject(new Error('Payment was not completed. Your cart is still here, try again when you are ready.'));
          },
        },
      });
      rz.on('payment.failed', (resp) => setError(resp?.error?.description || 'The payment failed. Please try another method.'));
      rz.open();
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (quote?.stockError) return setError(quote.stockError);
    setBusy(true);
    try {
      const { notes, ...profile } = f;
      const r = await capi('/api/public/checkout/order', {
        method: 'POST',
        body: {
          method,
          customer: { name: f.name, phone: f.phone, email: f.email, contactPref: f.contactPref },
          address: { line1: f.line1, line2: f.line2, city: f.city, state: f.state, pincode: f.pincode, country: f.country },
          notes,
          couponCode: applied,
          saveAddress: !!me && addrId === 'new' && saveAddress,
          items: lines,
        },
      });
      const final = method === 'razorpay' ? await payOnline(r) : r;
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ orderNumber: final.orderNumber, phone: f.phone }));
      } catch {
        /* ignore */
      }
      if (me) capi('/api/customer/me').then((x) => acc.setCustomer(x.customer)).catch(() => {});
      onPlaced({ ...final, phone: f.phone, name: f.name, pref: f.contactPref, method, email: f.email, loggedIn: !!me });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const q = quote;
  const methods = q?.methods || { razorpay: SHOP.online, cod: SHOP.cod };
  useEffect(() => {
    if (method === 'razorpay' && !methods.razorpay && methods.cod) setMethod('cod');
    if (method === 'cod' && !methods.cod && methods.razorpay) setMethod('razorpay');
  }, [method, methods.razorpay, methods.cod]);

  return (
    <Overlay
      variant="drawer"
      title="Checkout"
      onClose={onClose}
      footer={
        <>
          {q && (
            <dl className="co-total">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(q.subtotal)}</dd>
              </div>
              {q.discount > 0 && (
                <div className="disc">
                  <dt>Coupon {q.coupon?.code}</dt>
                  <dd>−{money(q.discount)}</dd>
                </div>
              )}
              <div>
                <dt>Shipping</dt>
                <dd>{q.shipping ? money(q.shipping) : 'Free'}</dd>
              </div>
              {q.codFee > 0 && (
                <div>
                  <dt>Cash on delivery fee</dt>
                  <dd>{money(q.codFee)}</dd>
                </div>
              )}
              <div className="tax">
                <dt>
                  GST {q.taxRate}%{q.taxIncluded ? ' (included)' : ''}
                </dt>
                <dd>{money(q.tax)}</dd>
              </div>
              <div className="grand">
                <dt>Total</dt>
                <dd>{money(q.total)}</dd>
              </div>
            </dl>
          )}
          <button className="shop-btn primary block" form="checkout-form" disabled={busy || !q || !!q.stockError || (!methods.razorpay && !methods.cod)}>
            {busy ? (method === 'razorpay' ? 'Opening payment…' : 'Placing order…') : method === 'razorpay' ? `Pay ${q ? money(q.total) : ''}` : 'Place order (pay on delivery)'}
          </button>
        </>
      }
    >
      <button className="ps-link back" onClick={onBack}>
        <Icon name="chev" size={14} style={{ transform: 'rotate(90deg)' }} /> Back to cart
      </button>

      {!me && acc.ready && (
        <div className="co-login">
          <span>Have an account? Log in for saved addresses and order history.</span>
          <button type="button" className="shop-btn" onClick={() => acc.openAuth('Log in to check out faster')}>
            Log in
          </button>
        </div>
      )}

      <form id="checkout-form" className="co" onSubmit={submit}>
        <fieldset>
          <legend>Contact</legend>
          <label>
            <span>Full name</span>
            <input required autoComplete="name" value={f.name} onChange={set('name')} />
          </label>
          <div className="co-row">
            <label>
              <span>Mobile</span>
              <input required type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="98765 43210" />
            </label>
            <label>
              <span>
                Email <em>order updates are sent here</em>
              </span>
              <input required type="email" autoComplete="email" value={f.email} onChange={set('email')} />
            </label>
          </div>
          {cart.items.some((i) => i.madeToOrder) && (
            <div className="co-pref" role="radiogroup" aria-label="How should the tailor contact you?">
              <span>Tailor should contact me by</span>
              {[
                ['email', 'Email'],
                ['phone', 'Call'],
              ].map(([k, label]) => (
                <button type="button" key={k} role="radio" aria-checked={f.contactPref === k} className={f.contactPref === k ? 'on' : ''} onClick={() => setF((x) => ({ ...x, contactPref: k }))}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Delivery address</legend>
          {addresses.length > 0 && (
            <div className="co-addrs">
              {addresses.map((a) => (
                <button type="button" key={a._id} className={addrId === a._id ? 'on' : ''} onClick={() => pickAddress(a)}>
                  <b>{a.label}</b>
                  <small>
                    {a.line1}, {a.city} {a.pincode}
                  </small>
                </button>
              ))}
              <button type="button" className={addrId === 'new' ? 'on' : ''} onClick={() => pickAddress(null)}>
                <b>+ New address</b>
              </button>
            </div>
          )}
          <label>
            <span>House / flat, street</span>
            <input required autoComplete="address-line1" value={f.line1} onChange={set('line1')} />
          </label>
          <label>
            <span>
              Area / landmark <em>optional</em>
            </span>
            <input autoComplete="address-line2" value={f.line2} onChange={set('line2')} />
          </label>
          <div className="co-row">
            <label>
              <span>City</span>
              <input required autoComplete="address-level2" value={f.city} onChange={set('city')} />
            </label>
            <label>
              <span>State</span>
              <input required autoComplete="address-level1" value={f.state} onChange={set('state')} />
            </label>
          </div>
          <div className="co-row">
            <label>
              <span>PIN code</span>
              <input required autoComplete="postal-code" inputMode="numeric" pattern="\d{6}" maxLength={6} value={f.pincode} onChange={set('pincode')} title="6-digit PIN code" />
            </label>
            <label>
              <span>Country</span>
              <input value="India" readOnly aria-readonly="true" />
            </label>
          </div>
          {me && addrId === 'new' && (
            <label className="co-check">
              <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /> Save this address to my account
            </label>
          )}
        </fieldset>

        <fieldset>
          <legend>Coupon</legend>
          <div className="co-coupon">
            <input
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              placeholder="Enter code"
              aria-label="Coupon code"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), setApplied(coupon.trim()))}
            />
            {applied && q?.coupon ? (
              <button type="button" className="shop-btn" onClick={() => (setApplied(''), setCoupon(''))}>
                Remove
              </button>
            ) : (
              <button type="button" className="shop-btn" onClick={() => setApplied(coupon.trim())} disabled={!coupon.trim()}>
                Apply
              </button>
            )}
          </div>
          {applied && q?.coupon && (
            <small className="co-ok">
              <Icon name="check" size={13} /> {q.coupon.code} applied: you save {money(q.discount)}
              {q.coupon.description ? ` · ${q.coupon.description}` : ''}
            </small>
          )}
          {applied && q?.couponError && <small className="shop-err">{q.couponError}</small>}
        </fieldset>

        <fieldset>
          <legend>Payment</legend>
          <div className="co-pay" role="radiogroup" aria-label="Payment method">
            {methods.razorpay && (
              <button type="button" role="radio" aria-checked={method === 'razorpay'} className={method === 'razorpay' ? 'on' : ''} onClick={() => setMethod('razorpay')}>
                <Icon name="wallet" size={18} />
                <span>
                  <b>Pay online</b>
                  <small>UPI, cards, net banking, wallets · secured by Razorpay</small>
                </span>
              </button>
            )}
            {methods.cod && (
              <button type="button" role="radio" aria-checked={method === 'cod'} className={method === 'cod' ? 'on' : ''} onClick={() => setMethod('cod')}>
                <Icon name="box" size={18} />
                <span>
                  <b>Cash on delivery</b>
                  <small>
                    Pay in cash or UPI when it arrives ·{' '}
                    {(q ? q.codCharge : SHOP.codFee) > 0 ? (
                      <>
                        {money(q ? q.codCharge : SHOP.codFee)} extra
                        {SHOP.codFreeOver > 0 ? ` (free on orders of ${money(SHOP.codFreeOver)}+)` : ''}
                        {SHOP.codFreeItems > 0 ? ` (free for ${SHOP.codFreeItems}+ items)` : ''}
                      </>
                    ) : (
                      'no extra charge'
                    )}
                  </small>
                </span>
              </button>
            )}
            {!methods.razorpay && !methods.cod && <p className="shop-err">Ordering is paused right now. Please contact us.</p>}
          </div>
        </fieldset>

        <label>
          <span>
            Note for us <em>optional</em>
          </span>
          <textarea rows={2} maxLength={800} value={f.notes} onChange={set('notes')} placeholder="e.g. needed before the 30th" />
        </label>

        {(qErr || q?.stockError) && <p className="shop-err">{q?.stockError || qErr}</p>}
        {error && (
          <p className="shop-err" role="alert">
            {error}
          </p>
        )}
        <p className="shop-muted small">
          By placing the order you agree to the{' '}
          <a href="/pages/terms" target="_blank" rel="noreferrer">
            terms
          </a>{' '}
          and{' '}
          <a href="/pages/returns" target="_blank" rel="noreferrer">
            returns policy
          </a>
          .
        </p>
      </form>
    </Overlay>
  );
}

function Done({ order, onClose, onTrack, onViewOrder }) {
  const [copied, setCopied] = useState(false);
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
    <Overlay variant="modal" title={order.method === 'razorpay' ? 'Payment successful' : 'Order placed'} onClose={onClose}>
      <div className="done">
        <span className="done-check">
          <Icon name="check" size={30} stroke={2.4} />
        </span>
        <h3>Thank you, {order.name.split(' ')[0]}!</h3>
        <p>
          {order.method === 'razorpay' ? `We received your payment of ${money(order.total)}.` : `Please keep ${money(order.total)} ready for the delivery.`}
          {order.email ? ` A confirmation is on its way to ${order.email}, and every update on this order will be emailed too.` : ''}
        </p>
        <button className="done-num" onClick={copy} aria-label="Copy order number">
          <span>Order number</span>
          <b>{order.orderNumber}</b>
          <em>
            <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Tap to copy'}
          </em>
        </button>
        <div className="done-actions">
          {order.loggedIn ? (
            <button className="shop-btn primary" onClick={() => onViewOrder(order.orderNumber)}>
              <Icon name="receipt" size={16} /> View order
            </button>
          ) : (
            <button className="shop-btn primary" onClick={onTrack}>
              <Icon name="receipt" size={16} /> Track order
            </button>
          )}
          <button className="shop-btn" onClick={onClose}>
            Keep shopping
          </button>
        </div>
      </div>
    </Overlay>
  );
}
