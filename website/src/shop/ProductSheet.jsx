import { useMemo, useState } from 'react';
import { GROUPS, LOOKS } from '../data.js';
import Icon from '../icons.jsx';
import Overlay from './Overlay.jsx';

const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.key, g.label]));

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
export default function ProductSheet({ target, onClose, onSave, onRemove }) {
  const look = LOOKS[target.lookIdx];
  const edit = target.edit;
  const garments = useMemo(
    () => (look ? GROUPS.flatMap((g) => look.pieces[g.key].map((p) => ({ ...p, group: g.key }))) : []),
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
      <div className="ps">
        <div className="ps-visual">
          <div className="ps-img" style={{ backgroundImage: `url("${look.big}")` }} role="img" aria-label={`${look.name} preview`} />
          <p className="ps-cap">Preview shows the sample look. Your piece is made in the colour and size you choose.</p>
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
  const error = !size ? 'Please choose a size' : custom && !hasMeasure ? 'Add at least bust, waist or hips' : '';
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
      image: look.small,
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
        <b>${garment.price}</b>
      </div>
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
        <button className="shop-btn primary grow" onClick={submit}>
          {edit ? 'Update item' : 'Add to cart'} · ${garment.price * qty}
        </button>
      </div>
      {tried && error && <p className="shop-err" role="alert">{error}</p>}
      {edit && (
        <button className="ps-link danger" onClick={() => onRemove(edit.cid)}>
          <Icon name="trash" size={14} /> Remove from cart
        </button>
      )}
    </>
  );
}
