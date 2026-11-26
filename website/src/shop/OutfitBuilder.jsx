import { useMemo, useState } from 'react';
import { CATS, GROUPS, LOOKS } from '../data.js';
import Icon from '../icons.jsx';
import { alternativesFor, cartLine, cropStyle, getProducts, lookTotal, money } from './catalog.js';

const QUICK_BUDGETS = [150, 250, 400, 600];

const productsOfLook = (lookIdx) => getProducts().filter((p) => p.looks.includes(lookIdx));
const sizeKind = (p) => (p.group === 'shoes' ? 'shoe' : 'apparel');

/**
 * Pick a look, then swap any of its pieces for other items of the same type (cheaper or pricier)
 * and watch the outfit total against your budget. "Fit my budget" makes the smallest swaps that
 * bring the total under budget. The finished outfit goes to the cart in one tap.
 */
export default function OutfitBuilder({ budget, setBudget, startLook, inCart, onOpenProduct, onTryLook, onAddOutfit }) {
  const all = getProducts();
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);

  const [style, setStyle] = useState('all');
  const [lookIdx, setLookIdx] = useState(() => Math.min(Math.max(0, startLook || 0), LOOKS.length - 1));
  const [sel, setSel] = useState(() => productsOfLook(lookIdx).map((p) => p.id));
  const [sizes, setSizes] = useState({});
  const [pref, setPref] = useState({ apparel: '', shoe: '' });
  const [swap, setSwap] = useState(null); // product id being swapped, or "add:<group>"
  const [msg, setMsg] = useState(null); // { tone: 'ok' | 'warn', text }
  const [missing, setMissing] = useState([]);

  const items = sel.map((id) => byId.get(id)).filter(Boolean);
  const total = items.reduce((n, p) => n + p.price, 0);
  const left = budget - total;
  const over = left < 0;
  const pct = budget > 0 ? Math.min(100, (total / budget) * 100) : 100;
  const original = productsOfLook(lookIdx).map((p) => p.id);
  const changed = sel.length !== original.length || sel.some((id) => !original.includes(id));
  const sliderMax = Math.max(1000, Math.ceil(Math.max(...LOOKS.map(lookTotal), budget) / 100) * 100);

  const looks = LOOKS.map((l, i) => ({ l, i, total: lookTotal(l) })).filter(({ l }) => style === 'all' || l.cat === style);

  const chooseLook = (i) => {
    setLookIdx(i);
    setSel(productsOfLook(i).map((p) => p.id));
    setSwap(null);
    setMsg(null);
    setMissing([]);
  };

  const replace = (fromId, to) => {
    setSel((s) => s.map((id) => (id === fromId ? to.id : id)));
    setSwap(null);
    setMsg(null);
  };
  const add = (to) => {
    setSel((s) => [...s, to.id]);
    setSwap(null);
    setMsg(null);
  };
  const remove = (id) => {
    setSel((s) => s.filter((x) => x !== id));
    setSwap(null);
    setMsg(null);
  };

  const sizeFor = (p) => {
    if (sizes[p.id]) return sizes[p.id];
    const list = p.sizes || [];
    if (list.length === 1) return list[0];
    const want = pref[sizeKind(p)];
    return list.includes(want) ? want : '';
  };
  const pickSize = (p, size) => {
    setSizes((s) => ({ ...s, [p.id]: size }));
    setPref((x) => ({ ...x, [sizeKind(p)]: size }));
    setMissing((m) => m.filter((id) => id !== p.id));
  };

  // Smallest swaps (same item type, cheaper) until the outfit fits the budget.
  const fitBudget = () => {
    let cur = [...sel];
    let sum = total;
    const swaps = [];
    for (let guard = 0; guard < 30 && sum > budget; guard++) {
      const options = [];
      for (const id of cur) {
        const p = byId.get(id);
        for (const a of alternativesFor(p, { exclude: cur })) {
          if (a.price < p.price) options.push({ from: p, to: a, saving: p.price - a.price });
        }
      }
      if (!options.length) break;
      const fits = options.filter((o) => sum - o.saving <= budget);
      const pick = fits.length
        ? fits.reduce((a, b) => (b.saving < a.saving ? b : a))
        : options.reduce((a, b) => (b.saving > a.saving ? b : a));
      cur = cur.map((id) => (id === pick.from.id ? pick.to.id : id));
      sum -= pick.saving;
      swaps.push(pick);
    }
    setSel(cur);
    setSwap(null);
    if (sum <= budget) {
      setMsg({
        tone: 'ok',
        text: swaps.length
          ? `Done — ${swaps.length} ${swaps.length === 1 ? 'swap' : 'swaps'} saved ${money(total - sum)}. ${swaps
              .map((s) => `${s.from.name} → ${s.to.name}`)
              .join(', ')}.`
          : 'This outfit already fits your budget.',
      });
    } else {
      setMsg({
        tone: 'warn',
        text: `The lowest this outfit can go is ${money(sum)}. Remove an item or raise your budget.`,
      });
    }
  };

  const addAll = () => {
    const need = items.filter((p) => !sizeFor(p)).map((p) => p.id);
    setMissing(need);
    if (need.length) {
      setMsg({ tone: 'warn', text: 'Pick a size for every item first.' });
      return;
    }
    onAddOutfit(items.map((p) => cartLine(p, sizeFor(p))));
    setMsg({ tone: 'ok', text: `Added ${items.length} ${items.length === 1 ? 'item' : 'items'} to your cart.` });
  };

  const look = LOOKS[lookIdx];

  return (
    <div className="store-scroll">
      <div className="store-wrap ob">
        <section className="store-hero">
          <div>
            <h1>Build within budget</h1>
            <p>Set your budget, choose a look, and swap any piece for a cheaper or fancier one. The total updates as you go.</p>
          </div>
        </section>

        {/* ---------- budget ---------- */}
        <section className="ob-budget" aria-label="Your budget">
          <div className="ob-budget-top">
            <label className="ob-money">
              <span>Your budget</span>
              <div>
                <b>₹</b>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="100"
                  value={budget}
                  onChange={(e) => setBudget(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  aria-label="Budget in dollars"
                />
              </div>
            </label>
            <div className="ob-quick">
              {QUICK_BUDGETS.map((b) => (
                <button key={b} className={budget === b ? 'on' : ''} onClick={() => setBudget(b)}>
                  {money(b)}
                </button>
              ))}
            </div>
          </div>
          <input
            className="ob-range"
            type="range"
            min="0"
            max={sliderMax}
            step="100"
            value={Math.min(budget, sliderMax)}
            onChange={(e) => setBudget(Number(e.target.value))}
            aria-label="Budget slider"
            style={{ '--p': `${(Math.min(budget, sliderMax) / sliderMax) * 100}%` }}
          />
        </section>

        {/* ---------- look picker ---------- */}
        <section className="ob-looks-wrap">
          <div className="store-section-h">
            <h2>1 · Choose a look</h2>
            <div className="ob-style">
              {CATS.map((c) => (
                <button key={c.key} className={style === c.key ? 'on' : ''} onClick={() => setStyle(c.key)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ob-looks">
            {looks.length === 0 && <p className="shop-muted">No looks in this style yet.</p>}
            {looks.map(({ l, i, total: t }) => (
              <button key={l.id || i} className={'ob-look' + (i === lookIdx ? ' on' : '')} onClick={() => chooseLook(i)} aria-pressed={i === lookIdx}>
                <span className="im" style={{ backgroundImage: `url("${l.small}")` }} />
                <span className="nm">{l.name}</span>
                <span className="pr">
                  {money(t)}
                  {t <= budget ? <em className="fit">In budget</em> : <em>+{money(t - budget)}</em>}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ---------- pieces + summary ---------- */}
        <div className="ob-main">
          <section className="ob-pieces">
            <div className="store-section-h">
              <h2>2 · Mix &amp; match pieces</h2>
              {changed && (
                <button className="ps-link" onClick={() => chooseLook(lookIdx)}>
                  <Icon name="reset" size={14} /> Original {look.name}
                </button>
              )}
            </div>

            {GROUPS.map((g) => {
              const rows = items.filter((p) => p.group === g.key);
              const canAdd = all.some((p) => p.group === g.key && !sel.includes(p.id));
              if (g.key.startsWith('x:') && !rows.length && !canAdd) return null;
              return (
                <div key={g.key} className="ob-group">
                  <div className="ob-group-h">
                    <h3>{g.label}</h3>
                    {canAdd && (
                      <button className={'ob-add' + (swap === 'add:' + g.key ? ' on' : '')} onClick={() => setSwap(swap === 'add:' + g.key ? null : 'add:' + g.key)}>
                        <Icon name={swap === 'add:' + g.key ? 'x' : 'plus'} size={14} stroke={2} />
                        {swap === 'add:' + g.key ? 'Close' : `Add ${g.label.toLowerCase()}`}
                      </button>
                    )}
                  </div>
                  {rows.length === 0 && swap !== 'add:' + g.key && <p className="ob-none">Not in this outfit</p>}

                  {rows.map((p) => {
                    const sz = sizeFor(p);
                    const alts = alternativesFor(p, { exclude: sel });
                    return (
                      <div key={p.id} className="ob-item-wrap">
                        <div className={'ob-item' + (missing.includes(p.id) ? ' need' : '')}>
                          <button className="ob-thumb" style={cropStyle(p, p.thumb)} onClick={() => onOpenProduct(p)} aria-label={`View ${p.name}`} />
                          <div className="ob-info">
                            <button className="ob-name" onClick={() => onOpenProduct(p)}>
                              {p.name}
                            </button>
                            <small>
                              {p.color}
                              {p.lookIdx !== lookIdx && <> · from {p.lookName}</>}
                              {inCart.has(p.id) && <> · in cart</>}
                            </small>
                            <div className="ob-ctl">
                              <label className="ob-size">
                                <span className="sr">Size for {p.name}</span>
                                <select value={sz} onChange={(e) => pickSize(p, e.target.value)}>
                                  {!sz && <option value="">Size…</option>}
                                  {(p.sizes || []).map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                                <Icon name="chev" size={13} />
                              </label>
                              {alts.length > 0 && (
                                <button className={'ob-swap' + (swap === p.id ? ' on' : '')} onClick={() => setSwap(swap === p.id ? null : p.id)}>
                                  <Icon name="shuffle" size={14} /> {swap === p.id ? 'Close' : `Swap · ${alts.length}`}
                                </button>
                              )}
                              <button className="ob-del" onClick={() => remove(p.id)} aria-label={`Remove ${p.name} from outfit`}>
                                <Icon name="trash" size={15} />
                              </button>
                            </div>
                          </div>
                          <b className="ob-price">{money(p.price)}</b>
                        </div>
                        {swap === p.id && (
                          <AltStrip alts={alts} current={p} total={total} budget={budget} onPick={(a) => replace(p.id, a)} />
                        )}
                      </div>
                    );
                  })}

                  {swap === 'add:' + g.key && (
                    <AltStrip
                      alts={all.filter((p) => p.group === g.key && !sel.includes(p.id)).sort((a, b) => a.price - b.price)}
                      total={total}
                      budget={budget}
                      onPick={add}
                    />
                  )}
                </div>
              );
            })}
          </section>

          <aside className="ob-sum" aria-label="Outfit total">
            <div className="ob-sum-in">
              <div className="ob-sum-row">
                <span>Outfit total</span>
                <b>{money(total)}</b>
              </div>
              <div className="ob-sum-row sub">
                <span>Budget</span>
                <span>{money(budget)}</span>
              </div>
              <div className={'ob-bar' + (over ? ' over' : '')} role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={total} aria-label="Budget used">
                <i style={{ width: pct + '%' }} />
              </div>
              <p className={'ob-left' + (over ? ' over' : '')}>
                {over ? `${money(-left)} over budget` : `${money(left)} left to spend`}
                <small>
                  {' '}
                  · {items.length} {items.length === 1 ? 'item' : 'items'}
                </small>
              </p>

              {msg && <p className={'ob-msg ' + msg.tone}>{msg.text}</p>}

              <div className="ob-sum-actions">
                {over && (
                  <button className="shop-btn block" onClick={fitBudget}>
                    <Icon name="wallet" size={17} /> Fit my budget
                  </button>
                )}
                <button className="shop-btn primary block" onClick={addAll} disabled={!items.length}>
                  <Icon name="cart" size={17} /> Add <span className="ob-long">outfit </span>to cart · {money(total)}
                </button>
                <button className="ps-link" onClick={() => onTryLook(lookIdx)}>
                  <Icon name="hanger" size={15} /> See {look.name} on the model
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function AltStrip({ alts, current, total, budget, onPick }) {
  const [within, setWithin] = useState(false);
  const base = total - (current?.price || 0);
  const list = within ? alts.filter((a) => base + a.price <= budget) : alts;
  return (
    <div className="ob-alts">
      <div className="ob-alts-h">
        <span>{current ? `Swap ${current.name} for…` : 'Pick one to add'} · cheapest first</span>
        <button className={'ob-chip' + (within ? ' on' : '')} onClick={() => setWithin((w) => !w)} aria-pressed={within}>
          {within && <Icon name="check" size={12} stroke={2.6} />} Fits my budget
        </button>
      </div>
      <div className="ob-alts-row">
        {list.length === 0 && <p className="shop-muted small">Nothing here fits your budget.</p>}
        {list.map((a) => {
          const fits = base + a.price <= budget;
          const diff = current ? a.price - current.price : a.price;
          return (
            <button key={a.id} className={'ob-alt' + (fits ? '' : ' dim')} onClick={() => onPick(a)}>
              <span className="im" style={cropStyle(a, a.thumb)} />
              <span className="nm">{a.name}</span>
              <span className="pr">
                {money(a.price)}
                {current && <em className={diff < 0 ? 'down' : diff > 0 ? 'up' : ''}>{diff === 0 ? 'same' : (diff < 0 ? '−' : '+') + money(Math.abs(diff))}</em>}
              </span>
              {!fits && <span className="ob-over">Over budget</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
