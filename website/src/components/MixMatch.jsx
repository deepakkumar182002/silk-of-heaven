import { GROUP_LABEL, LOOKS, SLOTS, isItemGroup, money, wearables } from '../data.js';
import Icon from '../icons.jsx';

/**
 * Mix & match for the current look: every item the admin added as a layer, grouped by type.
 * Tap to show / hide; items of the same type replace each other (jewellery can be combined).
 */
export default function MixMatch({ look, isWorn, toggleWear, wearNone, resetWear, onShop }) {
  const items = wearables(LOOKS[look]);
  if (!items.length) return null;
  const worn = items.filter((p) => isWorn(look, p)).length;
  const groupOf = (p) => Object.entries(LOOKS[look].pieces).find(([, list]) => list.includes(p))?.[0];
  // sections: library items by their category (Footwear, Bags…), older look items by position
  const sections = [];
  for (const p of items) {
    const g = groupOf(p);
    const key = isItemGroup(g) ? g : 'slot:' + p.slot;
    let sec = sections.find((s) => s.key === key);
    if (!sec) {
      const slot = SLOTS.find((s) => s.key === p.slot);
      sec = { key, slot: p.slot, label: isItemGroup(g) ? GROUP_LABEL[g] : slot?.label || 'Items', multi: !!(slot?.multi || p.multi), list: [] };
      sections.push(sec);
    }
    sec.list.push(p);
  }

  return (
    <section className="mix" aria-label="Mix and match">
      <div className="mix-h">
        <span>
          Mix &amp; match <small>{worn} on</small>
        </span>
        <button onClick={resetWear}>
          <Icon name="reset" size={14} /> Reset
        </button>
      </div>
      {sections.map((slot) => {
        const list = slot.list;
        const anyOn = list.some((p) => isWorn(look, p));
        return (
          <div key={slot.key} className="mix-slot">
            <span className="mix-label">
              {slot.label}
              {!slot.multi && list.length > 1 && <small> · pick one</small>}
            </span>
            <div className="mix-opts" role="group" aria-label={slot.label}>
              {!slot.multi && (
                <button
                  className={'mix-opt none' + (anyOn ? '' : ' on')}
                  aria-pressed={!anyOn}
                  onClick={() => wearNone(slot.slot)}
                >
                  <span className="ph">
                    <Icon name="eyeOff" size={18} />
                  </span>
                  <span className="nm">None</span>
                </button>
              )}
              {list.map((p) => {
                const on = isWorn(look, p);
                return (
                  <div key={p.id} className={'mix-opt' + (on ? ' on' : '')}>
                    <button className="mix-tap" aria-pressed={on} onClick={() => toggleWear(p)} aria-label={`${on ? 'Hide' : 'Show'} ${p.name}`}>
                      <span className="ph" style={p.thumb ? { backgroundImage: `url("${p.thumb}")` } : undefined}>
                        {!p.thumb && <Icon name="hanger" size={18} />}
                        <i className="tick">
                          <Icon name={on ? 'check' : 'plus'} size={11} stroke={2.6} />
                        </i>
                      </span>
                      <span className="nm">{p.name}</span>
                    </button>
                    <button className="pr" onClick={() => onShop(groupOf(p), p.id)} aria-label={`Buy ${p.name}, ${money(p.price)}`}>
                      {money(p.price)}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
