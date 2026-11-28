import sharp from 'sharp';

/**
 * Pixel helpers for the AI try-on pipeline.
 *
 * Every VELL look is a 1360×2048 transparent cut-out of the same model in the same pose.
 * The AI output is pulled back onto that exact canvas (aligned on the head), so a generated
 * look, a mix & match layer or a face layer always lines up with every other look.
 */
export const W = 1360;
export const H = 2048;
/** Face oval of the model on the canvas (forehead → chin, cheek → cheek). */
export const FACE = { cx: 683, cy: 262, rx: 92, ry: 118 };
/** Head + hair box used to align AI output with the original model. */
export const HEAD_REGION = { left: 520, top: 20, width: 330, height: 400 };
/** Square head-and-shoulders crop sent to the AI for face swaps. */
export const HEAD_CROP = { left: 400, top: 0, width: 560, height: 560 };

// Flat backdrop colours the AI is asked to keep; the one furthest from the garment colours is used.
const KEYS = [
  { name: 'pure chroma green', hex: '#00FF00', rgb: [0, 255, 0] },
  { name: 'pure magenta', hex: '#FF00FF', rgb: [255, 0, 255] },
  { name: 'pure blue', hex: '#0000FF', rgb: [0, 0, 255] },
  { name: 'pure cyan', hex: '#00FFFF', rgb: [0, 255, 255] },
];
const bgOf = (key) => ({ r: key.rgb[0], g: key.rgb[1], b: key.rgb[2] });
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Decode any image to raw RGBA, stretched to exactly w×h. */
export async function toRGBA(buf, w = W, h = H) {
  const data = await sharp(buf).rotate().resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  return new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
}

export const rgbaToPng = (px, w = W, h = H) =>
  sharp(Buffer.from(px.buffer, px.byteOffset, px.length), { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

/** JPEG of an image flattened onto a solid colour, for sending to the AI. */
export const flattenJpeg = (buf, rgb, w = W, h = H) =>
  sharp(buf)
    .rotate()
    .resize(w, h, { fit: 'fill' })
    .flatten({ background: { r: rgb[0], g: rgb[1], b: rgb[2] } })
    .jpeg({ quality: 92 })
    .toBuffer();

/** Photo prepared for the AI: EXIF-rotated, at most 1280 px, JPEG. */
export const photoJpeg = (buf) =>
  sharp(buf).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();

/** Pick the backdrop colour least present in the given images. */
export async function pickKey(buffers) {
  const hits = KEYS.map(() => 0);
  for (const b of buffers) {
    const data = await sharp(b).resize(96, 96, { fit: 'inside' }).ensureAlpha().raw().toBuffer();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      KEYS.forEach((k, j) => {
        if (Math.hypot(data[i] - k.rgb[0], data[i + 1] - k.rgb[1], data[i + 2] - k.rgb[2]) < 170) hits[j]++;
      });
    }
  }
  let best = 0;
  hits.forEach((c, j) => c < hits[best] && (best = j));
  return KEYS[best];
}
export { bgOf };

/** Remove the flat backdrop (and its shadows) in place, un-mixing the colour of soft edges. */
export function chromaKey(px, key) {
  const [kr, kg, kb] = key.rgb;
  const LO = 60;
  const HI = 150;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const d1 = Math.hypot(r - kr, g - kg, b - kb);
    const m = Math.max(r, g, b, 1);
    const d2 = Math.hypot((r * 255) / m - kr, (g * 255) / m - kg, (b * 255) / m - kb) + 25; // darker / shaded backdrop
    const d = Math.min(d1, d2);
    if (d >= HI) continue;
    if (d <= LO) {
      px[i + 3] = 0;
      continue;
    }
    const a = (d - LO) / (HI - LO);
    px[i] = clamp((r - (1 - a) * kr) / a);
    px[i + 1] = clamp((g - (1 - a) * kg) / a);
    px[i + 2] = clamp((b - (1 - a) * kb) / a);
    px[i + 3] = Math.round(a * px[i + 3]);
  }
  return cleanEdges(px, key);
}

