import { useCallback, useEffect, useState } from 'react';
import { api, imgUrl } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Spinner, useToast } from '../components/ui.jsx';

/**
 * The delivery partner's own panel (role "delivery"): orders given to them, step buttons
 * (picked up → out for delivery → delivered / not delivered), cash to collect, earnings, rating, activity.
 */
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const STEP = { new: 'Being prepared', contacted: 'Being prepared', stitching: 'Being stitched', ready: 'Ready to pick up', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };

export default function MyDeliveries({ view = 'todo' }) {
  const [tab, setTab] = useState(view);
  useEffect(() => setTab(view), [view]);
  return (
    <>
      <PageHead title={tab === 'earnings' ? 'My earnings' : 'My deliveries'} sub="Only the orders given to you. Update each step from here; the customer is told automatically." />
      <div className="seg dl-tabs">
        {[
          ['todo', 'To deliver'],
          ['done', 'Done'],
          ['earnings', 'Earnings & rating'],
        ].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'earnings' ? <Earnings /> : <Jobs done={tab === 'done'} />}
    </>
  );
}

function Jobs({ done }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState('');
  const toast = useToast();
  const load = useCallback(() => api(`/api/delivery/orders${done ? '?scope=done' : ''}`).then(setList).catch((e) => toast(e.message, 'err')), [done, toast]);
  useEffect(() => {
    setList(null);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (o, action) => {
    let body = { action };
    if (action === 'failed') {
      const note = window.prompt('Why could it not be delivered? (shown to the customer)', 'Customer not reachable');
      if (!note) return;
      body.note = note;
    }
    if (action === 'delivered') {
      if (o.collect > 0 && !window.confirm(`Collect ${money(o.collect)} cash / UPI from the customer. Collected?`)) return;
      body.collected = o.collect;
    }
    setBusy(o._id + action);
    try {
      const next = await api(`/api/delivery/orders/${o._id}`, { method: 'PUT', body });
      setList((l) => (['delivered'].includes(next.status) ? l.filter((x) => x._id !== o._id) : l.map((x) => (x._id === o._id ? next : x))));
      toast(action === 'delivered' ? 'Delivered. Well done!' : action === 'out' ? 'Out for delivery: the customer is told' : action === 'picked' ? 'Picked up' : 'Saved');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy('');
    }
  };

  if (!list) return <div className="center-pad"><Spinner size={26} /></div>;
  if (!list.length)
    return (
      <Empty icon="box" title={done ? 'No finished deliveries yet' : 'Nothing to deliver right now'}>
        <p>{done ? 'Delivered orders appear here.' : 'New deliveries given to you appear here. This page refreshes by itself.'}</p>
      </Empty>
    );

  return (
    <div className="dl-jobs">
      {list.map((o) => {
        const a = o.address || {};
        const addr = [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', '), a.pincode].filter(Boolean).join(', ');
        const d = o.delivery;
        const picked = !!d.pickedAt;
        return (
          <article key={o._id} className="card dl-job">
            <header>
              <div>
                <b>{o.orderNumber}</b>
                <small>
                  {o.kind === 'stitching' ? 'Stitched dress · ' : ''}
                  {STEP[o.status] || o.status}
                </small>
              </div>
              <span className={'dl-collect' + (o.collect ? '' : ' paid')}>{o.collect ? `Collect ${money(o.collect)}` : done && d.codCollected ? `Collected ${money(d.codCollected)}` : 'Prepaid'}</span>
            </header>
            <div className="dl-cust">
              <div>
                <b>{o.customer.name}</b>
                <small>{addr}</small>
              </div>
              {!done && (
                <div className="dl-contact">
                  <a className="btn sm" href={`tel:+91${String(o.customer.phone).replace(/\D/g, '').slice(-10)}`}>
                    <Icon name="phone" size={15} /> Call
                  </a>
                  <a className="btn sm" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer">
                    <Icon name="external" size={15} /> Map
                  </a>
                </div>
              )}
            </div>
            <ul className="dl-items">
              {o.items.map((i, k) => (
                <li key={k}>
                  {i.image && <img src={imgUrl(i.image, 120)} alt="" />}
                  <span>
                    {i.qty} × {i.name}
                    <small>{[i.size, i.color].filter(Boolean).join(' · ')}</small>
                  </span>
                </li>
              ))}
            </ul>
            {d.attempts?.length > 0 && <p className="muted small">Earlier tries: {d.attempts.map((x) => `${when(x.at)}: ${x.note}`).join(' · ')}</p>}
            {done ? (
              <p className="muted small">
                {o.status === 'delivered' ? `Delivered ${when(d.deliveredAt)} · you earned ${money(d.commission)}` : STEP[o.status]}
                {d.rating ? ` · rated ${d.rating}★${d.ratingNote ? ` “${d.ratingNote}”` : ''}` : ''}
              </p>
            ) : (
              <div className="dl-actions">
                {!picked && o.status !== 'out_for_delivery' && (
                  <button className="btn" disabled={!!busy || !['ready', 'shipped'].includes(o.status)} onClick={() => act(o, 'picked')} title={o.status === 'ready' ? '' : 'Wait until the store marks it ready'}>
                    <Icon name="box" size={16} /> Picked up
                  </button>
                )}
                {o.status !== 'out_for_delivery' ? (
                  <button className="btn primary" disabled={!!busy || !['ready', 'shipped'].includes(o.status)} onClick={() => act(o, 'out')}>
                    <Icon name="external" size={16} /> Out for delivery
                  </button>
                ) : (
                  <>
                    <button className="btn primary" disabled={!!busy} onClick={() => act(o, 'delivered')}>
                      <Icon name="check" size={16} /> Delivered{o.collect ? ` · got ${money(o.collect)}` : ''}
                    </button>
                    <button className="btn danger-outline" disabled={!!busy} onClick={() => act(o, 'failed')}>
                      Not delivered
                    </button>
                  </>
                )}
                {!['ready', 'shipped', 'out_for_delivery'].includes(o.status) && <small className="muted">The store is still preparing this order.</small>}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Earnings() {
  const [s, setS] = useState(null);
  const toast = useToast();
  useEffect(() => {
    api('/api/delivery/stats').then(setS).catch((e) => toast(e.message, 'err'));
  }, [toast]);
  if (!s) return <div className="center-pad"><Spinner size={26} /></div>;
  return (
    <>
      <div className="tiles">
        <div className="card tile">
          <small>Earned this month</small>
          <b>{money(s.earnedMonth)}</b>
        </div>
        <div className="card tile">
          <small>Earned in total</small>
          <b>{money(s.earned)}</b>
        </div>
        <div className="card tile">
          <small>Per delivery</small>
          <b>{money(s.commission)}</b>
        </div>
        <div className="card tile">
          <small>Delivered today / month / total</small>
          <b>
            {s.deliveredToday} / {s.deliveredMonth} / {s.delivered}
          </b>
        </div>
        <div className="card tile">
          <small>Cash collected today</small>
          <b>{money(s.cashToday)}</b>
        </div>
        <div className="card tile">
          <small>Your rating ({s.ratings} ratings)</small>
          <b>★ {s.rating ?? '–'}</b>
        </div>
        <div className="card tile">
          <small>On hand now</small>
          <b>{s.onHand}</b>
        </div>
        <div className="card tile">
          <small>Not delivered tries</small>
          <b>{s.failed}</b>
        </div>
      </div>
      <div className="report-grid dl-more">
        <section className="card pad">
          <h3>Customer ratings</h3>
          {!s.reviews.length ? (
            <p className="muted small">No ratings yet.</p>
          ) : (
            <ul className="notes">
              {s.reviews.map((r) => (
                <li key={r.orderNumber}>
                  <b className="stars-txt">{'★'.repeat(r.rating)}</b> {r.note || ''}
                  <small>
                    {r.orderNumber} · {when(r.at)}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card pad">
          <h3>Activity</h3>
          {!s.activity.length ? (
            <p className="muted small">Nothing yet.</p>
          ) : (
            <ul className="notes">
              {s.activity.map((a, i) => (
                <li key={i}>
                  {a.text}
                  <small>{when(a.at)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
