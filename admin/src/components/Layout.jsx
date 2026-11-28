import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from './icons.jsx';
import { useAuth } from '../auth.jsx';
import { api, SITE_URL } from '../api.js';

// Menu sections. Each link: [path, label, icon, roles, where it shows on the website]
// roles: who can see the link (admin = everything, tailor = orders only, delivery = own deliveries)
const NAV = [
  {
    links: [
      ['/', 'Dashboard', 'dashboard', ['admin', 'tailor']],
      ['/', 'My deliveries', 'box', ['delivery']],
      ['/earnings', 'Earnings & rating', 'dashboard', ['delivery']],
    ],
  },
  {
    title: 'Orders & customers',
    links: [
      ['/orders', 'Orders', 'orders', ['admin', 'tailor'], 'Shop orders and custom stitching orders'],
      ['/stitching', 'Stitching requests', 'scissors', ['admin', 'tailor'], 'Requests from the website page /stitching'],
      ['/deliveries', 'Deliveries', 'box', ['admin'], 'Assign orders to delivery partners'],
      ['/reports', 'Sales reports', 'dashboard', ['admin']],
      ['/customers', 'Customers', 'users', ['admin']],
    ],
  },
  {
    title: 'Products',
    hint: 'Home, /shop and the fitting room',
    links: [
      ['/looks', 'Looks & Dresses', 'hanger', ['admin'], 'Each look = one outfit on the model. Its pieces are the products on Home and /shop, and the outfit in the fitting room. Switched off = hidden everywhere.'],
      ['/items', 'Items', 'bag', ['admin'], 'Shoes, bags, jewellery… They show on the website only when added to a visible look.'],
      ['/bodies', 'Body models', 'body', ['admin'], 'Women / Men / Kids. Switched off = all its looks are hidden too.'],
      ['/categories', 'Categories', 'grid', ['admin'], 'Styles (Everyday, Party…): "Shop by style" on Home, style filter on /shop, outfit tabs in the fitting room.'],
    ],
  },
  {
    title: 'Fitting room only',
    hint: '/fitting-room',
    links: [
      ['/characters', 'Characters', 'users', ['admin'], 'Name, age and city on the model card in the fitting room'],
      ['/styling', 'Face, Hair & Styling', 'face', ['admin'], 'Style options in the fitting room'],
      ['/filters', 'Filters', 'filter', ['admin'], 'Photo colour filters in the fitting room'],
    ],
  },
  {
    title: 'Offers & messages',
    hint: 'Home, /shop and checkout',
    links: [
      ['/promotions', 'Promotions', 'megaphone', ['admin'], 'Offer bar above the menu, banners on Home and /shop, offer popup'],
      ['/coupons', 'Coupons', 'details', ['admin'], 'Discount codes at checkout'],
      ['/notifications', 'Notifications', 'bell', ['admin'], 'Bell on the website and phone push messages'],
      ['/reviews', 'Reviews', 'heart', ['admin'], 'Product ratings on the product page'],
    ],
  },
  {
    title: 'Settings',
    links: [
      ['/team', 'Team', 'users', ['admin']],
      ['/settings', 'Site Settings', 'settings', ['admin'], 'Store details, payments, delivery and COD charges'],
    ],
  },
];

export default function Layout() {
  const { admin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const [newOrders, setNewOrders] = useState(0);
  useEffect(() => setOpen(false), [loc.pathname, loc.search]);
  // the page behind the open menu does not scroll; Escape closes the menu
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', key);
    };
  }, [open]);

  // keep the "new orders" badge fresh (staff only)
  useEffect(() => {
    if (admin?.role === 'delivery') return undefined;
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
  }, [admin?.role]);

  return (
    <div className={'shell' + (open ? ' nav-open' : '')}>
      <aside className="sidebar">
        <div className="side-head">
          <div className="brand">
            <b>Silk of Heaven</b>
            <span>{admin?.role === 'delivery' ? 'Delivery' : 'Admin'}</span>
          </div>
          <button className="icon-btn side-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <Icon name="x" size={20} />
          </button>
        </div>
        <nav>
          {NAV.map((sec, i) => {
            const links = sec.links.filter((n) => n[3].includes(admin?.role));
            if (!links.length) return null;
            return (
              <div className="nav-sec" key={sec.title || i}>
                {sec.title && admin?.role === 'admin' && (
                  <div className="nav-title">
                    {sec.title}
                    {sec.hint && <small>{sec.hint}</small>}
                  </div>
                )}
                {links.map(([to, label, icon, , where]) => (
                  <NavLink key={to + label} to={to} end={to === '/'} title={where} className={({ isActive }) => (isActive ? 'on' : '')}>
                    <Icon name={icon} size={20} />
                    {label}
                    {to === '/orders' && newOrders > 0 && (
                      <span className="nav-badge" aria-label={`${newOrders} new orders`}>
                        {newOrders}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
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
