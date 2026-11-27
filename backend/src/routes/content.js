import { Router } from 'express';
import mongoose from 'mongoose';
import {
  AUDIENCES,
  Body,
  Category,
  Filter,
  Identity,
  Item,
  ItemCategory,
  Look,
  Promo,
  Review,
  Setting,
  TuneGroup,
  TUNE_KEYS,
} from '../models/index.js';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { PAGES, defaultPages } from '../utils/pages.js';
import { contactMail, sendMail } from '../services/mailer.js';
import { razorpayEnabled } from '../services/razorpay.js';
import { smsEnabled } from '../services/sms.js';
import { googleEnabled } from '../services/firebase.js';
import { shopConfig } from '../services/shop.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { destroyImage } from '../config/cloudinary.js';
import { crudRouter } from './crud.js';
import { cleanLink } from '../utils/links.js';
import { GROUPS, ITEM_GROUP, SLOTS, SLOT_KEYS, normalizeItem, normalizePiece } from '../utils/pieces.js';
import { detectFace, faceEngine } from '../services/faceService.js';
import { fetchImage } from '../services/tryon.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const KEY_RE = /^[a-z0-9-]{1,40}$/;
const dropUnused = async (oldIds, newIds) => {
  const keep = new Set(newIds);
  await Promise.all(oldIds.filter((id) => id && !keep.has(id)).map(destroyImage));
};

// Cloudinary ids of every image a look owns (cut-out + item photos + mix & match layers)
const lookImageIds = (l) => [
  l.imagePublicId,
  ...GROUPS.flatMap((g) => (l.pieces?.[g] || []).flatMap((p) => [p.photoPublicId, p.layerPublicId])),
].filter(Boolean);
const itemImageIds = (it) => [it.photoPublicId, ...(it.layers || []).map((l) => l.imagePublicId)].filter(Boolean);

const r = Router();

// ---------- Admin CRUD ----------
r.use(
  '/looks',
  crudRouter(Look, {
    fields: ['name', 'category', 'body', 'image', 'imagePublicId', 'pieces', 'items', 'order', 'active'],
    hooks: {
      beforeSave: async (data) => {
        if (data.body !== undefined && !(await Body.exists({ key: String(data.body) }))) throw bad('Choose a body model for this look');
        if (data.items !== undefined) {
          // only real library items, each once
          const list = Array.isArray(data.items) ? data.items : [];
          const ids = [...new Set(list.map((x) => String(x?.item || '')).filter((id) => mongoose.isValidObjectId(id)))];
          const found = new Set((await Item.find({ _id: { $in: ids } }, '_id')).map((x) => String(x._id)));
          const seen = new Set();
          data.items = list
            .filter((x) => found.has(String(x?.item)) && !seen.has(String(x.item)) && seen.add(String(x.item)))
            .map((x) => ({ item: x.item, defaultOn: !!x.defaultOn }));
        }
      },
      afterUpdate: (old, doc) => dropUnused(lookImageIds(old), lookImageIds(doc)),
      afterDelete: (doc) => Promise.all(lookImageIds(doc).map(destroyImage)),
    },
  })
);
r.use('/categories', crudRouter(Category, { fields: ['key', 'label', 'icon', 'order'] }));
r.use(
  '/identities',
  crudRouter(Identity, {
    fields: ['name', 'age', 'city', 'temp', 'body', 'order'],
    hooks: {
      beforeSave: async (data) => {
        if (data.body !== undefined && !(await Body.exists({ key: String(data.body) }))) throw bad('Choose a body model');
      },
    },
  })
);

// ---------- Body models (Women / Men / Kids …) ----------
r.use(
  '/bodies',
  crudRouter(Body, {
    fields: ['key', 'name', 'audience', 'image', 'imagePublicId', 'height', 'order', 'active'],
    hooks: {
      beforeSave: async (data, old) => {
        if (old) delete data.key; // looks, characters and item layers refer to it
        else if (!KEY_RE.test(String(data.key || ''))) throw bad('Key must be lowercase letters, numbers or dashes');
        if (data.audience !== undefined && !AUDIENCES.includes(data.audience)) throw bad('Audience must be women, men or kids');
        // face position on the base model: used for the avatar crop and checked by the face swap
        if (data.image && (data.image !== old?.image || !old?.face?.w)) {
          data.face = (await detectFace(await fetchImage(data.image).catch(() => null)).catch(() => null)) || undefined;
        } else if (data.image === '') data.face = undefined;
      },
      beforeDelete: async (doc) => {
        const looks = await Look.countDocuments({ body: doc.key });
        if (looks) throw bad(`${looks} look${looks === 1 ? ' uses' : 's use'} this body model. Move or delete them first.`, 409);
        if ((await Body.countDocuments()) <= 1) throw bad('Keep at least one body model', 409);
      },
      afterUpdate: (old, doc) => dropUnused([old.imagePublicId], [doc.imagePublicId]),
      afterDelete: async (doc) => {
        await destroyImage(doc.imagePublicId);
        const items = await Item.find({ 'layers.body': doc.key });
        for (const it of items) {
          const gone = it.layers.filter((l) => l.body === doc.key);
          it.layers = it.layers.filter((l) => l.body !== doc.key);
          await it.save();
          await Promise.all(gone.map((l) => destroyImage(l.imagePublicId)));
        }
        await Identity.updateMany({ body: doc.key }, { $set: { body: (await Body.findOne().sort({ order: 1 }))?.key || 'women' } });
      },
    },
  })
);

