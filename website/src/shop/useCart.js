import { useCallback, useEffect, useMemo, useState } from 'react';

const KEY = 'vell_cart_v1';

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const sameLine = (a, b) =>
  a.pieceId === b.pieceId && a.color === b.color && a.size === b.size && a.size !== 'Custom' && !a.notes && !b.notes;

/**
 * Cart line shape:
 * { cid, lookId, group, pieceId, name, lookName, image, color, colorHex, size, qty, price,
 *   measurements?, notes, madeToOrder, leadTimeDays }
 * Persisted in localStorage so a refresh never loses it.
 */
export default function useCart() {
  const [items, setItems] = useState(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* private mode: keep working in memory */
    }
  }, [items]);

  // keep several open tabs in sync
  useEffect(() => {
    const on = (e) => e.key === KEY && setItems(read());
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  /** Adds a line (merging identical standard-size lines) or replaces the line with the same cid. */
  const save = useCallback((line) => {
    setItems((s) => {
      if (line.cid && s.some((x) => x.cid === line.cid)) return s.map((x) => (x.cid === line.cid ? line : x));
      const twin = s.find((x) => sameLine(x, line));
      if (twin) return s.map((x) => (x === twin ? { ...x, qty: Math.min(10, x.qty + line.qty) } : x));
      return [...s, { ...line, cid: line.cid || Math.random().toString(36).slice(2, 10) }];
    });
  }, []);
  const remove = useCallback((cid) => setItems((s) => s.filter((x) => x.cid !== cid)), []);
  const setQty = useCallback(
    (cid, qty) => setItems((s) => s.map((x) => (x.cid === cid ? { ...x, qty: Math.max(1, Math.min(10, qty)) } : x))),
    []
  );
  const clear = useCallback(() => setItems([]), []);

  const totals = useMemo(
    () => ({
      count: items.reduce((n, i) => n + i.qty, 0),
      subtotal: items.reduce((n, i) => n + i.price * i.qty, 0),
      leadDays: items.reduce((n, i) => Math.max(n, i.leadTimeDays || 0), 0),
    }),
    [items]
  );

  return { items, save, remove, setQty, clear, ...totals };
}
