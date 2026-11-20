import { useState } from 'react';
import Slider from '../components/Slider.jsx';

const POSTURES = ['Relaxed', 'Confident', 'Editorial'];
const FRAMES = [
  ['full', 'Full body'],
  ['mid', 'Mid shot'],
  ['portrait', 'Portrait'],
];

export default function BodyView({ height, setHeight, build, setBuild, commit, framing, setFraming, rescan }) {
  const [posture, setPosture] = useState('Relaxed');
  return (
    <>
      <h3>Body</h3>
      <div className="sliders">
        <Slider label="Height (cm)" min={150} max={185} value={height} onChange={setHeight} onCommit={(v) => commit({ height: v })} />
        <Slider label="Build" value={build} onChange={setBuild} onCommit={(v) => commit({ build: v })} />
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
