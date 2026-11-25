export const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/';
export const H = (file, w) =>
  'https://images.higgs.ai/?default=1&output=webp&url=' + encodeURIComponent(CDN + file) + '&w=' + w + '&q=85';

/** Resized image URL: Cloudinary transformations, the higgs resizer for the original CDN, raw otherwise. */
export const imgUrl = (url, w) => {
  if (!url) return '';
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/f_auto,q_auto,w_${w}/`);
  }
  if (url.startsWith(CDN)) return H(url.slice(CDN.length), w);
  return url;
};

// Mutable site-level settings (filled from the API by loadCatalog)
export const SITE = {
  bg: H('hf_20261112_034551_6394b127-5366-40a8-9c82-3c416f1161f1.png', 2400),
  defaultTraits: ['Curious', 'Creative', 'Gentle'],
  faceSwap: false, // AI face preview available (set by the API)
};

/**
 * Fitting room mix & match. Pieces with a `layer` image can be shown / hidden on the model;
 * items in the same slot replace each other (jewellery can be combined).
 * Order = stacking order on the model, first is drawn at the bottom.
 */
export const SLOTS = [
  { key: 'bottom', label: 'Bottom wear' },
  { key: 'top', label: 'Tops & kurtis' },
  { key: 'full', label: 'Dresses, sarees & sets' },
  { key: 'shoes', label: 'Footwear' },
  { key: 'outer', label: 'Jackets & layers' },
  { key: 'drape', label: 'Dupattas & scarves' },
  { key: 'jewellery', label: 'Jewellery', multi: true },
  { key: 'bag', label: 'Bags & potlis' },
  { key: 'head', label: 'Headwear' },
];
const SLOT_RANK = Object.fromEntries(SLOTS.map((s, i) => [s.key, i]));

/** Switchable items of a look, in stacking order. */
export const wearables = (look) =>
  Object.values(look?.pieces || {})
    .flat()
    .filter((p) => p.layer)
    .sort((a, b) => (SLOT_RANK[a.slot] ?? 99) - (SLOT_RANK[b.slot] ?? 99));

/** Canvas every look, layer and face sits on. */
export const CANVAS = { w: 1360, h: 2048 };

const p = (name, color, price) => ({ name, color, price });

export const LOOKS = [
  {
    name: 'Denim Maxi', cat: 'everyday', file: 'hf_20261112_034542_a6430ecf-9862-412c-8ef6-5745115bd78c.png',
    pieces: {
      tops: [p('Ribbed crop tank', 'Charcoal', 38)],
      bottoms: [p('Washed denim maxi skirt', 'Light wash', 96)],
      full: [],
      shoes: [p('Knee-high leather boots', 'Black', 210)],
      acc: [p('Leather belt', 'Black', 42), p('Gold hoops', '14k', 64)],
    },
  },
  {
    name: 'Cloud Set', cat: 'everyday', file: 'hf_20261112_034738_73282737-acc8-41e9-a822-96c663e27b6c.png',
    pieces: {
      tops: [p('Half-zip sweatshirt', 'Oat', 74)],
      bottoms: [p('Wide sweatpants', 'Oat', 68)],
      full: [],
      shoes: [p('Chunky sneakers', 'White', 120)],
      acc: [p('Gold hoops', '14k', 64)],
    },
  },
  {
    name: 'Library Knit', cat: 'everyday', file: 'hf_20261112_034742_9a8a92fd-79ae-4163-9ffa-14ae2a68717f.png',
    pieces: {
      tops: [p('Cable-knit cardigan', 'Cream', 112), p('Cotton tee', 'White', 24)],
      bottoms: [p('Pleated wide trousers', 'Heather grey', 98)],
      full: [],
      shoes: [p('Penny loafers', 'Brown', 150)],
      acc: [],
    },
  },
  {
    name: 'Lilac Run', cat: 'athletic', file: 'hf_20261112_034735_4e352e03-ad2b-44d1-9fcf-4b5b9454dc55.png',
    pieces: {
      tops: [p('Zip training jacket', 'Lilac', 88), p('Sports crop top', 'Lilac', 44)],
      bottoms: [p('High-rise leggings', 'Lilac', 72)],
      full: [],
      shoes: [p('Running sneakers', 'White', 140)],
      acc: [],
    },
  },
  {
    name: 'Satin Night', cat: 'sleep', file: 'hf_20261112_034738_aeb8ea57-6399-4f3c-b54a-4a57d0bd971e.png',
    pieces: {
      tops: [p('Satin pyjama shirt', 'Powder blue', 66)],
      bottoms: [p('Satin pyjama trousers', 'Powder blue', 58)],
      full: [],
      shoes: [p('Fluffy slippers', 'Ivory', 34)],
      acc: [],
    },
  },
  {
    name: 'Night Suit', cat: 'formal', file: 'hf_20261112_034736_aace5c5f-8c14-4b00-83ba-744dbad2e337.png',
    pieces: {
      tops: [p('Oversized blazer', 'Black', 240), p('Silk camisole', 'Ivory', 82)],
      bottoms: [p('Straight suit trousers', 'Black', 160)],
      full: [],
      shoes: [p('Pointed heels', 'Black', 190)],
      acc: [],
    },
  },
  {
    name: 'Sage Slip', cat: 'party', file: 'hf_20261112_034735_3d9fb69e-b4e0-49f7-a2d4-e592bd616c27.png',
    pieces: {
      tops: [],
      bottoms: [],
      full: [p('Satin slip midi dress', 'Sage', 180)],
      shoes: [p('Strappy sandals', 'Silver', 130)],
      acc: [p('Fine chain necklace', 'Silver', 56)],
    },
  },
  {
    name: 'Bomber Cargo', cat: 'street', file: 'hf_20261112_034740_3e3c5ad7-689b-46a2-8e09-c7d36a569b9c.png',
    pieces: {
      tops: [p('Leather bomber', 'Black', 260), p('Crop tee', 'White', 22)],
      bottoms: [p('Parachute cargo pants', 'Khaki', 94)],
      full: [],
      shoes: [p('Platform sneakers', 'Black', 150)],
      acc: [],
    },
  },
].map((l) => ({ ...l, big: H(l.file, 1000), small: H(l.file, 360) }));

export const STD_SIZES = ['XS', 'S', 'M', 'L', 'XL'];

/** Local specs for pieces when the API did not provide them (offline fallback). */
export const withSpecs = (p, group, id) => ({
  id,
  description: `${p.name} in ${String(p.color || '').toLowerCase()}. Cut and finished to your measurements.`,
  fabric: '',
  care: '',
  sizes: group === 'shoes' ? ['36', '37', '38', '39', '40', '41'] : group === 'acc' ? ['One size'] : STD_SIZES,
  colors: [{ name: p.color || 'Default', hex: '#9aa0a6' }],
  madeToOrder: group !== 'shoes' && group !== 'acc',
  leadTimeDays: 5,
  ...p,
});

export const GROUPS = [
  { key: 'tops', label: 'Tops' },
  { key: 'bottoms', label: 'Bottoms' },
  { key: 'full', label: 'Full body' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'acc', label: 'Accessories' },
];

export const HOTSPOTS = {
  tops: [60, 24],
  full: [60, 38],
  bottoms: [38, 47],
  shoes: [40, 95],
  acc: [56, 14],
};

export const CATS = [
  { key: 'all', label: 'All', icon: 'grid' },
  { key: 'everyday', label: 'Everyday', icon: 'tee' },
  { key: 'athletic', label: 'Athletic', icon: 'athletic' },
  { key: 'sleep', label: 'Sleep', icon: 'moon' },
  { key: 'formal', label: 'Formal', icon: 'formal' },
  { key: 'party', label: 'Party', icon: 'dress' },
  { key: 'street', label: 'Street', icon: 'hoodie' },
];

export const FILTERS = [
  { name: 'Daylight', filter: 'none', tint: 'transparent' },
  {
    name: 'Soft Film',
    filter: 'contrast(.92) saturate(.85) brightness(1.06)',
    tint: 'linear-gradient(180deg, rgba(255,226,214,.35), rgba(180,200,220,.35))',
  },
  {
    name: 'Cool Studio',
    filter: 'saturate(.9) brightness(1.06) contrast(1.04)',
    tint: 'linear-gradient(180deg, rgba(150,190,255,.55), rgba(200,220,255,.3))',
  },
  {
    name: 'Blue Hour',
    filter: 'brightness(.82) contrast(1.1) saturate(1.1)',
    tint: 'linear-gradient(180deg, rgba(70,60,170,.75), rgba(150,90,170,.55))',
  },
  { name: 'Mono', filter: 'grayscale(1) contrast(1.12) brightness(1.03)', tint: 'transparent' },
  {
    name: 'Golden Hour',
    filter: 'saturate(1.1) brightness(1.02)',
    tint: 'linear-gradient(180deg, rgba(255,180,90,.6), rgba(255,140,80,.4))',
  },
];

export const IDENTITIES = [
  { name: 'Han Seo-yeon', age: 23, city: 'Seoul, KR', temp: 14 },
  { name: 'Kim Ha-eun', age: 22, city: 'Busan, KR', temp: 17 },
  { name: 'Yoon Ji-woo', age: 25, city: 'Seoul, KR', temp: 12 },
  { name: 'Park Min-ji', age: 24, city: 'Incheon, KR', temp: 13 },
  { name: 'Lee Soo-ah', age: 21, city: 'Daegu, KR', temp: 15 },
];

export const MENU = [
  { key: 'Face', icon: 'face' },
  { key: 'Hair', icon: 'hair' },
  { key: 'Makeup', icon: 'makeup' },
  { key: 'Body', icon: 'body' },
  { key: 'Outfits', icon: 'hanger' },
  { key: 'Accessories', icon: 'acc' },
  { key: 'Tattoos', icon: 'tattoo' },
  { key: 'Details', icon: 'details' },
];

export const TABS = ['DNA', 'BODY', 'STYLE', 'PERSONALITY', 'STORY'];

export const TUNE = {
  Face: {
    sliders: [['Smile', 35], ['Jawline', 50], ['Freckles', 10]],
    presets: ['Soft', 'Defined', 'Natural', 'Sculpted'],
  },
  Hair: {
    swatches: ['#14110f', '#3b2a20', '#6b4a35', '#a07c5a', '#d9c3a1'],
    sliders: [['Volume', 60], ['Shine', 70]],
    presets: ['High bun', 'Low bun', 'Long straight', 'Bob', 'Ponytail'],
  },
  Makeup: {
    swatches: ['#e8b4a8', '#d98c8c', '#b5525e', '#8e3c4a'],
    sliders: [['Blush', 30], ['Lip tint', 45], ['Glow', 55]],
    presets: ['No-makeup', 'Glass skin', 'Soft glam', 'Editorial'],
  },
  Accessories: {
    multi: true,
    label: 'Add items',
    presets: ['Gold hoops', 'Silver chain', 'Shoulder bag', 'Sunglasses', 'Watch', 'Hair clip'],
  },
  Tattoos: {
    sliders: [['Opacity', 40]],
    presets: ['None', 'Fine line', 'Floral', 'Script', 'Minimal dots'],
  },
  Details: {
    sliders: [['Skin texture', 70], ['Fabric detail', 80], ['Lighting softness', 60]],
    presets: ['Studio', 'Natural', 'Cinematic'],
  },
};

export const TRAITS = ['Curious', 'Bold', 'Calm', 'Witty', 'Romantic', 'Driven', 'Playful', 'Gentle', 'Creative', 'Loyal'];
export const AXES = ['Openness', 'Energy', 'Warmth', 'Focus', 'Humour'];

export const DEFAULTS = { look: 0, grade: 0, real: 75, height: 168, build: 50 };

// Face crop: 360×360 window of the 1360×2048 source at (500, 46)
export const faceCrop = (url, size) => {
  const k = size / 360;
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${1360 * k}px ${2048 * k}px`,
    backgroundPosition: `${-500 * k}px ${-46 * k}px`,
    backgroundRepeat: 'no-repeat',
  };
};