/** Excess of the backdrop colour in a pixel (> 0 = tinted by the backdrop). */
const spill = {
  '0,255,0': (r, g, b) => g - (r + b) / 2,
  '255,0,255': (r, g, b) => (r + b) / 2 - g,
  '0,0,255': (r, g, b) => b - (r + g) / 2,
  '0,255,255': (r, g, b) => (g + b) / 2 - r,
};

/**
 * Near the cut-out edge: remove backdrop colour spill and choke the alpha by ~1px,
 * so no coloured fringe is left around hair and clothes.
 */
function cleanEdges(px, key, w = W, h = H) {
  const excess = spill[key.rgb.join(',')];
  const n = w * h;
  // distance band: pixels within 3px of the background
  const bg = new Uint8Array(n);
  for (let p = 0; p < n; p++) bg[p] = px[p * 4 + 3] < 128 ? 1 : 0;
  let band = bg;
  for (let it = 0; it < 3; it++) {
    const next = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      if (band[p]) {
        next[p] = 1;
        continue;
      }
      const x = p % w;
      if ((x > 0 && band[p - 1]) || (x < w - 1 && band[p + 1]) || (p >= w && band[p - w]) || (p < n - w && band[p + w])) next[p] = 2;
    }
    if (it === 0) {
      // 1px choke: pixels touching the background lose half their opacity
      for (let p = 0; p < n; p++) if (next[p] === 2) px[p * 4 + 3] = px[p * 4 + 3] >> 1;
    }
    band = next;
  }
  for (let p = 0; p < n; p++) {
    if (!band[p] || bg[p]) continue;
    const i = p * 4;
    const e = excess(px[i], px[i + 1], px[i + 2]);
    if (e <= 0) continue;
    // pull the dominant backdrop channel(s) back to neutral
    const [kr, kg, kb] = key.rgb;
    if (kr) px[i] = clamp(px[i] - e);
    if (kg) px[i + 1] = clamp(px[i + 1] - e);
    if (kb) px[i + 2] = clamp(px[i + 2] - e);
  }
  return px;
}

// ---------------------------------------------------------------------------
// Alignment: find scale + shift that maps the AI output back onto the original
// ---------------------------------------------------------------------------
function gray(px, w, h, f, bg = 128) {
  const gw = Math.floor(w / f);
  const gh = Math.floor(h / f);
  const out = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let s = 0;
      for (let yy = 0; yy < f; yy++) {
        let i = ((y * f + yy) * w + x * f) * 4;
        for (let xx = 0; xx < f; xx++, i += 4) {
          const a = px[i + 3] / 255;
          s += (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) * a + bg * (1 - a);
        }
      }
      out[y * gw + x] = s / (f * f);
    }
  }
  return { g: out, w: gw, h: gh };
}

function search(B, G, f, region, center, scales, R, init, mask) {
  const x0 = Math.max(0, Math.floor(region.left / f));
  const y0 = Math.max(0, Math.floor(region.top / f));
  const x1 = Math.min(B.w, Math.ceil((region.left + region.width) / f));
  const y1 = Math.min(B.h, Math.ceil((region.top + region.height) / f));
  const cx = center.x / f;
  const cy = center.y / f;
  let best = { score: Infinity, s: 1, dx: 0, dy: 0 };
  for (const s of scales) {
    for (let ddy = -R; ddy <= R; ddy++) {
      for (let ddx = -R; ddx <= R; ddx++) {
        const dx = init.dx / f + ddx;
        const dy = init.dy / f + ddy;
        let sum = 0;
        let n = 0;
        for (let y = y0; y < y1; y++) {
          const sy = Math.round(cy + (y - cy) * s + dy);
          if (sy < 0 || sy >= G.h) continue;
          for (let x = x0; x < x1; x++) {
            if (mask && !mask(x * f, y * f)) continue;
            const sx = Math.round(cx + (x - cx) * s + dx);
            if (sx < 0 || sx >= G.w) continue;
            sum += Math.abs(B.g[y * B.w + x] - G.g[sy * G.w + sx]);
            n++;
          }
        }
        const score = n ? sum / n : Infinity;
        if (score < best.score) best = { score, s, dx: dx * f, dy: dy * f };
      }
    }
  }
  return best;
}

