import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULTS, FILTERS, IDENTITIES, LOOKS, SITE, TRAITS } from './data.js';
import useLayoutMode from './components/useLayoutMode.js';
import useCart from './shop/useCart.js';
import ProductSheet from './shop/ProductSheet.jsx';
import CartDrawer from './shop/CartDrawer.jsx';
import TrackOrder from './shop/TrackOrder.jsx';
import Icon from './icons.jsx';
import Scene from './components/Scene.jsx';
import Model from './components/Model.jsx';
import TopBar from './components/TopBar.jsx';
import Profile from './components/Profile.jsx';
import SideMenu from './components/SideMenu.jsx';
import Panel from './components/Panel.jsx';
import { ControlBar, Realism, FilterBar, SaveButton, Library } from './components/Bottom.jsx';

// Preload all eight w=1000 cut-outs at startup
const IMGS = LOOKS.map((l) => {
  const im = new Image();
  im.src = l.big;
  return im;
});

const FRAMINGS = ['full', 'mid', 'portrait'];
const TAB_VIEW = { DNA: 'dna', BODY: 'body', PERSONALITY: 'personality', STORY: 'story' };
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

let figId = 0;

export default function App() {
  const mode = useLayoutMode();
  const stageRef = useRef(null);
  const heroRef = useRef(null);
  const [heroScale, setHeroScale] = useState(0.5);
  const [feetY, setFeetY] = useState(null); // viewport y where the model's feet stand (non-desktop)

  // Fit the 440×800 model box inside the hero area (non-desktop layouts)
  useLayoutEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const s = Math.max(0.2, Math.min(r.height / 800, r.width / 460));
      setHeroScale(s);
      // model box is centred in the hero; the feet sit 287px below its centre (the figure ends ~4px above the box edge)
      setFeetY(r.top + r.height / 2 + (687 - 400 - 4) * s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  // Plant the model on the floor: on phones/tablets the background is scaled and shifted so the
  // floor of the photo (image height fraction FLOOR_AT) passes through her feet, while the photo still
  // covers the whole screen. Desktop keeps the plain "cover" background.
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    const reset = () => {
      root.removeProperty('--bgk');
      root.removeProperty('--bgy');
    };
    if (mode === 'desktop' || feetY == null) {
      reset();
      return;
    }
    const FLOOR_AT = 0.7; // photo's floor starts at ~0.60 of its height; 0.70 puts her feet clearly on it
    const ASPECT = 2688 / 1520;
    const MARGIN = 16; // covers the ±6px parallax with room to spare
    const apply = () => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      // #bg is its parent's box inset by -3% on every side, then cover-fitted and scaled by k about its centre
      const hb = vh * 1.06;
      const wb = vw * 1.06;
      const h0 = Math.max(hb, wb / ASPECT); // displayed image height at k = 1
      const c = (hb - h0) / 2 - hb / 2;
      const need = Math.max(1.04, (feetY + MARGIN) / (h0 * FLOOR_AT), (vh + MARGIN - feetY) / (h0 * (1 - FLOOR_AT)));
      const k = Math.min(need, 2.2);
      const top = feetY - k * h0 * FLOOR_AT; // viewport y of the photo's top edge after scaling
      root.setProperty('--bgk', k.toFixed(3));
      root.setProperty('--bgy', `${(top - vh / 2 - k * c).toFixed(1)}px`);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      reset();
    };
  }, [mode, feetY]);
  const modelRef = useRef(null);
  const libApi = useRef(null);

  // ---- stage scale ----
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1600, window.innerHeight / 900));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // ---- parallax ----
  useEffect(() => {
    const root = document.documentElement.style;
    const move = (e) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      root.setProperty('--bx', `${-x * 22}px`);
      root.setProperty('--by', `${-y * 12}px`);
      root.setProperty('--mx', `${x * 10}px`);
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);

  // ---- core look state ----
  const [look, setLook] = useState(0);
  const [cardOn, setCardOn] = useState(0);
  const [figs, setFigs] = useState([{ id: ++figId, look: 0, in: false }]);
  const [scanKey, setScanKey] = useState(0);
  const [grade, setGrade] = useState(DEFAULTS.grade);
  const [real, setReal] = useState(DEFAULTS.real);
  const [height, setHeight] = useState(DEFAULTS.height);
  const [build, setBuild] = useState(DEFAULTS.build);
  const [framing, setFraming] = useState('full');

  const tokenRef = useRef(0);
  const targetRef = useRef(0);

  const rescan = useCallback(() => setScanKey((k) => k + 1), []);

  const showLook = useCallback(async (i) => {
    const tok = ++tokenRef.current;
    targetRef.current = i;
    setCardOn(i);
    try {
      await IMGS[i].decode();
    } catch {
      /* image still usable */
    }
    if (tok !== tokenRef.current) return;
    setFigs((f) => [...f, { id: ++figId, look: i, in: true }]);
    setScanKey((k) => k + 1);
    setLook(i);
  }, []);

  const onWipeEnd = useCallback((id) => {
    setFigs((f) => {
      const idx = f.findIndex((x) => x.id === id);
      if (idx < 0) return f;
      return [{ ...f[idx], in: false }, ...f.slice(idx + 1)];
    });
  }, []);

  // ---- history ----
  const histRef = useRef({ stack: [{ ...DEFAULTS }], idx: 0 });
  const [hist, setHist] = useState({ idx: 0, len: 1 });
  const syncHist = () => setHist({ idx: histRef.current.idx, len: histRef.current.stack.length });

  const commit = useCallback((patch) => {
    const h = histRef.current;
    const s = { ...h.stack[h.idx], ...patch };
    h.stack = h.stack.slice(0, h.idx + 1).concat(s);
    h.idx++;
    syncHist();
  }, []);

  const applySnap = useCallback(
    (s) => {
      setGrade(s.grade);
      setReal(s.real);
      setHeight(s.height);
      setBuild(s.build);
      if (s.look !== targetRef.current) showLook(s.look);
    },
    [showLook]
  );

  const undo = () => {
    const h = histRef.current;
    if (h.idx <= 0) return;
    h.idx--;
    applySnap(h.stack[h.idx]);
    syncHist();
  };
  const redo = () => {
    const h = histRef.current;
    if (h.idx >= h.stack.length - 1) return;
    h.idx++;
    applySnap(h.stack[h.idx]);
    syncHist();
  };

  const pickLook = (i) => {
    if (i === targetRef.current) return;
    showLook(i);
    commit({ look: i });
  };

  // ---- toast ----
  const [toast, setToast] = useState({ msg: '', show: false });
  const toastTimer = useRef();
  const say = useCallback((msg) => {
    setToast({ msg, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 1800);
  }, []);

  // ---- UI state ----
  const [tab, setTab] = useState('STYLE');
  const [menu, setMenu] = useState('Outfits');
  const [cat, setCat] = useState('all');
  const [openRow, setOpenRow] = useState(null);
  const [favs, setFavs] = useState([]);
  const cart = useCart();
  const [product, setProduct] = useState(null); // { lookIdx, group, pieceId, edit? }
  const [cartOpen, setCartOpen] = useState(false);
  const [track, setTrack] = useState(null); // null | {} | { orderNumber, phone }
  const [saved, setSaved] = useState([]);
  const [libOpen, setLibOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [roul, setRoul] = useState(null);
  const [randSpin, setRandSpin] = useState(0);
  const [shufSpin, setShufSpin] = useState(0);
  const [traits, setTraits] = useState(() => [...SITE.defaultTraits]);
  const [ident, setIdent] = useState({ ...IDENTITIES[0], k: 0, seed: 'VL-0423-KR' });

  const view = tab === 'STYLE' ? (menu === 'Outfits' ? 'outfits' : menu === 'Body' ? 'body' : 'tune') : TAB_VIEW[tab];

  const toggleFav = (i) => setFavs((f) => (f.includes(i) ? f.filter((x) => x !== i) : [...f, i]));
  const openProduct = (group, pieceId) => setProduct({ lookIdx: look, group, pieceId });
  const editCartItem = (item) => {
    const lookIdx = LOOKS.findIndex((l) => l.id === item.lookId);
    setCartOpen(false);
    setProduct({ lookIdx, group: item.group, pieceId: item.pieceId, edit: item });
  };
  const saveProduct = (line) => {
    const wasEdit = !!product?.edit;
    cart.save(line);
    setProduct(null);
    if (wasEdit) setCartOpen(true);
    else say('Added to cart');
  };
  const removeProduct = (cid) => {
    cart.remove(cid);
    setProduct(null);
    say('Removed from cart');
  };

  // ---- identity shuffle ----
  const scrambleTimer = useRef();
  const reseed = () => {
    setShufSpin((s) => s + 180);
    const k = (ident.k + 1) % IDENTITIES.length;
    const id = IDENTITIES[k];
    setIdent((p) => ({ ...p, ...id, k, seed: `VL-0${400 + k * 37}-KR` }));
    clearInterval(scrambleTimer.current);
    let frame = 0;
    const frames = 14;
    scrambleTimer.current = setInterval(() => {
      frame++;
      if (frame >= frames) {
        clearInterval(scrambleTimer.current);
        setIdent((p) => ({ ...p, name: id.name }));
        return;
      }
      const fixed = Math.floor((frame / frames) * id.name.length);
      const s = id.name
        .split('')
        .map((ch, j) => (j < fixed || ch === ' ' || ch === '-' ? ch : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]))
        .join('');
      setIdent((p) => ({ ...p, name: s }));
    }, 40);
  };
  useEffect(() => () => clearInterval(scrambleTimer.current), []);

  // ---- randomize ----
  const randBusy = useRef(false);
  const randomize = () => {
    if (randBusy.current) return;
    randBusy.current = true;
    setRandSpin((r) => r + 360);
    const visible = LOOKS.map((l, i) => (cat === 'all' || l.cat === cat ? i : -1)).filter((i) => i >= 0);
    let pool = visible.filter((i) => i !== targetRef.current);
    if (!pool.length) pool = LOOKS.map((_, i) => i).filter((i) => i !== targetRef.current);
    const target = pool[(Math.random() * pool.length) | 0];
    const ring = visible.length ? visible : [target];
    let step = 0;
    let delay = 50;
    let pos = Math.max(0, ring.indexOf(targetRef.current));
    const tick = () => {
      if (step < 12) {
        pos = (pos + 1) % ring.length;
        setRoul(ring[pos]);
        step++;
        delay += 8;
        setTimeout(tick, delay);
        return;
      }
      setRoul(null);
      const g = (Math.random() * Math.min(4, FILTERS.length)) | 0;
      const r = 55 + ((Math.random() * 45) | 0);
      showLook(target);
      setGrade(g);
      setReal(r);
      commit({ look: target, grade: g, real: r });
      randBusy.current = false;
    };
    tick();
  };

  // ---- pose / reset ----
  const cyclePose = () => setFraming((f) => FRAMINGS[(FRAMINGS.indexOf(f) + 1) % 3]);
  const reset = () => {
    applySnap(DEFAULTS);
    setFraming('full');
    commit({ ...DEFAULTS });
    say('Reset to default');
  };

  // ---- save to library ----
  const [flyer, setFlyer] = useState(null);
  const [shine, setShine] = useState(0);
  const save = () => {
    setShine((s) => s + 1);
    setLibOpen(true);
    if (flyer) return;
    const k = mode === 'desktop' ? scale : 1;
    const sr = stageRef.current.getBoundingClientRect();
    const mr = modelRef.current.getBoundingClientRect();
    const w = mr.width / k;
    const from = {
      left: (mr.left - sr.left) / k + w * 0.25,
      top: (mr.top - sr.top) / k,
      width: w * 0.5,
      height: mr.height / k,
    };
    setFlyer({ look, grade, from, to: null, go: false });
  };

  useLayoutEffect(() => {
    if (!flyer || flyer.to) return;
    const to = libApi.current?.measureGhost(mode === 'desktop', stageRef.current);
    if (!to) return;
    setFlyer((f) => ({ ...f, to }));
    requestAnimationFrame(() => requestAnimationFrame(() => setFlyer((f) => f && { ...f, go: true })));
    const t = setTimeout(() => {
      setSaved((s) => [...s, { id: Date.now(), look: flyer.look, grade: flyer.grade }]);
      setFlyer(null);
      say('Saved to library');
    }, 860);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyer && flyer.from]);

  // close library on outside click
  useEffect(() => {
    if (!libOpen) return;
    const down = (e) => {
      if (!e.target.closest('#lib, #bagBtn, #saveBtn')) setLibOpen(false);
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [libOpen]);

  // ---- keyboard ----
  const keys = useRef();
  keys.current = { undo, redo, pickLook };
  useEffect(() => {
    const down = (e) => {
      const t = e.target;
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
        if (t.tagName !== 'INPUT' || t.type !== 'range' || e.key.startsWith('Arrow')) return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) keys.current.redo();
        else keys.current.undo();
      } else if (e.key === 'ArrowRight') {
        keys.current.pickLook((targetRef.current + 1) % LOOKS.length);
      } else if (e.key === 'ArrowLeft') {
        keys.current.pickLook((targetRef.current + LOOKS.length - 1) % LOOKS.length);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  const openHotspot = (key) => {
    setOpenRow(key);
    if (view !== 'outfits') {
      setTab('STYLE');
      setMenu('Outfits');
    }
    // On phones / tablets the panel lives in the scrolling sheet — bring the row into view
    if (mode !== 'desktop') {
      setTimeout(() => {
        document
          .querySelector('.view:not(.hidden) .row.open')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    }
  };

  // ---- shared pieces, arranged per layout mode ----
  const desktop = mode === 'desktop';

  const modelEl = (
    <Model
      ref={modelRef}
      figs={figs}
      look={look}
      scanKey={scanKey}
      real={real}
      height={height}
      build={build}
      framing={framing}
      onWipeEnd={onWipeEnd}
      onHotspot={openHotspot}
    />
  );
  const topBar = (
    <TopBar
      tab={tab}
      setTab={setTab}
      cartCount={cart.count}
      onCart={() => setCartOpen(true)}
      onTrack={() => setTrack({})}
      favCount={favs.length}
      isFav={favs.includes(look)}
      libCount={saved.length}
      onBag={() => setLibOpen((o) => !o)}
      moreOpen={moreOpen}
      setMoreOpen={setMoreOpen}
      say={say}
    />
  );
  const profile = (
    <Profile
      look={look}
      ident={ident}
      avatarSize={desktop ? 98 : mode === 'compact' ? 72 : 80}
      onName={(name) => {
        setIdent((p) => ({ ...p, name }));
        say('Name updated');
      }}
      onShuffle={reseed}
      spin={shufSpin}
    />
  );
  const side = (
    <SideMenu menu={menu} setMenu={setMenu} away={tab !== 'STYLE'} onRandomize={randomize} randSpin={randSpin} />
  );
  const panel = (
    <Panel
      view={view}
      menu={menu}
      look={look}
      cardOn={cardOn}
      roul={roul}
      cat={cat}
      setCat={setCat}
      pickLook={pickLook}
      favs={favs}
      toggleFav={toggleFav}
      openRow={openRow}
      setOpenRow={setOpenRow}
      cartItems={cart.items}
      onShop={openProduct}
      rescan={rescan}
      say={say}
      ident={ident}
      onReseed={() => {
        reseed();
        rescan();
      }}
      height={height}
      setHeight={setHeight}
      build={build}
      setBuild={setBuild}
      commit={commit}
      framing={framing}
      setFraming={setFraming}
      traits={traits}
      setTraits={setTraits}
      allTraits={TRAITS}
    />
  );
  const library = <Library ref={libApi} open={libOpen} saved={saved} ghost={!!flyer} onPick={pickLook} />;
  const ctrl = (
    <ControlBar
      canUndo={hist.idx > 0}
      canRedo={hist.idx < hist.len - 1}
      onUndo={undo}
      onRedo={redo}
      framing={framing}
      onPose={cyclePose}
      onReset={reset}
    />
  );
  const realism = <Realism value={real} onChange={setReal} onCommit={(v) => commit({ real: v })} />;
  const filterBar = (
    <FilterBar
      look={look}
      grade={grade}
      onPick={(g) => {
        setGrade(g);
        commit({ grade: g });
      }}
    />
  );
  const saveBtn = <SaveButton onSave={save} shine={shine} />;
  const flyerEl = flyer && (
    <div
      id="flyer"
      style={{
        ...(flyer.go && flyer.to ? flyer.to : flyer.from),
        backgroundImage: `url("${LOOKS[flyer.look].big}")`,
        filter: FILTERS[flyer.grade]?.filter,
      }}
    />
  );
  const toastEl = (
    <div id="toast" className={'glass' + (toast.show ? ' show' : '')} role="status" aria-live="polite">
      <Icon name="check" size={18} stroke={2.2} />
      {toast.msg}
    </div>
  );

  const shopEl = (
    <>
      {product && <ProductSheet target={product} onClose={() => setProduct(null)} onSave={saveProduct} onRemove={removeProduct} />}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          onClose={() => setCartOpen(false)}
          onEdit={editCartItem}
          onTrack={(orderNumber, phone) => {
            setCartOpen(false);
            setTrack({ orderNumber, phone });
          }}
        />
      )}
      {track && <TrackOrder initial={track.orderNumber ? track : null} onClose={() => setTrack(null)} />}
    </>
  );

  if (desktop) {
    return (
      <>
        <Scene grade={grade} real={real} />
        <div id="stage" ref={stageRef} style={{ '--s': scale }}>
          {modelEl}
          {topBar}
          {profile}
          {side}
          {panel}
          {library}
          {ctrl}
          {realism}
          {filterBar}
          {saveBtn}
          {flyerEl}
          {toastEl}
        </div>
        {shopEl}
      </>
    );
  }

  return (
    <>
      <Scene grade={grade} real={real} />
      <div id="mapp" className={'m-app m-' + mode} ref={stageRef}>
        <header className="m-head">{topBar}</header>
        <main className="m-main">
          <section className="m-hero" ref={heroRef}>
            <div className="m-modelbox" style={{ '--ms': heroScale, '--inv': 1 / heroScale }}>
              {modelEl}
            </div>
            {ctrl}
          </section>
          <section className="m-sheet">
            <div className="m-sheet-in">
              {profile}
              {side}
              {panel}
              <div className="m-pair">
                {realism}
                {saveBtn}
              </div>
              {filterBar}
            </div>
          </section>
        </main>
        {library}
        {flyerEl}
        {toastEl}
      </div>
      {shopEl}
    </>
  );
}