// ---------- Item library: categories ----------
r.use(
  '/item-categories',
  crudRouter(ItemCategory, {
    fields: ['key', 'label', 'slot', 'multi', 'icon', 'sizes', 'order'],
    hooks: {
      beforeSave: async (data, old) => {
        if (old) delete data.key; // items refer to it
        else if (!KEY_RE.test(String(data.key || ''))) throw bad('Key must be lowercase letters, numbers or dashes');
        if (data.slot !== undefined && data.slot !== 'none' && !SLOT_KEYS.includes(data.slot)) throw bad('Unknown position on the model');
        if (data.sizes !== undefined) data.sizes = (Array.isArray(data.sizes) ? data.sizes : []).map((s) => String(s).trim()).filter(Boolean);
      },
      beforeDelete: async (doc) => {
        const n = await Item.countDocuments({ category: doc.key });
        if (n) throw bad(`${n} item${n === 1 ? ' is' : 's are'} in this category. Move or delete ${n === 1 ? 'it' : 'them'} first.`, 409);
      },
    },
  })
);

// ---------- Item library: items ----------
r.use(
  '/items',
  crudRouter(Item, {
    fields: ['name', 'category', 'price', 'color', 'colors', 'sizes', 'description', 'fabric', 'care', 'madeToOrder', 'leadTimeDays', 'stock', 'photo', 'photoPublicId', 'layers', 'active', 'order'],
    hooks: {
      beforeSave: async (data, old) => {
        if (data.category !== undefined || !old) {
          if (!(await ItemCategory.exists({ key: String(data.category || '') }))) throw bad('Choose a category for this item');
        }
        if (data.layers !== undefined) {
          const keys = new Set((await Body.find({}, 'key')).map((b) => b.key));
          const seen = new Set();
          data.layers = (Array.isArray(data.layers) ? data.layers : []).filter(
            (l) => l?.image && keys.has(l.body) && !seen.has(l.body) && seen.add(l.body)
          );
        }
      },
      afterUpdate: (old, doc) => dropUnused(itemImageIds(old), itemImageIds(doc)),
      afterDelete: async (doc) => {
        await Look.updateMany({ 'items.item': doc._id }, { $pull: { items: { item: doc._id } } });
        await Promise.all(itemImageIds(doc).map(destroyImage));
      },
    },
  })
);
r.use('/filters', crudRouter(Filter, { fields: ['name', 'filter', 'tint', 'order'] }));

