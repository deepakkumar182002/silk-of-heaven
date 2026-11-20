import { useState } from 'react';
import { TUNE } from '../data.js';
import Slider from '../components/Slider.jsx';

const initial = () =>
  Object.fromEntries(
    Object.entries(TUNE).map(([k, c]) => [
      k,
      {
        preset: c.multi ? null : c.presets[0],
        multi: [],
        swatch: 0,
        sliders: Object.fromEntries((c.sliders || []).map(([n, v]) => [n, v])),
      },
    ])
  );

export default function TuneView({ menu, rescan, say }) {
  const [state, setState] = useState(initial);
  const item = TUNE[menu] ? menu : 'Face';
  const cfg = TUNE[item];
  const st = state[item];
  const patch = (p) => setState((s) => ({ ...s, [item]: { ...s[item], ...p } }));

  return (
    <>
      <h3>
        {item} <small>changes re-render the model</small>
      </h3>

      {cfg.swatches && (
        <div className="swatches">
          {cfg.swatches.map((c, i) => (
            <button
              key={c}
              className={'sw' + (st.swatch === i ? ' on' : '')}
              style={{ background: c }}
              aria-label={c}
              onClick={() => {
                patch({ swatch: i });
                rescan();
              }}
            />
          ))}
        </div>
      )}

      {cfg.label && <div className="sub">{cfg.label}</div>}
      <div className="opts" style={cfg.label ? { marginTop: 0 } : undefined}>
        {cfg.presets.map((o) => {
          const on = cfg.multi ? st.multi.includes(o) : st.preset === o;
          return (
            <button
              key={o}
              className={'opt' + (on ? ' on' : '')}
              onClick={() => {
                if (cfg.multi) patch({ multi: on ? st.multi.filter((x) => x !== o) : [...st.multi, o] });
                else patch({ preset: o });
                rescan();
                if (!cfg.multi) say(`${item}: ${o}`);
              }}
            >
              {o}
            </button>
          );
        })}
      </div>

      {cfg.sliders && (
        <div className="sliders">
          {cfg.sliders.map(([n]) => (
            <Slider
              key={n}
              label={n}
              value={st.sliders[n]}
              onChange={(v) => patch({ sliders: { ...st.sliders, [n]: v } })}
              onCommit={rescan}
            />
          ))}
        </div>
      )}
    </>
  );
}
