import { useEffect, useMemo, useState } from 'react';
import { GROUPS, GROUP_LABEL, LOOKS, imgUrl } from '../data.js';
import Icon from '../icons.jsx';
import Overlay from './Overlay.jsx';
import { alternativesFor, cropStyle, money } from './catalog.js';
import { RATINGS, SHOP } from '../data.js';
import { productPath, setSeo } from '../useRoute.js';
import { useAccount } from '../account/account.jsx';
import Reviews, { Stars } from './Reviews.jsx';


// Standard apparel size chart (cm)
const SIZE_CHART = {
  XS: [80, 62, 86],
  S: [84, 66, 90],
  M: [88, 70, 94],
  L: [94, 76, 100],
  XL: [100, 82, 106],
};

const MEASURES = [
  ['bust', 'Bust'],
  ['waist', 'Waist'],
  ['hips', 'Hips'],
  ['length', 'Length'],
];

export const findPiece = (look, group, id) => look?.pieces[group]?.find((p) => p.id === id);

/**
 * target: { lookIdx, group, pieceId }  and optionally  edit: <cart line>
 * Lets the customer switch garment within the look, choose colour & size (or custom measurements),
 * quantity and stitching notes, then add / update the cart line.
 */
export default function ProductSheet({ target, onClose, onSave, onRemove, onSwitch, onTry }) {
  const look = LOOKS[target.lookIdx];
  const edit = target.edit;
  const garments = useMemo(
    () => (look ? GROUPS.flatMap((g) => (look.pieces[g.key] || []).map((p) => ({ ...p, group: g.key }))) : []),
    [look]
  );
  const [selId, setSelId] = useState(target.pieceId);
  const garment = garments.find((p) => p.id === selId) || garments[0];

  if (!look || !garment) {
    return (
      <Overlay title="Item unavailable" onClose={onClose}>
        <p className="shop-muted">This item is no longer available.</p>
        {edit && (
          <button className="shop-btn" onClick={() => onRemove(edit.cid)}>
            Remove from cart
          </button>
        )}
      </Overlay>
    );
  }

  return (
    <Overlay title={edit ? 'Edit item' : look.name} onClose={onClose} wide label={`${garment.name} details`}>
      <SheetSeo look={look} garment={garment} />
      <div className="ps">
        <div className="ps-visual">
          <div
            className={'ps-img' + (garment.photo ? ' photo' : '')}
            style={{ backgroundImage: `url("${garment.photo ? imgUrl(garment.photo, 900) : look.big}")` }}
            role="img"
            aria-label={`${garment.photo ? garment.name : look.name} preview`}
          />
          <WishShare look={look} garment={garment} />
          <p className="ps-cap">{garment.photo ? 'Product photo.' : 'Preview shows the sample look.'} Your piece comes in the colour and size you choose.</p>
          {onTry && (
            <button className="ps-link ps-try" onClick={() => onTry(target.lookIdx)}>
              <Icon name="hanger" size={15} /> See {look.name} on the model
            </button>
          )}
        </div>

        <div className="ps-info">
          {!edit && garments.length > 1 && (
            <div className="ps-garments" role="tablist" aria-label="Garments in this look">
              {garments.map((g) => (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={g.id === garment.id}
                  className={g.id === garment.id ? 'on' : ''}
                  onClick={() => setSelId(g.id)}
                >
                  <small>{GROUP_LABEL[g.group]}</small>
                  {g.name}
                </button>
              ))}
            </div>
          )}
          <ProductForm key={garment.id} look={look} garment={garment} edit={edit} onSave={onSave} onRemove={onRemove} />
          {!edit && <Reviews key={`rv-${garment.id}`} garment={garment} look={look} />}
          {!edit && onSwitch && <Similar garment={garment} onPick={onSwitch} />}
        </div>
      </div>
    </Overlay>
  );
}

