import { PAGES, STORE } from '../data.js';
import Icon from '../icons.jsx';
import { ROUTES, linkProps } from '../useRoute.js';
import { useAccount } from '../account/account.jsx';

/** Header used by the shop, account and info pages. tab: 'browse' | 'build' | null */
export function StoreHeader({ tab, cart, onOpenCart, onFittingRoom }) {
  const acc = useAccount();
  const me = acc.customer;
  return (
    <header className="store-head">
      <a className="store-brand" {...linkProps(ROUTES.shop)} aria-label={`${STORE.name} shop home`}>
        <b>Silk of Heaven</b>
        <span>Shop</span>
      </a>
      <nav className="store-tabs" aria-label="Shop sections">
        <a className={tab === 'browse' ? 'on' : ''} aria-current={tab === 'browse' ? 'page' : undefined} {...linkProps(ROUTES.shop)}>
          <Icon name="grid" size={17} /> All items
        </a>
        <a className={tab === 'build' ? 'on' : ''} aria-current={tab === 'build' ? 'page' : undefined} {...linkProps(ROUTES.build)}>
          <Icon name="wallet" size={17} /> Build within budget
        </a>
      </nav>
      <div className="store-actions">
        <a className="store-ibtn" {...linkProps('/account/wishlist')} aria-label={`Wishlist, ${acc.wish.length} items`}>
          <Icon name="heart" size={20} />
          {acc.wish.length > 0 && <span className="store-badge">{acc.wish.length}</span>}
        </a>
        {me ? (
          <a className="store-ibtn store-me" {...linkProps(ROUTES.account)} aria-label="My account" title={me.name || 'My account'}>
            {me.avatar ? <img src={me.avatar} alt="" referrerPolicy="no-referrer" /> : <b>{(me.name || me.email || me.phone || '?').slice(0, 1).toUpperCase()}</b>}
          </a>
        ) : (
          <button className="store-login" onClick={() => acc.openAuth()} aria-label="Log in or sign up">
            <Icon name="user" size={18} />
            <span className="long">Login / Sign up</span>
            <span className="short">Login</span>
          </button>
        )}
        <button className="store-ibtn" onClick={onOpenCart} aria-label={`Cart, ${cart.count} items`}>
          <Icon name="cart" size={20} />
          {cart.count > 0 && <span className="store-badge">{cart.count}</span>}
        </button>
        <button className="store-fit" onClick={onFittingRoom} aria-label="Open fitting room — see outfits on your model">
          <Icon name="hanger" size={19} />
          <span>Fitting room</span>
        </button>
      </div>
    </header>
  );
}

/** Footer: policy pages, contact details. */
export function StoreFooter() {
  return (
    <footer className="store-foot">
      <div className="sf-cols">
        <div>
          <b className="sf-brand">{STORE.name}</b>
          <p>Try every look on your own model, then order it ready-made or stitched to your size.</p>
        </div>
        <nav aria-label="Information">
          <b>Help</b>
          {PAGES.map((p) => (
            <a key={p.key} {...linkProps(`/pages/${p.key}`)}>
              {p.title}
            </a>
          ))}
        </nav>
        <div>
          <b>Contact</b>
          {STORE.phone && (
            <a href={`tel:${STORE.phone.replace(/\s/g, '')}`}>
              <Icon name="phone" size={14} /> {STORE.phone}
            </a>
          )}
          {STORE.email && (
            <a href={`mailto:${STORE.email}`}>
              <Icon name="mail" size={14} /> {STORE.email}
            </a>
          )}
          {STORE.address && (
            <span>
              <Icon name="pin" size={14} /> {STORE.address}
            </span>
          )}
          <a {...linkProps('/account/orders')}>
            <Icon name="receipt" size={14} /> My orders
          </a>
        </div>
      </div>
      <p className="sf-legal">
        © {new Date().getFullYear()} {STORE.legalName || STORE.name}
        {STORE.gstin ? ` · GSTIN ${STORE.gstin}` : ''} · Secure payments by Razorpay · Prices in ₹
      </p>
    </footer>
  );
}
