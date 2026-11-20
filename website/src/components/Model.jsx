import { forwardRef } from 'react';
import { GROUPS, HOTSPOTS, LOOKS, realFilters } from '../data.js';

const Model = forwardRef(function Model(
  { figs, look, scanKey, real, height, build, framing, onWipeEnd, onHotspot },
  ref
) {
  const pieces = LOOKS[look].pieces;
  return (
    <div id="modelWrap" ref={ref} className={framing}>
      <div id="shadow" />
      <div
        id="modelInner"
        style={{
          '--height': 1 + ((height - 168) / 168) * 0.9,
          '--build': 1 + ((build - 50) / 50) * 0.07,
        }}
      >
        <div id="breath">
          <div id="figs" style={{ '--real': realFilters(real).model }}>
            {figs.map((f) => (
              <div
                key={f.id}
                className={'fig' + (f.in ? ' in' : '')}
                style={{ backgroundImage: `url("${LOOKS[f.look].big}")` }}
                onAnimationEnd={f.in ? () => onWipeEnd(f.id) : undefined}
              />
            ))}
          </div>
          <div id="scan" key={scanKey} className={scanKey ? 'go' : ''} />
          <div id="hotspots" className={framing === 'full' ? '' : 'off'}>
            {GROUPS.filter((g) => pieces[g.key].length).map((g) => {
              const [x, y] = HOTSPOTS[g.key];
              const p = pieces[g.key][0];
              return (
                <button
                  key={look + g.key}
                  className="hot"
                  style={{ left: x + '%', top: y + '%' }}
                  onClick={() => onHotspot(g.key)}
                  aria-label={p.name}
                >
                  <span className="tip">
                    <b>{p.name}</b> <span>· {p.color} · ${p.price}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

export default Model;
