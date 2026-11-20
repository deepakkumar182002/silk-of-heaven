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
