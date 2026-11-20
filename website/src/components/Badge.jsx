import { useEffect, useRef, useState } from 'react';

export default function Badge({ count }) {
  const [bump, setBump] = useState(-1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setBump((b) => b + 1);
  }, [count]);
  return (
    <span className={'badge' + (count ? ' has' : '')}>
      <i className={bump < 0 ? '' : 'b' + (bump % 2)}>{count || ''}</i>
    </span>
  );
}