/**
 * Coarse-to-fine search for the transform where output(x,y) = gen(c + (x - c)·s + d) best matches base
 * inside `region`. Returns { s, dx, dy, score } (score = mean grey difference, 0–255).
 */
export function findTransform(base, gen, region, { w = W, h = H, maxShift = 160, minScale = 0.88, maxScale = 1.12, mask } = {}) {
  const center = { x: region.left + region.width / 2, y: region.top + region.height / 2 };
  const coarseF = w >= 500 ? 8 : 4;
  const scales = [];
  for (let s = minScale; s <= maxScale + 1e-9; s += 0.02) scales.push(+s.toFixed(3));
  const c = search(gray(base, w, h, coarseF), gray(gen, w, h, coarseF), coarseF, region, center, scales, Math.ceil(maxShift / coarseF), { dx: 0, dy: 0 }, mask);
  const fineF = 2;
  const fine = search(
    gray(base, w, h, fineF),
    gray(gen, w, h, fineF),
    fineF,
    region,
    center,
    [c.s - 0.01, c.s - 0.005, c.s, c.s + 0.005, c.s + 0.01],
    Math.ceil(coarseF / fineF) + 1,
    c,
    mask
  );
  return { ...fine, cx: center.x, cy: center.y };
}

/** Resample `px` with the transform (bilinear); pixels from outside are filled with `fill` (RGBA). */
export function applyTransform(px, t, { w = W, h = H, fill = [0, 0, 0, 0] } = {}) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = t.cy + (y - t.cy) * t.s + t.dy;
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const sx = t.cx + (x - t.cx) * t.s + t.dx;
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) {
        out[o] = fill[0];
        out[o + 1] = fill[1];
        out[o + 2] = fill[2];
        out[o + 3] = fill[3];
        continue;
      }
      const i00 = (y0 * w + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + w * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 4; c++) {
        out[o + c] =
          (px[i00 + c] * (1 - fx) + px[i10 + c] * fx) * (1 - fy) + (px[i01 + c] * (1 - fx) + px[i11 + c] * fx) * fy;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Face
// ---------------------------------------------------------------------------
/** 1 inside the oval, feathered to 0 at its edge. */
export function ovalWeight(x, y, oval, feather = 0.16) {
  const r = Math.hypot((x - oval.cx) / oval.rx, (y - oval.cy) / oval.ry);
  if (r >= 1) return 0;
  if (r <= 1 - feather) return 1;
  const t = (1 - r) / feather;
  return t * t * (3 - 2 * t);
}

/** Paste the original face back so every look keeps the exact same face. */
export function lockFace(base, gen, w = W) {
  const { cx, cy, rx, ry } = FACE;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const m = ovalWeight(x, y, FACE, 0.22);
      if (!m) continue;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) gen[i + c] = gen[i + c] * (1 - m) + base[i + c] * m;
    }
  }
  return gen;
}

/**
 * Face layer from a face-swapped head crop: aligns the AI crop on the unchanged hair & shoulders,
 * then keeps only the feathered face oval. Returns a small PNG and its box on the 1360×2048 canvas.
 */
