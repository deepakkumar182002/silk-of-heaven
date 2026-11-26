import { useEffect, useMemo, useRef, useState } from 'react';
import { imgUrl, uploadImage } from '../api.js';
import Icon from './icons.jsx';
import { Modal, Spinner } from './ui.jsx';

const W = 1360;
const H = 2048;
const VIEW = 340; // preview width in px (canvas is drawn at VIEW / W)

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

/**
 * Remove a plain background: flood fill from the image border over pixels close to the border colour,
 * with a soft edge. Product photos on white / grey / any flat colour come out as cut-outs.
 */
function cutOut(img, tolerance) {
  const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
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
  return c;
}

const hasTransparency = (img) => {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  return [0, 7, 56, 63].some((i) => d[i * 4 + 3] < 200);
};

/**
 * "Place on model": put a product photo (shoes, bag, jewellery…) on the body model without AI.
 * Drag to move, scroll or slider to resize, rotate and mirror, remove a plain background,
 * then it is saved as a 1360×2048 transparent layer that lines up with every look of this body.
 */
export default function PlaceOnModel({ base, face, slot, source, onDone, onClose }) {
  const [img, setImg] = useState(null);
  const [error, setError] = useState('');
  const [tol, setTol] = useState(28);
  const [cut, setCut] = useState(true);
  const [pos, setPos] = useState(() => startFor(slot, face)); // centre x, y and width, in canvas px
  const [rot, setRot] = useState(0);
  const [flip, setFlip] = useState(false);
  const [busy, setBusy] = useState(false);
  const view = useRef(null);
  const drag = useRef(null);

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

  const item = useMemo(() => (img ? cutOut(img, cut ? tol : 0) : null), [img, cut, tol]);

  const draw = (ctx, k) => {
    if (!item) return;
    const w = pos.w * k;
    const h = w * (item.height / item.width);
    ctx.save();
    ctx.translate(pos.x * k, pos.y * k);
    ctx.rotate((rot * Math.PI) / 180);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(item, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  useEffect(() => {
    const c = view.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    draw(ctx, VIEW / W);
  });

  const toCanvas = (e) => {
    const r = view.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    drag.current = { dx: p.x - pos.x, dy: p.y - pos.y };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const p = toCanvas(e);
    setPos((s) => ({ ...s, x: p.x - drag.current.dx, y: p.y - drag.current.dy }));
  };
  const onWheel = (e) => setPos((s) => ({ ...s, w: Math.max(30, Math.min(W * 1.5, s.w * (e.deltaY < 0 ? 1.05 : 1 / 1.05))) }));
  const nudge = (dx, dy) => setPos((s) => ({ ...s, x: s.x + dx, y: s.y + dy }));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      draw(c.getContext('2d'), 1);
      const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not create the layer'))), 'image/png'));
      const r = await uploadImage(new File([blob], 'layer.png', { type: 'image/png' }), 'layers');
      onDone(r);
    } catch (e) {
      setError(e.name === 'SecurityError' ? 'This photo blocks editing (no CORS). Upload it from your computer instead.' : e.message);
      setBusy(false);
    }
  };

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
        <div
          className="place-view"
          style={{ width: VIEW, backgroundImage: `url("${imgUrl(base, 700)}")` }}
          onWheel={onWheel}
        >
          <canvas
            ref={view}
            width={VIEW}
            height={(VIEW * H) / W}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          />
          {!img && !error && (
            <span className="place-wait">
              <Spinner size={22} />
            </span>
          )}
        </div>

        <div className="place-tools">
          <p className="hint">Drag the item onto the model. Scroll on the picture or use the slider to resize. Arrow buttons move it by 2 px.</p>
          <label className="field">
            <span className="field-label">Size · {Math.round(pos.w)} px wide</span>
            <input type="range" min="30" max={W * 1.3} value={pos.w} onChange={(e) => setPos((s) => ({ ...s, w: Number(e.target.value) }))} />
          </label>
          <label className="field">
            <span className="field-label">Rotate · {rot}°</span>
            <input type="range" min="-45" max="45" value={rot} onChange={(e) => setRot(Number(e.target.value))} />
          </label>
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
          <label className="check">
            <input type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} />
            Remove plain background
          </label>
          {cut && (
            <label className="field">
              <span className="field-label">Background tolerance · {tol}</span>
              <input type="range" min="4" max="70" value={tol} onChange={(e) => setTol(Number(e.target.value))} />
              <small className="hint">Raise it if some background stays, lower it if parts of the item disappear.</small>
            </label>
          )}
          <p className="hint">
            Works best for bags, jewellery, sunglasses, dupattas and footwear photographed from the front. For a perfect fit (folds, both feet, the
            right angle) use a layer made in a photo editor or with AI.
          </p>
        </div>
      </div>
    </Modal>
  );
}
