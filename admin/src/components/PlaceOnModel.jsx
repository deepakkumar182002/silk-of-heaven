import { useEffect, useMemo, useRef, useState } from 'react';
import { imgUrl, uploadImage } from '../api.js';
import Icon from './icons.jsx';
import { Modal, Spinner } from './ui.jsx';

const W = 1360;
const H = 2048;
const VIEW = 420; // preview width in px at zoom 1
const MS = 0.5; // the erase mask is kept at half size (soft brush, light undo)
const MW = W * MS;
const MH = H * MS;
const CLOTHES = ['top', 'outer', 'bottom', 'full', 'drape'];
const NECK_FIRST = ['top', 'outer', 'full']; // garments whose collar should sit behind the neck

// Where an item starts on the original model (face centre ≈ 678, 264; face width ≈ 142),
// moved and scaled to the face of other bodies (men, kids)
const START = {
  shoes: [680, 1950, 430],
  bag: [930, 1150, 300],
  jewellery: [680, 340, 230],
  drape: [680, 700, 720],
  outer: [680, 820, 820],
  top: [680, 700, 700],
  bottom: [680, 1350, 620],
  full: [680, 1050, 900],
  head: [680, 170, 380],
  none: [680, 1000, 500],
};
const startFor = (slot, face) => {
  const [x, y, w] = START[slot] || START.none;
  if (!face?.w) return { x, y, w };
  const k = face.w / 142;
  const cx = face.x + face.w / 2;
  const cy = face.y + face.h / 2;
  return { x: cx + (x - 678) * k, y: cy + (y - 264) * k, w: w * k };
};

// ---------------------------------------------------------------------------
// canvas helpers
// ---------------------------------------------------------------------------
const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};
const ctx2 = (c) => c.getContext('2d', { willReadFrequently: true });

/** Soft blur by halving the image a few times and scaling it back up (works in every browser). */
function blurred(src, w, h, radius) {
  let cur = mk(w, h);
  cur.getContext('2d').drawImage(src, 0, 0, w, h);
  while (cur.width / 2 >= w / Math.max(1, radius) && cur.width > 4) {
    const n = mk(cur.width / 2, cur.height / 2);
    n.getContext('2d').drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
  }
  const out = mk(w, h);
  const o = out.getContext('2d');
  o.imageSmoothingQuality = 'high';
  o.drawImage(cur, 0, 0, w, h);
  return out;
}

/**
 * Remove a plain background: flood fill from the image border over pixels close to the border colour,
 * with a soft edge. Returns the canvas; `canvas.key` is the background colour that was removed.
 */
function cutOut(img, tolerance) {
  const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = mk(w, h);
  const ctx = ctx2(c);
  ctx.drawImage(img, 0, 0, w, h);
  if (!tolerance) return c;
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // background colour = average of the border pixels
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const addRef = (i) => {
    r += px[i];
    g += px[i + 1];
    b += px[i + 2];
    n++;
  };
  for (let x = 0; x < w; x++) {
    addRef(x * 4);
    addRef(((h - 1) * w + x) * 4);
  }
  for (let y = 0; y < h; y++) {
    addRef(y * w * 4);
    addRef((y * w + w - 1) * 4);
  }
  r /= n;
  g /= n;
  b /= n;
  const tol = tolerance * 2.2; // slider 0–100 → colour distance 0–220
  const dist = (p) => Math.sqrt((px[p] - r) ** 2 + (px[p + 1] - g) ** 2 + (px[p + 2] - b) ** 2);

  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const push = (i) => {
    if (bg[i]) return;
    if (px[i * 4 + 3] >= 8 && dist(i * 4) > tol) return; // transparent pixels count as background
    bg[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  // clear the background, soften pixels next to it (anti-aliased edge)
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (bg[i]) {
      px[p + 3] = 0;
      continue;
    }
    const x = i % w;
    const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (i >= w && bg[i - w]) || (i < w * (h - 1) && bg[i + w]);
    if (edge) {
      const d = dist(p);
      px[p + 3] = Math.round(px[p + 3] * Math.min(1, Math.max(0.15, (d - tol) / (tol * 0.6 + 1) + 0.5)));
    }
  }
  ctx.putImageData(data, 0, 0);
  c.key = [r, g, b];
  return c;
}

/** Distance (4-neighbour steps, capped) of every pixel from the transparent area. */
function edgeDistance(px, w, h, max) {
  const n = w * h;
  const d = new Uint8Array(n).fill(255);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (px[i * 4 + 3] < 20) {
      d[i] = 0;
      q[tail++] = i;
    }
  }
  while (head < tail) {
    const i = q[head++];
    if (d[i] >= max) continue;
    const nd = d[i] + 1;
    const x = i % w;
    if (x > 0 && d[i - 1] > nd) (d[i - 1] = nd), (q[tail++] = i - 1);
    if (x < w - 1 && d[i + 1] > nd) (d[i + 1] = nd), (q[tail++] = i + 1);
    if (i >= w && d[i - w] > nd) (d[i - w] = nd), (q[tail++] = i - w);
    if (i < n - w && d[i + w] > nd) (d[i + w] = nd), (q[tail++] = i + w);
  }
  return d;
}