export const realFilters = (v) => {
  const k = Math.max(0, (80 - v) / 80);
  return {
    model: `saturate(${1 + k * 0.9}) contrast(${1 + k * 0.25}) blur(${k * 1.4}px) brightness(${1 + k * 0.05})`,
    bg: `blur(${k * 5}px) saturate(${1 + k * 0.5})`,
  };
};

// Deterministic radar values (30–94) from selected trait names
export const radarFrom = (traits) =>
  AXES.map((_, a) => {
    let h = 7 + a * 131;
    traits.forEach((t) => {
      for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i) * (a + 3)) % 100003;
    });
    return 30 + (h % 65);
  });

// ---------------------------------------------------------------------------
// Live catalog from the VELL API. Arrays/objects above are the offline fallback
// and are replaced *in place* so every importer sees the loaded data.
// ---------------------------------------------------------------------------
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5050').replace(/\/$/, '');

const replace = (arr, items) => {
  arr.length = 0;
  arr.push(...items);
};

export async function loadCatalog(timeoutMs = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/api/public/catalog`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const c = await res.json();

    if (Array.isArray(c.looks) && c.looks.length) {
      replace(
        LOOKS,
        c.looks.map((l) => ({
          id: l.id,
          name: l.name,
          cat: l.category,
          big: imgUrl(l.image, 1000),
          small: imgUrl(l.image, 360),
          pieces: Object.fromEntries(
            Object.entries({ tops: [], bottoms: [], full: [], shoes: [], acc: [], ...l.pieces }).map(([g, list]) => [
              g,
              list.map((p) => ({
                ...p,
                ...(p.layer ? { layer: imgUrl(p.layer, 1000), slot: p.slot || 'bag' } : {}),
                ...(p.photo ? { thumb: imgUrl(p.photo, 200) } : {}),
              })),
            ])
          ),
        }))
      );
    }
    if (Array.isArray(c.categories) && c.categories.length) {
      replace(CATS, [CATS.find((x) => x.key === 'all') || { key: 'all', label: 'All', icon: 'grid' }, ...c.categories]);
    }
    if (Array.isArray(c.identities) && c.identities.length) replace(IDENTITIES, c.identities);
    if (Array.isArray(c.filters) && c.filters.length) replace(FILTERS, c.filters);
    if (c.tune && typeof c.tune === 'object') {
      for (const [key, g] of Object.entries(c.tune)) {
        TUNE[key] = {
          presets: g.presets || [],
          ...(g.swatches?.length ? { swatches: g.swatches } : {}),
          ...(g.sliders?.length ? { sliders: g.sliders.map((s) => [s.name, s.value]) } : {}),
          ...(g.multi ? { multi: true, label: g.multiLabel || 'Add items' } : {}),
        };
      }
    }
    const st = c.settings || {};
    if (st.background) SITE.bg = imgUrl(st.background, 2400);
    if (Array.isArray(st.traits) && st.traits.length) replace(TRAITS, st.traits);
    SITE.faceSwap = !!st.faceSwap;
    const defs = (st.defaultTraits || []).filter((t) => TRAITS.includes(t));
    SITE.defaultTraits = defs.length ? defs.slice(0, 3) : TRAITS.slice(0, 3);
    return true;
  } catch (e) {
    console.warn('[VELL] Using built-in catalog — API unavailable:', e.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Give the built-in fallback looks ids + specs (replaced by real ones when the API answers)
LOOKS.forEach((l, i) => {
  l.id = `local-${i}`;
  for (const g of Object.keys(l.pieces)) l.pieces[g] = l.pieces[g].map((p, j) => withSpecs(p, g, `local-${i}-${g}-${j}`));
});

// ---------------------------------------------------------------------------
// Shop API
// ---------------------------------------------------------------------------
async function post(path, body) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Cannot reach the store right now. Please check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Something went wrong. Please try again.');
  return data;
}
export const placeOrder = (payload) => post('/api/public/orders', payload);
export const trackOrder = (orderNumber, phone) => post('/api/public/orders/track', { orderNumber, phone });

/** Shrink a photo in the browser before upload (max 1280 px JPEG). */
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return await new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.9));
  } catch {
    return file;
  }
}

/**
 * AI face preview: sends the photo once, gets back a small face layer for the model.
 * Resolves { image: dataURL, box: { x, y, w, h } } on the 1360×2048 canvas.
 */
export async function swapFace(file) {
  const form = new FormData();
  form.append('photo', await shrink(file), 'face.jpg');
  form.append('consent', 'yes');
  let res;
  try {
    res = await fetch(`${API_URL}/api/public/tryon/face`, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? 'This is taking too long. Please try again.' : 'Cannot reach VELL right now. Please check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Could not create your face preview. Please try another photo.');
  return data;
}
