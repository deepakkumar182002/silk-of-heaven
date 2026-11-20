import { useEffect, useRef, useState } from 'react';
import { LOOKS } from '../data.js';

const pick3 = (all) => [...all].sort(() => Math.random() - 0.5).slice(0, 3);

export default function StoryView({ active, ident, height, look, traits, allTraits }) {
  const [text, setText] = useState('');
  const timer = useRef();
  const ctx = useRef();
  ctx.current = { ident, height, look, traits };

  const type = (tr) => {
    const { ident: id, height: h, look: lk } = ctx.current;
    const t = [...tr];
    for (const x of ['Curious', 'Creative', 'Gentle']) if (t.length < 3 && !t.includes(x)) t.push(x);
    const [a, b, c] = t.map((x) => x.toLowerCase());
    const bio =
      `${id.name} is ${h} cm of ${a} energy from ${id.city}. Mornings start with a long walk along the river in her ` +
      `${LOOKS[lk].name.toLowerCase()} look; friends call her ${b} and a little ${c}. She collects film cameras, ` +
      `keeps a sketchbook of strangers’ outfits, and is saving for a studio of her own.`;
    clearInterval(timer.current);
    let n = 0;
    setText('');
    timer.current = setInterval(() => {
      n += 2;
      setText(bio.slice(0, n));
      if (n >= bio.length) clearInterval(timer.current);
    }, 22);
  };

  useEffect(() => {
    if (active) type(ctx.current.traits);
    else clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => () => clearInterval(timer.current), []);

  return (
    <>
      <h3>
        Story <small>auto-written from your choices</small>
      </h3>
      <div className="story">
        {text}
        <span className="caret" />
      </div>
      <button className="outline-btn" onClick={() => type(pick3(allTraits))}>
        Rewrite story
      </button>
    </>
  );
}