export async function faceLayerFrom(baseCrop, genBuf) {
  const { width: cw, height: ch, left, top } = HEAD_CROP;
  const gen = await toRGBA(genBuf, cw, ch);
  const oval = { cx: FACE.cx - left, cy: FACE.cy - top, rx: FACE.rx, ry: FACE.ry };
  const t = findTransform(baseCrop, gen, { left: 0, top: 0, width: cw, height: ch }, {
    w: cw,
    h: ch,
    maxShift: 60,
    minScale: 0.9,
    maxScale: 1.1,
    mask: (x, y) => Math.hypot((x - oval.cx) / oval.rx, (y - oval.cy) / oval.ry) > 1.25,
  });
  const al = applyTransform(gen, t, { w: cw, h: ch });
  const bx = Math.floor(oval.cx - oval.rx - 2);
  const by = Math.floor(oval.cy - oval.ry - 2);
  const bw = Math.ceil(oval.rx * 2 + 4);
  const bh = Math.ceil(oval.ry * 2 + 4);
  const out = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const sx = bx + x;
      const sy = by + y;
      const m = ovalWeight(sx, sy, oval, 0.2);
      if (!m) continue;
      const i = (sy * cw + sx) * 4;
      const o = (y * bw + x) * 4;
      out[o] = al[i];
      out[o + 1] = al[i + 1];
      out[o + 2] = al[i + 2];
      out[o + 3] = Math.round(m * 255);
    }
  }
  return {
    png: await rgbaToPng(out, bw, bh),
    box: { x: bx + left, y: by + top, w: bw, h: bh },
    score: t.score,
  };
}

// ---------------------------------------------------------------------------
// Mix & match layer: what the AI added on top of the look
// ---------------------------------------------------------------------------
async function blurredHalf(px) {
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
    const a = px[i + 3] / 255;
    rgb[j] = px[i] * a + 128 * (1 - a);
    rgb[j + 1] = px[i + 1] * a + 128 * (1 - a);
    rgb[j + 2] = px[i + 2] * a + 128 * (1 - a);
  }
  return sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).resize(W / 2, H / 2).blur(2.5).raw().toBuffer();
}

function keepBigComponents(mask, w, h) {
  const label = new Int32Array(w * h);
  const sizes = [0];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    let sp = 0;
    stack[sp++] = s;
    label[s] = next;
    let size = 0;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of nb) {
        if (q >= 0 && q < mask.length && mask[q] && !label[q]) {
          label[q] = next;
          stack[sp++] = q;
        }
      }
    }
    sizes.push(size);
    next++;
  }
  let largest = 0;
  for (const s of sizes) if (s > largest) largest = s;
  const min = Math.max(120, largest * 0.12);
  for (let i = 0; i < mask.length; i++) if (mask[i] && sizes[label[i]] < min) mask[i] = 0;
  return mask;
}

/**
 * Layer = pixels of `gen` that differ from `look`, cleaned up and feathered.
 * Returns { png, coverage } where coverage is the changed share of the figure (0–1).
 */
export async function extractLayer(look, gen, { keepFace = false } = {}) {
  const w2 = W / 2;
  const h2 = H / 2;
  const [A, B] = await Promise.all([blurredHalf(look), blurredHalf(gen)]);
  let mask = new Uint8Array(w2 * h2);
  let figure = 0;
  for (let i = 0, j = 0; i < mask.length; i++, j += 3) {
    const d = Math.abs(A[j] - B[j]) + Math.abs(A[j + 1] - B[j + 1]) + Math.abs(A[j + 2] - B[j + 2]);
    mask[i] = d > 75 ? 255 : 0;
    const x = (i % w2) * 2;
    const y = Math.floor(i / w2) * 2;
    if (look[(y * W + x) * 4 + 3] > 128) figure++;
  }
  mask = keepBigComponents(mask, w2, h2);
  let changed = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) changed++;

  // grow a little to cover anti-aliased edges, then feather
  const grown = await sharp(Buffer.from(mask), { raw: { width: w2, height: h2, channels: 1 } }).blur(2.5).extractChannel(0).raw().toBuffer();
  for (let i = 0; i < grown.length; i++) grown[i] = grown[i] > 30 ? 255 : 0;
  const soft = await sharp(grown, { raw: { width: w2, height: h2, channels: 1 } }).blur(1.2).resize(W, H).extractChannel(0).raw().toBuffer();

  const out = new Uint8ClampedArray(W * H * 4);
  for (let p = 0, i = 0; p < soft.length; p++, i += 4) {
    let m = soft[p] / 255;
    if (!m) continue;
    if (!keepFace) {
      const x = p % W;
      const y = (p - x) / W;
      m *= 1 - ovalWeight(x, y, { ...FACE, rx: FACE.rx * 0.92, ry: FACE.ry * 0.92 }, 0.2);
    }
    out[i] = gen[i];
    out[i + 1] = gen[i + 1];
    out[i + 2] = gen[i + 2];
    out[i + 3] = Math.round(m * gen[i + 3]);
  }
  return { png: await rgbaToPng(out), coverage: figure ? changed / figure : 0 };
}