function ProductForm({ look, garment, edit, onSave, onRemove }) {
  const colors = garment.colors?.length ? garment.colors : [{ name: garment.color || 'Default', hex: '#9aa0a6' }];
  const sizes = garment.sizes?.length ? garment.sizes : ['One size'];
  const canCustom = garment.madeToOrder;

  const [color, setColor] = useState(edit?.color || colors[0].name);
  const [size, setSize] = useState(edit?.size || (sizes.length === 1 ? sizes[0] : ''));
  const [qty, setQty] = useState(edit?.qty || 1);
  const [m, setM] = useState({ bust: '', waist: '', hips: '', length: '', ...(edit?.measurements || {}) });
  const [notes, setNotes] = useState(edit?.notes || '');
  const [guide, setGuide] = useState(false);
  const [tried, setTried] = useState(false);

  const custom = size === 'Custom';
  const hasMeasure = ['bust', 'waist', 'hips'].some((k) => Number(m[k]) > 0);
  const colour = colors.find((c) => c.name === color) || colors[0];
  const soldOut = garment.stock === 0;
  const lowStock = garment.stock > 0 && garment.stock <= 5;
  const error = !size
    ? 'Please choose a size'
    : custom && !hasMeasure
      ? 'Add at least bust, waist or hips'
      : garment.stock != null && qty > garment.stock
        ? `Only ${garment.stock} left`
        : '';
  const stdChart = garment.madeToOrder && sizes.some((s) => SIZE_CHART[s]);

  const submit = () => {
    setTried(true);
    if (error) return;
    const measurements = custom
      ? Object.fromEntries(MEASURES.map(([k]) => [k, Number(m[k]) || undefined]).filter(([, v]) => v))
      : undefined;
    onSave({
      cid: edit?.cid,
      lookId: look.id,
      group: garment.group,
      pieceId: garment.id,
      name: garment.name,
      lookName: look.name,
      image: garment.thumb || look.small,
      color: colour.name,
      colorHex: colour.hex,
      size,
      qty,
      price: garment.price,
      measurements,
      notes: notes.trim(),
      madeToOrder: garment.madeToOrder,
      leadTimeDays: garment.leadTimeDays,
    });
  };

  return (
    <>
      <div className="ps-title">
        <h3>{garment.name}</h3>
        <b>{money(garment.price)}</b>
      </div>
      {RATINGS[garment.id] && (
        <a className="ps-rating" href="#reviews">
          <Stars value={RATINGS[garment.id].avg} /> {RATINGS[garment.id].avg} · {RATINGS[garment.id].count} review{RATINGS[garment.id].count === 1 ? '' : 's'}
        </a>
      )}
      <small className="ps-taxnote">{SHOP.pricesIncludeTax ? 'Inclusive of all taxes' : `+ GST ${SHOP.gstRate}%`}</small>
      <span className={'ps-tag' + (garment.madeToOrder ? ' mto' : '')}>
        <Icon name={garment.madeToOrder ? 'scissors' : 'box'} size={14} />
        {garment.madeToOrder
          ? `Made to order · stitched in ~${garment.leadTimeDays} days`
          : `Ready-made · ships in ~${garment.leadTimeDays} days`}
      </span>
      {garment.description && <p className="ps-desc">{garment.description}</p>}

      <dl className="ps-specs">
        <div><dt>Colour</dt><dd>{colour.name}</dd></div>
        {garment.fabric && <div><dt>Fabric</dt><dd>{garment.fabric}</dd></div>}
        {garment.care && <div><dt>Care</dt><dd>{garment.care}</dd></div>}
        <div><dt>Part of</dt><dd>{look.name}</dd></div>
      </dl>

      <div className="ps-block">
        <div className="ps-label">Colour <span>{colour.name}</span></div>
        <div className="ps-colors">
          {colors.map((c) => (
            <button
              key={c.name}
              className={'ps-sw' + (c.name === color ? ' on' : '')}
              style={{ '--c': c.hex || '#9aa0a6' }}
              onClick={() => setColor(c.name)}
              aria-label={c.name}
              aria-pressed={c.name === color}
              title={c.name}
            />
          ))}
        </div>
      </div>

      <div className="ps-block">
        <div className="ps-label">
          Size
          {stdChart && (
            <button className="ps-link" onClick={() => setGuide((g) => !g)}>
              <Icon name="ruler" size={14} /> Size guide
            </button>
          )}
        </div>
        <div className="ps-sizes">
          {sizes.map((s) => (
            <button key={s} className={s === size ? 'on' : ''} onClick={() => setSize(s)} aria-pressed={s === size}>
              {s}
            </button>
          ))}
          {canCustom && (
            <button className={'custom' + (custom ? ' on' : '')} onClick={() => setSize('Custom')} aria-pressed={custom}>
              <Icon name="ruler" size={14} /> Custom fit
            </button>
          )}
        </div>

        {guide && stdChart && (
          <table className="ps-chart">
            <thead>
              <tr><th>Size</th><th>Bust</th><th>Waist</th><th>Hips</th></tr>
            </thead>
            <tbody>
              {Object.entries(SIZE_CHART).map(([s, v]) => (
                <tr key={s} className={s === size ? 'on' : ''}>
                  <td>{s}</td>
                  {v.map((n, i) => <td key={i}>{n} cm</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {custom && (
          <div className="ps-measure">
            <p className="shop-muted">Your tailor will cut to these (in cm) and confirm them with you before starting.</p>
            <div className="ps-mgrid">
              {MEASURES.map(([k, label]) => (
                <label key={k}>
                  <span>{label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    placeholder="cm"
                    value={m[k]}
                    onChange={(e) => setM((x) => ({ ...x, [k]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ps-block">
        <div className="ps-label">Notes for the tailor <span>optional</span></div>
        <textarea
          rows={2}
          maxLength={500}
          placeholder="e.g. shorten sleeves by 2 cm, add pockets…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="ps-buy">
        <div className="ps-qty" aria-label="Quantity">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" disabled={qty <= 1}>
            <Icon name="minus" size={16} stroke={2} />
          </button>
          <b>{qty}</b>
          <button onClick={() => setQty((q) => Math.min(10, q + 1))} aria-label="Increase quantity" disabled={qty >= 10}>
            <Icon name="plus" size={16} stroke={2} />
          </button>
        </div>
        <button className="shop-btn primary grow" onClick={submit} disabled={soldOut}>
          {soldOut ? 'Out of stock' : `${edit ? 'Update item' : 'Add to cart'} · ${money(garment.price * qty)}`}
        </button>
      </div>
      {lowStock && <p className="ps-stock">Only {garment.stock} left</p>}
      {tried && error && <p className="shop-err" role="alert">{error}</p>}
      {edit && (
        <button className="ps-link danger" onClick={() => onRemove(edit.cid)}>
          <Icon name="trash" size={14} /> Remove from cart
        </button>
      )}
    </>
  );
}

/** Same type of item from other looks, cheapest first, so the customer can compare prices. */
function Similar({ garment, onPick }) {
  const same = (a) => a.name === garment.name && a.color === garment.color && a.price === garment.price;
  const alts = alternativesFor(garment).filter((a) => !same(a));
  if (!alts.length) return null;
  return (
    <div className="ps-similar">
      <div className="ps-label">
        More {(GROUP_LABEL[garment.group] || 'items').toLowerCase()} · compare prices <span>{alts.length}</span>
      </div>
      <div className="ps-sim-row">
        {alts.map((a) => {
          const diff = a.price - garment.price;
          return (
            <button key={a.id} className="ob-alt" onClick={() => onPick(a)}>
              <span className="im" style={cropStyle(a, a.thumb)} />
              <span className="nm">{a.name}</span>
              <span className="pr">
                {money(a.price)}
                <em className={diff < 0 ? 'down' : diff > 0 ? 'up' : ''}>
                  {diff === 0 ? 'same' : (diff < 0 ? '−' : '+') + money(Math.abs(diff))}
                </em>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Title, description, share image and canonical URL of the product page. */
function SheetSeo({ look, garment }) {
  useEffect(() => {
    const prev = { title: document.title, path: window.location.pathname };
    setSeo({
      title: `${garment.name} · ${money(garment.price)}`,
      description: (garment.description || `${garment.name} from ${look.name}.`).slice(0, 160),
      image: garment.photo || look.big,
      path: productPath(garment),
    });
    return () => (document.title = prev.title);
  }, [garment, look]);
  return null;
}

/** Wishlist heart and share link. */
function WishShare({ look, garment }) {
  const acc = useAccount();
  const [msg, setMsg] = useState('');
  const on = acc.isWished(garment.id);
  const url = window.location.origin + productPath(garment);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: garment.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setMsg('Link copied');
        setTimeout(() => setMsg(''), 1600);
      }
    } catch {
      /* cancelled */
    }
  };
  return (
    <div className="ps-acts">
      <button className={'ps-wish' + (on ? ' on' : '')} aria-pressed={on} onClick={() => setMsg(acc.toggleWish({ lookId: look.id, group: garment.group, pieceId: garment.id }) ? 'Saved to wishlist' : 'Removed from wishlist')}>
        <Icon name="heart" size={17} fill={on ? 'currentColor' : 'none'} /> {on ? 'In wishlist' : 'Wishlist'}
      </button>
      <button className="ps-wish" onClick={share}>
        <Icon name="copy" size={16} /> Share
      </button>
      {msg && <small className="ps-msg">{msg}</small>}
    </div>
  );
}