/**
 * Take the background's colour cast out of the edge (green fringe from a green screen, any colour):
 * the part of each pixel's colour that points towards the key colour is removed, strongest at the edge.
 */
function despill(px, w, h, key) {
  const d = edgeDistance(px, w, h, 11);
  let kc = null;
  if (key) {
    const m = (key[0] + key[1] + key[2]) / 3;
    kc = [key[0] - m, key[1] - m, key[2] - m];
  } else {
    // already a cut-out: guess the fringe colour from the outer edge
    const s = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      if (d[i] < 1 || d[i] > 2) continue;
      const p = i * 4;
      const m = (px[p] + px[p + 1] + px[p + 2]) / 3;
      s[0] += px[p] - m;
      s[1] += px[p + 1] - m;
      s[2] += px[p + 2] - m;
      n++;
    }
    if (n) kc = s.map((v) => v / n);
  }
  const len = kc ? Math.hypot(kc[0], kc[1], kc[2]) : 0;
  if (len < 18) return; // grey / white background: nothing to take out
  const u = kc.map((v) => v / len);
  for (let i = 0; i < w * h; i++) {
    const di = d[i];
    if (di === 0) continue;
    const p = i * 4;
    const m = (px[p] + px[p + 1] + px[p + 2]) / 3;
    const proj = (px[p] - m) * u[0] + (px[p + 1] - m) * u[1] + (px[p + 2] - m) * u[2];
    if (proj <= 0) continue;
    // near the edge the cast goes completely; deeper inside only a strong cast (green light bouncing on the fabric)
    const cut = di <= 7 ? proj : di <= 10 ? proj * 0.7 : Math.max(0, proj - 40);
    if (!cut) continue;
    px[p] -= cut * u[0];
    px[p + 1] -= cut * u[1];
    px[p + 2] -= cut * u[2];
  }
}

/** Clear every separate blob much smaller than the item itself (AI watermark sparkle, specks). */
function dropSpecks(px, w, h) {
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
      const i = stack[--sp];
      size++;
      const x = i % w;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
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
  const min = Math.max(40, Math.max(0, ...sizes) * 0.015);
  for (let i = 0; i < n; i++) if ((label[i] && sizes[label[i]] < min) || (!label[i] && px[i * 4 + 3] < 40)) px[i * 4 + 3] = 0;
}

/** Shrink the edge by `n` px and soften it, so no hard cut-out line or background halo is left. */
function softEdge(px, w, h, n) {
  const a = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + 3];
  for (let it = 0; it < n; it++) {
    const b = a.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        a[i] = Math.min(b[i], b[i - 1], b[i + 1], b[i - w], b[i + w]);
      }
    }
  }
  const b = a.slice();
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (b[i] === 255 && b[i - 1] === 255 && b[i + 1] === 255 && b[i - w] === 255 && b[i + w] === 255) continue;
      a[i] = (b[i] * 4 + b[i - 1] + b[i + 1] + b[i - w] + b[i + w] + b[i - w - 1] + b[i - w + 1] + b[i + w - 1] + b[i + w + 1]) / 12;
    }
  }
  for (let i = 0; i < w * h; i++) px[i * 4 + 3] = a[i];
}

/** The product photo as a clean cut-out. */
function prepareItem(img, { tol, clean, edge }) {
  const c = cutOut(img, tol);
  if (!clean && !edge) return c;
  const ctx = ctx2(c);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  if (clean) {
    dropSpecks(data.data, c.width, c.height);
    despill(data.data, c.width, c.height, c.key);
  }
  if (edge) softEdge(data.data, c.width, c.height, edge - 1);
  ctx.putImageData(data, 0, 0);
  return c;
}

