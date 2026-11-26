import { Router } from 'express';
import mongoose from 'mongoose';
import { Coupon, Customer, Order, Review } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { crudRouter } from './crud.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const rx = (q) => new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
// orders that really happened (not unpaid checkouts, not cancelled)
const REAL = { status: { $nin: ['awaiting_payment', 'cancelled'] } };

const r = Router();

// ---------- Coupons ----------
r.use(
  '/coupons',
  crudRouter(Coupon, {
    fields: ['code', 'description', 'type', 'value', 'minSubtotal', 'maxDiscount', 'startsAt', 'endsAt', 'usageLimit', 'perCustomer', 'firstOrderOnly', 'active', 'order'],
    sort: { createdAt: -1 },
    hooks: {
      beforeSave: async (d) => {
        if (d.code !== undefined) {
          d.code = String(d.code).trim().toUpperCase();
          if (!/^[A-Z0-9_-]{3,24}$/.test(d.code)) throw bad('Code: 3–24 letters, numbers, - or _');
        }
        if (d.type === 'percent' && Number(d.value) > 90) throw bad('A percent discount can be at most 90%');
        for (const k of ['startsAt', 'endsAt']) if (d[k] === '') d[k] = null;
      },
    },
  })
);

const admin = [requireAuth, requireRole('admin')];

// ---------- Reviews (moderation) ----------
r.get(
  '/reviews',
  ...admin,
  asyncHandler(async (req, res) => {
    const filter = ['pending', 'approved', 'rejected'].includes(req.query.status) ? { status: req.query.status } : {};
    const [reviews, counts] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1 }).limit(300).populate('customer', 'name email phone'),
      Review.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    res.json({ reviews, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
  })
);
r.put(
  '/reviews/:id',
  ...admin,
  asyncHandler(async (req, res) => {
    if (!['pending', 'approved', 'rejected'].includes(req.body.status)) throw bad('Unknown status');
    const doc = await Review.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }).populate('customer', 'name email phone');
    if (!doc) throw bad('Review not found', 404);
    res.json(doc);
  })
);
r.delete(
  '/reviews/:id',
  ...admin,
  asyncHandler(async (req, res) => {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);

// ---------- Customers ----------
r.get(
  '/customers',
  ...admin,
  asyncHandler(async (req, res) => {
    const q = str(req.query.q, 60);
    const filter = q ? { $or: [{ name: rx(q) }, { email: rx(q) }, { phone: rx(q.replace(/\D/g, '') || q) }] } : {};
    const customers = await Customer.find(filter).sort({ createdAt: -1 }).limit(300).lean();
    const stats = await Order.aggregate([
      { $match: { ...REAL, customerRef: { $in: customers.map((c) => c._id) } } },
      { $group: { _id: '$customerRef', orders: { $sum: 1 }, spent: { $sum: '$total' }, last: { $max: '$createdAt' } } },
    ]);
    const by = new Map(stats.map((s) => [String(s._id), s]));
    res.json(
      customers.map((c) => ({
        _id: c._id,
        name: c.name,
        email: c.email || '',
        phone: c.phone || '',
        login: [c.passwordHash && 'email', c.phoneVerified && 'phone', c.googleUid && 'google'].filter(Boolean),
        createdAt: c.createdAt,
        lastLoginAt: c.lastLoginAt,
        blocked: !!c.blocked,
        addresses: c.addresses?.length || 0,
        wishlist: c.wishlist?.length || 0,
        orders: by.get(String(c._id))?.orders || 0,
        spent: by.get(String(c._id))?.spent || 0,
        lastOrder: by.get(String(c._id))?.last || null,
      }))
    );
  })
);
r.get(
  '/customers/:id',
  ...admin,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad('Customer not found', 404);
    const c = await Customer.findById(req.params.id);
    if (!c) throw bad('Customer not found', 404);
    const [orders, reviews] = await Promise.all([
      Order.find({ customerRef: c._id, status: { $ne: 'awaiting_payment' } }).sort({ createdAt: -1 }).limit(100).select('orderNumber status total createdAt payment items.name items.qty'),
      Review.find({ customer: c._id }).sort({ createdAt: -1 }),
    ]);
    res.json({ customer: c, orders, reviews });
  })
);
r.put(
  '/customers/:id',
  ...admin,
  asyncHandler(async (req, res) => {
    const c = await Customer.findById(req.params.id);
    if (!c) throw bad('Customer not found', 404);
    if (req.body.blocked !== undefined) c.blocked = !!req.body.blocked;
    await c.save();
    res.json({ customer: c });
  })
);

// ---------- Sales reports ----------
r.get(
  '/reports',
  ...admin,
  asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 366);
    const from = new Date(Date.now() - days * 86_400_000);
    from.setHours(0, 0, 0, 0);
    const match = { ...REAL, createdAt: { $gte: from } };
    const net = { $subtract: ['$total', { $ifNull: ['$payment.refunded', 0] }] };
    const tz = 'Asia/Kolkata';
    const [totals, daily, byMethod, byStatus, top, coupons, newCustomers, cancelled, returns] = await Promise.all([
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            gross: { $sum: '$total' },
            net: { $sum: net },
            tax: { $sum: '$tax' },
            discount: { $sum: '$discount' },
            shipping: { $sum: '$shipping' },
            refunded: { $sum: { $ifNull: ['$payment.refunded', 0] } },
            items: { $sum: { $sum: '$items.qty' } },
          },
        },
      ]),
      Order.aggregate([
        { $match: match },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }, orders: { $sum: 1 }, revenue: { $sum: net } } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([{ $match: match }, { $group: { _id: '$payment.method', orders: { $sum: 1 }, revenue: { $sum: net } } }]),
      Order.aggregate([{ $match: { createdAt: { $gte: from }, status: { $ne: 'awaiting_payment' } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: match },
        { $unwind: '$items' },
        { $group: { _id: { name: '$items.name', piece: '$items.piece' }, qty: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.qty', '$items.unitPrice'] } } } },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),
      Order.aggregate([{ $match: { ...match, couponCode: { $gt: '' } } }, { $group: { _id: '$couponCode', orders: { $sum: 1 }, discount: { $sum: '$discount' } } }, { $sort: { orders: -1 } }]),
      Customer.countDocuments({ createdAt: { $gte: from } }),
      Order.countDocuments({ createdAt: { $gte: from }, status: 'cancelled' }),
      Order.countDocuments({ createdAt: { $gte: from }, 'returns.0': { $exists: true } }),
    ]);

    // every day in the range, also days without orders
    const byDay = new Map(daily.map((d) => [d._id, d]));
    const series = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getTime() + i * 86_400_000);
      const key = d.toLocaleDateString('en-CA', { timeZone: tz });
      series.push({ date: key, orders: byDay.get(key)?.orders || 0, revenue: Math.round((byDay.get(key)?.revenue || 0) * 100) / 100 });
    }
    const t = totals[0] || { orders: 0, gross: 0, net: 0, tax: 0, discount: 0, shipping: 0, refunded: 0, items: 0 };
    res.json({
      days,
      from,
      totals: { ...t, aov: t.orders ? Math.round((t.gross / t.orders) * 100) / 100 : 0, newCustomers, cancelled, returns },
      series,
      byMethod: byMethod.map((m) => ({ method: m._id || 'manual', orders: m.orders, revenue: m.revenue })),
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
      top: top.map((x) => ({ name: x._id.name, qty: x.qty, revenue: x.revenue })),
      coupons: coupons.map((c) => ({ code: c._id, orders: c.orders, discount: c.discount })),
    });
  })
);

export default r;
