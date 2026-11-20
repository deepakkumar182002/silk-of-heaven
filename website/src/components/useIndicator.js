import { useEffect, useLayoutEffect, useState } from 'react';

// Scrolls a horizontally-scrolling parent (mobile tab / chip rows) so the active element is visible.
function ensureVisible(el) {
  const p = el?.parentElement;
  if (!p || p.scrollWidth <= p.clientWidth + 1) return;
  const l = el.offsetLeft;
  const r = l + el.offsetWidth;
  if (l < p.scrollLeft) p.scrollTo({ left: l - 12, behavior: 'smooth' });
  else if (r > p.scrollLeft + p.clientWidth) p.scrollTo({ left: r - p.clientWidth + 12, behavior: 'smooth' });
}

// Measures the active element (unscaled layout px) after layout and again on window load.
export default function useIndicator(getEl, deps) {
  const [box, setBox] = useState(null);
  const measure = () => {
    const el = getEl();
    if (el) {
      setBox({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
      ensureVisible(el);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, deps);
  useEffect(() => {
    window.addEventListener('load', measure);
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => {
      window.removeEventListener('load', measure);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return box;
}
