import { useState } from 'react';
import Slider from '../components/Slider.jsx';
import { LOOKS, bodyOf } from '../data.js';

const POSTURES = ['Relaxed', 'Confident', 'Editorial'];
const FRAMES = [
  ['full', 'Full body'],
  ['mid', 'Mid shot'],
  ['portrait', 'Portrait'],
];
// quick body types per audience: height (cm) + build (0 slim … 100 full)
const TYPES = {
  women: [
    ['Petite', 152, 42],
    ['Average', 163, 50],
    ['Tall', 175, 46],
    ['Very tall', 183, 48],
    ['Curvy', 165, 78],
  ],
  men: [
    ['Short', 163, 48],
    ['Average', 175, 50],
    ['Tall', 185, 50],
    ['Very tall', 193, 52],
    ['Broad', 178, 78],
  ],
  kids: [
    ['Toddler', 90, 50],
    ['Small', 110, 48],
    ['Average', 125, 50],
    ['Tall', 140, 48],
    ['Teen', 155, 50],
  ],
};
const RANGE = { women: [145, 190], men: [150, 205], kids: [75, 165] };
const UNIT_KEY = 'vell_unit';

export const toFeet = (cm) => {
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
};
const buildLabel = (b) => (b < 25 ? 'Slim' : b < 42 ? 'Lean' : b <= 58 ? 'Regular' : b <= 75 ? 'Curvy' : 'Full');

export default function BodyView({ look, height, setHeight, build, setBuild, commit, framing, setFraming, rescan }) {
  const audience = bodyOf(LOOKS[look]?.body).audience || 'women';
  const types = TYPES[audience] || TYPES.women;
  const [MIN_CM, MAX_CM] = RANGE[audience] || RANGE.women;
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
  const type = types.find(([, h, b]) => h === height && b === build)?.[0];

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
        {types.map(([name, h, b]) => (
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