const isSkin = (d, p) => {
  const r = d[p];
  const g = d[p + 1];
  const b = d[p + 2];
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 40 && cb >= 75 && cb <= 135 && cr >= 132 && cr <= 182;
};

/**
 * The model's face and neck skin (half size), found from the body's outline: head, the narrowest row
 * below it (neck) and the shoulders. Painted into the erase mask, it puts the neck in front of a collar.
 */
function neckMask(base) {
  const c = mk(MW, MH);
  const x = ctx2(c);
  x.drawImage(base, 0, 0, MW, MH);
  const d = x.getImageData(0, 0, MW, MH).data;
  const solid = (i) => d[i * 4 + 3] > 128;
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < MH; y++) {
    for (let i = y * MW, e = i + MW; i < e; i++) {
      if (solid(i)) {
        if (y0 < 0) y0 = y;
        y1 = y;
        break;
      }
    }
  }
  if (y0 < 0) return null;
  const ph = y1 - y0;
  let sx = 0;
  let sn = 0;
  for (let y = y0; y < y0 + ph * 0.05; y++) {
    for (let i = 0; i < MW; i++) if (solid(y * MW + i)) (sx += i), sn++;
  }
  const cx = Math.round(sx / Math.max(1, sn));
  const run = (y, at = cx) => {
    if (!solid(y * MW + at)) return null;
    let l = at;
    let r = at;
    while (l > 0 && solid(y * MW + l - 1)) l--;
    while (r < MW - 1 && solid(y * MW + r + 1)) r++;
    return [l, r];
  };
  let headY = y0;
  let headW = 0;
  for (let y = y0; y < y0 + ph * 0.14; y++) {
    const rr = run(y);
    if (rr && rr[1] - rr[0] > headW) (headW = rr[1] - rr[0]), (headY = y);
  }
  let neckY = headY;
  let neckW = headW;
  for (let y = headY; y < headY + ph * 0.1; y++) {
    const rr = run(y);
    if (rr && rr[1] - rr[0] < neckW) (neckW = rr[1] - rr[0]), (neckY = y);
  }
  const nr = run(neckY);
  if (!nr || !neckW) return null;
  const ncx = (nr[0] + nr[1]) / 2;
  let shY = neckY;
  for (let y = neckY; y < neckY + ph * 0.12; y++) {
    shY = y;
    const rr = run(y, Math.round(ncx));
    if (rr && rr[1] - rr[0] > 2.2 * neckW) break;
  }
  const yEnd = Math.min(y1, shY + Math.round(neckW * 0.6));
  const out = mk(MW, MH);
  const o = ctx2(out);
  const img = o.createImageData(MW, MH);
  const m = img.data;
  for (let y = y0; y <= yEnd; y++) {
    let l;
    let r;
    if (y <= neckY) {
      const rr = run(y);
      if (!rr) continue;
      [l, r] = rr;
    } else {
      l = Math.max(0, Math.round(ncx - neckW * 0.8));
      r = Math.min(MW - 1, Math.round(ncx + neckW * 0.8));
    }
    for (let xx = l; xx <= r; xx++) {
      const i = y * MW + xx;
      if (solid(i) && isSkin(d, i * 4)) {
        m[i * 4] = m[i * 4 + 1] = m[i * 4 + 2] = 255;
        m[i * 4 + 3] = 255;
      }
    }
  }
  o.putImageData(img, 0, 0);
  // close small holes (shadow under the chin) and soften the edge
  const soft = blurred(out, MW, MH, 3);
  const sd = ctx2(soft).getImageData(0, 0, MW, MH);
  for (let i = 3; i < sd.data.length; i += 4) sd.data[i] = Math.min(255, Math.max(0, (sd.data[i] - 60) * 1.9));
  ctx2(soft).putImageData(sd, 0, 0);
  return soft;
}

