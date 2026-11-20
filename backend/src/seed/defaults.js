// Default content — mirrors the original hard-coded VELL website data.
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/';
const p = (name, color, price) => ({ name, color, price });
const look = (name, category, file, pieces) => ({
  name,
  category,
  image: CDN + file,
  pieces: { tops: [], bottoms: [], full: [], shoes: [], acc: [], ...pieces },
});

export const DEFAULT_LOOKS = [
  look('Denim Maxi', 'everyday', 'hf_20261112_034542_a6430ecf-9862-412c-8ef6-5745115bd78c.png', {
    tops: [p('Ribbed crop tank', 'Charcoal', 38)],
    bottoms: [p('Washed denim maxi skirt', 'Light wash', 96)],
    shoes: [p('Knee-high leather boots', 'Black', 210)],
    acc: [p('Leather belt', 'Black', 42), p('Gold hoops', '14k', 64)],
  }),
  look('Cloud Set', 'everyday', 'hf_20261112_034738_73282737-acc8-41e9-a822-96c663e27b6c.png', {
    tops: [p('Half-zip sweatshirt', 'Oat', 74)],
    bottoms: [p('Wide sweatpants', 'Oat', 68)],
    shoes: [p('Chunky sneakers', 'White', 120)],
    acc: [p('Gold hoops', '14k', 64)],
  }),
  look('Library Knit', 'everyday', 'hf_20261112_034742_9a8a92fd-79ae-4163-9ffa-14ae2a68717f.png', {
    tops: [p('Cable-knit cardigan', 'Cream', 112), p('Cotton tee', 'White', 24)],
    bottoms: [p('Pleated wide trousers', 'Heather grey', 98)],
    shoes: [p('Penny loafers', 'Brown', 150)],
  }),
  look('Lilac Run', 'athletic', 'hf_20261112_034735_4e352e03-ad2b-44d1-9fcf-4b5b9454dc55.png', {
    tops: [p('Zip training jacket', 'Lilac', 88), p('Sports crop top', 'Lilac', 44)],
    bottoms: [p('High-rise leggings', 'Lilac', 72)],
    shoes: [p('Running sneakers', 'White', 140)],
  }),
  look('Satin Night', 'sleep', 'hf_20261112_034738_aeb8ea57-6399-4f3c-b54a-4a57d0bd971e.png', {
    tops: [p('Satin pyjama shirt', 'Powder blue', 66)],
    bottoms: [p('Satin pyjama trousers', 'Powder blue', 58)],
    shoes: [p('Fluffy slippers', 'Ivory', 34)],
  }),
  look('Night Suit', 'formal', 'hf_20261112_034736_aace5c5f-8c14-4b00-83ba-744dbad2e337.png', {
    tops: [p('Oversized blazer', 'Black', 240), p('Silk camisole', 'Ivory', 82)],
    bottoms: [p('Straight suit trousers', 'Black', 160)],
    shoes: [p('Pointed heels', 'Black', 190)],
  }),
  look('Sage Slip', 'party', 'hf_20261112_034735_3d9fb69e-b4e0-49f7-a2d4-e592bd616c27.png', {
    full: [p('Satin slip midi dress', 'Sage', 180)],
    shoes: [p('Strappy sandals', 'Silver', 130)],
    acc: [p('Fine chain necklace', 'Silver', 56)],
  }),
  look('Bomber Cargo', 'street', 'hf_20261112_034740_3e3c5ad7-689b-46a2-8e09-c7d36a569b9c.png', {
    tops: [p('Leather bomber', 'Black', 260), p('Crop tee', 'White', 22)],
    bottoms: [p('Parachute cargo pants', 'Khaki', 94)],
    shoes: [p('Platform sneakers', 'Black', 150)],
  }),
].map((l, i) => ({ ...l, order: i, active: true }));

