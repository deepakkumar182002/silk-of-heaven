export const GROUPS = ['tops', 'bottoms', 'full', 'shoes', 'acc'];

export const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const SHOE_SIZES = ['36', '37', '38', '39', '40', '41'];

const HEX = {
  charcoal: '#36454f', 'light wash': '#8fb0d0', black: '#141414', oat: '#d9cdb8', white: '#f5f5f5',
  cream: '#f3ead3', 'heather grey': '#9a9a9f', brown: '#6b4a35', lilac: '#b9a3d9', 'powder blue': '#b6cfe8',
  ivory: '#f6f1e3', sage: '#a3b59b', silver: '#c0c0c0', khaki: '#b5a77c', '14k': '#d4af37', gold: '#d4af37',
  navy: '#1f2a44', beige: '#d8c8a8', grey: '#9a9a9f', red: '#b3262e',
};
export const guessHex = (name = '') => HEX[name.trim().toLowerCase()] || '#9aa0a6';

const GROUP_DEFAULTS = {
  tops: { fabric: 'Soft cotton blend', madeToOrder: true, leadTimeDays: 5, sizes: STANDARD_SIZES, care: 'Machine wash cold, line dry' },
  bottoms: { fabric: 'Structured cotton twill', madeToOrder: true, leadTimeDays: 6, sizes: STANDARD_SIZES, care: 'Machine wash cold, iron on medium' },
  full: { fabric: 'Satin crepe', madeToOrder: true, leadTimeDays: 8, sizes: STANDARD_SIZES, care: 'Hand wash cold or dry clean' },
  shoes: { fabric: 'Leather & rubber sole', madeToOrder: false, leadTimeDays: 7, sizes: SHOE_SIZES, care: 'Wipe clean with a damp cloth' },
  acc: { fabric: 'Metal / leather', madeToOrder: false, leadTimeDays: 3, sizes: ['One size'], care: 'Keep dry, store in pouch' },
};

/** Effective option lists for a piece, filling gaps with group defaults. */
export function normalizePiece(p, group) {
  const d = GROUP_DEFAULTS[group] || GROUP_DEFAULTS.tops;
  const baseColor = p.color || 'Default';
  const colors =
    p.colors && p.colors.length
      ? p.colors.map((c) => ({ name: c.name, hex: c.hex || guessHex(c.name) }))
      : [baseColor, 'Black', 'White', 'Ivory']
          .filter((n, i, a) => a.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i)
          .map((n) => ({ name: n, hex: guessHex(n) }));
  return {
    description: p.description || `${p.name} in ${baseColor.toLowerCase()}. Cut and finished to your measurements.`,
    fabric: p.fabric || d.fabric,
    care: p.care || d.care,
    sizes: p.sizes && p.sizes.length ? p.sizes : d.sizes,
    colors,
    madeToOrder: p.madeToOrder ?? d.madeToOrder,
    leadTimeDays: p.leadTimeDays ?? d.leadTimeDays,
  };
}

/**
 * Mix & match slots for the fitting room. A piece with a `layer` image is a switchable item:
 * the website can show / hide it on the model, and items in the same slot replace each other.
 * Order = stacking order on the model (first = bottom).
 */
export const SLOTS = {
  bottom: { label: 'Bottom / Salwar / Palazzo / Skirt', group: 'bottoms', hint: 'Replace her bottom wear (trousers, skirt, salwar, palazzo, churidar, dhoti pants) with this one.' },
  top: { label: 'Top / Kurti / Blouse / Shirt', group: 'tops', hint: 'Replace her upper-body garment with this one and style it naturally with her current bottom wear.' },
  full: { label: 'Dress / Saree / Lehenga / Anarkali / Suit set', group: 'full', hint: 'Replace her whole outfit with this one-piece or set. Drape a saree, lehenga or dupatta in the traditional Indian way.' },
  shoes: { label: 'Shoes / Juttis / Kolhapuris / Heels', group: 'shoes', hint: 'Replace her footwear with these, on both feet, same foot position.' },
  outer: { label: 'Jacket / Shrug / Koti / Blazer', group: 'tops', hint: 'Layer it over her current outfit, worn as shown in the photo.' },
  drape: { label: 'Dupatta / Scarf / Stole / Shawl', group: 'acc', hint: 'Drape it naturally (dupatta over one or both shoulders, scarf around the neck) without covering her face.' },
  jewellery: { label: 'Jewellery (jhumkas, necklace, bangles, maang tikka, nath)', group: 'acc', hint: 'Put the jewellery on in the right place (ears, neck, wrists, forehead) at a realistic size. Do not change her face.' },
  bag: { label: 'Bag / Potli / Clutch', group: 'acc', hint: 'Hang it from her shoulder or let it hang from the hand at her side WITHOUT moving her arms.' },
  head: { label: 'Headwear / Sunglasses / Hair accessory', group: 'acc', hint: 'Put it on naturally without changing her face or hairstyle more than needed.' },
};
export const SLOT_KEYS = Object.keys(SLOTS);

/** Shop group of an item-library category on the website: "x:<category key>". */
export const ITEM_GROUP = 'x:';

/** Effective options of a library item (category sizes, slot defaults, its own colours only). */
export function normalizeItem(it, cat) {
  const group = SLOTS[cat?.slot]?.group || 'acc';
  const sizes = it.sizes?.length ? it.sizes : cat?.sizes?.length ? cat.sizes : undefined;
  const colors = it.colors?.length ? it.colors : [{ name: it.color || 'Default', hex: '' }];
  const n = normalizePiece({ ...it, sizes, colors }, group);
  return { ...n, madeToOrder: !!it.madeToOrder, leadTimeDays: it.leadTimeDays ?? 5 };
}
