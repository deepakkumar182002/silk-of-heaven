import { useEffect, useState } from 'react';
import { capi } from '../data.js';
import Icon from '../icons.jsx';
import { useAccount } from '../account/account.jsx';

export function Stars({ value, size = 14 }) {
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} fill={value >= n - 0.25 ? 'currentColor' : 'none'} stroke={1.5} />
      ))}
    </span>
  );
}

const ago = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Approved reviews of a product, and a form for logged-in customers (verified buyers are marked). */
export default function Reviews({ garment, look }) {
  const acc = useAccount();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ rating: 0, title: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const real = /^[a-f0-9]{24}$/i.test(String(garment.id));

  useEffect(() => {
    if (!real) return;
    capi(`/api/public/reviews?product=${garment.id}`)
      .then(setData)
      .catch(() => setData({ reviews: [], count: 0, avg: 0 }));
  }, [garment.id, real]);

  if (!real) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!f.rating) return setError('Choose 1 to 5 stars');
    setBusy(true);
    setError('');
    try {
      const r = await capi('/api/customer/reviews', { method: 'POST', body: { productId: garment.id, productName: garment.name, lookId: look.id, ...f } });
      setMsg(r.message);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rv" id="reviews" aria-label="Reviews">
      <div className="ps-label">
        Reviews
        {data?.count > 0 && (
          <span>
            <Stars value={data.avg} /> {data.avg} · {data.count}
          </span>
        )}
      </div>
      {data?.count === 0 && !open && <p className="shop-muted small">No reviews yet.</p>}
      <ul className="rv-list">
        {(data?.reviews || []).slice(0, 6).map((r) => (
          <li key={r.id}>
            <div className="rv-h">
              <Stars value={r.rating} size={12} />
              <b>{r.title || r.name}</b>
            </div>
            {r.text && <p>{r.text}</p>}
            <small>
              {r.name} · {ago(r.at)}
              {r.verified && (
                <em>
                  <Icon name="check" size={11} stroke={2.4} /> Verified buyer
                </em>
              )}
            </small>
          </li>
        ))}
      </ul>
      {msg && <p className="auth-info">{msg}</p>}
      {open ? (
        <form className="co rv-form" onSubmit={submit}>
          <div className="rv-pick" role="radiogroup" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} role="radio" aria-checked={f.rating === n} aria-label={`${n} stars`} onClick={() => setF((x) => ({ ...x, rating: n }))}>
                <Icon name="star" size={24} fill={f.rating >= n ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
          <label>
            <span>
              Title <em>optional</em>
            </span>
            <input maxLength={100} value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />
          </label>
          <label>
            <span>Your review</span>
            <textarea rows={3} maxLength={1500} value={f.text} onChange={(e) => setF((x) => ({ ...x, text: e.target.value }))} placeholder="Fit, fabric, stitching…" />
          </label>
          {error && <p className="shop-err">{error}</p>}
          <div className="rv-btns">
            <button type="button" className="shop-btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="shop-btn primary" disabled={busy}>
              {busy ? 'Sending…' : 'Submit review'}
            </button>
          </div>
        </form>
      ) : (
        !msg && (
          <button className="ps-link" onClick={() => acc.requireLogin('Log in to write a review', () => setOpen(true))}>
            <Icon name="star" size={14} /> Write a review
          </button>
        )
      )}
    </section>
  );
}
