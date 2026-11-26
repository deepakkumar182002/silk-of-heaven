import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from './icons.jsx';
import { useAuth } from '../auth.jsx';
import { api, SITE_URL } from '../api.js';

// roles: who can see the link (admin = everything, tailor = orders only)
const NAV = [
  ['/', 'Dashboard', 'dashboard', ['admin', 'tailor']],
  ['/orders', 'Orders', 'orders', ['admin', 'tailor']],
  ['/reports', 'Sales reports', 'dashboard', ['admin']],
  ['/customers', 'Customers', 'users', ['admin']],
  ['/coupons', 'Coupons', 'details', ['admin']],
  ['/reviews', 'Reviews', 'heart', ['admin']],
  ['/looks', 'Looks & Dresses', 'hanger', ['admin']],
  ['/items', 'Items', 'bag', ['admin']],
  ['/bodies', 'Body models', 'body', ['admin']],
  ['/characters', 'Characters', 'users', ['admin']],
  ['/categories', 'Categories', 'grid', ['admin']],
  ['/styling', 'Face, Hair & Styling', 'face', ['admin']],
  ['/filters', 'Filters', 'filter', ['admin']],
  ['/team', 'Team', 'users', ['admin']],
  ['/settings', 'Site Settings', 'settings', ['admin']],
];

export default function Layout() {
  const { admin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const [newOrders, setNewOrders] = useState(0);
  useEffect(() => setOpen(false), [loc.pathname]);

  // keep the "new orders" badge fresh
  useEffect(() => {
    let alive = true;
    const load = () =>
      api('/api/admin/orders/stats')
        .then((s) => alive && setNewOrders(s.counts.new))
        .catch(() => {});
    load();
    const t = setInterval(load, 45000);
    window.addEventListener('orders-changed', load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('orders-changed', load);
    };
  }, []);

  return (
    <div className={'shell' + (open ? ' nav-open' : '')}>
      <aside className="sidebar">
        <div className="brand">
          <b>Silk of Heaven</b>
          <span>Admin</span>
        </div>
        <nav>
          {NAV.filter((n) => n[3].includes(admin?.role)).map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
              <Icon name={icon} size={20} />
              {label}
              {to === '/orders' && newOrders > 0 && <span className="nav-badge" aria-label={`${newOrders} new orders`}>{newOrders}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <a href={SITE_URL} target="_blank" rel="noreferrer">
            <Icon name="external" size={18} />
            View website
          </a>
          <div className="who" title={admin?.email}>
            {admin?.name || admin?.email} · {admin?.role}
          </div>
          <button onClick={logout}>
            <Icon name="logout" size={18} />
            Log out
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn burger" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <div className="brand sm">
            <b>Silk of Heaven</b>
            <span>Admin</span>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
