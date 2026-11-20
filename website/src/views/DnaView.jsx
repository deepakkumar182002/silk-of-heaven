import { useEffect, useRef } from 'react';

const N = 26;
const X0 = (300 - (N - 1) * 11) / 2;

export default function DnaView({ ident, onReseed, active }) {
  const lines = useRef([]);
  const dotsA = useRef([]);
  const dotsB = useRef([]);

  useEffect(() => {
    if (!active) return;
    let t = 0;
    let raf;
    const frame = () => {
      t += 0.03;
      for (let i = 0; i < N; i++) {
        const a = i * 0.42 + t;
        const s = Math.sin(a);
        const d1 = (Math.cos(a) + 1) / 2;
        const d2 = 1 - d1;
        const y1 = 60 + s * 38;
        const y2 = 60 - s * 38;
        const l = lines.current[i];
        const p = dotsA.current[i];
        const q = dotsB.current[i];
        if (!l || !p || !q) continue;
        l.setAttribute('y1', y1);
        l.setAttribute('y2', y2);
        l.setAttribute('stroke-opacity', 0.15 + Math.max(d1, d2) * 0.25);
        p.setAttribute('cy', y1);
        p.setAttribute('r', 2 + d1 * 2.4);
        p.setAttribute('fill-opacity', 0.4 + d1 * 0.6);
        q.setAttribute('cy', y2);
        q.setAttribute('r', 2 + d2 * 2.4);
        q.setAttribute('fill-opacity', 0.4 + d2 * 0.6);
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <>
      <h3>
        DNA <small>identity seed</small>
      </h3>
      <svg className="helix" width="300" height="120" viewBox="0 0 300 120">
        {Array.from({ length: N }, (_, i) => {
          const x = X0 + i * 11;
          return (
            <g key={i}>
              <line ref={(el) => (lines.current[i] = el)} x1={x} x2={x} y1="60" y2="60" stroke="#fff" strokeWidth="1" />
              <circle ref={(el) => (dotsA.current[i] = el)} cx={x} cy="60" r="2" fill="#fff" />
              <circle ref={(el) => (dotsB.current[i] = el)} cx={x} cy="60" r="2" fill="#fff" />
            </g>
          );
        })}
      </svg>
      <div className="kv">
        <div><span>Seed</span>{ident.seed}</div>
        <div><span>Heritage</span>Korean</div>
        <div><span>Age</span>{ident.age}</div>
        <div><span>Eye colour</span>Dark brown</div>
        <div><span>Hair</span>Black · high bun</div>
      </div>
      <button className="outline-btn" onClick={onReseed}>
        Re-seed identity
      </button>
    </>
  );
}
