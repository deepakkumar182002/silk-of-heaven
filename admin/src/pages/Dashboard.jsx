import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, SITE_URL } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import Icon from '../components/icons.jsx';
import { Spinner, useToast } from '../components/ui.jsx';

const CARDS = [
  ['looks', 'Looks & dresses', 'hanger', '/looks', (s) => `${s.activeLooks} live on the website`],
  ['identities', 'Characters', 'users', '/characters', () => 'Names cycled by Shuffle'],
  ['categories', 'Categories', 'grid', '/categories', () => 'Outfit filter chips'],
  ['filters', 'Filters', 'filter', '/filters', () => 'Scene colour grades'],
  ['traits', 'Personality traits', 'heart', '/settings', () => 'Shown in the Personality tab'],
];

const ORDER_CARDS = [
  ['new', 'New orders', 'Waiting to be contacted', 'orders'],
  ['contacted', 'Contacted', 'Customer confirmed', 'phone'],
  ['stitching', 'Stitching', 'In progress', 'scissors'],
  ['ready', 'Ready', 'To hand over / dispatch', 'box'],
];

export default function Dashboard() {
  const { admin } = useAuth();
  const isAdmin = admin?.role === 'admin';
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState(null);
  const toast = useToast();

  useEffect(() => {
    api('/api/admin/orders/stats').then(setOrders).catch((e) => toast(e.message, 'err'));
    if (isAdmin) api('/api/admin/stats').then(setStats).catch((e) => toast(e.message, 'err'));
  }, [toast, isAdmin]);

  return (
    <>
      <PageHead
        title={isAdmin ? 'Dashboard' : `Hello, ${admin?.name?.split(' ')[0] || 'there'}`}
        sub={isAdmin ? 'Everything the VELL website shows is managed here.' : 'Here is where your stitching orders stand.'}
      >
        {isAdmin && (
          <>
            <a className="btn" href={SITE_URL} target="_blank" rel="noreferrer">
              <Icon name="external" size={18} /> Open website
            </a>
            <Link className="btn primary" to="/looks?new=1">
              <Icon name="plus" size={18} /> Add look
            </Link>
          </>
        )}
        {!isAdmin && (
          <Link className="btn primary" to="/orders?status=new">
            <Icon name="orders" size={18} /> View new orders
          </Link>
        )}
      </PageHead>

      <h2 className="dash-h">Orders</h2>
      {!orders ? (
        <div className="center-pad"><Spinner size={26} /></div>
      ) : (
        <div className="stat-grid">
          {ORDER_CARDS.map(([k, label, sub, icon]) => (
            <Link key={k} to={`/orders?status=${k}`} className={'stat card' + (k === 'new' && orders.counts.new ? ' hot' : '')}>
              <span className="stat-icon">
                <Icon name={icon} size={22} />
              </span>
              <b>{orders.counts[k]}</b>
              <span>{label}</span>
              <small>{sub}</small>
            </Link>
          ))}
          {isAdmin && (
            <Link to="/orders" className="stat card">
              <span className="stat-icon">
                <Icon name="check" size={22} />
              </span>
              <b>${orders.revenue.toLocaleString()}</b>
              <span>Order value</span>
              <small>{orders.total} orders, cancelled excluded</small>
            </Link>
          )}
        </div>
      )}

      {isAdmin && (
        <>
          <h2 className="dash-h">Catalogue</h2>
          {!stats ? (
            <div className="center-pad"><Spinner size={26} /></div>
          ) : (
            <div className="stat-grid">
              {CARDS.map(([key, label, icon, to, sub]) => (
                <Link key={key} to={to} className="stat card">
                  <span className="stat-icon">
                    <Icon name={icon} size={22} />
                  </span>
                  <b>{stats[key]}</b>
                  <span>{label}</span>
                  <small>{sub(stats)}</small>
                </Link>
              ))}
            </div>
          )}

          <div className="card tips">
            <h3>Cut-out guidelines</h3>
            <ul>
              <li>Upload <b>transparent PNG or WebP</b> cut-outs at <b>1360 × 2048</b> px.</li>
              <li>Keep the model registered like the originals: head top ≈ y 28, feet ≈ y 2025, head centre x = 680.</li>
              <li>The avatar and filter thumbnails crop the face from the 360 × 360 square at (500, 46). Check the preview while editing a look.</li>
              <li>Set colours, sizes, fabric and stitching time for each piece in the look editor. Customers choose from these when ordering.</li>
              <li>Changes show up on the website on the next page load.</li>
            </ul>
          </div>
        </>
      )}
    </>
  );
}
