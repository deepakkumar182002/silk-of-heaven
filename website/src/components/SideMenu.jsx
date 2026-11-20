import { useRef } from 'react';
import { MENU } from '../data.js';
import Icon from '../icons.jsx';
import useIndicator from './useIndicator.js';

export default function SideMenu({ menu, setMenu, away, onRandomize, randSpin }) {
  const btns = useRef({});
  const ind = useIndicator(() => btns.current[menu], [menu]);
  return (
    <>
      <nav id="side" className={'glass' + (away ? ' away' : '')}>
        <span id="sideInd" className="pill-on" style={ind ? { top: ind.top } : { opacity: 0 }} />
        {MENU.map((m) => (
          <button
            key={m.key}
            ref={(el) => (btns.current[m.key] = el)}
            className={m.key === menu ? 'on' : ''}
            onClick={() => setMenu(m.key)}
          >
            <Icon name={m.icon} />
            {m.key}
          </button>
        ))}
      </nav>
      <button id="rand" className={'glass' + (away ? ' away' : '')} onClick={onRandomize}>
        <Icon name="randomize" style={{ transform: `rotate(${randSpin}deg)` }} />
        Randomize VELL
      </button>
    </>
  );
}