// ---------- Promotions: announcement bar, shop banners, offer popups ----------
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const promoMedia = (p) => [
  [p.mediaPublicId, p.mediaType === 'video' ? 'video' : 'image'],
  [p.mobileMediaPublicId, 'image'],
];
r.use(
  '/promos',
  crudRouter(Promo, {
    fields: ['kind', 'title', 'text', 'media', 'mediaPublicId', 'mediaType', 'mobileMedia', 'mobileMediaPublicId', 'link', 'buttonText', 'textColor', 'align', 'autoClose', 'delay', 'startsAt', 'endsAt', 'active', 'order'],
    sort: { kind: 1, order: 1, createdAt: 1 },
    hooks: {
      beforeSave: async (data, old) => {
        if (old) delete data.kind; // a banner stays a banner
        const kind = old?.kind || data.kind;
        if (!['announcement', 'banner', 'popup'].includes(kind)) throw bad('Choose announcement, banner or popup');
        for (const [k, max] of [['title', 120], ['text', kind === 'popup' ? 600 : 240], ['buttonText', 40]]) {
          if (data[k] !== undefined) data[k] = String(data[k]).trim().slice(0, max);
        }
        if (data.link !== undefined) data.link = cleanLink(data.link);
        if (data.textColor !== undefined && !COLOR_RE.test(data.textColor)) data.textColor = '#ffffff';
        if (data.mediaType !== undefined && data.mediaType !== 'video') data.mediaType = 'image';
        for (const k of ['startsAt', 'endsAt']) {
          if (data[k] === undefined) continue;
          if (!data[k]) data[k] = null;
          else if (Number.isNaN(new Date(data[k]).getTime())) throw bad('Invalid date');
        }
        const m = { ...(old || {}), ...data };
        if (m.startsAt && m.endsAt && new Date(m.endsAt) < new Date(m.startsAt)) throw bad('The end date is before the start date');
        if (kind === 'announcement' && !m.text) throw bad('Write the announcement text');
        if (kind === 'banner' && !m.media) throw bad('Add a banner image');
        if (kind === 'banner' && m.mediaType === 'video') throw bad('Banners take an image or GIF');
        if (kind === 'popup' && !m.media && !m.title && !m.text) throw bad('Add an image / video or some text');
      },
      afterUpdate: async (old, doc) => {
        const now = new Set([doc.mediaPublicId, doc.mobileMediaPublicId].filter(Boolean));
        await Promise.all(promoMedia(old).filter(([id]) => id && !now.has(id)).map(([id, t]) => destroyImage(id, t)));
      },
      afterDelete: async (doc) => {
        await Promise.all(promoMedia(doc).filter(([id]) => id).map(([id, t]) => destroyImage(id, t)));
      },
    },
  })
);

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

r.get(
  '/settings',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const s = await getSettings();
    res.json({
      ...s.toObject(),
      shop: shopConfig(s),
      defaultPages: defaultPages({ name: env.storeName, store: s.store || {}, shop: shopConfig(s) }),
      services: { razorpay: razorpayEnabled(), sms: smsEnabled(), google: googleEnabled(), mail: !!(env.mail.user && env.mail.pass) },
    });
  })
);
r.put(
  '/settings',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const s = await getSettings();
    const oldPublicId = s.backgroundPublicId;
    const oldBaseId = s.baseModelPublicId;
    for (const f of ['background', 'backgroundPublicId', 'baseModel', 'baseModelPublicId', 'traits', 'defaultTraits']) {
      if (req.body[f] !== undefined) s[f] = req.body[f];
    }
    // shop, business details and pages: only known keys
    const num = (v, min, max) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
    };
    if (req.body.shop && typeof req.body.shop === 'object') {
      const b = req.body.shop;
      const set = (k, v) => v !== undefined && s.set(`shop.${k}`, v);
      set('gstRate', num(b.gstRate, 0, 40));
      set('shippingFee', num(b.shippingFee, 0, 100000));
      set('freeShippingOver', num(b.freeShippingOver, 0, 10000000));
      set('codFee', num(b.codFee, 0, 100000));
      set('returnWindowDays', num(b.returnWindowDays, 0, 90));
      for (const k of ['pricesIncludeTax', 'onlinePayments', 'codEnabled', 'reviewsAutoApprove']) if (b[k] !== undefined) set(k, !!b[k]);
    }
    if (req.body.store && typeof req.body.store === 'object') {
      for (const k of ['legalName', 'gstin', 'address', 'phone', 'email', 'whatsapp', 'instagram']) {
        if (req.body.store[k] !== undefined) s.set(`store.${k}`, String(req.body.store[k]).trim().slice(0, k === 'address' ? 400 : 120));
      }
      if (s.store.gstin && !/^[0-9A-Z]{15}$/.test(s.store.gstin.toUpperCase())) throw bad('GSTIN must be 15 letters and numbers');
      s.set('store.gstin', (s.store.gstin || '').toUpperCase());
    }
    if (req.body.promo && typeof req.body.promo === 'object') {
      const b = req.body.promo;
      for (const k of ['barBg', 'barColor']) if (b[k] !== undefined && COLOR_RE.test(b[k])) s.set(`promo.${k}`, b[k]);
      const speed = num(b.barSpeed, 10, 200);
      if (speed !== undefined) s.set('promo.barSpeed', speed);
      const every = num(b.bannerInterval, 2, 30);
      if (every !== undefined) s.set('promo.bannerInterval', every);
    }
    if (req.body.pages && typeof req.body.pages === 'object') {
      for (const [k] of PAGES) if (req.body.pages[k] !== undefined) s.set(`pages.${k}`, String(req.body.pages[k]).slice(0, 20000));
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
    const [looks, activeLooks, categories, identities, filters, items, bodies] = await Promise.all([
      Look.countDocuments(),
      Look.countDocuments({ active: true }),
      Category.countDocuments(),
      Identity.countDocuments(),
      Filter.countDocuments(),
      Item.countDocuments(),
      Body.countDocuments(),
    ]);
    const s = await getSettings();
    res.json({ looks, activeLooks, categories, identities, filters, items, bodies, traits: s.traits.length });
  })
);