/** The base model, loaded so its pixels can be read (its outline for the shadow, its neck). */
function useBase(base) {
  const [img, setImg] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!base) return undefined;
    let alive = true;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const t = ctx2(mk(2, 2));
        t.drawImage(im, 0, 0, 2, 2);
        t.getImageData(0, 0, 1, 1); // throws when the image blocks reading (no CORS)
        if (alive) setImg(im);
      } catch {
        if (alive) setFailed(true);
      }
    };
    im.onerror = () => alive && setFailed(true);
    im.src = imgUrl(base, W);
    return () => {
      alive = false;
    };
  }, [base]);
  return useMemo(() => ({ img, failed }), [img, failed]);
}

/**
 * The finished layer at scale k (1 = 1360 × 2048): the item placed, the erased parts removed,
 * colour matched, depth at its edges, and a soft shadow on the model's body.
 */
function compose({ item, pos, rot, flip, k, mask, look, depth, shadow, base }) {
  const w = Math.round(W * k);
  const h = Math.round(H * k);
  const c = mk(w, h);
  const x = ctx2(c);
  const iw = pos.w * k;
  const ih = iw * (item.height / item.width);
  x.save();
  x.translate(pos.x * k, pos.y * k);
  x.rotate((rot * Math.PI) / 180);
  if (flip) x.scale(-1, 1);
  x.drawImage(item, -iw / 2, -ih / 2, iw, ih);
  x.restore();
  if (mask) {
    x.globalCompositeOperation = 'destination-out';
    x.drawImage(mask, 0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
  }

  // depth: the item gets slightly darker towards its own edges (and around an erased neck), like fabric turning
  // around the body. Only the item's outline is used, so nothing of the model's own clothes shows through.
  const plain = !look.bright && !look.contrast && !look.sat && !look.warm;
  const map = depth > 0 ? ctx2(blurred(c, w, h, Math.max(2, 22 * k))).getImageData(0, 0, w, h).data : null;
  if (map || !plain) {
    const id = x.getImageData(0, 0, w, h);
    const px = id.data;
    const br = 1 + look.bright / 100;
    const ct = 1 + look.contrast / 100;
    const st = 1 + look.sat / 100;
    const wm = look.warm * 0.6;
    const dp = (depth / 100) * 0.5;
    for (let i = 0, n = w * h; i < n; i++) {
      const p = i * 4;
      if (!px[p + 3]) continue;
      let r = px[p] * br;
      let g = px[p + 1] * br;
      let b = px[p + 2] * br;
      r = (r - 128) * ct + 128;
      g = (g - 128) * ct + 128;
      b = (b - 128) * ct + 128;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * st + wm;
      g = l + (g - l) * st;
      b = l + (b - l) * st - wm;
      if (map) {
        const f = 1 - dp * (1 - map[p + 3] / 255);
        r *= f;
        g *= f;
        b *= f;
      }
      px[p] = r;
      px[p + 1] = g;
      px[p + 2] = b;
    }
    x.putImageData(id, 0, 0);
  }
  if (!(shadow > 0 && base.img)) return c;

  // soft shadow of the item, only where it falls on the model
  const s = mk(w, h);
  const sx = s.getContext('2d');
  sx.drawImage(blurred(c, w, h, Math.max(2, 16 * k)), 0, Math.round(7 * k));
  sx.globalCompositeOperation = 'source-in';
  sx.fillStyle = `rgba(0, 0, 0, ${(0.7 * shadow) / 100})`;
  sx.fillRect(0, 0, w, h);
  sx.globalCompositeOperation = 'destination-in';
  sx.drawImage(base.img, 0, 0, w, h);
  const out = mk(w, h);
  const o = out.getContext('2d');
  o.drawImage(s, 0, 0);
  o.drawImage(c, 0, 0);
  return out;
}

const hasTransparency = (img) => {
  const c = mk(8, 8);
  const ctx = ctx2(c);
  ctx.drawImage(img, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  return [0, 7, 56, 63].some((i) => d[i * 4 + 3] < 200);
};

const NO_LOOK = { bright: 0, contrast: 0, sat: 0, warm: 0 };

/**
 * "Place on model": put a product photo (shirt, shoes, bag, jewellery…) on the body model without AI.
 * Drag to move, resize, rotate and mirror; the cut-out is cleaned (background, green fringe, watermark),
 * its colour can be matched, its edges get depth, it casts a soft shadow, and the neck (or anything else)
 * can be brought in front with the erase brush. Saved as a 1360×2048 transparent layer for this body.
 */
export default function PlaceOnModel({ base, face, slot, source, onDone, onClose }) {
  const clothes = CLOTHES.includes(slot);
  const [img, setImg] = useState(null);
  const [error, setError] = useState('');
  const [tol, setTol] = useState(28);
  const [cut, setCut] = useState(true);
  const [clean, setClean] = useState(true);
  const [edge, setEdge] = useState(1);
  const [pos, setPos] = useState(() => startFor(slot, face)); // centre x, y and width, in canvas px
  const [rot, setRot] = useState(0);
  const [flip, setFlip] = useState(false);
  const [look, setLook] = useState(NO_LOOK);
  const [depth, setDepth] = useState(clothes ? 45 : 25);
  const [shadow, setShadow] = useState(clothes ? 45 : 30);
  const [tool, setTool] = useState('move'); // move | erase | restore
  const [brush, setBrush] = useState(40); // diameter in canvas px
  const [zoom, setZoom] = useState(1);
  const [maskVer, setMaskVer] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const view = useRef(null);
  const scroller = useRef(null);
  const ring = useRef(null);
  const drag = useRef(null);
  const mask = useRef(null);
  const undo = useRef([]);
  const neckDone = useRef(false);
  const model = useBase(base);

  if (!mask.current) mask.current = mk(MW, MH);

  // load the photo (File or URL); URLs need CORS so the canvas can be exported (Cloudinary allows it)
  useEffect(() => {
    let url = '';
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      if (hasTransparency(im)) setCut(false); // already a cut-out
      setImg(im);
    };
    im.onerror = () => setError('Could not load this photo. Upload it again from your computer.');
    if (source instanceof Blob) {
      url = URL.createObjectURL(source);
      im.src = url;
    } else im.src = imgUrl(source, 1400);
    return () => url && URL.revokeObjectURL(url);
  }, [source]);

  const item = useMemo(() => (img ? prepareItem(img, { tol: cut ? tol : 0, clean, edge }) : null), [img, cut, tol, clean, edge]);

  // ---- erase mask ----
  const snapshot = () => {
    undo.current.push(ctx2(mask.current).getImageData(0, 0, MW, MH));
    if (undo.current.length > 15) undo.current.shift();
  };
  const undoMask = () => {
    const last = undo.current.pop();
    if (!last) return;
    ctx2(mask.current).putImageData(last, 0, 0);
    setMaskVer((v) => v + 1);
  };
  const clearMask = () => {
    snapshot();
    ctx2(mask.current).clearRect(0, 0, MW, MH);
    setMaskVer((v) => v + 1);
    setNote('');
  };
  const neckFront = (auto) => {
    if (!model.img) return;
    const m = neckMask(model.img);
    if (!m) {
      if (!auto) setNote('Could not find the neck on this model. Use the erase brush instead.');
      return;
    }
    snapshot();
    const x = ctx2(mask.current);
    x.globalCompositeOperation = 'source-over';
    x.drawImage(m, 0, 0);
    setMaskVer((v) => v + 1);
    setNote(auto ? 'The neck was brought in front of the collar automatically. Undo if this item should cover the neck.' : 'Neck and face are in front of the item.');
  };
  // garments with a collar: the neck goes in front once, as soon as the model and the item are ready
  useEffect(() => {
    if (neckDone.current || !model.img || !item || !NECK_FIRST.includes(slot)) return;
    neckDone.current = true;
    neckFront(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.img, item, slot]);

  const dab = (p, from) => {
    const x = ctx2(mask.current);
    x.globalCompositeOperation = tool === 'erase' ? 'source-over' : 'destination-out';
    const r = (brush / 2) * MS;
    const steps = from ? Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / (brush * 0.2))) : 1;
    for (let s = 1; s <= steps; s++) {
      const cx = (from ? from.x + ((p.x - from.x) * s) / steps : p.x) * MS;
      const cy = (from ? from.y + ((p.y - from.y) * s) / steps : p.y) * MS;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.55, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cy, r, 0, Math.PI * 2);
      x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    setMaskVer((v) => v + 1);
  };

  // ---- preview ----
  const viewW = Math.min(W, VIEW * zoom);
  const parts = { item, pos, rot, flip, mask: mask.current, look, depth, shadow, base: model };
  useEffect(() => {
    const c = view.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (item) ctx.drawImage(compose({ ...parts, k: c.width / W }), 0, 0);
  });

  // zooming in keeps the item in the middle of the view
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = (pos.x / W) * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = ((pos.y - (pos.w * (item ? item.height / item.width : 1)) / 3) / H) * el.scrollHeight - el.clientHeight / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const toCanvas = (e) => {
    const r = view.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const moveRing = (e) => {
    const el = ring.current;
    if (!el) return;
    if (tool === 'move' || !e) {
      el.style.display = 'none';
      return;
    }
    const r = view.current.getBoundingClientRect();
    const d = (brush / W) * r.width;
    el.style.display = 'block';
    el.style.width = el.style.height = `${d}px`;
    el.style.left = `${e.clientX - r.left - d / 2}px`;
    el.style.top = `${e.clientY - r.top - d / 2}px`;
  };
  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    if (tool === 'move') {
      drag.current = { dx: p.x - pos.x, dy: p.y - pos.y };
      return;
    }
    snapshot();
    drag.current = { last: p };
    dab(p);
  };
  const onMove = (e) => {
    moveRing(e);
    if (!drag.current) return;
    const p = toCanvas(e);
    if (tool === 'move') setPos((s) => ({ ...s, x: p.x - drag.current.dx, y: p.y - drag.current.dy }));
    else {
      dab(p, drag.current.last);
      drag.current.last = p;
    }
  };
  const onWheel = (e) => {
    if (zoom > 1 || tool !== 'move') return; // zoomed in: the wheel scrolls the view
    setPos((s) => ({ ...s, w: Math.max(30, Math.min(W * 1.5, s.w * (e.deltaY < 0 ? 1.05 : 1 / 1.05))) }));
  };
  const nudge = (dx, dy) => setPos((s) => ({ ...s, x: s.x + dx, y: s.y + dy }));
  const setL = (k) => (e) => setLook((l) => ({ ...l, [k]: Number(e.target.value) }));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const c = compose({ ...parts, k: 1 });
      const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the layer'))), 'image/png'));
      const r = await uploadImage(new File([blob], 'layer.png', { type: 'image/png' }), 'layers');
      onDone(r);
    } catch (e) {
      setError(e.name === 'SecurityError' ? 'This photo blocks editing (no CORS). Upload it from your computer instead.' : e.message);
      setBusy(false);
    }
  };

  const slider = (label, value, min, max, onChange, fmt = (v) => v) => (
    <label className="field place-slider">
      <span className="field-label">
        {label} <code>{fmt(value)}</code>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={onChange} />
    </label>
  );
  const signed = (v) => (v > 0 ? `+${v}` : `${v}`);
  const noBase = model.failed ? <small className="warn-text">The model image could not be read here, so the shadow and neck tools are off.</small> : null;

  return (
    <Modal
      wide
      title="Place on model"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          {error && <span className="err grow">{error}</span>}
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!item || busy}>
            {busy ? <Spinner /> : <Icon name="check" size={16} />} Save layer
          </button>
        </>
      }
    >
      <div className="place">
        <div className="place-left">
          <div className="place-scroll" ref={scroller}>
            <div
              className={`place-view tool-${tool}`}
              style={{
                width: `${zoom * 100}%`,
                // zoomed in: the sharp model image, with the small one underneath while it loads
                backgroundImage: `${zoom > 1 ? `url("${imgUrl(base, 1400)}"), ` : ''}url("${imgUrl(base, 700)}")`,
              }}
              onWheel={onWheel}
            >
              <canvas
                ref={view}
                width={viewW}
                height={(viewW * H) / W}
                data-mask={maskVer}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onPointerLeave={() => moveRing(null)}
              />
              <i className="place-ring" ref={ring} />
              {!img && !error && (
                <span className="place-wait">
                  <Spinner size={22} />
                </span>
              )}
            </div>
          </div>
          <div className="place-bar">
            <div className="seg" role="group" aria-label="Tool">
              {[
                ['move', 'Move', 'pose'],
                ['erase', 'Erase', 'eyeOff'],
                ['restore', 'Restore', 'eye'],
              ].map(([k, label, icon]) => (
                <button key={k} type="button" className={tool === k ? 'on' : ''} onClick={() => setTool(k)} aria-pressed={tool === k}>
                  <Icon name={icon} size={14} /> {label}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Zoom">
              {[1, 2, 3].map((z) => (
                <button key={z} type="button" className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)} aria-pressed={zoom === z}>
                  {z}×
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="place-tools">
          <section>
            <h4>Position</h4>
            <p className="hint">Drag the item onto the model (tool: Move). Scroll on the picture or use the slider to resize.</p>
            {slider('Size', Math.round(pos.w), 30, W * 1.3, (e) => setPos((s) => ({ ...s, w: Number(e.target.value) })), (v) => `${v} px`)}
            {slider('Rotate', rot, -45, 45, (e) => setRot(Number(e.target.value)), (v) => `${v}°`)}
            <div className="place-row">
              <button type="button" className="btn sm" onClick={() => setFlip((f) => !f)}>
                <Icon name="shuffle" size={14} /> Mirror
              </button>
              <span className="nudge">
                <button type="button" className="icon-btn" onClick={() => nudge(0, -2)} aria-label="Move up">
                  <Icon name="up" size={16} />
                </button>
                <button type="button" className="icon-btn" onClick={() => nudge(0, 2)} aria-label="Move down">
                  <Icon name="down" size={16} />
                </button>
                <button type="button" className="icon-btn" onClick={() => nudge(-2, 0)} aria-label="Move left">
                  <span className="flip-x">
                    <Icon name="chevRight" size={16} />
                  </span>
                </button>
                <button type="button" className="icon-btn" onClick={() => nudge(2, 0)} aria-label="Move right">
                  <Icon name="chevRight" size={16} />
                </button>
              </span>
            </div>
          </section>

          <section>
            <h4>Clean cut-out</h4>
            <label className="check">
              <input type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} />
              Remove plain background
            </label>
            {cut && (
              <label className="field place-slider">
                <span className="field-label">
                  Background tolerance <code>{tol}</code>
                </span>
                <input type="range" min="4" max="70" value={tol} onChange={(e) => setTol(Number(e.target.value))} />
                <small className="hint">Raise it if some background stays, lower it if parts of the item disappear.</small>
              </label>
            )}
            <label className="check">
              <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} />
              Remove green edge, watermark and specks
            </label>
            {slider('Soft edge', edge, 0, 4, (e) => setEdge(Number(e.target.value)), (v) => (v ? `${v}` : 'off'))}
          </section>

          <section>
            <h4>Match the model</h4>
            {slider('Depth (darker edges)', depth, 0, 100, (e) => setDepth(Number(e.target.value)), (v) => `${v}%`)}
            {slider('Shadow on the body', shadow, 0, 100, (e) => setShadow(Number(e.target.value)), (v) => `${v}%`)}
            {noBase}
            {slider('Brightness', look.bright, -50, 50, setL('bright'), signed)}
            {slider('Contrast', look.contrast, -50, 50, setL('contrast'), signed)}
            {slider('Colour strength', look.sat, -60, 60, setL('sat'), signed)}
            {slider('Warm / cool', look.warm, -30, 30, setL('warm'), signed)}
            <button type="button" className="btn sm" onClick={() => setLook(NO_LOOK)} disabled={look === NO_LOOK}>
              <Icon name="reset" size={14} /> Original colours
            </button>
          </section>

          <section>
            <h4>In front of the item</h4>
            <p className="hint">
              <b>Erase</b> shows the model through the item (neck behind a collar, hair over a dupatta, hands over a bag). <b>Restore</b> brings the item back. Zoom
              in for small areas.
            </p>
            {slider('Brush', brush, 8, 160, (e) => setBrush(Number(e.target.value)), (v) => `${v} px`)}
            <div className="place-row wrap">
              <button type="button" className="btn sm" onClick={() => neckFront(false)} disabled={!model.img}>
                <Icon name="face" size={14} /> Neck in front
              </button>
              <button type="button" className="btn sm" onClick={undoMask}>
                <Icon name="undo" size={14} /> Undo
              </button>
              <button type="button" className="btn sm" onClick={clearMask}>
                <Icon name="trash" size={14} /> Clear erasing
              </button>
            </div>
            {note && <small className="hint">{note}</small>}
          </section>

          <p className="hint">
            A flat product photo cannot fold around the body. For the most natural shirts and kurtis, make the whole look with Gemini (Looks &amp; Dresses → Add look) and
            use this for shoes, bags, jewellery and dupattas, or to finish a layer.
          </p>
        </div>
      </div>
    </Modal>
  );
}
