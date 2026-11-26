import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Empty, Modal, Spinner, useToast } from '../components/ui.jsx';
import { inr } from './Reports.jsx';

const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function Customers() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const toast = useToast();

  useEffect(() => {
    const t = setTimeout(
      () =>
        api(`/api/admin/customers?q=${encodeURIComponent(q.trim())}`)
          .then(setList)
          .catch((e) => toast(e.message, 'err')),
      q ? 300 : 0
    );
    return () => clearTimeout(t);
  }, [q, toast]);

  return (
    <>
      <PageHead title="Customers" sub="Website accounts (phone, email or Google login) with their orders and spend." />
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {!list ? (
        <div className="center-pad">
          <Spinner size={26} />
        </div>
      ) : !list.length ? (
        <Empty icon="users" title={q ? 'No customers match' : 'No customer accounts yet'} />
      ) : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Login</th>
                <th className="num">Orders</th>
                <th className="num">Spent</th>
                <th>Last order</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c._id} onClick={() => setOpen(c._id)} className={'click' + (c.blocked ? ' muted-row' : '')}>
                  <td>
                    <b>{c.name || 'No name'}</b>
                    <small>{[c.email, c.phone && `+91 ${c.phone}`].filter(Boolean).join(' · ')}</small>
                  </td>
                  <td>{c.login.join(', ') || '—'}</td>
                  <td className="num">{c.orders}</td>
                  <td className="num">{inr(c.spent)}</td>
                  <td>{date(c.lastOrder)}</td>
                  <td>{date(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <CustomerModal id={open} onClose={() => setOpen(null)} onChange={(c) => setList((s) => s.map((x) => (x._id === c._id ? { ...x, blocked: c.blocked } : x)))} />}
    </>
  );
}

function CustomerModal({ id, onClose, onChange }) {
  const [d, setD] = useState(null);
  const toast = useToast();
  useEffect(() => {
    api(`/api/admin/customers/${id}`).then(setD).catch((e) => toast(e.message, 'err'));
  }, [id, toast]);
  const block = async () => {
    const next = !d.customer.blocked;
    if (next && !window.confirm('Block this customer? They cannot log in or order while blocked.')) return;
    try {
      const r = await api(`/api/admin/customers/${id}`, { method: 'PUT', body: { blocked: next } });
      setD((x) => ({ ...x, customer: r.customer }));
      onChange(r.customer);
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const c = d?.customer;
  return (
    <Modal wide title={c ? c.name || 'Customer' : 'Customer'} onClose={onClose} footer={c && <button className={'btn' + (c.blocked ? '' : ' danger')} onClick={block}>{c.blocked ? 'Unblock' : 'Block customer'}</button>}>
      {!d ? (
        <Spinner />
      ) : (
        <div className="stack">
          <div className="kv">
            <span>Email</span>
            <b>
              {c.email || '—'} {c.emailVerified && <small className="ok-text">verified</small>}
            </b>
            <span>Phone</span>
            <b>
              {c.phone ? `+91 ${c.phone}` : '—'} {c.phoneVerified && <small className="ok-text">verified</small>}
            </b>
            <span>Joined</span>
            <b>{date(c.createdAt)}</b>
            <span>Last login</span>
            <b>{date(c.lastLoginAt)}</b>
            <span>Wishlist</span>
            <b>{c.wishlist?.length || 0} items</b>
          </div>
          {c.addresses?.length > 0 && (
            <div>
              <h4 className="section-title">Addresses</h4>
              {c.addresses.map((a) => (
                <p key={a._id} className="muted small">
                  <b>{a.label}</b> · {[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}
                </p>
              ))}
            </div>
          )}
          <div>
            <h4 className="section-title">Orders · {d.orders.length}</h4>
            {d.orders.length === 0 && <p className="muted small">No orders yet.</p>}
            {d.orders.map((o) => (
              <a key={o._id} className="mini-order" href={`/orders?open=${o._id}`}>
                <b>{o.orderNumber}</b>
                <span>{date(o.createdAt)}</span>
                <span>{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span>
                <span className="status-pill">{o.status}</span>
                <b>{inr(o.total)}</b>
              </a>
            ))}
          </div>
          {d.reviews.length > 0 && (
            <div>
              <h4 className="section-title">Reviews · {d.reviews.length}</h4>
              {d.reviews.map((r) => (
                <p key={r._id} className="muted small">
                  {'★'.repeat(r.rating)} {r.productName} · {r.status}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
