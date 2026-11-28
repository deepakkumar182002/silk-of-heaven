import { useEffect, useState } from 'react';
import { API_URL, STORE, capi, getCustomerToken, imgUrl, money } from '../data.js';
import Icon from '../icons.jsx';
import { linkProps, navigate } from '../useRoute.js';
import { StoreFooter, StoreHeader } from '../shop/StoreChrome.jsx';
import { loadRazorpay } from '../shop/CartDrawer.jsx';
import { useAccount } from './account.jsx';

/**
 * Custom stitching, separate from shop orders: the customer describes the dress, adds design / fabric
 * photos and measurements; we send a price; they accept and pay (online or on delivery) and follow
 * the stitching step by step.
 */
const MEASURE_LABEL = {
  bust: 'Bust / Chest',
  waist: 'Waist',
  hips: 'Hips',
  shoulder: 'Shoulder',
  sleeve: 'Sleeve length',
  armhole: 'Armhole',
  length: 'Garment length',
  neckFront: 'Front neck depth',
  neckBack: 'Back neck depth',
  inseam: 'Inseam',
  thigh: 'Thigh',
};
const REQ_LABEL = { submitted: 'Waiting for price', quoted: 'Price sent', accepted: 'Accepted', rejected: 'Declined', cancelled: 'Cancelled' };
const ORDER_LABEL = {
  awaiting_payment: 'Waiting for payment',
  new: 'Confirmed',
  contacted: 'Details confirmed',
  stitching: 'Being stitched',
  ready: 'Ready',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const date = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Shrink a photo in the browser (long side 1600 px, JPEG) so it uploads fast and fits the API limit. */
async function shrink(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.85));
}
async function uploadPhoto(file) {
  const form = new FormData();
  form.append('file', await shrink(file), 'photo.jpg');
  const res = await fetch(`${API_URL}/api/customer/stitching/upload`, { method: 'POST', headers: { Authorization: `Bearer ${getCustomerToken()}` }, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Upload failed');
  return data;
}

// ---------------------------------------------------------------------------
// /stitching: the request form
// ---------------------------------------------------------------------------
export default function StitchingPage({ cart, onOpenCart, onFittingRoom }) {
  const acc = useAccount();
  const me = acc.customer;
  return (
    <main className="store store-page" aria-label="Custom stitching">
      <StoreHeader tab={null} cart={cart} onOpenCart={onOpenCart} onFittingRoom={onFittingRoom} />
      <div className="store-scroll">
        <div className="store-wrap st">
          <section className="st-hero">
            <h1>Custom stitching</h1>
            <p>Get your own dress stitched by our tailors. Tell us what you want, add photos of the design and your fabric, and your measurements. We send you a price; you pay only after you accept it.</p>
            <ol className="st-how">
              <li><b>1</b> Send your request</li>
              <li><b>2</b> Get a price</li>
              <li><b>3</b> Accept &amp; pay</li>
              <li><b>4</b> Track the stitching till delivery</li>
            </ol>
          </section>
          {!acc.ready ? (
            <p className="shop-muted">Loading…</p>
          ) : !me ? (
            <div className="acct-login">
              <Icon name="scissors" size={34} />
              <h2>Log in to send a stitching request</h2>
              <p>So you can follow it, accept the price and pay. It takes a few seconds with your mobile number.</p>
              <button className="shop-btn primary" onClick={() => acc.openAuth('Log in to send a stitching request')}>
                Log in or sign up
              </button>
            </div>
          ) : (
            <StitchForm me={me} />
          )}
        </div>
        <StoreFooter />
      </div>
    </main>
  );
}

function StitchForm({ me }) {
  const [opt, setOpt] = useState(null);
  const addresses = me.addresses || [];
  const def = addresses.find((a) => a.isDefault) || addresses[0];
  const [f, setF] = useState({
    garment: '',
    fabricSource: 'mine',
    fabricDetails: '',
    designNotes: '',
    measureVisit: false,
    neededBy: '',
    name: me.name || '',
    phone: me.phone || '',
  });
  const [m, setM] = useState({});
  const [photos, setPhotos] = useState([]); // { url, publicId } | { uploading: true, key }
  const [addrId, setAddrId] = useState(def?._id || 'new');
  const [addr, setAddr] = useState(def ? pickAddr(def) : { line1: '', line2: '', city: '', state: '', pincode: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => {
    capi('/api/customer/stitching/options').then(setOpt).catch((e) => setError(e.message));
  }, []);

  const addPhotos = async (files) => {
    const list = [...files].slice(0, 6 - photos.length);
    for (const file of list) {
      const key = Math.random().toString(36).slice(2);
      setPhotos((p) => [...p, { uploading: true, key }]);
      try {
        const r = await uploadPhoto(file);
        setPhotos((p) => p.map((x) => (x.key === key ? r : x)));
      } catch (e) {
        setPhotos((p) => p.filter((x) => x.key !== key));
        setError(e.message);
      }
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!f.garment) return setError('Choose what you want stitched');
    if (photos.some((p) => p.uploading)) return setError('Please wait for the photos to upload');
    setBusy(true);
    try {
      const r = await capi('/api/customer/stitching', {
        method: 'POST',
        body: { ...f, measurements: f.measureVisit ? {} : m, images: photos, address: addr },
      });
      navigate(`/account/stitching/${r.number}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!opt) return error ? <p className="shop-err">{error}</p> : <p className="shop-muted">Loading…</p>;
  return (
    <form className="st-form co" onSubmit={submit}>
      <fieldset>
        <legend>What should we stitch?</legend>
        <div className="st-chips" role="radiogroup" aria-label="Garment">
          {opt.garments.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={f.garment === g} className={f.garment === g ? 'on' : ''} onClick={() => setF((x) => ({ ...x, garment: g }))}>
              {g}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Fabric</legend>
        <div className="co-pay st-two" role="radiogroup" aria-label="Fabric">
          {[
            ['mine', 'I have my fabric', 'Hand it over at our pickup, or we collect it'],
            ['store', 'Use fabric from the store', 'We suggest options with the price'],
          ].map(([k, t, d]) => (
            <button key={k} type="button" role="radio" aria-checked={f.fabricSource === k} className={f.fabricSource === k ? 'on' : ''} onClick={() => setF((x) => ({ ...x, fabricSource: k }))}>
              <span>
                <b>{t}</b>
                <small>{d}</small>
              </span>
            </button>
          ))}
        </div>
        <label>
          <span>
            About the fabric <em>optional</em>
          </span>
          <textarea rows={2} maxLength={1000} value={f.fabricDetails} onChange={set('fabricDetails')} placeholder="e.g. 2.5 m pure cotton, maroon with gold border, lining included" />
        </label>
      </fieldset>

      <fieldset>
        <legend>Design</legend>
        <div className="st-photos">
          {photos.map((p, i) => (
            <span key={p.key || p.url} className="st-photo">
              {p.uploading ? <span className="fc-spin" /> : <img src={imgUrl(p.url, 240)} alt={`Design photo ${i + 1}`} />}
              {!p.uploading && (
                <button type="button" onClick={() => setPhotos((l) => l.filter((x) => x !== p))} aria-label="Remove photo">
                  <Icon name="x" size={14} />
                </button>
              )}
            </span>
          ))}
          {photos.length < 6 && (
            <label className="st-add">
              <Icon name="camera" size={22} />
              <small>Add photos</small>
              <input type="file" accept="image/*" multiple hidden onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))} />
            </label>
          )}
        </div>
        <small className="shop-muted">Photos of the design you like, your fabric, or a dress that fits you well. Up to 6.</small>
        <label>
          <span>Describe the design</span>
          <textarea rows={3} maxLength={2000} value={f.designNotes} onChange={set('designNotes')} placeholder="Neck style, sleeves, length, lining, buttons or zip, any work or lace…" />
        </label>
      </fieldset>

      <fieldset>
        <legend>Measurements (inches)</legend>
        <label className="st-check">
          <input type="checkbox" checked={f.measureVisit} onChange={set('measureVisit')} /> Our tailor should take my measurements (call or visit)
        </label>
        {!f.measureVisit && (
          <div className="st-measures">
            {opt.measures.map((k) => (
              <label key={k}>
                <span>{MEASURE_LABEL[k] || k}</span>
                <input type="number" inputMode="decimal" min="1" max="119" step="0.25" placeholder="in" value={m[k] || ''} onChange={(e) => setM((x) => ({ ...x, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Contact &amp; delivery</legend>
        <div className="co-row">
          <label>
            <span>Name</span>
            <input required value={f.name} onChange={set('name')} autoComplete="name" />
          </label>
          <label>
            <span>Mobile</span>
            <input required inputMode="numeric" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="10-digit number" />
          </label>
        </div>
        {addresses.length > 0 && (
          <div className="st-chips" role="radiogroup" aria-label="Saved addresses">
            {addresses.map((a) => (
              <button key={a._id} type="button" role="radio" aria-checked={addrId === a._id} className={addrId === a._id ? 'on' : ''} onClick={() => (setAddrId(a._id), setAddr(pickAddr(a)))}>
                {a.label || 'Address'}: {a.line1}, {a.city}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={addrId === 'new'} className={addrId === 'new' ? 'on' : ''} onClick={() => (setAddrId('new'), setAddr({ line1: '', line2: '', city: '', state: '', pincode: '' }))}>
              + New address
            </button>
          </div>
        )}
        {addrId === 'new' && (
          <>
            <label>
              <span>Address</span>
              <input required value={addr.line1} onChange={(e) => setAddr((a) => ({ ...a, line1: e.target.value }))} placeholder="House, street, area" />
            </label>
            <div className="co-row">
              <label>
                <span>City</span>
                <input required value={addr.city} onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} />
              </label>
              <label>
                <span>PIN code</span>
                <input required inputMode="numeric" maxLength={6} value={addr.pincode} onChange={(e) => setAddr((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, '') }))} />
              </label>
            </div>
          </>
        )}
        <label>
          <span>
            Needed by <em>optional</em>
          </span>
          <input type="date" value={f.neededBy} min={new Date(Date.now() + 86400e3).toISOString().slice(0, 10)} onChange={set('neededBy')} />
        </label>
      </fieldset>

      {error && <p className="shop-err" role="alert">{error}</p>}
      <button className="shop-btn primary block" disabled={busy}>
        {busy ? <span className="fc-spin" /> : 'Send request'}
      </button>
      <small className="shop-muted">No payment now. {STORE.name} sends you a price first.</small>
    </form>
  );
}
const pickAddr = (a) => ({ line1: a.line1, line2: a.line2 || '', city: a.city, state: a.state || '', pincode: a.pincode || '' });

// ---------------------------------------------------------------------------
// My account → Custom stitching
// ---------------------------------------------------------------------------
export function StitchingList() {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    capi('/api/customer/stitching')
      .then(setList)
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <p className="shop-err">{error}</p>;
  if (!list) return <p className="shop-muted">Loading…</p>;
  return (
    <>
      <div className="st-list-head">
        <h1 className="acct-h">Custom stitching</h1>
        <a className="shop-btn primary" {...linkProps('/stitching')}>
          <Icon name="plus" size={16} /> New request
        </a>
      </div>
      {!list.length ? (
        <div className="shop-empty">
          <Icon name="scissors" size={34} />
          <h3>No stitching requests yet</h3>
          <p>Send your design and measurements; we reply with a price.</p>
        </div>
      ) : (
        <ul className="ord-list">
          {list.map((r) => (
            <li key={r.number}>
              <a {...linkProps(`/account/stitching/${r.number}`)}>
                <span className="ord-thumbs">{r.images[0] ? <i style={{ backgroundImage: `url("${imgUrl(r.images[0], 160)}")` }} /> : <i className="st-noimg"><Icon name="scissors" size={18} /></i>}</span>
                <span className="ord-info">
                  <b>
                    {r.garment} · {r.number}
                  </b>
                  <small>
                    {date(r.createdAt)}
                    {r.quote ? ` · ${money(r.quote.price)}` : ''}
                  </small>
                </span>
                <span className={'track-pill ' + (r.order ? r.order.status : r.status)}>{r.order && r.order.status !== 'cancelled' ? ORDER_LABEL[r.order.status] : REQ_LABEL[r.status]}</span>
                <Icon name="chevRight" size={16} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const FLOW = ['submitted', 'quoted', 'new', 'stitching', 'ready', 'out_for_delivery', 'delivered'];
const FLOW_LABEL = { submitted: 'Request sent', quoted: 'Price sent', new: 'Accepted & confirmed', stitching: 'Being stitched', ready: 'Ready', out_for_delivery: 'Out for delivery', delivered: 'Delivered' };

export function StitchingDetail({ number }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [method, setMethod] = useState('razorpay');
  const [opt, setOpt] = useState(null);
  const [busy, setBusy] = useState('');

  const load = () => capi(`/api/customer/stitching/${number}`).then(setR).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    capi('/api/customer/stitching/options')
      .then((o) => {
        setOpt(o);
        if (!o.payments.razorpay) setMethod('cod');
      })
      .catch(() => {});
  }, [number]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !r) return <p className="shop-err">{error}</p>;
  if (!r) return <p className="shop-muted">Loading…</p>;

  const o = r.order && r.order.status !== 'cancelled' ? r.order : null;
  const paid = o && o.status !== 'awaiting_payment';
  const stage = paid ? (o.status === 'contacted' ? 'new' : o.status === 'shipped' ? 'out_for_delivery' : o.status) : r.status === 'quoted' || (r.status === 'accepted' && !paid) ? 'quoted' : 'submitted';
  const at = FLOW.indexOf(stage);
  const canAccept = r.quote && (r.status === 'quoted' || (r.status === 'accepted' && !paid));

  const accept = async () => {
    setBusy('accept');
    setError('');
    try {
      const res = await capi(`/api/customer/stitching/${number}/accept`, { method: 'POST', body: { method } });
      if (res.razorpay) {
        const Razorpay = await loadRazorpay();
        await new Promise((resolve, reject) => {
          const rz = new Razorpay({
            key: res.razorpay.key,
            order_id: res.razorpay.orderId,
            amount: res.razorpay.amount,
            currency: res.razorpay.currency,
            name: res.razorpay.name,
            description: res.razorpay.description,
            prefill: res.razorpay.prefill,
            theme: { color: '#1d1b20' },
            handler: async (resp) => {
              try {
                resolve(await capi('/api/public/checkout/verify', { method: 'POST', body: resp }));
              } catch (e) {
                reject(e);
              }
            },
            modal: { ondismiss: () => reject(new Error('The payment was not completed. You can try again.')) },
          });
          rz.open();
        });
      }
      await load();
    } catch (e) {
      setError(e.message);
      await load();
    } finally {
      setBusy('');
    }
  };
  const cancel = async () => {
    if (!window.confirm('Cancel this stitching request?')) return;
    setBusy('cancel');
    try {
      setR(await capi(`/api/customer/stitching/${number}/cancel`, { method: 'POST', body: {} }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="ord st-detail">
      <a className="ps-link back" {...linkProps('/account/stitching')}>
        <Icon name="chev" size={14} style={{ transform: 'rotate(90deg)' }} /> All stitching requests
      </a>
      <div className="ord-head">
        <div>
          <h1 className="acct-h">{r.garment}</h1>
          <small>
            {r.number} · sent {date(r.createdAt)}
            {o ? ` · order ${o.orderNumber}` : ''}
          </small>
        </div>
        <span className={'track-pill ' + (o ? o.status : r.status)}>{o ? ORDER_LABEL[o.status] : REQ_LABEL[r.status]}</span>
      </div>

      {['rejected', 'cancelled'].includes(r.status) ? (
        <p className="st-note bad">{r.status === 'rejected' ? `We cannot take this request: ${r.reason}` : 'You cancelled this request.'}</p>
      ) : (
        <ol className="ord-steps">
          {FLOW.map((s, i) => (
            <li key={s} className={i < at ? 'done' : i === at ? 'now' : ''}>
              <i>{i <= at ? <Icon name="check" size={12} stroke={2.6} /> : null}</i>
              <span>{FLOW_LABEL[s]}</span>
            </li>
          ))}
        </ol>
      )}

      {canAccept && (
        <div className="st-quote">
          <div className="st-quote-price">
            <small>Our price</small>
            <b>{money(r.quote.price)}</b>
            <small>Ready in about {r.quote.days} days · delivery included</small>
          </div>
          {r.quote.note && <p>{r.quote.note}</p>}
          <div className="co-pay" role="radiogroup" aria-label="Payment method">
            {opt?.payments.razorpay && (
              <button type="button" role="radio" aria-checked={method === 'razorpay'} className={method === 'razorpay' ? 'on' : ''} onClick={() => setMethod('razorpay')}>
                <Icon name="wallet" size={18} />
                <span>
                  <b>Pay online now</b>
                  <small>UPI, cards, net banking · Razorpay</small>
                </span>
              </button>
            )}
            {opt?.payments.cod && (
              <button type="button" role="radio" aria-checked={method === 'cod'} className={method === 'cod' ? 'on' : ''} onClick={() => setMethod('cod')}>
                <Icon name="box" size={18} />
                <span>
                  <b>Pay on delivery</b>
                  <small>Cash or UPI when your dress arrives</small>
                </span>
              </button>
            )}
          </div>
          <button className="shop-btn primary block" onClick={accept} disabled={!!busy}>
            {busy === 'accept' ? <span className="fc-spin" /> : method === 'cod' ? 'Accept price' : `Accept & pay ${money(r.quote.price)}`}
          </button>
        </div>
      )}
      {r.status === 'submitted' && <p className="st-note">We are looking at your request and will send you a price soon. You get a notification and an email.</p>}
      {error && <p className="shop-err">{error}</p>}
      {o && (
        <p className="st-note">
          Payment: {o.payment.status === 'paid' ? 'paid' : o.payment.method === 'cod' ? 'on delivery' : o.payment.status} · <a {...linkProps(`/account/orders/${o.orderNumber}`)}>Order details, invoice &amp; delivery</a>
        </p>
      )}

      <section className="st-sum">
        {r.images.length > 0 && (
          <div className="st-photos">
            {r.images.map((u) => (
              <a key={u} className="st-photo" href={u} target="_blank" rel="noreferrer">
                <img src={imgUrl(u, 240)} alt="Design" />
              </a>
            ))}
          </div>
        )}
        <dl className="ps-specs">
          <div>
            <dt>Fabric</dt>
            <dd>{r.fabricSource === 'store' ? 'From the store' : 'My own'}{r.fabricDetails ? ` · ${r.fabricDetails}` : ''}</dd>
          </div>
          {r.designNotes && (
            <div>
              <dt>Design</dt>
              <dd>{r.designNotes}</dd>
            </div>
          )}
          <div>
            <dt>Measurements</dt>
            <dd>
              {r.measureVisit
                ? 'Our tailor takes them'
                : Object.entries(r.measurements)
                    .map(([k, v]) => `${MEASURE_LABEL[k] || k} ${v}″`)
                    .join(' · ')}
            </dd>
          </div>
          <div>
            <dt>Deliver to</dt>
            <dd>
              {r.address?.line1}, {r.address?.city} {r.address?.pincode}
            </dd>
          </div>
        </dl>
      </section>

      {['submitted', 'quoted'].includes(r.status) && (
        <button className="ps-link danger" onClick={cancel} disabled={!!busy}>
          <Icon name="x" size={14} /> Cancel request
        </button>
      )}
    </div>
  );
}
