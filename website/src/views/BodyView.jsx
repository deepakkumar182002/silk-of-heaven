import { useState } from 'react';
import Slider from '../components/Slider.jsx';

const POSTURES = ['Relaxed', 'Confident', 'Editorial'];
const FRAMES = [
  ['full', 'Full body'],
  ['mid', 'Mid shot'],
  ['portrait', 'Portrait'],
];
// quick body types: height (cm) + build (0 slim … 100 curvy)
const TYPES = [
  ['Petite', 152, 42],
  ['Average', 163, 50],
  ['Tall', 175, 46],
  ['Very tall', 183, 48],
  ['Curvy', 165, 78],
];
const MIN_CM = 145;
const MAX_CM = 190;
const UNIT_KEY = 'vell_unit';

export const toFeet = (cm) => {
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
};
const buildLabel = (b) => (b < 25 ? 'Slim' : b < 42 ? 'Lean' : b <= 58 ? 'Regular' : b <= 75 ? 'Curvy' : 'Full');

export default function BodyView({ height, setHeight, build, setBuild, commit, framing, setFraming, rescan }) {
  const [posture, setPosture] = useState('Relaxed');
  const [unit, setUnit] = useState(() => localStorage.getItem(UNIT_KEY) || 'cm');
  const pickUnit = (u) => {
    setUnit(u);
    try {
      localStorage.setItem(UNIT_KEY, u);
    } catch {
      /* ignore */
    }
  };
  const type = TYPES.find(([, h, b]) => h === height && b === build)?.[0];

  return (
    <>
      <h3>
        Body
        <span className="unit-toggle" role="group" aria-label="Height unit">
          {[
            ['cm', 'cm'],
            ['ft', 'ft / in'],
          ].map(([k, l]) => (
            <button key={k} className={unit === k ? 'on' : ''} aria-pressed={unit === k} onClick={() => pickUnit(k)}>
              {l}
            </button>
          ))}
        </span>
      </h3>

      <div className="sub">Body type</div>
      <div className="opts" style={{ marginTop: 0 }}>
        {TYPES.map(([name, h, b]) => (
          <button
            key={name}
            className={'opt' + (type === name ? ' on' : '')}
            onClick={() => {
              setHeight(h);
              setBuild(b);
              commit({ height: h, build: b });
              rescan();
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="sliders">
        <Slider
          label="Height"
          min={MIN_CM}
          max={MAX_CM}
          value={height}
          display={unit === 'ft' ? `${toFeet(height)} · ${height} cm` : `${height} cm · ${toFeet(height)}`}
          onChange={setHeight}
          onCommit={(v) => commit({ height: v })}
        />
        <div className="scale-row" aria-hidden="true">
          <span>{unit === 'ft' ? toFeet(MIN_CM) : `${MIN_CM} cm`}</span>
          <span>{unit === 'ft' ? toFeet(MAX_CM) : `${MAX_CM} cm`}</span>
        </div>
        <Slider label="Build" value={build} display={`${buildLabel(build)} · ${build}`} onChange={setBuild} onCommit={(v) => commit({ build: v })} />
        <div className="scale-row" aria-hidden="true">
          <span>Slim</span>
          <span>Full</span>
        </div>
      </div>

      <div className="sub">Posture</div>
      <div className="opts" style={{ marginTop: 0 }}>
        {POSTURES.map((p) => (
          <button
            key={p}
            className={'opt' + (posture === p ? ' on' : '')}
            onClick={() => {
              setPosture(p);
              rescan();
            }}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="sub">Framing</div>
      <div className="opts" style={{ marginTop: 0 }}>
        {FRAMES.map(([k, label]) => (
          <button key={k} className={'opt' + (framing === k ? ' on' : '')} onClick={() => setFraming(k)}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
