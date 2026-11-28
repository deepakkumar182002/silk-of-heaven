import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Spinner, useToast } from '../components/ui.jsx';
import { Pill } from './Orders.jsx';

/** Delivery monitoring: partners with their numbers, orders waiting for a partner, and orders on the way. */
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

export default function Delivery() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const toast = useToast();
  const load = useCallback(() => api('/api/admin/delivery').then(setData).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const assign = async (order, boy) => {
    setBusy(order._id);
    try {
      await api(`/api/admin/delivery/orders/${order._id}/assign`, { method: 'PUT', body: { boy: boy || null } });
      toast(boy ? `${order.orderNumber} assigned` : 'Partner removed');
      await load();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy('');
    }
  };

  if (!data) {
    return (
      <>
        <PageHead title="Deliveries" />
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      </>
    );
  }
  const ready = data.partners.filter((p) => p.active && p.phoneVerified);
  const pick = (o) => (
    <select value={o.boy?._id || o.boy || ''} disabled={busy === o._id || o.status === 'out_for_delivery'} onChange={(e) => assign(o, e.target.value)}>
      <option value="">{o.boy ? 'Remove partner' : 'Choose partner…'}</option>
      {ready.map((p) => (
        <option key={p._id} value={p._id}>
          {p.name} ({p.onHand} on hand)
        </option>
      ))}
    </select>
  );

  return (
    <>
      <PageHead title="Deliveries" sub={`Give orders to your delivery partners and follow them. Each partner earns ${money(data.defaultCommission)} per delivered order unless set otherwise in Team.`}>
        <Link className="btn" to="/team">
          <Icon name="users" size={17} /> Manage partners
        </Link>
      </PageHead>

      {!data.partners.length ? (
        <Empty icon="users" title="No delivery partners yet">
          <p>Add them in Team → “Add delivery partner” and verify their mobile number.</p>
        </Empty>
      ) : (
        <div className="dl-partners">
          {data.partners.map((p) => (
            <div key={p._id} className={'card dl-partner' + (p.active && p.phoneVerified ? '' : ' off')}>
              <div className="dl-p-head">
                <span className="avatar-letter">{p.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <b>{p.name}</b>
                  <small>
                    +91 {p.phone} {!p.phoneVerified ? '· not verified' : ''} {!p.active ? '· switched off' : ''}
                  </small>
                </div>
                <span className="dl-rating" title={`${p.ratings} ratings`}>
                  ★ {p.rating ?? '–'}
                </span>
              </div>
              <div className="dl-stats">
                <div>
                  <b>{p.onHand}</b>
                  <small>on hand</small>
                </div>
                <div>
                  <b>{p.deliveredToday}</b>
                  <small>today</small>
                </div>
                <div>
                  <b>{p.delivered}</b>
                  <small>delivered</small>
                </div>
                <div>
                  <b>{money(p.earnedMonth)}</b>
                  <small>earned this month</small>
                </div>
                <div>
                  <b>{money(p.cashToday)}</b>
                  <small>cash today</small>
                </div>
                <div>
                  <b>{p.failed}</b>
                  <small>failed tries</small>
                </div>
              </div>
              <small className="muted">
                {money(p.commission)} per delivery · total earned {money(p.earned)} · cash collected {money(p.cash)} · last {when(p.last)}
              </small>
            </div>
          ))}
        </div>
      )}

      <section className="dl-sec">
        <h3 className="nt-h">
          Waiting for a partner <small className="muted">{data.waiting.length}</small>
        </h3>
        {!data.waiting.length ? (
          <p className="muted small">Nothing waiting. Orders show up here until they are given to a partner.</p>
        ) : (
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="num">To collect</th>
                  <th>Partner</th>
                </tr>
              </thead>
              <tbody>
                {data.waiting.map((o) => (
                  <tr key={o._id}>
                    <td>
                      <Link to={`/orders?open=${o._id}`}>{o.orderNumber}</Link>
                      <small>
                        {o.kind === 'stitching' ? 'Stitching · ' : ''}
                        {o.items} item{o.items === 1 ? '' : 's'} · {when(o.createdAt)}
                      </small>
                    </td>
                    <td>
                      {o.customer}
                      <small>
                        {o.city} {o.pincode}
                      </small>
                    </td>
                    <td>
                      <Pill s={o.status} />
                    </td>
                    <td className="num">{o.collect ? money(o.collect) : 'Paid'}</td>
                    <td>{pick(o)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dl-sec">
        <h3 className="nt-h">
          With partners <small className="muted">{data.onTheWay.length}</small>
        </h3>
        {!data.onTheWay.length ? (
          <p className="muted small">No open deliveries.</p>
        ) : (
          <div className="card table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="num">To collect</th>
                  <th>Partner</th>
                </tr>
              </thead>
              <tbody>
                {data.onTheWay.map((o) => (
                  <tr key={o._id}>
                    <td>
                      <Link to={`/orders?open=${o._id}`}>{o.orderNumber}</Link>
                      <small>
                        assigned {when(o.assignedAt)}
                        {o.attempts ? ` · ${o.attempts} failed try` : ''}
                      </small>
                    </td>
                    <td>
                      {o.customer}
                      <small>
                        {o.city} {o.pincode}
                      </small>
                    </td>
                    <td>
                      <Pill s={o.status} />
                    </td>
                    <td className="num">{o.collect ? money(o.collect) : 'Paid'}</td>
                    <td>
                      <b>{o.boy?.name}</b>
                      <small>{o.boy?.phone}</small>
                      {o.status !== 'out_for_delivery' && pick(o)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
