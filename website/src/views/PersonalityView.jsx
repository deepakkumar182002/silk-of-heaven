import { useEffect, useState } from 'react';
import { AXES, radarFrom } from '../data.js';
import Slider from '../components/Slider.jsx';

const CX = 125;
const CY = 112;
const R = 78;
const pt = (i, r) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
};
const poly = (vals) => vals.map((v, i) => pt(i, v).join(',')).join(' ');

export default function PersonalityView({ traits, setTraits, allTraits }) {
  const [vals, setVals] = useState(() => radarFrom(traits));
  useEffect(() => setVals(radarFrom(traits)), [traits]);

  const toggle = (t) =>
    setTraits((s) => {
      if (s.includes(t)) return s.filter((x) => x !== t);
      const n = [...s, t];
      return n.length > 3 ? n.slice(1) : n;
    });

  const setAxis = (i, v) => setVals((a) => a.map((x, j) => (j === i ? v : x)));

  return (
    <>
      <h3>
        Personality <small>pick up to 3</small>
      </h3>
      <div className="opts">
        {allTraits.map((t) => (
          <button key={t} className={'opt' + (traits.includes(t) ? ' on' : '')} onClick={() => toggle(t)}>
            {t}
          </button>
        ))}
      </div>
      <svg className="radar" width="250" height="210" viewBox="0 0 250 210">
        {[1, 2, 3, 4].map((k) => (
          <polygon key={k} points={poly(AXES.map(() => (R * k) / 4))} fill="none" stroke="rgba(255,255,255,.25)" />
        ))}
        {AXES.map((a, i) => {
          const [x, y] = pt(i, R);
          const [lx, ly] = pt(i, R + 14);
          return (
            <g key={a}>
              <line x1={CX} y1={CY} x2={x} y2={y} stroke="rgba(255,255,255,.25)" />
              <text
                x={lx}
                y={ly}
                fill="rgba(255,255,255,.72)"
                fontSize="11"
                textAnchor={Math.abs(lx - CX) < 4 ? 'middle' : lx > CX ? 'start' : 'end'}
                dominantBaseline="middle"
              >
                {a}
              </text>
            </g>
          );
        })}
        <polygon
          points={poly(vals.map((v) => (v / 100) * R))}
          fill="rgba(255,255,255,.28)"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <div className="sliders" style={{ marginTop: 6 }}>
        <Slider label="Openness" value={vals[0]} onChange={(v) => setAxis(0, v)} />
        <Slider label="Energy" value={vals[1]} onChange={(v) => setAxis(1, v)} />
      </div>
    </>
  );
}
