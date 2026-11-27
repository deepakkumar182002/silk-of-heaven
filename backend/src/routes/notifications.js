import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole, optionalCustomer } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { destroyImage } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { Customer, Notification, PushSub } from '../models/index.js';
import { pushEnabled, sendNotification } from '../services/notify.js';
import { cleanLink } from '../utils/links.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const who = (req) => req.admin?.name || req.admin?.email || 'admin';

// ---------------------------------------------------------------------------
// Admin: send to everyone or to chosen customers, history, delete
// ---------------------------------------------------------------------------
export const adminNotifications = Router();
adminNotifications.use(requireAuth, requireRole('admin'));

adminNotifications.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = req.query.type === 'order' ? 'order' : 'custom';
    const [items, subscribers, linked] = await Promise.all([
      Notification.find({ type }).sort({ createdAt: -1 }).limit(100).populate('recipients', 'name email phone').lean(),
      PushSub.countDocuments(),
      PushSub.countDocuments({ customer: { $ne: null } }),
    ]);
    res.json({ items, push: { enabled: pushEnabled(), subscribers, loggedIn: linked } });
  })
);

adminNotifications.post(
  '/',
  asyncHandler(async (req, res) => {
    const title = str(req.body.title, 120);
    if (!title) throw bad('Write a title');
    const audience = req.body.audience === 'selected' ? 'selected' : 'all';
    let recipients = [];
    if (audience === 'selected') {
      const ids = (Array.isArray(req.body.recipients) ? req.body.recipients : []).filter((id) => mongoose.isValidObjectId(id)).slice(0, 2000);
      recipients = (await Customer.find({ _id: { $in: ids } }, '_id').lean()).map((c) => c._id);
      if (!recipients.length) throw bad('Choose at least one customer');
    }
    const n = await sendNotification({
      title,
      body: str(req.body.body, 1000),
      image: str(req.body.image, 600),
      imagePublicId: str(req.body.imagePublicId, 200),
      link: cleanLink(req.body.link),
      audience,
      recipients,
      type: 'custom',
      sentBy: who(req),
    });
    res.status(201).json(await Notification.findById(n._id).populate('recipients', 'name email phone').lean());
  })
);

adminNotifications.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad('Not found', 404);
    const n = await Notification.findByIdAndDelete(req.params.id);
    if (!n) throw bad('Not found', 404);
    if (n.imagePublicId && !(await Notification.exists({ imagePublicId: n.imagePublicId }))) await destroyImage(n.imagePublicId);
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Website: the bell (guests see notifications for everyone, logged-in customers also their own),
// and browser push subscriptions
// ---------------------------------------------------------------------------
export const publicNotifications = Router();

publicNotifications.get(
  '/',
  optionalCustomer,
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - 90 * 24 * 3600e3);
    const or = [{ audience: 'all' }];
    if (req.customer) or.push({ recipients: req.customer._id });
    const items = await Notification.find({ createdAt: { $gte: since }, $or: or }).sort({ createdAt: -1 }).limit(40).lean();
    res.set('Cache-Control', 'private, no-store');
    res.json({
      push: pushEnabled() ? { publicKey: env.push.publicKey } : null,
      items: items.map((n) => ({ id: n._id, title: n.title, body: n.body, image: n.image, link: n.link, type: n.type, at: n.createdAt })),
    });
  })
);

const subLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests' } });
const validSub = (s) =>
  s && typeof s.endpoint === 'string' && /^https:\/\/[^\s]{10,800}$/.test(s.endpoint) && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string' && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;

// save (or re-link to the logged-in customer) this browser's push subscription
publicNotifications.post(
  '/push/subscribe',
  subLimiter,
  optionalCustomer,
  asyncHandler(async (req, res) => {
    if (!pushEnabled()) throw bad('Push notifications are not set up', 503);
    const s = req.body.subscription;
    if (!validSub(s)) throw bad('Invalid subscription');
    await PushSub.findOneAndUpdate(
      { endpoint: s.endpoint },
      {
        $set: { keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, userAgent: str(req.get('user-agent'), 200), ...(req.customer ? { customer: req.customer._id } : {}) },
      },
      { upsert: true }
    );
    res.json({ ok: true });
  })
);

publicNotifications.post(
  '/push/unsubscribe',
  subLimiter,
  asyncHandler(async (req, res) => {
    const endpoint = str(req.body.endpoint, 900);
    if (endpoint) await PushSub.deleteOne({ endpoint });
    res.json({ ok: true });
  })
);
