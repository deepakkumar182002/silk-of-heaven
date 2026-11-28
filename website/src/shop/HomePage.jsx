import { useMemo, useRef, useState } from 'react';
import { BODIES, CATS, GROUPS, LOOKS, STORE } from '../data.js';
import Icon from '../icons.jsx';
import { linkProps, navigate } from '../useRoute.js';
import { StoreEmpty, StoreFooter, StoreHeader } from './StoreChrome.jsx';
import { BannerCarousel } from './Promos.jsx';
import { ProductCard } from './ShopPage.jsx';
import { GROUP_LABEL, getProducts } from './catalog.js';

const ROW = 10;

/**
 * The home page: banners, search, shop by style / for whom, a row of items per type and complete
 * looks. No filters here: every tile opens the shop list (/shop) with that filter already set.
 */
export default function HomePage({ cart, onOpenCart, onFittingRoom, onOpenProduct }) {
  const products = getProducts();
  const inCart = useMemo(() => new Set(cart.items.map((i) => i.pieceId)), [cart.items]);
  const [q, setQ] = useState('');

  const groups = GROUPS.map((g) => ({ ...g, items: products.filter((p) => p.group === g.key) })).filter((g) => g.items.length);
  const newest = [...products].sort((a, b) => b.order - a.order).slice(0, ROW);
  const styles = CATS.filter((c) => c.key !== 'all')
    .map((c) => ({ ...c, look: LOOKS.find((l) => l.cat === c.key), count: products.filter((p) => p.cats.includes(c.key)).length }))
    .filter((c) => c.count);
  const bodies = BODIES.filter((b) => LOOKS.some((l) => l.body === b.key));
  const looks = LOOKS.slice(0, 8);

  const card = (p) => <ProductCard key={p.id} p={p} inCart={inCart.has(p.id)} onOpen={() => onOpenProduct(p)} />;

  return (
    <main className="store store-page" tabIndex={-1} aria-label={`${STORE.name} home`}>
      <StoreHeader tab="home" cart={cart} onOpenCart={onOpenCart} onFittingRoom={onFittingRoom} />
      <div className="store-scroll">
        <div className="store-wrap hm">
          <h1 className="sr">{STORE.name}: clothes, shoes, bags and jewellery</h1>
          <BannerCarousel />

          {products.length === 0 && <StoreEmpty />}
          {products.length > 0 && (
          <>
          <form
            className="store-search hm-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : '/shop');
            }}
          >
            <Icon name="search" size={18} />
            <input type="search" placeholder="Search tops, sarees, shoes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
          </form>

          {styles.length > 0 && (
            <section className="hm-sec">
              <Head title="Shop by style" link="/shop" />
              <div className="hm-styles">
                {styles.map((c) => (
                  <a key={c.key} className="hm-style" {...linkProps(`/shop?style=${c.key}`)}>
                    <span className="hm-style-img" style={c.look ? { backgroundImage: `url("${c.look.small}")` } : undefined}>
                      {!c.look && <Icon name={c.icon} size={26} />}
                    </span>
                    <b>{c.label}</b>
                    <small>{c.count} items</small>
                  </a>
                ))}
              </div>
            </section>
          )}

          {bodies.length > 1 && (
            <section className="hm-sec">
              <Head title="Shop for" />
              <div className="hm-for">
                {bodies.map((b) => {
                  const look = LOOKS.find((l) => l.body === b.key);
                  return (
                    <a key={b.key} className="hm-for-card" {...linkProps(`/shop?for=${b.key}`)}>
                      <span style={look ? { backgroundImage: `url("${look.small}")` } : undefined} />
                      <b>{b.name}</b>
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          <Row title="New in" link="/shop" items={newest} card={card} />

          {groups.map((g) => (
            <Row key={g.key} title={GROUP_LABEL[g.key] || g.label} link={`/shop?type=${encodeURIComponent(g.key)}`} count={g.items.length} items={g.items.slice(0, ROW)} card={card} />
          ))}

          {looks.length > 0 && (
            <section className="hm-sec">
              <Head title="Complete looks" link="/shop" />
              <div className="hm-looks">
                {looks.map((l) => {
                  const first = products.find((p) => p.looks.includes(LOOKS.indexOf(l)));
                  const price = products.filter((p) => p.lookIdx === LOOKS.indexOf(l)).reduce((n, p) => n + p.price, 0);
                  return (
                    <button key={l.id} className="hm-look" onClick={() => first && onOpenProduct(first)}>
                      <span style={{ backgroundImage: `url("${l.small}")` }} />
                      <b>{l.name}</b>
                      {price > 0 && <small>Full look · ₹{price.toLocaleString('en-IN')}</small>}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          </>
          )}

          <section className="hm-ctas">
            <a className="hm-cta stitch" {...linkProps('/stitching')}>
              <Icon name="scissors" size={26} />
              <span>
                <b>Custom stitching</b>
                <small>Send your fabric and design, get it stitched to your size and track it till delivery.</small>
              </span>
              <Icon name="chevRight" size={18} />
            </a>
            {products.length > 0 && (
            <button className="hm-cta fit" onClick={onFittingRoom}>
              <Icon name="hanger" size={26} />
              <span>
                <b>Fitting room</b>
                <small>See every outfit on a model, mix and match, even with your own face.</small>
              </span>
              <Icon name="chevRight" size={18} />
            </button>
            )}
          </section>
        </div>
        <StoreFooter />
      </div>
    </main>
  );
}

function Head({ title, link, count }) {
  return (
    <div className="store-section-h hm-head">
      <h2>
        {title}
        {count ? <small>{count}</small> : null}
      </h2>
      {link && (
        <a className="hm-all" {...linkProps(link)}>
          View all <Icon name="chevRight" size={14} />
        </a>
      )}
    </div>
  );
}

/** A horizontal, swipeable row of product cards with arrows on desktop. */
function Row({ title, link, count, items, card }) {
  const ref = useRef(null);
  if (!items.length) return null;
  const by = (d) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <section className="hm-sec">
      <Head title={title} link={link} count={count} />
      <div className="hm-row-wrap">
        <button className="hm-arrow prev" onClick={() => by(-1)} aria-label={`Scroll ${title} left`}>
          <Icon name="chevRight" size={18} />
        </button>
        <div className="hm-row" ref={ref}>
          {items.map(card)}
          {link && (
            <a className="hm-more" {...linkProps(link)}>
              <Icon name="grid" size={22} />
              View all
            </a>
          )}
        </div>
        <button className="hm-arrow next" onClick={() => by(1)} aria-label={`Scroll ${title} right`}>
          <Icon name="chevRight" size={18} />
        </button>
      </div>
    </section>
  );
}