export const DEFAULT_CATEGORIES = [
  ['everyday', 'Everyday', 'tee'],
  ['athletic', 'Athletic', 'athletic'],
  ['sleep', 'Sleep', 'moon'],
  ['formal', 'Formal', 'formal'],
  ['party', 'Party', 'dress'],
  ['street', 'Street', 'hoodie'],
].map(([key, label, icon], order) => ({ key, label, icon, order }));

export const DEFAULT_IDENTITIES = [
  ['Han Seo-yeon', 23, 'Seoul, KR', 14],
  ['Kim Ha-eun', 22, 'Busan, KR', 17],
  ['Yoon Ji-woo', 25, 'Seoul, KR', 12],
  ['Park Min-ji', 24, 'Incheon, KR', 13],
  ['Lee Soo-ah', 21, 'Daegu, KR', 15],
].map(([name, age, city, temp], order) => ({ name, age, city, temp, order }));

const s = (pairs) => pairs.map(([name, value]) => ({ name, value }));
export const DEFAULT_TUNE = [
  {
    key: 'Face',
    sliders: s([['Smile', 35], ['Jawline', 50], ['Freckles', 10]]),
    presets: ['Soft', 'Defined', 'Natural', 'Sculpted'],
  },
  {
    key: 'Hair',
    swatches: ['#14110f', '#3b2a20', '#6b4a35', '#a07c5a', '#d9c3a1'],
    sliders: s([['Volume', 60], ['Shine', 70]]),
    presets: ['High bun', 'Low bun', 'Long straight', 'Bob', 'Ponytail'],
  },
  {
    key: 'Makeup',
    swatches: ['#e8b4a8', '#d98c8c', '#b5525e', '#8e3c4a'],
    sliders: s([['Blush', 30], ['Lip tint', 45], ['Glow', 55]]),
    presets: ['No-makeup', 'Glass skin', 'Soft glam', 'Editorial'],
  },
  {
    key: 'Accessories',
    multi: true,
    multiLabel: 'Add items',
    presets: ['Gold hoops', 'Silver chain', 'Shoulder bag', 'Sunglasses', 'Watch', 'Hair clip'],
  },
  {
    key: 'Tattoos',
    sliders: s([['Opacity', 40]]),
    presets: ['None', 'Fine line', 'Floral', 'Script', 'Minimal dots'],
  },
  {
    key: 'Details',
    sliders: s([['Skin texture', 70], ['Fabric detail', 80], ['Lighting softness', 60]]),
    presets: ['Studio', 'Natural', 'Cinematic'],
  },
];

export const DEFAULT_FILTERS = [
  ['Daylight', 'none', 'transparent'],
  ['Soft Film', 'contrast(.92) saturate(.85) brightness(1.06)', 'linear-gradient(180deg, rgba(255,226,214,.35), rgba(180,200,220,.35))'],
  ['Cool Studio', 'saturate(.9) brightness(1.06) contrast(1.04)', 'linear-gradient(180deg, rgba(150,190,255,.55), rgba(200,220,255,.3))'],
  ['Blue Hour', 'brightness(.82) contrast(1.1) saturate(1.1)', 'linear-gradient(180deg, rgba(70,60,170,.75), rgba(150,90,170,.55))'],
  ['Mono', 'grayscale(1) contrast(1.12) brightness(1.03)', 'transparent'],
  ['Golden Hour', 'saturate(1.1) brightness(1.02)', 'linear-gradient(180deg, rgba(255,180,90,.6), rgba(255,140,80,.4))'],
].map(([name, filter, tint], order) => ({ name, filter, tint, order }));

export const DEFAULT_SETTINGS = {
  key: 'site',
  background: CDN + 'hf_20261112_034551_6394b127-5366-40a8-9c82-3c416f1161f1.png',
  traits: ['Curious', 'Bold', 'Calm', 'Witty', 'Romantic', 'Driven', 'Playful', 'Gentle', 'Creative', 'Loyal'],
  defaultTraits: ['Curious', 'Creative', 'Gentle'],
};
