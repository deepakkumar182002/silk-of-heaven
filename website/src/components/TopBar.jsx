import { useRef } from 'react';
import { TABS } from '../data.js';
import Icon from '../icons.jsx';
import Badge from './Badge.jsx';
import useIndicator from './useIndicator.js';

const MORE = [
  ['Share look', 'Share link copied'],
  ['Export render', 'Exported 4K render'],
  ['Duplicate', 'Duplicated as a new look'],
  ['Settings', 'Settings saved'],
];

export default function TopBar({ tab, setTab, cartCount, favCount, isFav, libCount, onBag, onCart, onShop, onHome, onTrack, onAccount, accountName, moreOpen, setMoreOpen, say }) {
  const btns = useRef({});
  const ind = useIndicator(() => btns.current[tab], [tab]);

  return (
    <>
      <a
        id="logo"
        href="/shop"
        aria-label="Silk of Heaven shop home"
        onClick={(e) => {
          e.preventDefault();
          onHome();
        }}
      >
        <b>Silk of Heaven</b>
        <span>FITTING ROOM</span>
      </a>

      <nav id="tabs" className="glass">
        <span id="tabInd" className="pill-on" style={ind ? { left: ind.left, width: ind.width } : { opacity: 0 }} />
        {TABS.map((t) => (
          <button key={t} ref={(el) => (btns.current[t] = el)} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <div id="icons">
        <button className="ibtn glass shop-pill" aria-label="Back to shop" onClick={onShop}>
          <Icon name="store" />
          <span>Shop</span>
        </button>
        <button className="ibtn glass" aria-label="Cart" onClick={onCart}>
          <Icon name="cart" />
          <Badge count={cartCount} />
        </button>
        <button className="ibtn glass" aria-label="Favourites">
          <Icon name="heart" fill={isFav ? '#fff' : 'none'} />
          <Badge count={favCount} />
        </button>
        <button id="bagBtn" className="ibtn glass" aria-label="Library" onClick={onBag}>
          <Icon name="bag" />
          <Badge count={libCount} />
        </button>
        <button className="ibtn glass" aria-label="More" onClick={() => setMoreOpen((o) => !o)}>
          <Icon name="more" />
        </button>
      </div>

      <div id="more" className={'glass' + (moreOpen ? ' open' : '')}>
        <button
          onClick={() => {
            setMoreOpen(false);
            onShop();
          }}
        >
          Shop all items
        </button>
        <button
          onClick={() => {
            setMoreOpen(false);
            onAccount();
          }}
        >
          {accountName ? `My account (${accountName.split(' ')[0]})` : 'Log in / Sign up'}
        </button>
        <button
          onClick={() => {
            setMoreOpen(false);
            onTrack();
          }}
        >
          Track order
        </button>
        {MORE.map(([label, msg]) => (
          <button
            key={label}
            onClick={() => {
              setMoreOpen(false);
              say(msg);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
