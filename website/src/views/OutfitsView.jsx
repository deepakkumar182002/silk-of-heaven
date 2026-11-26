import { useEffect, useRef, useState } from 'react';
import { BODIES, CATS, GROUPS, LOOKS, isItemGroup, money } from '../data.js';
import Icon from '../icons.jsx';
import FaceCard from '../components/FaceCard.jsx';
import MixMatch from '../components/MixMatch.jsx';

const matches = (l, cat, body) => (cat === 'all' || l.cat === cat) && (l.body || BODIES[0].key) === body;

export default function OutfitsView({
  look, cardOn, roul, cat, setCat, pickLook, favs, toggleFav, openRow, setOpenRow, cartItems, onShop, onOpenShop,
  isWorn, toggleWear, wearNone, resetWear, body, pickBody, face, faceOn, setFaceOn, onFace, say,
}) {
  const [vis, setVis] = useState(() => ({ shown: LOOKS.map((l) => matches(l, cat, body)), out: [], gen: -1, order: [] }));
  const first = useRef(true);
  const visRef = useRef(vis);
  visRef.current = vis;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const match = LOOKS.map((l) => matches(l, cat, body));
    const order = match.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
    const cur = visRef.current;
    const out = cur.shown.map((sh, i) => (sh && !match[i] ? i : -1)).filter((i) => i >= 0);
    setVis({ ...cur, out });
    const t = setTimeout(
      () => setVis((v) => ({ shown: match, out: [], gen: v.gen + 1, order })),
      out.length ? 300 : 0
    );
    return () => clearTimeout(t);
  }, [cat, body]);

  const count = LOOKS.filter((l) => matches(l, cat, body)).length;
  const bodies = BODIES.filter((b) => LOOKS.some((l) => l.body === b.key));
  const pieces = LOOKS[look].pieces;

  return (
    <>
      <h3>
        Outfits <small>{count} {count === 1 ? 'look' : 'looks'}</small>
        <span className="o-links">
          <button onClick={() => onOpenShop({ tab: 'browse' })}>
            <Icon name="store" size={15} /> Shop all
          </button>
          <button onClick={() => onOpenShop({ tab: 'build', lookIdx: look })}>
            <Icon name="wallet" size={15} /> Budget
          </button>
        </span>
      </h3>

      {bodies.length > 1 && (
        <div className="body-switch" role="tablist" aria-label="Model">
          {bodies.map((b) => (
            <button key={b.key} role="tab" aria-selected={b.key === body} className={b.key === body ? 'on' : ''} onClick={() => pickBody(b.key)}>
              {b.name}
            </button>
          ))}
        </div>
      )}

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

      <FaceCard compact look={look} body={body} face={face} faceOn={faceOn} setFaceOn={setFaceOn} onFace={onFace} say={say} />
      <MixMatch look={look} isWorn={isWorn} toggleWear={toggleWear} wearNone={wearNone} resetWear={resetWear} onShop={onShop} />

      <div className="acc">
        {GROUPS.map((g) => {
          const list = pieces[g.key] || [];
          if (isItemGroup(g.key) && !list.length) return null; // library categories only when the look has some
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
                          <span className="pr">{money(p.price)}</span>
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