// ---------------------------------------------------------------------------
// Manual images (e.g. made in Gemini / ChatGPT): remove the plain backdrop and place the person
// exactly like the original model (head near the top, feet on the same line, centred).
// ---------------------------------------------------------------------------
/** Framing of the original Women model on the 1360×2048 canvas. */
export const FRAME = { top: 30, bottom: 2024, cx: 680 };

/**
 * buf: any photo or cut-out. heightRatio: 1 = an adult filling the frame like the original model,
 * 0.76 = a 128 cm child next to a 168 cm adult. Resolves { png, keyed, box }.
 */
export async function cutoutToCanvas(buf, { heightRatio = 1 } = {}) {
  const ratio = Math.min(1.05, Math.max(0.4, Number(heightRatio) || 1));
  const flat = await sharp(buf).rotate().resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
  const px = new Uint8ClampedArray(flat.buffer, flat.byteOffset, flat.length);

  // the border tells us what the backdrop is (ignore the transparent padding "contain" added)
  let n = 0;
  let clear = 0;
  const sum = [0, 0, 0];
  const sample = (x, y) => {
    const i = (y * W + x) * 4;
    if (px[i + 3] < 20) return void clear++;
    n++;
    sum[0] += px[i];
    sum[1] += px[i + 1];
    sum[2] += px[i + 2];
  };
  for (let x = 0; x < W; x += 4) {
    sample(x, 0);
    sample(x, H - 1);
  }
  for (let y = 0; y < H; y += 4) {
    sample(0, y);
    sample(W - 1, y);
  }
  // already transparent around the person: keep it as it is
  const alreadyCut = n === 0 || clear > n * 4;
  let keyed = false;
  if (!alreadyCut) {
    const bg = sum.map((v) => v / n);
    const near = KEYS.map((k) => ({ k, d: Math.hypot(bg[0] - k.rgb[0], bg[1] - k.rgb[1], bg[2] - k.rgb[2]) })).sort((a, b) => a.d - b.d)[0];
    if (near.d > 150) {
      throw Object.assign(new Error('Could not find a plain green background. Make the image on a flat bright green (#00FF00) background and try again.'), { status: 422, expose: true });
    }
    // fill the padding with the backdrop colour, then key it out
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 20) {
        px[i] = near.k.rgb[0];
        px[i + 1] = near.k.rgb[1];
        px[i + 2] = near.k.rgb[2];
        px[i + 3] = 255;
      }
    }
    chromaKey(px, near.k);
    keyed = true;
  }

  // drop small separate blobs (AI watermark sparkle, specks): only the person is kept
  dropSmallBlobs(px);

  // bounding box of the person (rows / columns with at least a few solid pixels, so specks do not count)
  const rows = new Uint32Array(H);
  const cols = new Uint32Array(W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (px[(y * W + x) * 4 + 3] > 180) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const first = (arr, min) => arr.findIndex((v) => v >= min);
  const last = (arr, min) => arr.length - 1 - [...arr].reverse().findIndex((v) => v >= min);
  const y0 = first(rows, 3);
  const y1 = last(rows, 3);
  const x0 = first(cols, 3);
  const x1 = last(cols, 3);
  if (y0 < 0 || x0 < 0 || y1 - y0 < 200) throw Object.assign(new Error('No person found in the image.'), { status: 422, expose: true });

  // scale the person to the same height as the original model (× ratio), feet on the same line
  const cut = await sharp(Buffer.from(px.buffer, px.byteOffset, px.length), { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .png()
    .toBuffer();
  let th = Math.round((FRAME.bottom - FRAME.top) * ratio);
  let tw = Math.round(((x1 - x0 + 1) * th) / (y1 - y0 + 1));
  if (tw > W - 20) {
    th = Math.round((th * (W - 20)) / tw);
    tw = W - 20;
  }
  const resized = await sharp(cut).resize(tw, th, { fit: 'fill' }).png().toBuffer();
  const left = Math.max(0, Math.min(W - tw, Math.round(FRAME.cx - tw / 2)));
  const top = FRAME.bottom - th;
  const png = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { png, keyed, box: { left, top, width: tw, height: th } };
}

/** Clears every opaque blob smaller than 2 % of the biggest one (the person). */
function dropSmallBlobs(px, w = W, h = H) {
  const n = w * h;
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  const sizes = [0];
  let next = 1;
  for (let s = 0; s < n; s++) {
    if (px[s * 4 + 3] < 40 || label[s]) continue;
    let sp = 0;
    stack[sp++] = s;
    label[s] = next;
    let size = 0;
    while (sp) {
      const p = stack[--sp];
      size++;
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of nb) {
        if (q >= 0 && q < n && !label[q] && px[q * 4 + 3] >= 40) {
          label[q] = next;
          stack[sp++] = q;
        }
      }
    }
    sizes.push(size);
    next++;
  }
  const largest = Math.max(0, ...sizes);
  const min = Math.max(400, largest * 0.02);
  for (let p = 0; p < n; p++) if (label[p] && sizes[label[p]] < min) px[p * 4 + 3] = 0;
  // faint pixels left around removed blobs
  for (let p = 0; p < n; p++) if (!label[p] && px[p * 4 + 3] < 40) px[p * 4 + 3] = 0;
  return px;
}

/**
 * Manual framing from the admin editor: the image (fitted into 1360×2048) is scaled by `scale` about
 * the canvas centre, then moved by dx / dy canvas pixels. What falls outside the canvas is cropped.
 * The admin preview uses exactly the same maths (CSS: translate(dx, dy) scale(s), origin centre).
 */
export async function frameTransform(buf, { scale = 1, dx = 0, dy = 0 } = {}) {
  const s = Math.min(3, Math.max(0.3, Number(scale) || 1));
  const mx = Math.round(Math.max(-W, Math.min(W, Number(dx) || 0)));
  const my = Math.round(Math.max(-H, Math.min(H, Number(dy) || 0)));
  const fitted = await sharp(buf).rotate().resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().png().toBuffer();
  const sw = Math.max(1, Math.round(W * s));
  const sh = Math.max(1, Math.round(H * s));
  const left = Math.round((W - sw) / 2 + mx);
  const top = Math.round((H - sh) / 2 + my);
  const srcX = Math.max(0, -left);
  const srcY = Math.max(0, -top);
  const dstX = Math.max(0, left);
  const dstY = Math.max(0, top);
  const w = Math.min(sw - srcX, W - dstX);
  const h = Math.min(sh - srcY, H - dstY);
  if (w <= 0 || h <= 0) throw Object.assign(new Error('The image was moved completely out of the frame'), { status: 400, expose: true });
  const part = await sharp(fitted).resize(sw, sh, { fit: 'fill' }).extract({ left: srcX, top: srcY, width: w, height: h }).png().toBuffer();
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: part, left: dstX, top: dstY }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Where the person is on a 1360×2048 cut-out (for the editor's "Centre" button). */
export async function personBox(buf) {
  const raw = await sharp(buf).rotate().resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
  const px = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.length);
  dropSmallBlobs(px);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (px[(y * W + x) * 4 + 3] > 180) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
