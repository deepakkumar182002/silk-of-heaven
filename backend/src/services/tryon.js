import sharp from 'sharp';
import { generateImage } from './gemini.js';
import {
  FACE,
  H,
  HEAD_CROP,
  HEAD_REGION,
  W,
  applyTransform,
  chromaKey,
  extractLayer,
  faceLayerFrom,
  findTransform,
  flattenJpeg,
  lockFace,
  photoJpeg,
  pickKey,
  rgbaToPng,
  toRGBA,
} from './imaging.js';
import { SLOTS } from '../utils/pieces.js';

// Above this mean grey difference (0–255) on the head after alignment, the AI probably moved the model.
const DRIFT = 22;

const SAME_MODEL = (key) => `Hard rules:
- Keep the model identical: same face and identity, expression, hairstyle, skin tone, body shape and size, pose, arm, hand, leg and foot positions, head angle and gaze (straight at the camera).
- Keep exactly the same camera, framing and scale: full body visible from the top of the hair to the soles of the feet, at the same position in the frame. Do not zoom, crop, rotate, mirror or shift.
- Background: keep the flat, perfectly uniform ${key.name} (${key.hex}) background. No floor, no shadows, no gradient, no props, no text, no watermark.
- Photorealistic studio lighting matching the original photo.`;

/** Fetch an image by URL (with a tiny in-memory cache for the base model / look images). */
const cache = new Map();
export async function fetchImage(url) {
  if (cache.has(url)) return cache.get(url);
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch {
    throw Object.assign(new Error('Could not download the model image'), { status: 502, expose: true });
  }
  if (!res.ok) throw Object.assign(new Error(`Could not download the model image (${res.status})`), { status: 502, expose: true });
  const buf = Buffer.from(await res.arrayBuffer());
  cache.set(url, buf);
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  return buf;
}

async function alignAndKey(refFlat, genBuf, key, region = HEAD_REGION) {
  const gen = await toRGBA(genBuf);
  const t = findTransform(refFlat, gen, region);
  const aligned = applyTransform(gen, t, { fill: [...key.rgb, 255] });
  chromaKey(aligned, key);
  return { px: aligned, t };
}

const describeTransform = (t) => ({ scale: +t.s.toFixed(3), dx: Math.round(t.dx), dy: Math.round(t.dy), score: +t.score.toFixed(1) });

/**
 * Dress the base model in a garment (one or more product photos of the same outfit).
 * Returns a 1360×2048 transparent PNG aligned with every other look.
 */
export async function fitDress({ baseBuf, photos, notes = '', keepFace = true }) {
  const garment = await Promise.all(photos.map(photoJpeg));
  const key = await pickKey([...garment, baseBuf]);
  const baseIn = await flattenJpeg(baseBuf, key.rgb);

  const out = await generateImage(
    [
      `You are a fashion virtual try-on renderer.\nIMAGE 1 is the reference model: a full-body, front-facing studio photo on a flat ${key.name} background.`,
      { buffer: baseIn, mime: 'image/jpeg' },
      `The next ${garment.length > 1 ? `${garment.length} images show ONE outfit from different angles` : 'image shows ONE outfit'} (product photos: it may be on a hanger, a mannequin, a flat lay or another person; use them only for the clothing design).`,
      ...garment.map((buffer) => ({ buffer, mime: 'image/jpeg' })),
      `Task: output IMAGE 1 with the model wearing exactly this outfit instead of her current clothes.${notes ? `\nOutfit notes from the designer: ${notes}` : ''}
- Reproduce the garment faithfully: colour, fabric, print, border, embroidery, zari, mirror work, length and silhouette.
- It must drape and fit realistically on her body, with natural folds. Indian wear (saree, lehenga, dupatta, kurta, salwar, anarkali, sharara) is draped and worn the traditional way.
- Keep her current footwear unless the outfit photos clearly include footwear. Add no other accessories or bags.
${SAME_MODEL(key)}`,
    ],
    { aspectRatio: '2:3' }
  );

  const [base, baseFlat] = await Promise.all([toRGBA(baseBuf), toRGBA(baseIn)]);
  const { px, t } = await alignAndKey(baseFlat, out, key);
  if (keepFace) lockFace(base, px);
  return {
    png: await rgbaToPng(px),
    alignment: describeTransform(t),
    warning: t.score > DRIFT ? 'The AI moved or changed the model more than usual. Check the face and pose, and regenerate if it looks off.' : '',
  };
}

/**
 * Generate a mix & match layer: the item alone, positioned on the 1360×2048 canvas so it sits
 * exactly on this look when shown on top of it.
 */