export default r;

// ---------- Public catalog for the website ----------
export const publicRouter = Router();
publicRouter.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const [looks, categories, identities, tune, filters, settings, bodies, itemCats, items, ratings, promos] = await Promise.all([
      Look.find({ active: true }).sort({ order: 1, createdAt: 1 }).lean(),
      Category.find().sort({ order: 1, createdAt: 1 }).lean(),
      Identity.find().sort({ order: 1, createdAt: 1 }).lean(),
      TuneGroup.find().lean(),
      Filter.find().sort({ order: 1, createdAt: 1 }).lean(),
      getSettings(),
      Body.find({ active: true }).sort({ order: 1, createdAt: 1 }).lean(),
      ItemCategory.find().sort({ order: 1, createdAt: 1 }).lean(),
      Item.find({ active: true }).lean(),
      Review.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }]),
      Promo.find({
        active: true,
        $and: [{ $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }, { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] }],
      })
        .sort({ order: 1, createdAt: 1 })
        .lean(),
    ]);
    const bodyKeys = new Set(bodies.map((b) => b.key));
    const catByKey = new Map(itemCats.map((c) => [c.key, c]));
    const itemById = new Map(items.filter((it) => catByKey.has(it.category)).map((it) => [String(it._id), it]));

    // library items attached to a look, as extra shop groups "x:<category>" next to tops, bottoms…
    const attached = (l) => {
      const out = Object.fromEntries(itemCats.map((c) => [ITEM_GROUP + c.key, []]));
      for (const a of l.items || []) {
        const it = itemById.get(String(a.item));
        if (!it) continue;
        const cat = catByKey.get(it.category);
        const layer = cat.slot !== 'none' && (it.layers || []).find((x) => x.body === (l.body || 'women'));
        out[ITEM_GROUP + cat.key].push({
          id: it._id,
          item: true,
          name: it.name,
          color: it.color,
          price: it.price,
          ...normalizeItem(it, cat),
          ...(it.stock != null && !it.madeToOrder ? { stock: it.stock } : {}),
          ...(it.photo ? { photo: it.photo } : {}),
          ...(layer ? { layer: layer.image, slot: cat.slot, multi: !!cat.multi, defaultOn: !!a.defaultOn } : {}),
        });
      }
      return out;
    };

    res.set('Cache-Control', 'public, max-age=30');
    res.json({
      looks: looks
        .filter((l) => bodyKeys.has(l.body || 'women'))
        .map((l) => ({
          id: l._id,
          name: l.name,
          category: l.category,
          body: l.body || 'women',
          image: l.image,
          pieces: {
            ...Object.fromEntries(
              GROUPS.map((g) => [
                g,
                (l.pieces?.[g] || []).map((p) => ({
                  id: p._id,
                  name: p.name,
                  color: p.color,
                  price: p.price,
                  ...normalizePiece(p, g),
                  ...(p.stock != null && !normalizePiece(p, g).madeToOrder ? { stock: p.stock } : {}),
                  ...(p.photo ? { photo: p.photo } : {}),
                  ...(p.layer ? { layer: p.layer, slot: SLOTS[p.slot] ? p.slot : '', defaultOn: !!p.defaultOn } : {}),
                })),
              ])
            ),
            ...attached(l),
          },
        })),
      bodies: bodies.map(({ key, name, audience, image, height, face }) => ({ key, name, audience, image, height, ...(face?.w ? { face } : {}) })),
      itemCategories: itemCats.map(({ key, label, slot, multi, icon }) => ({ key: ITEM_GROUP + key, label, slot, multi: !!multi, icon })),
      categories: categories.map(({ key, label, icon }) => ({ key, label, icon })),
      identities: identities.map(({ name, age, city, temp, body }) => ({ name, age, city, temp, body: body || 'women' })),
      tune: Object.fromEntries(
        tune.map(({ key, presets, swatches, sliders, multi, multiLabel }) => [
          key,
          { presets, swatches, sliders, multi, multiLabel },
        ])
      ),
      filters: filters.map(({ name, filter, tint }) => ({ name, filter, tint })),
      ratings: Object.fromEntries(ratings.map((x) => [x._id, { avg: Math.round(x.avg * 10) / 10, count: x.count }])),
      shop: (() => {
        const c = shopConfig(settings);
        return {
          currency: 'INR',
          gstRate: c.gstRate,
          pricesIncludeTax: c.pricesIncludeTax,
          shippingFee: c.shippingFee,
          freeShippingOver: c.freeShippingOver,
          cod: c.codEnabled,
          codFee: c.codFee,
          online: c.onlinePayments && razorpayEnabled(),
          returnWindowDays: c.returnWindowDays,
        };
      })(),
      store: { name: env.storeName, ...(settings.store?.toObject?.() || settings.store || {}) },
      pages: (() => {
        const def = defaultPages({ name: env.storeName, store: settings.store || {}, shop: shopConfig(settings) });
        return PAGES.map(([key, title]) => ({ key, title, text: settings.pages?.[key]?.trim() || def[key] }));
      })(),
      auth: { phone: smsEnabled() || !env.production, google: googleEnabled() },
      promos: (() => {
        const p = settings.promo || {};
        const of = (k) => promos.filter((x) => x.kind === k);
        return {
          bar: { bg: p.barBg || '#b0154a', color: p.barColor || '#ffffff', speed: p.barSpeed || 40 },
          bannerInterval: p.bannerInterval || 5,
          announcements: of('announcement').map((x) => ({ id: x._id, text: x.text, link: x.link })),
          banners: of('banner').map((x) => ({
            id: x._id,
            title: x.title,
            text: x.text,
            image: x.media,
            mobileImage: x.mobileMedia,
            link: x.link,
            buttonText: x.buttonText,
            textColor: x.textColor,
            align: x.align,
          })),
          popups: of('popup').map((x) => ({
            id: x._id,
            title: x.title,
            text: x.text,
            media: x.media,
            mediaType: x.mediaType,
            link: x.link,
            buttonText: x.buttonText,
            autoClose: x.autoClose,
            delay: x.delay,
          })),
        };
      })(),
      settings: {
        background: settings.background,
        traits: settings.traits,
        defaultTraits: settings.defaultTraits,
        faceSwap: !!(await faceEngine()),
      },
    });
  })
);

