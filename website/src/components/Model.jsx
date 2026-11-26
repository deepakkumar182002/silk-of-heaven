import { forwardRef } from 'react';
import { CANVAS, GROUPS, HOTSPOTS, LOOKS, bodyOf, money, realFilters } from '../data.js';

/** Face layer placed on the 1360×2048 canvas (same box as the look image). */
export const faceStyle = (face) => ({
  left: `${(face.box.x / CANVAS.w) * 100}%`,
  top: `${(face.box.y / CANVAS.h) * 100}%`,
  width: `${(face.box.w / CANVAS.w) * 100}%`,
  height: `${(face.box.h / CANVAS.h) * 100}%`,
  backgroundImage: `url("${face.image}")`,
});

const Model = forwardRef(function Model(
  { figs, look, scanKey, real, height, build, framing, onWipeEnd, onHotspot, layersOf, faceOf },
  ref
) {
  const pieces = LOOKS[look].pieces;
  const ref0 = bodyOf(LOOKS[look].body).height || 168; // the body model's own height = scale 1
  return (
    <div id="modelWrap" ref={ref} className={framing}>
      <div id="shadow" />
      <div
        id="modelInner"
        style={{
          '--height': 1 + ((height - ref0) / ref0) * 0.9,
          '--build': 1 + ((build - 50) / 50) * 0.07,
        }}
      >
        <div id="breath">
          <div id="figs" style={{ '--real': realFilters(real).model }}>
            {figs.map((f) => {
              const face = faceOf(f.look);
              return (
              <div
                key={f.id}
                className={'fig' + (f.in ? ' in' : '')}
                style={{ backgroundImage: `url("${LOOKS[f.look].big}")` }}
                onAnimationEnd={f.in ? (e) => e.target === e.currentTarget && onWipeEnd(f.id) : undefined}
              >
                {layersOf(f.look).map((p) => (
                  <span key={p.id} className="fig-layer" style={{ backgroundImage: `url("${p.layer}")` }} />
                ))}
                {face && <span className="fig-face" style={faceStyle(face)} />}
              </div>
              );
            })}
          </div>
          <div id="scan" key={scanKey} className={scanKey ? 'go' : ''} />
          <div id="hotspots" className={framing === 'full' ? '' : 'off'}>
            {GROUPS.filter((g) => HOTSPOTS[g.key] && pieces[g.key]?.length).map((g) => {
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
                    <b>{p.name}</b> <span>· {p.color} · {money(p.price)}</span>
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
