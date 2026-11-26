import { CATS, GROUPS, GROUP_LABEL, LOOKS, imgUrl, money } from '../data.js';

export { GROUP_LABEL };
export const catLabel = (key) => CATS.find((c) => c.key === key)?.label || key;

export { money };

/** Price presets shown in the shop's "Budget" filter (₹). */
export const PRICE_PRESETS = [
  { key: 'u1000', label: 'Under ₹1,000', min: 0, max: 999 },
  { key: '1000-2500', label: '₹1,000 – ₹2,500', min: 1000, max: 2500 },
  { key: '2500-5000', label: '₹2,500 – ₹5,000', min: 2500, max: 5000 },
  { key: '5000+', label: '₹5,000 & above', min: 5000, max: Infinity },
];

export const SORTS = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'name', label: 'Name: A – Z' },
];

/**
 * Every shoppable piece of every active look, flattened into a product list.
 * The same garment used in several looks (same name, colour and price) is listed once
 * and remembers all the looks it appears in.
 *
 * product: { key, id, lookIdx, lookId, lookName, cat, cats, group, name, color, price,
 *            colors, sizes, madeToOrder, leadTimeDays, image, thumb, looks: [lookIdx], order }
 */
let cache = null;
export function getProducts() {
  if (cache) return cache;
  const byKey = new Map();
  let order = 0;
  LOOKS.forEach((look, lookIdx) => {
    for (const g of GROUPS) {
      for (const p of look.pieces[g.key] || []) {
        const key = `${g.key}|${p.name}|${p.color}|${p.price}`.toLowerCase();
        const seen = byKey.get(key);
        if (seen) {
          seen.looks.push(lookIdx);
          if (!seen.cats.includes(look.cat)) seen.cats.push(look.cat);
          if (!seen.bodies.includes(look.body)) seen.bodies.push(look.body);
          continue;
        }
        byKey.set(key, {
          ...p,
          key: p.id,
          price: Number(p.price) || 0,
          lookIdx,
          lookId: look.id,
          lookName: look.name,
          cat: look.cat,
          cats: [look.cat],
          bodies: [look.body],
          group: g.key,
          // items with their own product photo show it; garments are cropped from the look photo
          plain: !!p.photo,
          image: p.photo ? imgUrl(p.photo, 900) : look.big,
          thumb: p.photo ? imgUrl(p.photo, 360) : look.small,
          looks: [lookIdx],
          order: order++,
        });
      }
    }
  });
  cache = [...byKey.values()];
  return cache;
}

export const productById = (id) => getProducts().find((p) => p.id === id);

export function sortProducts(list, sort) {
  const s = [...list];
  if (sort === 'price-asc') s.sort((a, b) => a.price - b.price || a.order - b.order);
  else if (sort === 'price-desc') s.sort((a, b) => b.price - a.price || a.order - b.order);
  else if (sort === 'name') s.sort((a, b) => a.name.localeCompare(b.name));
  else s.sort((a, b) => a.order - b.order);
  return s;
}

/** Same kind of item (tops, shoes…) from the whole store, cheapest first. */
export const alternativesFor = (product, { exclude = [] } = {}) =>
  getProducts()
    .filter((p) => p.group === product.group && p.id !== product.id && !exclude.includes(p.id))
    .sort((a, b) => a.price - b.price);

/** Total price of a look if you buy every piece in it. */
export const lookTotal = (look) =>
  GROUPS.reduce((n, g) => n + (look.pieces[g.key] || []).reduce((m, p) => m + (Number(p.price) || 0), 0), 0);

// Zoom the full-length look photo onto the garment for product thumbnails.
// [focus x, focus y, zoom] in fractions of the 2:3 photo.
const FOCUS = {
  tops: [0.5, 0.3, 1.9],
  bottoms: [0.5, 0.6, 1.6],
  full: [0.5, 0.45, 1.2],
  shoes: [0.5, 0.93, 2.3],
  acc: [0.5, 0.28, 1.5],
};
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Background style that frames the piece inside a 3:4 card. */
export function cropStyle(product, url = product.image) {
  if (product.plain) {
    return { backgroundImage: url ? `url("${url}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  const [x, y, z] = FOCUS[product.group] || FOCUS.full;
  const ratio = 4 / 3; // card height / width
  const imgH = 1.5 * z; // photo height relative to card width
  const px = z === 1 ? 0.5 : clamp01((0.5 - x * z) / (1 - z));
  const py = clamp01((0.5 * ratio - y * imgH) / (ratio - imgH));
  return {
    backgroundImage: url ? `url("${url}")` : undefined,
    backgroundSize: `${z * 100}% auto`,
    backgroundPosition: `${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%`,
  };
}

/** Builds a cart line for a product with its first colour. */
export const cartLine = (p, size, extra = {}) => {
  const colour = p.colors?.[0] || { name: p.color || 'Default', hex: '#9aa0a6' };
  return {
    lookId: p.lookId,
    group: p.group,
    pieceId: p.id,
    name: p.name,
    lookName: p.lookName,
    image: p.thumb,
    color: colour.name,
    colorHex: colour.hex,
    size,
    qty: 1,
    price: p.price,
    notes: '',
    madeToOrder: p.madeToOrder,
    leadTimeDays: p.leadTimeDays,
    ...extra,
  };
};