// ---------- Reviews of a product ----------
publicRouter.get(
  '/reviews',
  asyncHandler(async (req, res) => {
    const productId = String(req.query.product || '').slice(0, 40);
    if (!mongoose.isValidObjectId(productId)) return res.json({ reviews: [], avg: 0, count: 0 });
    const reviews = await Review.find({ productId, status: 'approved' }).sort({ createdAt: -1 }).limit(50).lean();
    const count = reviews.length;
    res.json({
      count,
      avg: count ? Math.round((reviews.reduce((n, r) => n + r.rating, 0) / count) * 10) / 10 : 0,
      reviews: reviews.map((r) => ({ id: r._id, name: r.name, rating: r.rating, title: r.title, text: r.text, verified: r.verified, at: r.createdAt })),
    });
  })
);

// ---------- Contact form ----------
const contactLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many messages, please try again later.' } });
publicRouter.post(
  '/contact',
  contactLimiter,
  asyncHandler(async (req, res) => {
    const f = (k, max) => String(req.body[k] ?? '').trim().slice(0, max);
    const msg = { name: f('name', 80), email: f('email', 120), phone: f('phone', 20), message: f('message', 3000) };
    if (msg.name.length < 2) throw bad('Please enter your name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email) && msg.phone.replace(/\D/g, '').length < 10) throw bad('Add your email or phone so we can reply');
    if (msg.message.length < 5) throw bad('Please write your message');
    if (!(await sendMail(contactMail(msg)))) throw bad('Could not send your message right now. Please email or call us instead.', 503);
    res.json({ ok: true });
  })
);

// ---------- Sitemap (the website proxies /sitemap.xml here) ----------
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';
publicRouter.get(
  '/sitemap.xml',
  asyncHandler(async (req, res) => {
    const base = env.siteUrl;
    const looks = await Look.find({ active: true }).lean();
    const items = new Map((await Item.find({ active: true }, 'name').lean()).map((i) => [String(i._id), i]));
    const urls = new Set([`${base}/shop`, `${base}/fitting-room`, ...PAGES.map(([k]) => `${base}/pages/${k}`)]);
    for (const l of looks) {
      for (const g of GROUPS) for (const p of l.pieces?.[g] || []) urls.add(`${base}/product/${slug(p.name)}-${p._id}`);
      for (const a of l.items || []) {
        const it = items.get(String(a.item));
        if (it) urls.add(`${base}/product/${slug(it.name)}-${it._id}`);
      }
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls]
      .map((u) => `  <url><loc>${u.replace(/&/g, '&amp;')}</loc></url>`)
      .join('\n')}\n</urlset>\n`;
    res.set({ 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' });
    res.send(xml);
  })
);
