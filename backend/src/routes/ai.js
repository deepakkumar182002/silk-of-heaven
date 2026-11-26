import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { uploadBuffer } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { Body, Look, Setting } from '../models/index.js';
import { SLOTS } from '../utils/pieces.js';
import { aiEnabled } from '../services/gemini.js';
import { fetchImage, fitDress, makeLayer, neutralBase, swapFace } from '../services/tryon.js';
import { HEAD_CROP } from '../services/imaging.js';
import { alignToBody, faceEngine, localFaceUp, localSwap } from '../services/faceService.js';
import sharp from 'sharp';

const ALLOWED = ['image/png', 'image/webp', 'image/jpeg', 'image/avif'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Only PNG, WebP, JPEG or AVIF photos are allowed'), { status: 400 }));
  },
});

const bad = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });

/** Only fetch public https images (no localhost / private network addresses). */
function safeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    throw bad('Invalid image URL');
  }
  const host = u.hostname.toLowerCase();
  const privateHost =
    host === 'localhost' ||
    host.endsWith('.local') ||
    /^(127|10|0)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host.includes(':');
  if (u.protocol !== 'https:' || privateHost) throw bad('Image URL must be a public https link');
  return u.toString();
}

/**
 * The base model of a body (Women / Men / Kids…): its own base image, else (first body only) the
 * Site Settings base model, else the body's first live look.
 */
async function baseModelUrl(bodyKey) {
  const bodies = await Body.find({ active: true }).sort({ order: 1, createdAt: 1 }).lean();
  const body = (bodyKey && bodies.find((b) => b.key === String(bodyKey))) || bodies[0];
  if (body?.image) return { url: body.image, source: 'body', body: body.key, face: body.face };
  if (!body || body === bodies[0]) {
    const s = await Setting.findOne({ key: 'site' }).lean();
    if (s?.baseModel) return { url: s.baseModel, source: 'settings', body: body?.key };
  }
  const first = await Look.findOne({ active: true, ...(body ? { body: body.key } : {}) }).sort({ order: 1, createdAt: 1 }).lean();
  return first ? { url: first.image, source: 'look', lookName: first.name, body: body?.key } : { url: '', source: null, body: body?.key };
}

const requireAi = (req, res, next) => (aiEnabled() ? next() : next(bad('AI is not configured. Add GEMINI_API_KEY to backend/.env and restart the API.', 503)));

