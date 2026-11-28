import { useEffect, useMemo, useState } from 'react';
import { SHOP, capi, imgUrl, money } from '../data.js';
import Icon from '../icons.jsx';
import { linkProps, navigate, setSeo } from '../useRoute.js';
import { getProducts } from '../shop/catalog.js';
import { ProductCard } from '../shop/ShopPage.jsx';
import { StoreFooter, StoreHeader } from '../shop/StoreChrome.jsx';
import { useAccount } from './account.jsx';
import { StitchingDetail, StitchingList } from './StitchingPage.jsx';

const TABS = [
  ['orders', 'My orders', 'receipt'],
  ['stitching', 'Custom stitching', 'scissors'],
  ['wishlist', 'Wishlist', 'heart'],
  ['addresses', 'Addresses', 'pin'],
  ['profile', 'Profile', 'user'],
];
export const STATUS_LABEL = {
  awaiting_payment: 'Awaiting payment',
  new: 'Confirmed',
  contacted: 'Details confirmed',
  stitching: 'Being stitched',
  ready: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const PAY_LABEL = { unpaid: 'Pay on delivery', pending: 'Payment pending', paid: 'Paid', failed: 'Payment failed', refunded: 'Refunded', partially_refunded: 'Partly refunded' };
const date = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AccountPage({ route, cart, onOpenCart, onFittingRoom, onOpenProduct }) {
  const acc = useAccount();
  const me = acc.customer;
  const tab = route.tab || 'orders';

  useEffect(() => setSeo({ title: 'My account', description: '' }), []);

  let body;
  if (!acc.ready) body = <p className="shop-muted">Loading…</p>;
  else if (!me && tab !== 'wishlist') {
    body = (
      <div className="acct-login">
        <Icon name="user" size={34} />
        <h2>Log in to see your orders</h2>
        <p>Use your mobile number, email or Google account. New here? An account is created on your first login.</p>
        <button className="shop-btn primary" onClick={() => acc.openAuth()}>
          Log in or sign up
        </button>
        <p className="shop-muted small">
          Ordered without an account? <a {...linkProps('/shop')}>Track it</a> from the cart menu with your order number and phone, or log in with the same phone or
          email to see it here.
        </p>
      </div>
    );
  } else if (tab === 'orders') body = route.order ? <OrderDetail number={route.order} onOpenProduct={onOpenProduct} /> : <Orders />;
  else if (tab === 'stitching') body = route.request ? <StitchingDetail number={route.request} /> : <StitchingList />;
  else if (tab === 'wishlist') body = <Wishlist onOpenProduct={onOpenProduct} cart={cart} />;
  else if (tab === 'addresses') body = <Addresses />;
  else body = <Profile />;

  return (
    <main className="store store-page" aria-label="My account">
      <StoreHeader tab={null} cart={cart} onOpenCart={onOpenCart} onFittingRoom={onFittingRoom} />
      <div className="store-scroll">
        <div className="store-wrap acct">
          <aside className="acct-side">
            {me && (
              <div className="acct-me">
                <span className="acct-av">{me.avatar ? <img src={me.avatar} alt="" referrerPolicy="no-referrer" /> : (me.name || '?').slice(0, 1).toUpperCase()}</span>
                <div>
                  <b>{me.name || 'Your account'}</b>
                  <small>{me.email || (me.phone ? `+91 ${me.phone}` : '')}</small>
                </div>
              </div>
            )}
            <nav>
              {TABS.map(([k, l, ic]) => (
                <a key={k} className={tab === k ? 'on' : ''} {...linkProps(`/account/${k}`)}>
                  <Icon name={ic} size={17} /> {l}
                  {k === 'wishlist' && acc.wish.length > 0 && <small>{acc.wish.length}</small>}
                </a>
              ))}
              {me && (
                <button
                  onClick={() => {
                    acc.signOut();
                    navigate('/shop');
                  }}
                >
                  <Icon name="logout" size={17} /> Log out
                </button>
              )}
            </nav>
          </aside>
          <section className="acct-main">{body}</section>
        </div>
        <StoreFooter />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    capi('/api/customer/me/orders')
      .then((r) => setOrders(r.orders.filter((o) => o.kind !== 'stitching'))) // stitching orders live under Custom stitching
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="shop-err">{error}</p>;
  if (!orders) return <p className="shop-muted">Loading your orders…</p>;
  if (!orders.length)
    return (
      <div className="shop-empty">
        <Icon name="receipt" size={34} />
        <h3>No orders yet</h3>
        <p>Orders placed while logged in, or with your verified phone or email, show up here.</p>
        <a className="shop-btn primary" {...linkProps('/shop')}>
          Start shopping
        </a>
      </div>
    );
  return (
    <>
      <h1 className="acct-h">My orders</h1>
      <ul className="ord-list">
        {orders.map((o) => (
          <li key={o.orderNumber}>
            <a {...linkProps(`/account/orders/${o.orderNumber}`)}>
              <span className="ord-thumbs">
                {o.items.slice(0, 3).map((i) => (
                  <i key={i.id} style={{ backgroundImage: `url("${imgUrl(i.image, 160)}")` }} />
                ))}
              </span>
              <span className="ord-info">
                <b>{o.orderNumber}</b>
                <small>
                  {date(o.createdAt)} · {o.items.reduce((n, i) => n + i.qty, 0)} item(s) · {money(o.total)}
                </small>
              </span>
              <span className={'track-pill ' + o.status}>{STATUS_LABEL[o.status] || o.status}</span>
              <Icon name="chevRight" size={16} />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

const STEPS = ['new', 'contacted', 'stitching', 'ready', 'shipped', 'out_for_delivery', 'delivered'];
const REASONS = ['Size or fit issue', 'Different from the photos', 'Damaged or defective', 'Wrong item received', 'Changed my mind'];

function OrderDetail({ number, onOpenProduct }) {
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [ret, setRet] = useState(null); // { reason, details, qty: { [id]: n } }

  useEffect(() => {
    capi(`/api/customer/me/orders/${number}`)
      .then(setO)
      .catch((e) => setError(e.message));
  }, [number]);

  if (error && !o) return <p className="shop-err">{error}</p>;
  if (!o) return <p className="shop-muted">Loading…</p>;

  const act = async (what, fn) => {
    setBusy(what);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };
  const invoice = () =>
    act('invoice', async () => {
      const res = await capi(`/api/customer/me/orders/${o.orderNumber}/invoice`, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${o.orderNumber}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  const cancel = () => {
    if (!window.confirm(o.payment.status === 'paid' ? 'Cancel this order? The full amount is refunded to your payment method.' : 'Cancel this order?')) return;
    act('cancel', async () => setO(await capi(`/api/customer/me/orders/${o.orderNumber}/cancel`, { method: 'POST', body: {} })));
  };
  const sendReturn = (e) => {
    e.preventDefault();
    act('return', async () => {
      const items = Object.entries(ret.qty)
        .filter(([, n]) => n > 0)
        .map(([id, qty]) => ({ id, qty }));
      setO(await capi(`/api/customer/me/orders/${o.orderNumber}/return`, { method: 'POST', body: { reason: ret.reason, details: ret.details, items } }));
      setRet(null);
    });
  };

  const at = STEPS.indexOf(o.status);
  const stitch = o.kind === 'stitching';
  const own = !!o.delivery || o.status === 'out_for_delivery'; // our own delivery partner, not a courier
  const steps = STEPS.filter((s) => (s === 'contacted' || s === 'stitching' ? stitch : s === 'shipped' ? !own : s === 'out_for_delivery' ? own : true));
  const label = (s) => (s === 'ready' && stitch ? 'Ready' : STATUS_LABEL[s]);
  const product = (i) => getProducts().find((p) => p.id === i.pieceId);

  return (
    <div className="ord">
      <a className="ps-link back" {...linkProps('/account/orders')}>
        <Icon name="chev" size={14} style={{ transform: 'rotate(90deg)' }} /> All orders
      </a>
      <div className="ord-head">
        <div>
          <h1 className="acct-h">Order {o.orderNumber}</h1>
          <small>
            Placed {date(o.createdAt)}
            {o.invoiceNumber ? ` · Invoice ${o.invoiceNumber}` : ''}
          </small>
        </div>
        <span className={'track-pill ' + o.status}>{STATUS_LABEL[o.status] || o.status}</span>
      </div>

      {o.status !== 'cancelled' && (
        <ol className="ord-steps">
          {steps.map((s) => {
            const i = STEPS.indexOf(s);
            return (
              <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>
                <i>{i <= at ? <Icon name="check" size={12} stroke={2.6} /> : null}</i>
                <span>{label(s)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {o.delivery && <DeliveryCard o={o} onRated={setO} />}
      {o.tracking && (
        <p className="ord-track">
          <Icon name="box" size={16} /> {o.tracking.carrier} · {o.tracking.number}
          {o.tracking.url && (
            <a href={o.tracking.url} target="_blank" rel="noreferrer">
              Track shipment
            </a>
          )}
        </p>
      )}

      <ul className="track-items">
        {o.items.map((i) => {
          const p = product(i);
          return (
            <li key={i.id}>
              <span className="cart-thumb" style={{ backgroundImage: `url("${imgUrl(i.image, 160)}")` }} />
              <div>
                <b>{i.name}</b>
                <small>
                  {i.color} · {i.size} · ×{i.qty}
                </small>
                {o.status === 'delivered' && p && (
                  <button className="ps-link" onClick={() => onOpenProduct(p)}>
                    <Icon name="star" size={13} /> Review or buy again
                  </button>
                )}
              </div>
              <b>{money(i.unitPrice * i.qty)}</b>
            </li>
          );
        })}
      </ul>

      <dl className="co-total ord-total">
        <div>
          <dt>Subtotal</dt>
          <dd>{money(o.subtotal)}</dd>
        </div>
        {o.discount > 0 && (
          <div className="disc">
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
        <div className="tax">
          <dt>
            GST {o.taxRate}%{o.taxIncluded ? ' (included)' : ''}
          </dt>
          <dd>{money(o.tax)}</dd>
        </div>
        <div className="grand">
          <dt>Total</dt>
          <dd>{money(o.total)}</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>
            {o.payment.method === 'cod' ? 'Cash on delivery' : 'Online'} · {PAY_LABEL[o.payment.status] || o.payment.status}
            {o.payment.refunded > 0 && ` · ${money(o.payment.refunded)} refunded`}
          </dd>
        </div>
      </dl>

      <p className="ord-addr">
        <Icon name="pin" size={15} /> {[o.address.line1, o.address.line2, o.address.city, o.address.state, o.address.pincode].filter(Boolean).join(', ')}
      </p>

      <div className="ord-acts">
        {o.hasInvoice && (
          <button className="shop-btn" onClick={invoice} disabled={!!busy}>
            <Icon name="download" size={15} /> {busy === 'invoice' ? 'Preparing…' : 'Invoice (PDF)'}
          </button>
        )}
        {o.canReturn && !ret && (
          <button className="shop-btn" onClick={() => setRet({ reason: REASONS[0], details: '', qty: {} })}>
            <Icon name="reset" size={15} /> Return items
          </button>
        )}
        {o.canCancel && (
          <button className="shop-btn danger" onClick={cancel} disabled={!!busy}>
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel order'}
          </button>
        )}
      </div>
      {error && <p className="shop-err">{error}</p>}

      {ret && (
        <form className="co ord-return" onSubmit={sendReturn}>
          <h3>Return items</h3>
          <p className="shop-muted small">
            Within {o.returnWindowDays} days of delivery. Custom-fit pieces cannot be returned. See the <a {...linkProps('/pages/returns')}>returns policy</a>.
          </p>
          {o.items
            .filter((i) => i.returnable)
            .map((i) => (
              <label key={i.id} className="ret-line">
                <span>{i.name}</span>
                <select value={ret.qty[i.id] || 0} onChange={(e) => setRet((r) => ({ ...r, qty: { ...r.qty, [i.id]: Number(e.target.value) } }))}>
                  {Array.from({ length: i.qty + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n === 0 ? 'Keep' : `Return ${n}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          <label>
            <span>Reason</span>
            <select value={ret.reason} onChange={(e) => setRet((r) => ({ ...r, reason: e.target.value }))}>
              {REASONS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            <span>
              Details <em>optional</em>
            </span>
            <textarea rows={2} maxLength={600} value={ret.details} onChange={(e) => setRet((r) => ({ ...r, details: e.target.value }))} />
          </label>
          <div className="rv-btns">
            <button type="button" className="shop-btn" onClick={() => setRet(null)}>
              Cancel
            </button>
            <button className="shop-btn primary" disabled={!!busy || !Object.values(ret.qty).some((n) => n > 0)}>
              {busy === 'return' ? 'Sending…' : 'Request return'}
            </button>
          </div>
        </form>
      )}

      {o.returns.length > 0 && (
        <>
          <h3 className="acct-sub">Returns</h3>
          <ul className="track-log">
            {o.returns.map((r) => (
              <li key={r.id}>
                <b>
                  {r.items.map((x) => `${x.qty} × ${x.name}`).join(', ')} · {r.status}
                </b>
                <small>
                  {date(r.requestedAt)} · {r.reason}
                  {r.refundAmount ? ` · refund ${money(r.refundAmount)}` : ''}
                </small>
                {r.note && <p>{r.note}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="acct-sub">Updates</h3>
      <ul className="track-log">
        {[...o.history].reverse().map((h, n) => (
          <li key={n}>
            <b>{STATUS_LABEL[h.status] || h.status}</b>
            <small>{new Date(h.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>
            {h.note && <p>{h.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Wishlist({ onOpenProduct, cart }) {
  const acc = useAccount();
  const products = getProducts();
  const list = useMemo(() => acc.wish.map((w) => products.find((p) => p.id === w.pieceId)).filter(Boolean), [acc.wish, products]);
  const inCart = new Set(cart.items.map((i) => i.pieceId));
  return (
    <>
      <h1 className="acct-h">Wishlist</h1>
      {!acc.customer && list.length > 0 && (
        <p className="shop-muted small">
          Saved in this browser. <button className="ps-link" onClick={() => acc.openAuth('Log in to keep your wishlist on every device')}>Log in</button> to keep it on
          every device.
        </p>
      )}
      {list.length === 0 ? (
        <div className="shop-empty">
          <Icon name="heart" size={34} />
          <h3>Nothing saved yet</h3>
          <p>Tap the heart on any product to save it here.</p>
          <a className="shop-btn primary" {...linkProps('/shop')}>
            Browse the shop
          </a>
        </div>
      ) : (
        <div className="pgrid">
          {list.map((p) => (
            <ProductCard key={p.id} p={p} inCart={inCart.has(p.id)} onOpen={() => onOpenProduct(p)} />
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
const blankAddr = { label: 'Home', name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '', country: 'India', isDefault: false };

function Addresses() {
  const acc = useAccount();
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = acc.customer.addresses || [];
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await capi(edit._id ? `/api/customer/me/addresses/${edit._id}` : '/api/customer/me/addresses', { method: edit._id ? 'PUT' : 'POST', body: edit });
      acc.setCustomer(r.customer);
      setEdit(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const del = async (a) => {
    if (!window.confirm('Delete this address?')) return;
    try {
      acc.setCustomer((await capi(`/api/customer/me/addresses/${a._id}`, { method: 'DELETE' })).customer);
    } catch (err) {
      setError(err.message);
    }
  };
  const set = (k) => (e) => setEdit((x) => ({ ...x, [k]: e.target.value }));

  return (
    <>
      <h1 className="acct-h">Addresses</h1>
      {edit ? (
        <form className="co acct-form" onSubmit={save}>
          <div className="co-row">
            <label>
              <span>Label</span>
              <input value={edit.label} onChange={set('label')} placeholder="Home, Office…" />
            </label>
            <label>
              <span>
                Receiver's name <em>optional</em>
              </span>
              <input value={edit.name} onChange={set('name')} />
            </label>
          </div>
          <label>
            <span>House / flat, street</span>
            <input required value={edit.line1} onChange={set('line1')} />
          </label>
          <label>
            <span>
              Area / landmark <em>optional</em>
            </span>
            <input value={edit.line2} onChange={set('line2')} />
          </label>
          <div className="co-row">
            <label>
              <span>City</span>
              <input required value={edit.city} onChange={set('city')} />
            </label>
            <label>
              <span>State</span>
              <input value={edit.state} onChange={set('state')} />
            </label>
          </div>
          <div className="co-row">
            <label>
              <span>PIN code</span>
              <input required inputMode="numeric" pattern="\d{6}" maxLength={6} value={edit.pincode} onChange={set('pincode')} />
            </label>
            <label>
              <span>
                Phone <em>optional</em>
              </span>
              <input type="tel" value={edit.phone} onChange={set('phone')} />
            </label>
          </div>
          <label className="co-check">
            <input type="checkbox" checked={!!edit.isDefault} onChange={(e) => setEdit((x) => ({ ...x, isDefault: e.target.checked }))} /> Use as my default address
          </label>
          {error && <p className="shop-err">{error}</p>}
          <div className="rv-btns">
            <button type="button" className="shop-btn" onClick={() => setEdit(null)}>
              Cancel
            </button>
            <button className="shop-btn primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save address'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="addr-grid">
            {list.map((a) => (
              <div key={a._id} className={'addr' + (a.isDefault ? ' def' : '')}>
                <b>
                  {a.label} {a.isDefault && <small>Default</small>}
                </b>
                <p>
                  {a.name && (
                    <>
                      {a.name}
                      <br />
                    </>
                  )}
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ''}
                  <br />
                  {a.city}
                  {a.state ? `, ${a.state}` : ''} {a.pincode}
                </p>
                <div>
                  <button className="ps-link" onClick={() => setEdit({ ...blankAddr, ...a })}>
                    <Icon name="pencil" size={13} /> Edit
                  </button>
                  <button className="ps-link danger" onClick={() => del(a)}>
                    <Icon name="trash" size={13} /> Delete
                  </button>
                </div>
              </div>
            ))}
            <button className="addr add" onClick={() => setEdit({ ...blankAddr, isDefault: !list.length })} disabled={list.length >= 10}>
              <Icon name="plus" size={20} /> Add address
            </button>
          </div>
          {error && <p className="shop-err">{error}</p>}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
function Profile() {
  const acc = useAccount();
  const me = acc.customer;
  const [f, setF] = useState({ name: me.name || '', email: me.email || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const run = (what, fn) => async (e) => {
    e.preventDefault();
    setBusy(what);
    setError('');
    setMsg('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <h1 className="acct-h">Profile</h1>
      <form
        className="co acct-form"
        onSubmit={run('profile', async () => {
          acc.setCustomer((await capi('/api/customer/me', { method: 'PUT', body: f })).customer);
          setMsg('Profile saved');
        })}
      >
        <label>
          <span>Full name</span>
          <input required value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />
        </label>
        <label>
          <span>Email {me.emailVerified && <em>verified</em>}</span>
          <input type="email" value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} />
        </label>
        <label>
          <span>Mobile {me.phoneVerified && <em>verified</em>}</span>
          <input value={me.phone ? `+91 ${me.phone}` : 'Not added'} readOnly />
          {!me.phone && (
            <button type="button" className="ps-link" onClick={() => acc.openAuth('Verify your mobile number to add it to this account')}>
              Add mobile number
            </button>
          )}
        </label>
        <button className="shop-btn primary" disabled={!!busy}>
          {busy === 'profile' ? 'Saving…' : 'Save'}
        </button>
      </form>

      <h3 className="acct-sub">{me.hasPassword ? 'Change password' : 'Set a password'}</h3>
      <form
        className="co acct-form"
        onSubmit={run('pw', async () => {
          acc.setCustomer((await capi('/api/customer/me/password', { method: 'PUT', body: pw })).customer);
          setPw({ currentPassword: '', newPassword: '' });
          setMsg('Password saved');
        })}
      >
        {me.hasPassword && (
          <label>
            <span>Current password</span>
            <input type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw((x) => ({ ...x, currentPassword: e.target.value }))} />
          </label>
        )}
        <label>
          <span>New password</span>
          <input type="password" required minLength={8} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw((x) => ({ ...x, newPassword: e.target.value }))} />
        </label>
        <button className="shop-btn" disabled={!!busy}>
          {busy === 'pw' ? 'Saving…' : 'Save password'}
        </button>
      </form>
      {msg && <p className="auth-info">{msg}</p>}
      {error && <p className="shop-err">{error}</p>}
      <p className="shop-muted small">Returns are accepted within {SHOP.returnWindowDays} days of delivery.</p>
    </>
  );
}

/** Our delivery partner: name, call button while on the way, and the customer's rating afterwards. */
function DeliveryCard({ o, onRated }) {
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const d = o.delivery;
  const send = async () => {
    setBusy(true);
    setErr('');
    try {
      onRated(await capi(`/api/customer/me/orders/${o.orderNumber}/rate-delivery`, { method: 'POST', body: { rating: stars, note } }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ord-deliv">
      <span className="ord-deliv-ic">
        <Icon name="box" size={18} />
      </span>
      <div>
        <b>{o.status === 'delivered' ? `Delivered by ${d.partner || 'our partner'}` : `Delivery partner: ${d.partner || 'assigned'}`}</b>
        {o.status === 'out_for_delivery' && <small>On the way to you today.</small>}
        {d.rating ? (
          <small>
            You rated {d.rating}/5{d.ratingNote ? `: “${d.ratingNote}”` : ''}. Thank you!
          </small>
        ) : null}
        {o.canRateDelivery && (
          <div className="ord-rate">
            <small>How was the delivery?</small>
            <div className="ord-stars" role="radiogroup" aria-label="Rate the delivery">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={n <= stars ? 'on' : ''} onClick={() => setStars(n)}>
                  ★
                </button>
              ))}
            </div>
            {stars > 0 && (
              <>
                <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Anything to add? (optional)" />
                <button className="shop-btn primary" onClick={send} disabled={busy}>
                  {busy ? <span className="fc-spin" /> : 'Send rating'}
                </button>
              </>
            )}
            {err && <small className="shop-err">{err}</small>}
          </div>
        )}
      </div>
      {o.status === 'out_for_delivery' && d.phone && (
        <a className="shop-btn" href={`tel:+91${d.phone}`}>
          <Icon name="phone" size={16} /> Call
        </a>
      )}
    </div>
  );
}
