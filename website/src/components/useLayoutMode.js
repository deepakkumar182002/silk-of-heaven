import { useEffect, useState } from 'react';

/**
 * desktop – wide landscape screens: the original 1600×900 scaled stage
 * split   – tablets / small laptops / phones in landscape: model left, controls right
 * compact – portrait phones & tablets: model on top, scrolling control sheet below
 */
export function getMode(w = window.innerWidth, h = window.innerHeight) {
  if (w >= 1200 && h >= 640 && w / h >= 1.25) return 'desktop';
  if (w > h && w >= 640) return 'split';
  return 'compact';
}

export default function useLayoutMode() {
  const [mode, setMode] = useState(getMode);
  useEffect(() => {
    const on = () => setMode(getMode());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return mode;
}
