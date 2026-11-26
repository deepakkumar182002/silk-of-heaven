import { Router } from 'express';
import { Category, Filter, Identity, Look, Setting, TuneGroup, TUNE_KEYS } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { destroyImage } from '../config/cloudinary.js';
import { crudRouter } from './crud.js';
import { GROUPS, SLOTS, normalizePiece } from '../utils/pieces.js';
import { faceEngine } from '../services/faceService.js';

// Cloudinary ids of every image a look owns (cut-out + item photos + mix & match layers)
const lookImageIds = (l) => [
  l.imagePublicId,
  ...GROUPS.flatMap((g) => (l.pieces?.[g] || []).flatMap((p) => [p.photoPublicId, p.layerPublicId])),
].filter(Boolean);

const r = Router();

// ---------- Admin CRUD ----------
r.use(
  '/looks',
  crudRouter(Look, {
    fields: ['name', 'category', 'image', 'imagePublicId', 'pieces', 'order', 'active'],
    hooks: {
      afterUpdate: async (old, doc) => {
        const keep = new Set(lookImageIds(doc));
        await Promise.all(lookImageIds(old).filter((id) => !keep.has(id)).map(destroyImage));
      },
      afterDelete: (doc) => Promise.all(lookImageIds(doc).map(destroyImage)),
    },
  })
);
r.use('/categories', crudRouter(Category, { fields: ['key', 'label', 'icon', 'order'] }));
r.use('/identities', crudRouter(Identity, { fields: ['name', 'age', 'city', 'temp', 'order'] }));
r.use('/filters', crudRouter(Filter, { fields: ['name', 'filter', 'tint', 'order'] }));

// ---------- Tune groups (fixed keys, edit only) ----------
r.get(
  '/tune',
  requireAuth, requireRole('admin'),
  asyncHandler(async (req, res) => {
    const docs = await TuneGroup.find();
    res.json(TUNE_KEYS.map((k) => docs.find((d) => d.key === k)).filter(Boolean));
  })
);
r.put(
  '/tune/:key',
  requireAuth, requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (!TUNE_KEYS.includes(req.params.key)) return res.status(404).json({ message: 'Unknown styling group' });
    const { presets, swatches, sliders, multi, multiLabel } = req.body;
    const doc = await TuneGroup.findOneAndUpdate(
      { key: req.params.key },
      { $set: { presets, swatches, sliders, multi, multiLabel } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(doc);
  })
);

// ---------- Settings (singleton) ----------
const getSettings = async () => (await Setting.findOne({ key: 'site' })) || Setting.create({ key: 'site' });

r.get('/settings', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => res.json(await getSettings())));
r.put(
  '/settings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const s = await getSettings();
    const oldPublicId = s.backgroundPublicId;
    const oldBaseId = s.baseModelPublicId;
    for (const f of ['background', 'backgroundPublicId', 'baseModel', 'baseModelPublicId', 'traits', 'defaultTraits']) {
      if (req.body[f] !== undefined) s[f] = req.body[f];
    }
    await s.save();
    if (oldPublicId && oldPublicId !== s.backgroundPublicId) await destroyImage(oldPublicId);
    if (oldBaseId && oldBaseId !== s.baseModelPublicId) await destroyImage(oldBaseId);
    res.json(s);
  })
);

// ---------- Dashboard stats ----------
r.get(
  '/stats',
  requireAuth, requireRole('admin'),
  asyncHandler(async (req, res) => {
    const [looks, activeLooks, categories, identities, filters] = await Promise.all([
      Look.countDocuments(),
      Look.countDocuments({ active: true }),
      Category.countDocuments(),
      Identity.countDocuments(),
      Filter.countDocuments(),
    ]);
    const s = await getSettings();
    res.json({ looks, activeLooks, categories, identities, filters, traits: s.traits.length });
  })
);

export default r;

// ---------- Public catalog for the website ----------
export const publicRouter = Router();
publicRouter.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const [looks, categories, identities, tune, filters, settings] = await Promise.all([
      Look.find({ active: true }).sort({ order: 1, createdAt: 1 }).lean(),
      Category.find().sort({ order: 1, createdAt: 1 }).lean(),
      Identity.find().sort({ order: 1, createdAt: 1 }).lean(),
      TuneGroup.find().lean(),
      Filter.find().sort({ order: 1, createdAt: 1 }).lean(),
      getSettings(),
    ]);
    res.set('Cache-Control', 'public, max-age=30');
    res.json({
      looks: looks.map((l) => ({
        id: l._id,
        name: l.name,
        category: l.category,
        image: l.image,
        pieces: Object.fromEntries(
          GROUPS.map((g) => [
            g,
            (l.pieces?.[g] || []).map((p) => ({
              id: p._id,
              name: p.name,
              color: p.color,
              price: p.price,
              ...normalizePiece(p, g),
              ...(p.photo ? { photo: p.photo } : {}),
              ...(p.layer ? { layer: p.layer, slot: SLOTS[p.slot] ? p.slot : '', defaultOn: !!p.defaultOn } : {}),
            })),
          ])
        ),
      })),
      categories: categories.map(({ key, label, icon }) => ({ key, label, icon })),
      identities: identities.map(({ name, age, city, temp }) => ({ name, age, city, temp })),
      tune: Object.fromEntries(
        tune.map(({ key, presets, swatches, sliders, multi, multiLabel }) => [
          key,
          { presets, swatches, sliders, multi, multiLabel },
        ])
      ),
      filters: filters.map(({ name, filter, tint }) => ({ name, filter, tint })),
      settings: {
        background: settings.background,
        traits: settings.traits,
        defaultTraits: settings.defaultTraits,
        faceSwap: !!(await faceEngine()),
      },
    });
  })
);
