import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, imgUrl } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Field, Modal, Spinner, useToast } from '../components/ui.jsx';
import { Pill } from './Orders.jsx';

/**
 * Custom stitching requests from the website (separate from shop orders): look at the design photos and
 * measurements, send a price or decline. When the customer accepts and pays, a stitching order appears
 * in Orders, where the tailor and the delivery partner take over.
 */
const STATUS = { submitted: 'New', quoted: 'Price sent', accepted: 'Accepted', rejected: 'Declined', cancelled: 'Cancelled' };
const MEASURE = { bust: 'Bust / chest', waist: 'Waist', hips: 'Hips', shoulder: 'Shoulder', sleeve: 'Sleeve', armhole: 'Armhole', length: 'Length', neckFront: 'Front neck', neckBack: 'Back neck', inseam: 'Inseam', thigh: 'Thigh' };
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function Stitching() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('submitted');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const openId = params.get('open');
  const toast = useToast();

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (status !== 'all') qs.set('status', status);
    if (q.trim()) qs.set('q', q.trim());
    return api('/api/admin/stitching?' + qs)
      .then(setData)
      .catch((e) => toast(e.message, 'err'));
  }, [status, q, toast]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const counts = data?.counts || {};
  return (
    <>
      <PageHead title="Stitching requests" sub="Customers' own dresses to stitch. Send a price; when they accept and pay, it becomes a stitching order in Orders." />
      <div className="status-tabs" role="tablist">
        {[['submitted', 'New'], ['quoted', 'Price sent'], ['accepted', 'Accepted'], ['rejected', 'Declined'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={status === k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>
            {l} <b>{k === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[k] || 0}</b>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input placeholder="Search request no., name, phone or garment" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {!data ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : !data.list.length ? (
        <Empty icon="scissors" title="Nothing here">
          <p>Requests sent from the website’s “Custom stitching” page appear here.</p>
        </Empty>
      ) : (
        <div className="order-list">
          {data.list.map((r) => (
            <button key={r._id} className={'order-row card' + (r.status === 'submitted' ? ' is-new' : '')} onClick={() => setParams({ open: r._id })}>
              <div className="or-main">
                <b className="or-no">{r.number}</b>
                <small>{when(r.createdAt)}</small>
              </div>
              <div className="or-cust">
                <b>{r.contact?.name}</b>
                <small>{r.contact?.phone}</small>
              </div>
              <div className="or-items">
                <span>{r.garment}</span>
                <small>
                  {r.images.length} photo{r.images.length === 1 ? '' : 's'} · {r.measureVisit ? 'take measurements' : `${Object.keys(r.measurements || {}).length} measurements`}
                </small>
              </div>
              <div className="or-total">
                <b>{r.quote?.price ? money(r.quote.price) : '—'}</b>
                {r.order && <small>{r.order.orderNumber}</small>}
              </div>
              <div className="or-state">
                <span className={'pill-s st-' + r.status}>{STATUS[r.status]}</span>
                {r.order && <Pill s={r.order.status} />}
              </div>
            </button>
          ))}
        </div>
      )}
      {openId && <RequestDetail id={openId} onClose={() => setParams({})} onChanged={load} />}
    </>
  );
}

function RequestDetail({ id, onClose, onChanged }) {
  const { admin } = useAuth();
  const [r, setR] = useState(null);
  const [quote, setQuote] = useState({ price: '', days: 10, note: '' });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    api(`/api/admin/stitching/${id}`)
      .then((d) => {
        setR(d);
        if (d.quote?.price) setQuote({ price: d.quote.price, days: d.quote.days, note: d.quote.note || '' });
      })
      .catch((e) => toast(e.message, 'err'));
  }, [id, toast]);
  const run = async (fn, ok) => {
    setBusy(true);
    try {
      setR(await fn());
      toast(ok);
      onChanged();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };
  const open = r && ['submitted', 'quoted'].includes(r.status);
  const isAdmin = admin?.role === 'admin';

  return (
    <Modal wide title={r ? `${r.garment} · ${r.number}` : 'Stitching request'} onClose={onClose}>
      {!r ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : (
        <div className="od">
          <div className="od-main">
            <section className="od-card">
              <div className="od-cust-head">
                <div>
                  <h3>{r.contact?.name}</h3>
                  <small className="muted">Sent {when(r.createdAt)}{r.neededBy ? ` · needed by ${new Date(r.neededBy).toLocaleDateString('en-IN')}` : ''}</small>
                </div>
                <span className={'pill-s st-' + r.status}>{STATUS[r.status]}</span>
              </div>
              <div className="contact-btns">
                <a className="btn primary" href={`tel:+91${r.contact?.phone}`}>
                  <Icon name="phone" size={17} /> Call {r.contact?.phone}
                </a>
                <a className="btn" href={`https://wa.me/91${r.contact?.phone}`} target="_blank" rel="noreferrer">
                  <Icon name="chat" size={17} /> WhatsApp
                </a>
                {r.contact?.email && (
                  <a className="btn" href={`mailto:${r.contact.email}`}>
                    <Icon name="mail" size={17} /> Email
                  </a>
                )}
              </div>
              <div className="od-addr">
                <pre>{[r.address?.line1, r.address?.line2, [r.address?.city, r.address?.state].filter(Boolean).join(', '), r.address?.pincode].filter(Boolean).join('\n')}</pre>
              </div>
            </section>

            <section className="od-card">
              <h4 className="section-title">What to stitch</h4>
              <div className="kv">
                <span>Garment</span>
                <b>{r.garment}</b>
                <span>Fabric</span>
                <span>
                  {r.fabricSource === 'store' ? 'From the store' : "Customer's own"}
                  {r.fabricDetails ? ` · ${r.fabricDetails}` : ''}
                </span>
                {r.designNotes && (
                  <>
                    <span>Design</span>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{r.designNotes}</span>
                  </>
                )}
              </div>
              {r.images.length > 0 && (
                <div className="st-photos">
                  {r.images.map((x) => (
                    <a key={x.url} href={x.url} target="_blank" rel="noreferrer">
                      <img src={imgUrl(x.url, 300)} alt="Design" />
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section className="od-card">
              <h4 className="section-title">Measurements (inches)</h4>
              {r.measureVisit ? (
                <p className="muted">The customer asked our tailor to take the measurements (call to arrange).</p>
              ) : (
                <div className="st-measure-grid">
                  {Object.entries(r.measurements || {}).map(([k, v]) => (
                    <div key={k}>
                      <small>{MEASURE[k] || k}</small>
                      <b>{v}″</b>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="od-side">
            {open && isAdmin && (
              <section className="od-card">
                <h4 className="section-title">{r.status === 'quoted' ? 'Change the price' : 'Send a price'}</h4>
                <div className="row2">
                  <Field label="Price (₹)" hint="Includes fabric if from the store, stitching and delivery">
                    <input type="number" min="1" value={quote.price} onChange={(e) => setQuote((x) => ({ ...x, price: e.target.value }))} />
                  </Field>
                  <Field label="Ready in (days)">
                    <input type="number" min="1" value={quote.days} onChange={(e) => setQuote((x) => ({ ...x, days: e.target.value }))} />
                  </Field>
                </div>
                <Field label="Note to the customer (optional)">
                  <textarea rows={2} value={quote.note} onChange={(e) => setQuote((x) => ({ ...x, note: e.target.value }))} placeholder="e.g. Lining and latkans included." />
                </Field>
                <button className="btn primary block" disabled={busy} onClick={() => run(() => api(`/api/admin/stitching/${id}/quote`, { method: 'PUT', body: quote }), 'Price sent to the customer')}>
                  {busy ? <Spinner /> : 'Send price'}
                </button>
              </section>
            )}
            {open && isAdmin && (
              <section className="od-card">
                <h4 className="section-title">Decline</h4>
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason shown to the customer" />
                <button className="btn danger-outline block" disabled={busy || !reason.trim()} onClick={() => run(() => api(`/api/admin/stitching/${id}/reject`, { method: 'PUT', body: { note: reason } }), 'Request declined')}>
                  Decline request
                </button>
              </section>
            )}
            {r.quote?.price > 0 && (
              <section className="od-card">
                <h4 className="section-title">Price</h4>
                <p>
                  <b>{money(r.quote.price)}</b> · ready in {r.quote.days} days
                </p>
                {r.order && (
                  <p className="muted small">
                    Order {r.order.orderNumber}: <Pill s={r.order.status} /> · <Link to={`/orders?open=${r.order._id}`}>open the order</Link>
                  </p>
                )}
              </section>
            )}
            <section className="od-card">
              <h4 className="section-title">History</h4>
              <ul className="notes">
                {r.history.map((h, i) => (
                  <li key={i}>
                    <b>{STATUS[h.status] || h.status}</b> {h.note}
                    <small>
                      {when(h.at)} · {h.by}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </Modal>
  );
}
