import { useEffect, useRef, useState } from 'react';
import { CATS, GROUPS, LOOKS } from '../data.js';
import Icon from '../icons.jsx';

const ALL = LOOKS.map(() => true);

export default function OutfitsView({
  look, cardOn, roul, cat, setCat, pickLook, favs, toggleFav, openRow, setOpenRow, cartItems, onShop,
}) {
  const [vis, setVis] = useState({ shown: ALL, out: [], gen: -1, order: [] });
  const first = useRef(true);
  const visRef = useRef(vis);
  visRef.current = vis;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const match = LOOKS.map((l) => cat === 'all' || l.cat === cat);
    const order = match.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
    const cur = visRef.current;
    const out = cur.shown.map((sh, i) => (sh && !match[i] ? i : -1)).filter((i) => i >= 0);
    setVis({ ...cur, out });
    const t = setTimeout(
      () => setVis((v) => ({ shown: match, out: [], gen: v.gen + 1, order })),
      out.length ? 300 : 0
    );
    return () => clearTimeout(t);
  }, [cat]);

  const count = LOOKS.filter((l) => cat === 'all' || l.cat === cat).length;
  const pieces = LOOKS[look].pieces;

  return (
    <>
      <h3>
        Outfits <small>{count} {count === 1 ? 'look' : 'looks'}</small>
      </h3>

      <div className="cats">
        {CATS.map((c) => (
          <button key={c.key} className={'cat' + (cat === c.key ? ' on' : '')} onClick={() => setCat(c.key)}>
            <span className="tile">
              <Icon name={c.icon} size={24} />
            </span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid">
        {LOOKS.map((l, i) => {
          const j = vis.order.indexOf(i);
          const entering = vis.gen >= 0 && vis.shown[i] && j >= 0;
          const cls = [
            'card',
            cardOn === i && 'on',
            roul === i && 'roul',
            vis.out.includes(i) && 'out',
            !vis.shown[i] && 'gone',
            entering && 'enter' + (vis.gen % 2),
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={i}
              className={cls}
              style={entering ? { animationDelay: j * 45 + 'ms' } : undefined}
              onClick={() => pickLook(i)}
              onDoubleClick={() => toggleFav(i)}
              aria-label={l.name}
            >
              <span className="im" style={{ backgroundImage: `url("${l.small}")` }} />
              <span className={'fav' + (favs.includes(i) ? ' on' : '')}>
                <Icon name="heart" size={13} fill="#fff" stroke={1.4} />
              </span>
              <span className="tag">{l.name}</span>
            </button>
          );
        })}
      </div>

      <div className="acc">
        {GROUPS.map((g) => {
          const list = pieces[g.key];
          const open = openRow === g.key;
          return (
            <div key={g.key} className={'row' + (open ? ' open' : '')}>
              <button className="row-h" onClick={() => setOpenRow(open ? null : g.key)}>
                {g.label}
                {list.length > 0 && <small>· {list.length}</small>}
                <Icon name="chev" size={18} />
              </button>
              <div className="row-b">
                <div>
                  <div className="items">
                    {list.length === 0 && <div className="empty">Nothing in this look</div>}
                    {list.map((p) => {
                      const inCart = cartItems.some((i) => i.pieceId === p.id);
                      return (
                        <div key={p.id || p.name} className="item">
                          <button className="iname" onClick={() => onShop(g.key, p.id)}>{p.name}</button>
                          <span className="c">{p.color}</span>
                          <span className="pr">${p.price}</span>
                          <button
                            className={'add' + (inCart ? ' in' : '')}
                            onClick={() => onShop(g.key, p.id)}
                            aria-label={inCart ? `${p.name} is in your cart. View or change` : `View ${p.name} and add to cart`}
                          >
                            <Icon name={inCart ? 'check' : 'plus'} size={15} stroke={2} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
