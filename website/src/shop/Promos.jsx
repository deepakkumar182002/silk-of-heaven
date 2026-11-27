import { useCallback, useEffect, useRef, useState } from 'react';
import { PROMOS, imgUrl } from '../data.js';
import Icon from '../icons.jsx';
import { navigate } from '../useRoute.js';
import { useEscapeLayer } from './Overlay.jsx';

/** Open a promo link: pages of this site in the app, other sites in a new tab. */
export function openPromoLink(link) {
  if (!link) return;
  if (link.startsWith('/')) navigate(link);
  else window.open(link, '_blank', 'noopener');
}
const linkAttrs = (link) =>
  link.startsWith('/')
    ? {
        href: link,
        onClick: (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
          e.preventDefault();
          navigate(link);
        },
      }
    : { href: link, target: '_blank', rel: 'noopener' };

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Announcement bar: the offers scroll right → left above the header of every page
// ---------------------------------------------------------------------------
export function AnnouncementBar() {
  const list = PROMOS.announcements;
  const run = useRef(null);
  const [dur, setDur] = useState(30);
  const [copies, setCopies] = useState(2);

  // enough copies to fill wide screens; speed = px per second set in admin
  useEffect(() => {
    const fit = () => {
      const w = run.current?.offsetWidth || 1;
      setCopies(Math.max(2, Math.ceil((window.innerWidth * 2) / w)));
      setDur(w / (PROMOS.bar.speed || 40));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  if (!list.length) return null;
  // the moving copies are decoration (hidden from screen readers, not focusable); the list above is the real content
  const items = (copy) =>
    list.map((a) => (
      <span key={copy + a.id} className="pbar-item">
        {a.link ? (
          <a {...linkAttrs(a.link)} className="pbar-link" tabIndex={-1}>
            {a.text}
            <Icon name="chevRight" size={12} />
          </a>
        ) : (
          a.text
        )}
        <i aria-hidden="true">✦</i>
      </span>
    ));
  return (
    <div className="pbar" style={{ background: PROMOS.bar.bg, color: PROMOS.bar.color }} role="region" aria-label="Offers">
      <ul className="sr">
        {list.map((a) => (
          <li key={a.id}>{a.link ? <a {...linkAttrs(a.link)}>{a.text}</a> : a.text}</li>
        ))}
      </ul>
      <div className="pbar-track" style={{ '--pbar-shift': `-${100 / copies}%`, animationDuration: `${dur}s` }} aria-hidden="true">
        {Array.from({ length: copies }, (_, i) => (
          <div key={i} className="pbar-run" ref={i === 0 ? run : undefined}>
            {items(i)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shop banners: auto-sliding carousel, always moving right → left
// ---------------------------------------------------------------------------
export function BannerCarousel() {
  const slides = PROMOS.banners;
  const n = slides.length;
  const [pos, setPos] = useState(0); // 0…n (n = copy of the first slide, for the endless loop)
  const [anim, setAnim] = useState(true);
  const [paused, setPaused] = useState(false);
  const drag = useRef(null);
  const moved = useRef(false); // a swipe is not a click on the banner link
  const track = useRef(null);

  const go = useCallback(
    (to) => {
      setAnim(true);
      setPos((p) => {
        if (to === 'next') return Math.min(p + 1, n);
        if (to === 'prev') return Math.max(p - 1, -1);
        return to;
      });
    },
    [n]
  );

  // jump without animation from the copy back to the real first slide (and from -1 to the last)
  const settle = (e) => {
    if (e.target !== e.currentTarget) return;
    if (pos >= n) {
      setAnim(false);
      setPos(0);
    } else if (pos < 0) {
      setAnim(false);
      setPos(n - 1);
    }
  };
  useEffect(() => {
    if (anim) return undefined;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setAnim(true)));
    return () => cancelAnimationFrame(r);
  }, [anim]);

  useEffect(() => {
    if (n < 2 || paused) return undefined;
    const t = setInterval(() => !document.hidden && go('next'), (PROMOS.bannerInterval || 5) * 1000);
    return () => clearInterval(t);
  }, [n, paused, go]);

  if (!n) return null;
  const idx = ((pos % n) + n) % n;
  const shown = n > 1 ? [slides[n - 1], ...slides, slides[0]] : slides; // [last copy, …slides, first copy]
  const offset = n > 1 ? pos + 1 : 0;

  const down = (e) => {
    if (n < 2) return;
    drag.current = { x: e.clientX, dx: 0, w: track.current?.offsetWidth || 1 };
    moved.current = false;
  };
  const moveP = (e) => {
    if (!drag.current) return;
    drag.current.dx = e.clientX - drag.current.x;
    if (Math.abs(drag.current.dx) > 6) moved.current = true;
    if (moved.current && track.current) track.current.style.transform = `translateX(calc(${-offset * 100}% + ${drag.current.dx}px))`;
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (track.current) track.current.style.transform = '';
    if (Math.abs(d.dx) > d.w * 0.12) go(d.dx < 0 ? 'next' : 'prev');
  };

  return (
    <section
      className="bn"
      aria-roledescription="carousel"
      aria-label="Offers"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className="bn-view"
        onPointerDown={down}
        onPointerMove={moveP}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        onClickCapture={(e) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
      >
        <div
          ref={track}
          className={'bn-track' + (anim && !reducedMotion() ? ' anim' : '')}
          style={{ transform: `translateX(${-offset * 100}%)` }}
          onTransitionEnd={settle}
        >
          {shown.map((b, i) => (
            <BannerSlide key={i} b={b} hidden={i !== offset} />
          ))}
        </div>
      </div>
      {n > 1 && (
        <>
          <button className="bn-arrow prev" onClick={() => go('prev')} aria-label="Previous offer">
            <Icon name="chevRight" size={20} />
          </button>
          <button className="bn-arrow next" onClick={() => go('next')} aria-label="Next offer">
            <Icon name="chevRight" size={20} />
          </button>
          <div className="bn-dots" role="tablist" aria-label="Choose offer">
            {slides.map((b, i) => (
              <button key={b.id} role="tab" aria-selected={i === idx} aria-label={`Offer ${i + 1} of ${n}`} className={i === idx ? 'on' : ''} onClick={() => go(i)}>
                {i === idx && !paused && <i style={{ animationDuration: `${PROMOS.bannerInterval || 5}s` }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function BannerSlide({ b, hidden }) {
  const img = (
    <picture>
      {b.mobileImage && <source media="(max-width: 640px)" srcSet={imgUrl(b.mobileImage, 900)} />}
      <img src={imgUrl(b.image, 1800)} alt={b.title || b.text || 'Offer'} draggable="false" />
    </picture>
  );
  const copy = (b.title || b.text || b.buttonText) && (
    <div className="bn-copy" style={{ color: b.textColor }}>
      {b.title && <h2>{b.title}</h2>}
      {b.text && <p>{b.text}</p>}
      {b.buttonText && b.link && <span className="bn-btn">{b.buttonText}</span>}
    </div>
  );
  const cls = `bn-slide align-${b.align || 'left'}${b.mobileImage ? ' has-m' : ''}`;
  return b.link ? (
    <a className={cls} {...linkAttrs(b.link)} aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : undefined} draggable="false">
      {img}
      {copy}
    </a>
  ) : (
    <div className={cls} aria-hidden={hidden || undefined}>
      {img}
      {copy}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Offer popup: image / GIF / video, "Skip" and "Show more", closes by itself after N seconds.
// Skipped (or timed out) → shown again on the visitor's next visit.
// "Show more" (or a video watched to the end) → never shown to this visitor again.
// ---------------------------------------------------------------------------
const SEEN_KEY = 'soh_promo_seen';
const VISIT_KEY = 'soh_promo_visit';
const readList = (store, key) => {
  try {
    const v = JSON.parse(store.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const addTo = (store, key, id) => {
  try {
    store.setItem(key, JSON.stringify([...new Set([...readList(store, key), id])].slice(-50)));
  } catch {
    /* storage blocked: the popup simply shows again */
  }
};

export function PromoPopup({ blocked }) {
  const [p, setP] = useState(null);

  useEffect(() => {
    const seen = readList(localStorage, SEEN_KEY);
    const visit = readList(sessionStorage, VISIT_KEY); // once per visit (browser tab session)
    const next = PROMOS.popups.find((x) => !seen.includes(x.id) && !visit.includes(x.id));
    if (!next) return undefined;
    const t = setTimeout(() => {
      addTo(sessionStorage, VISIT_KEY, next.id);
      setP(next);
    }, Math.max(0, next.delay || 0) * 1000);
    return () => clearTimeout(t);
  }, []);

  if (!p || blocked) return null;
  return <PopupCard p={p} onDone={() => setP(null)} />;
}

function PopupCard({ p, onDone }) {
  const total = p.autoClose || 0;
  const [left, setLeft] = useState(total);
  const [hold, setHold] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const card = useRef(null);
  const video = useRef(null);
  const [muted, setMuted] = useState(true);

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(onDone, reducedMotion() ? 0 : 220);
  }, [onDone]);
  const viewed = () => addTo(localStorage, SEEN_KEY, p.id);
  useEscapeLayer(close);

  useEffect(() => {
    const prev = document.activeElement;
    card.current?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);

  // countdown (paused while the pointer / focus is on the popup or the tab is hidden)
  useEffect(() => {
    if (!total || hold) return undefined;
    const t = setInterval(() => {
      if (document.hidden) return;
      setLeft((s) => Math.max(0, +(s - 0.1).toFixed(1)));
    }, 100);
    return () => clearInterval(t);
  }, [total, hold]);
  useEffect(() => {
    if (total && left <= 0) close();
  }, [left, total, close]);

  const more = () => {
    viewed();
    close();
    openPromoLink(p.link);
  };
  const btn = p.buttonText || 'Show more';

  return (
    <div className={'pp-back' + (leaving ? ' out' : '')} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section
        ref={card}
        className={'pp' + (p.media ? '' : ' text-only')}
        role="dialog"
        aria-modal="true"
        aria-label={p.title || 'Offer'}
        tabIndex={-1}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHold(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHold(false)}
      >
        <button className="pp-x" onClick={close} aria-label="Close">
          <Icon name="x" size={18} />
        </button>
        {p.media && (
          <div className={'pp-media' + (p.mediaType === 'video' ? ' video' : '')}>
            {p.mediaType === 'video' ? (
              <>
                <video
                  ref={video}
                  src={p.media}
                  autoPlay
                  muted={muted}
                  playsInline
                  onEnded={viewed}
                  onClick={() => {
                    const v = video.current;
                    if (v) v.paused ? v.play() : v.pause();
                  }}
                />
                <button className="pp-sound" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Turn sound on' : 'Mute'}>
                  {muted ? <SoundOff /> : <SoundOn />}
                </button>
              </>
            ) : (
              <img src={imgUrl(p.media, 900)} alt={p.title || 'Offer'} />
            )}
          </div>
        )}
        <div className="pp-body">
          {p.title && <h2>{p.title}</h2>}
          {p.text && <p>{p.text}</p>}
          <div className="pp-actions">
            <button className="pp-skip" onClick={close}>
              Skip
            </button>
            <button className="pp-more" onClick={more}>
              {btn}
              {p.link && <Icon name="chevRight" size={16} />}
            </button>
          </div>
        </div>
        {total > 0 && (
          <div className="pp-timer" aria-live="off">
            <span style={{ width: `${(left / total) * 100}%` }} />
            <small>{hold ? 'Paused' : `Closes in ${Math.ceil(left)}s`}</small>
          </div>
        )}
      </section>
    </div>
  );
}

const SoundOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 10v4h3l5 4V6L7 10H4z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </svg>
);
const SoundOn = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 10v4h3l5 4V6L7 10H4z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