const store = async (png, folder) => {
  const r = await uploadBuffer(png, folder);
  return { url: r.secure_url, publicId: r.public_id, width: r.width, height: r.height };
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const adminAi = Router();
adminAi.use(requireAuth, requireRole('admin'));

adminAi.get(
  '/status',
  asyncHandler(async (req, res) => {
    res.json({
      enabled: aiEnabled(),
      model: env.gemini.model,
      base: await baseModelUrl(),
      face: await localFaceUp(), // auto-align and face checks need the Python face service
      slots: Object.entries(SLOTS).map(([key, v]) => ({ key, label: v.label, group: v.group })),
    });
  })
);

// Dress photo(s) → the base model wearing it, as a new look cut-out
adminAi.post(
  '/look',
  requireAi,
  upload.array('photos', 4),
  asyncHandler(async (req, res) => {
    if (!req.files?.length) throw bad('Upload at least one photo of the dress');
    const base = req.body.baseUrl ? { url: safeUrl(req.body.baseUrl) } : await baseModelUrl(req.body.body);
    if (!base.url) throw bad('Set an AI base model in Site Settings or add one look first');
    const result = await fitDress({
      baseBuf: await fetchImage(base.url),
      photos: req.files.map((f) => f.buffer),
      notes: String(req.body.notes || '').slice(0, 400),
      keepFace: req.body.keepFace !== 'false',
    });
    const [image, photo] = await Promise.all([
      store(result.png, 'looks'),
      req.body.keepPhoto === 'false' ? null : store(await sharp(req.files[0].buffer).rotate().resize(900, 900, { fit: 'inside' }).webp({ quality: 86 }).toBuffer(), 'items'),
    ]);
    res.status(201).json({ ...image, photo, alignment: result.alignment, warning: result.warning });
  })
);

// Item photo(s) + a look → a mix & match layer for that look
adminAi.post(
  '/layer',
  requireAi,
  upload.array('photos', 3),
  asyncHandler(async (req, res) => {
    const slot = String(req.body.slot || '');
    if (!SLOTS[slot]) throw bad('Choose what kind of item this is');
    const lookImage = safeUrl(req.body.lookImage);
    let photos = req.files?.map((f) => f.buffer) || [];
    if (!photos.length && req.body.photoUrl) photos = [await fetchImage(safeUrl(req.body.photoUrl))];
    if (!photos.length) throw bad('Upload a photo of the item');

    const result = await makeLayer({
      lookBuf: await fetchImage(lookImage),
      photos,
      slot,
      name: String(req.body.name || '').slice(0, 80),
      notes: String(req.body.notes || '').slice(0, 300),
    });
    const [layer, photo] = await Promise.all([
      store(result.png, 'layers'),
      req.files?.length ? store(await sharp(req.files[0].buffer).rotate().resize(900, 900, { fit: 'inside' }).webp({ quality: 86 }).toBuffer(), 'items') : null,
    ]);
    res.status(201).json({ layer, photo, coverage: result.coverage, alignment: result.alignment, warning: result.warning });
  })
);

// A look / layer cut-out → scaled and shifted so the face sits exactly where the body model's face is
adminAi.post(
  '/align',
  asyncHandler(async (req, res) => {
    const image = safeUrl(req.body.image);
    const base = await baseModelUrl(req.body.body);
    if (!base.url) throw bad('This body model has no base image yet. Add it on the Body models page first.');
    if (base.url === image) throw bad('This is the base image of the body model itself, it is already aligned.');
    const [baseBuf, imageBuf] = await Promise.all([fetchImage(base.url), fetchImage(image)]);
    const out = await alignToBody({ baseBuf, imageBuf });
    const stored = await store(out.png, 'looks');
    res.status(201).json({ ...stored, scale: out.scale, dx: out.dx, dy: out.dy, offBefore: out.offBefore, offAfter: out.offAfter, refined: out.refined });
  })
);

// A look → the same model in plain basics, to use as the AI base model
adminAi.post(
  '/base',
  requireAi,
  asyncHandler(async (req, res) => {
    const from = safeUrl(req.body.fromUrl);
    const result = await neutralBase({ fromBuf: await fetchImage(from) });
    res.status(201).json({ ...(await store(result.png, 'base')), alignment: result.alignment });
  })
);

// ---------------------------------------------------------------------------
// Public: website face swap
// ---------------------------------------------------------------------------
export const publicAi = Router();

const faceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.face.perHour,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'You have made a lot of face previews. Please try again in an hour.' },
  skip: (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip), // no limit while developing locally
});

// the Gemini face swap works on a fixed head crop: only for bodies whose face is inside it
const inHeadCrop = (f) => {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  return cx > HEAD_CROP.left + 120 && cx < HEAD_CROP.left + HEAD_CROP.width - 120 && cy > HEAD_CROP.top + 120 && cy < HEAD_CROP.top + HEAD_CROP.height - 120;
};

const requireFace = asyncHandler(async (req, res, next) => {
  req.faceEngine = await faceEngine();
  if (!req.faceEngine) throw bad('Face preview is not available right now.', 503);
  next();
});

publicAi.post(
  '/face',
  requireFace,
  faceLimiter,
  upload.single('photo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw bad('Upload a photo of your face');
    if (req.body.consent !== 'yes') throw bad('Please confirm this is your photo or that you have permission to use it');
    const base = await baseModelUrl(req.body.body);
    if (!base.url) throw bad('Face preview is not available for this model right now', 503);
    if (req.faceEngine === 'gemini' && base.face?.w && !inHeadCrop(base.face)) {
      throw bad('Face preview for this model needs the face service. Please try again later.', 503);
    }
    const baseBuf = await fetchImage(base.url);
    // nothing is stored: the selfie and the result live only in this response
    res.set('Cache-Control', 'no-store');
    if (req.faceEngine === 'local') {
      const out = await localSwap({ selfie: req.file.buffer, baseBuf });
      return res.json({ image: out.image, box: out.box, canvas: out.canvas, notes: out.notes || [], engine: 'local' });
    }
    const out = await swapFace({ baseBuf, selfie: req.file.buffer });
    res.json({ image: `data:image/png;base64,${out.png.toString('base64')}`, box: out.box, canvas: out.canvas, engine: 'gemini' });
  })
);
