import { useEffect, useMemo, useRef, useState } from 'react';
import { CATS, GROUPS } from '../data.js';
import Icon from '../icons.jsx';
import OutfitBuilder from './OutfitBuilder.jsx';
import { GROUP_LABEL, PRICE_PRESETS, SORTS, catLabel, cropStyle, getProducts, money, sortProducts } from './catalog.js';

const SECTION_LIMIT = 8;
const BUDGET_KEY = 'vell_budget_v1';

const readBudget = () => {
  const n = Number(localStorage.getItem(BUDGET_KEY));
  return Number.isFinite(n) && n > 0 ? n : 300;
};

/**
 * The shop page (home route): every piece of every look as a product, grouped by item type,
 * with style / type / budget / availability filters, search and sorting — plus the
 * "Build within budget" outfit builder. The "Fitting room" button opens the creator,
 * where the user sees the dressing on their own model.
 *
 * tab: 'browse' | 'build' (driven by the route)
 * initial: { group?, lookIdx? }
 */
export default function ShopPage({ tab, onTab, initial, cart, currentLook, notice, onFittingRoom, onOpenProduct, onOpenCart, onTryLook, onAddOutfit }) {
  const [budget, setBudget] = useState(readBudget);
  const root = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(BUDGET_KEY, String(budget));
    } catch {
      /* ignore */
    }
  }, [budget]);

  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);

  const inCart = useMemo(() => new Set(cart.items.map((i) => i.pieceId)), [cart.items]);

  return (
    <main className="store store-page" ref={root} tabIndex={-1} aria-label="VELL shop">
      <header className="store-head">
        <a className="store-brand" href="#/shop" onClick={() => onTab('browse')} aria-label="VELL shop home">
          <b>VELL</b>
          <span>Shop</span>
        </a>
        <nav className="store-tabs" role="tablist" aria-label="Shop sections">
          <button role="tab" aria-selected={tab === 'browse'} className={tab === 'browse' ? 'on' : ''} onClick={() => onTab('browse')}>
            <Icon name="grid" size={17} /> All items
          </button>
          <button role="tab" aria-selected={tab === 'build'} className={tab === 'build' ? 'on' : ''} onClick={() => onTab('build')}>
            <Icon name="wallet" size={17} /> Build within budget
          </button>
        </nav>
        <div className="store-actions">
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

      {tab === 'browse' ? (
        <Browse initial={initial} inCart={inCart} onOpenProduct={onOpenProduct} onFittingRoom={onFittingRoom} />
      ) : (
        <OutfitBuilder
          budget={budget}
          setBudget={setBudget}
          startLook={initial?.lookIdx ?? currentLook}
          inCart={inCart}
          onOpenProduct={onOpenProduct}
          onTryLook={onTryLook}
          onAddOutfit={onAddOutfit}
        />
      )}

      <div className={'store-toast' + (notice.show ? ' show' : '')} role="status" aria-live="polite">
        <Icon name="check" size={17} stroke={2.2} />
        {notice.msg}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Browse: filters + category-wise listing
// ---------------------------------------------------------------------------
const EMPTY = { q: '', style: 'all', type: 'all', min: '', max: '', preset: '', avail: [], sort: 'featured' };

function Browse({ initial, inCart, onOpenProduct, onFittingRoom }) {
  const products = getProducts();
  const [f, setF] = useState(() => ({ ...EMPTY, type: initial?.group || 'all' }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const scroller = useRef(null);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  // scroll back to the top whenever the result set changes shape
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [f.style, f.type]);

  const priceRange = useMemo(() => {
    const prices = products.map((p) => p.price);
    return { lo: Math.min(...prices, 0), hi: Math.max(...prices, 0) };
  }, [products]);

  const min = f.min === '' ? 0 : Number(f.min) || 0;
  const max = f.max === '' ? Infinity : Number(f.max) || Infinity;
  const q = f.q.trim().toLowerCase();

  // everything except the item-type filter (so type counts stay meaningful)
  const base = useMemo(
    () =>
      products.filter(
        (p) =>
          (f.style === 'all' || p.cats.includes(f.style)) &&
          p.price >= min &&
          p.price <= max &&
          (f.avail.length === 0 || f.avail.includes(p.madeToOrder ? 'mto' : 'ready')) &&
          (!q || `${p.name} ${p.color} ${p.lookName} ${GROUP_LABEL[p.group]} ${p.fabric || ''}`.toLowerCase().includes(q))
      ),
    [products, f.style, f.avail, min, max, q]
  );
  const typeCount = (g) => base.filter((p) => p.group === g).length;
  const results = sortProducts(f.type === 'all' ? base : base.filter((p) => p.group === f.type), f.sort);
  const styleCount = (key) => (key === 'all' ? products.length : products.filter((p) => p.cats.includes(key)).length);

  const chips = [
    f.style !== 'all' && { label: catLabel(f.style), clear: { style: 'all' } },
    f.type !== 'all' && { label: GROUP_LABEL[f.type], clear: { type: 'all' } },
    (f.min !== '' || f.max !== '') && {
      label: PRICE_PRESETS.find((p) => p.key === f.preset)?.label || `${money(min)} – ${max === Infinity ? 'any' : money(max)}`,
      clear: { min: '', max: '', preset: '' },
    },
    ...f.avail.map((a) => ({ label: a === 'mto' ? 'Made to order' : 'Ready-made', clear: { avail: f.avail.filter((x) => x !== a) } })),
    q && { label: `“${f.q.trim()}”`, clear: { q: '' } },
  ].filter(Boolean);
  const activeCount = chips.filter((c) => !('q' in c.clear)).length;

  const pickPreset = (p) =>
    f.preset === p.key
      ? set({ preset: '', min: '', max: '' })
      : set({ preset: p.key, min: p.min ? String(p.min) : '', max: p.max === Infinity ? '' : String(p.max) });
  const toggleAvail = (a) => set({ avail: f.avail.includes(a) ? f.avail.filter((x) => x !== a) : [...f.avail, a] });

  const card = (p) => <ProductCard key={p.id} p={p} inCart={inCart.has(p.id)} onOpen={() => onOpenProduct(p)} />;

  return (
    <div className="store-scroll" ref={scroller}>
      <div className="store-wrap">
        <section className="store-hero">
          <div>
            <h1>Shop the looks</h1>
            <p>Every piece from every VELL look, made to order or ready to ship. Filter by style, type and budget.</p>
            <button className="store-fit-link" onClick={onFittingRoom}>
              <Icon name="hanger" size={16} /> See how it looks on your model <Icon name="chevRight" size={14} />
            </button>
          </div>
          <label className="store-search">
            <Icon name="search" size={18} />
            <input
              type="search"
              placeholder="Search tops, boots, denim…"
              value={f.q}
              onChange={(e) => set({ q: e.target.value })}
              aria-label="Search products"
            />
          </label>
        </section>

        <div className="store-styles" role="group" aria-label="Shop by style">
          {CATS.map((c) => (
            <button key={c.key} className={f.style === c.key ? 'on' : ''} onClick={() => set({ style: c.key })} aria-pressed={f.style === c.key}>
              <span className="tile">
                <Icon name={c.icon} size={22} />
              </span>
              <span>
                {c.label}
                <small>{styleCount(c.key)}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="store-layout">
          {filtersOpen && <div className="store-side-back" onClick={() => setFiltersOpen(false)} />}
          <aside className={'store-side' + (filtersOpen ? ' open' : '')} aria-label="Filters">
            <div className="store-side-head">
              <b>Filters</b>
              <button className="ps-link" onClick={() => setF((x) => ({ ...EMPTY, q: x.q, sort: x.sort }))} disabled={!activeCount}>
                Clear all
              </button>
            </div>

            <div className="sf-block">
              <h4>Category</h4>
              <button className={'sf-opt' + (f.type === 'all' ? ' on' : '')} onClick={() => set({ type: 'all' })}>
                All items <small>{base.length}</small>
              </button>
              {GROUPS.map((g) => (
                <button
                  key={g.key}
                  className={'sf-opt' + (f.type === g.key ? ' on' : '') + (typeCount(g.key) ? '' : ' zero')}
                  onClick={() => set({ type: g.key })}
                >
                  {g.label} <small>{typeCount(g.key)}</small>
                </button>
              ))}
            </div>

            <div className="sf-block">
              <h4>Budget</h4>
              {PRICE_PRESETS.map((p) => (
                <button key={p.key} className={'sf-check' + (f.preset === p.key ? ' on' : '')} onClick={() => pickPreset(p)} aria-pressed={f.preset === p.key}>
                  <span className="box radio" />
                  {p.label}
                </button>
              ))}
              <div className="sf-range">
                <label>
                  <span>Min $</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder={String(priceRange.lo)}
                    value={f.min}
                    onChange={(e) => set({ min: e.target.value, preset: '' })}
                  />
                </label>
                <span className="dash">–</span>
                <label>
                  <span>Max $</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder={String(priceRange.hi)}
                    value={f.max}
                    onChange={(e) => set({ max: e.target.value, preset: '' })}
                  />
                </label>
              </div>
            </div>

            <div className="sf-block">
              <h4>Availability</h4>
              {[
                ['mto', 'Made to order', 'scissors'],
                ['ready', 'Ready-made', 'box'],
              ].map(([k, label, icon]) => (
                <button key={k} className={'sf-check' + (f.avail.includes(k) ? ' on' : '')} onClick={() => toggleAvail(k)} aria-pressed={f.avail.includes(k)}>
                  <span className="box">{f.avail.includes(k) && <Icon name="check" size={13} stroke={2.6} />}</span>
                  <Icon name={icon} size={15} /> {label}
                </button>
              ))}
            </div>

            <button className="shop-btn primary block sf-done" onClick={() => setFiltersOpen(false)}>
              Show {results.length} {results.length === 1 ? 'item' : 'items'}
            </button>
          </aside>

          <section className="store-results" aria-live="polite">
            <div className="store-toolbar">
              <button className="store-filter-btn" onClick={() => setFiltersOpen(true)}>
                <Icon name="filter" size={17} /> Filters{activeCount ? ` · ${activeCount}` : ''}
              </button>
              <span className="store-count">
                {results.length} {results.length === 1 ? 'item' : 'items'}
              </span>
              <label className="store-sort">
                <span>Sort</span>
                <select value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <Icon name="chev" size={15} />
              </label>
            </div>

            {chips.length > 0 && (
              <div className="store-chips">
                {chips.map((c) => (
                  <button key={c.label} onClick={() => set(c.clear)} aria-label={`Remove filter ${c.label}`}>
                    {c.label} <Icon name="x" size={13} stroke={2.2} />
                  </button>
                ))}
              </div>
            )}

            {results.length === 0 ? (
              <div className="shop-empty">
                <Icon name="search" size={34} />
                <h3>No items match</h3>
                <p>Try a wider budget or another style.</p>
                <button className="shop-btn" onClick={() => setF(EMPTY)}>
                  Clear all filters
                </button>
              </div>
            ) : f.type === 'all' ? (
              GROUPS.map((g) => {
                const list = results.filter((p) => p.group === g.key);
                if (!list.length) return null;
                return (
                  <section key={g.key} className="store-section">
                    <div className="store-section-h">
                      <h2>
                        {g.label} <small>{list.length}</small>
                      </h2>
                      {list.length > SECTION_LIMIT && (
                        <button className="ps-link" onClick={() => set({ type: g.key })}>
                          View all {list.length} <Icon name="chevRight" size={14} />
                        </button>
                      )}
                    </div>
                    <div className="pgrid">{list.slice(0, SECTION_LIMIT).map(card)}</div>
                  </section>
                );
              })
            ) : (
              <section className="store-section">
                <div className="store-section-h">
                  <h2>
                    {GROUP_LABEL[f.type]} <small>{results.length}</small>
                  </h2>
                  <button className="ps-link" onClick={() => set({ type: 'all' })}>
                    All categories
                  </button>
                </div>
                <div className="pgrid">{results.map(card)}</div>
              </section>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export function ProductCard({ p, inCart, onOpen }) {
  const swatches = (p.colors || []).slice(0, 4);
  const more = (p.colors?.length || 0) - swatches.length;
  return (
    <button className="pc" onClick={onOpen} aria-label={`${p.name}, ${money(p.price)}. View details`}>
      <span className="pc-img" style={cropStyle(p)}>
        <span className="pc-type">{GROUP_LABEL[p.group]}</span>
        {inCart && (
          <span className="pc-in">
            <Icon name="check" size={12} stroke={2.6} /> In cart
          </span>
        )}
        <span className="pc-quick">View details</span>
      </span>
      <span className="pc-body">
        <span className="pc-name">{p.name}</span>
        <span className="pc-meta">
          {p.color} · from <i>{p.lookName}</i>
        </span>
        <span className="pc-row">
          <b>{money(p.price)}</b>
          {swatches.length > 0 && (
            <span className="pc-sw" aria-label={`${p.colors.length} colours`}>
              {swatches.map((c) => (
                <i key={c.name} style={{ background: c.hex }} title={c.name} />
              ))}
              {more > 0 && <em>+{more}</em>}
            </span>
          )}
        </span>
        <span className={'pc-tag' + (p.madeToOrder ? ' mto' : '')}>
          <Icon name={p.madeToOrder ? 'scissors' : 'box'} size={12} />
          {p.madeToOrder ? `Made to order · ~${p.leadTimeDays}d` : `Ready-made · ships ~${p.leadTimeDays}d`}
        </span>
      </span>
    </button>
  );
}