export async function makeLayer({ lookBuf, photos, slot, name = '', notes = '' }) {
  const spec = SLOTS[slot];
  if (!spec) throw Object.assign(new Error('Unknown item type'), { status: 400, expose: true });
  const item = await Promise.all(photos.map(photoJpeg));
  const key = await pickKey([...item, lookBuf]);
  const lookIn = await flattenJpeg(lookBuf, key.rgb);

  const out = await generateImage(
    [
      `You are a fashion virtual try-on renderer.\nIMAGE 1 is a full-body, front-facing studio photo of a model on a flat ${key.name} background.`,
      { buffer: lookIn, mime: 'image/jpeg' },
      `The next image${item.length > 1 ? 's show' : ' shows'} one ${spec.label.split(' (')[0].toLowerCase()} item${name ? ` called "${name}"` : ''} (product photo${item.length > 1 ? 's' : ''}).`,
      ...item.map((buffer) => ({ buffer, mime: 'image/jpeg' })),
      `Task: output IMAGE 1 with this item added to the model. ${spec.hint}${notes ? `\nNotes: ${notes}` : ''}
Change ONLY the pixels where the item is. Everything else (face, hair, body, pose, the rest of her clothing and the background) must stay exactly as in IMAGE 1.
${SAME_MODEL(key)}`,
    ],
    { aspectRatio: '2:3' }
  );

  const [look, lookFlat] = await Promise.all([toRGBA(lookBuf), toRGBA(lookIn)]);
  // earrings / headwear change the head itself, so align on the shoulders and torso instead
  const region = slot === 'jewellery' || slot === 'head' ? { left: 380, top: 420, width: 600, height: 700 } : HEAD_REGION;
  const { px, t } = await alignAndKey(lookFlat, out, key, region);
  const keepFace = slot === 'jewellery' || slot === 'head';
  if (!keepFace) lockFace(look, px);
  const { png, coverage } = await extractLayer(look, px, { keepFace });

  let warning = '';
  if (coverage < 0.004) warning = 'The AI barely changed the image, so the layer is almost empty. Try a clearer product photo or regenerate.';
  else if (coverage > 0.45) warning = 'The AI changed a large part of the outfit. If the layer looks wrong, regenerate or upload your own layer.';
  else if (t.score > DRIFT) warning = 'The AI moved the model more than usual. Check the preview and regenerate if the item is out of place.';
  return { png, coverage: +coverage.toFixed(3), alignment: describeTransform(t), warning };
}

/**
 * Website face swap: returns a small face layer (PNG) and its box on the canvas.
 * The selfie is only held in memory for this request.
 */
export async function swapFace({ baseBuf, selfie }) {
  const crop = await sharp(baseBuf).resize(W, H, { fit: 'fill' }).extract(HEAD_CROP).flatten({ background: '#8a8a8a' }).png().toBuffer();
  const cropIn = await sharp(crop).jpeg({ quality: 92 }).toBuffer();
  const face = await photoJpeg(selfie);

  const out = await generateImage(
    [
      'IMAGE 1 is a head-and-shoulders studio portrait of a model on a plain grey background.',
      { buffer: cropIn, mime: 'image/jpeg' },
      'IMAGE 2 is a photo of a person.',
      { buffer: face, mime: 'image/jpeg' },
      `Task: output IMAGE 1 with the model's face replaced by the face of the person in IMAGE 2, so it clearly looks like that person (face shape, eyes, eyebrows, nose, lips, natural skin texture and complexion).
Keep from IMAGE 1: the hairstyle and hair, head size, position and angle, gaze straight at the camera, a soft natural expression, the ears and earrings, neck, shoulders, clothing, lighting, crop and grey background. Blend the face skin naturally with the neck.
Photorealistic. Same framing; do not zoom, crop or shift.`,
    ],
    { aspectRatio: '1:1' }
  );

  const baseCrop = await toRGBA(crop, HEAD_CROP.width, HEAD_CROP.height);
  const layer = await faceLayerFrom(baseCrop, out);
  return { ...layer, canvas: { w: W, h: H }, oval: FACE };
}

/** Make a neutral base model (plain fitted basics, barefoot, no accessories) from an existing look. */
export async function neutralBase({ fromBuf }) {
  const key = await pickKey([fromBuf]);
  const inp = await flattenJpeg(fromBuf, key.rgb);
  const out = await generateImage(
    [
      `IMAGE 1 is a full-body, front-facing studio photo of a model on a flat ${key.name} background.`,
      { buffer: inp, mime: 'image/jpeg' },
      `Task: output IMAGE 1 with the model wearing only a plain, fitted, sleeveless nude-beige bodysuit with no pattern, and barefoot. Remove every accessory, belt, bag and jewellery (keep the hairstyle).
${SAME_MODEL(key)}`,
    ],
    { aspectRatio: '2:3' }
  );
  const [src, srcFlat] = await Promise.all([toRGBA(fromBuf), toRGBA(inp)]);
  const { px, t } = await alignAndKey(srcFlat, out, key);
  lockFace(src, px);
  return { png: await rgbaToPng(px), alignment: describeTransform(t) };
}
