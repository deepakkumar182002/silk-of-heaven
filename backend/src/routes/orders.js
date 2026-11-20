import crypto from 'crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { Admin, Look, Order, ORDER_STATUSES } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { GROUPS, normalizePiece } from '../utils/pieces.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (v, max = 1000) => String(v ?? '').trim().slice(0, max);
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : undefined;
};

async function newOrderNumber() {
  const d = new Date();
  const day = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 0; i < 6; i++) {
    const rnd = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
    const n = `VL-${day}-${rnd}`;
    if (!(await Order.exists({ orderNumber: n }))) return n;
  }
  throw new Error('Could not generate an order number');
}

/** Builds trusted order items from the client's cart: names, prices, options all come from the DB. */
async function buildItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw bad('Your cart is empty');
  if (rawItems.length > 25) throw bad('Too many items in one order');

  const lookIds = [...new Set(rawItems.map((i) => String(i.lookId)))].filter((id) => mongoose.isValidObjectId(id));
  const looks = await Look.find({ _id: { $in: lookIds }, active: true });
  const byId = new Map(looks.map((l) => [l._id.toString(), l]));

  return rawItems.map((raw) => {
    const look = byId.get(String(raw.lookId));
    const group = String(raw.group);
    const piece = look && GROUPS.includes(group) ? look.pieces[group].find((p) => p._id?.toString() === String(raw.pieceId)) : null;
    if (!look || !piece) throw bad(`"${str(raw.name, 60) || 'An item'}" is no longer available. Please remove it from your cart.`, 409);

    const spec = normalizePiece(piece.toObject(), group);
    const colour = spec.colors.find((c) => c.name.toLowerCase() === String(raw.color || '').toLowerCase()) || spec.colors[0];

    const size = str(raw.size, 20);
    const custom = size.toLowerCase() === 'custom';
    if (custom && !spec.madeToOrder) throw bad(`"${piece.name}" is ready-made and has no custom fit`);
    const okSize = spec.sizes.find((s) => s.toLowerCase() === size.toLowerCase());
    if (!custom && !okSize) throw bad(`Please choose a valid size for "${piece.name}"`);

    let measurements;
    if (custom) {
      const m = raw.measurements || {};
      measurements = { bust: num(m.bust, 40, 200), waist: num(m.waist, 40, 200), hips: num(m.hips, 40, 220), length: num(m.length, 20, 250) };
      if (!measurements.bust && !measurements.waist && !measurements.hips) throw bad(`Add at least one measurement for the custom fit of "${piece.name}"`);
    }

    const qty = Math.round(Number(raw.qty));
    if (!(qty >= 1 && qty <= 10)) throw bad('Quantity must be between 1 and 10');

    return {
      look: look._id,
      lookName: look.name,
      group,
      piece: piece._id,
      name: piece.name,
      image: look.image,
      fabric: spec.fabric,
      color: colour.name,
      colorHex: colour.hex,
      size: custom ? 'Custom' : okSize,
      measurements,
      qty,
      unitPrice: piece.price,
      madeToOrder: spec.madeToOrder,
      leadTimeDays: spec.leadTimeDays,
      notes: text(raw.notes, 500),
    };
  });
}

// =====================================================================
// Public (website) — no login
// =====================================================================
export const publicOrders = Router();

const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many orders from this device. Please try again later.' },
});
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again in a few minutes.' },
});

publicOrders.post(
  '/orders',
  orderLimiter,
  asyncHandler(async (req, res) => {
    const c = req.body.customer || {};
    const a = req.body.address || {};

    const name = str(c.name, 80);
    const phone = str(c.phone, 25);
    const phoneNorm = digits(phone);
    const email = str(c.email, 120).toLowerCase();
    if (name.length < 2) throw bad('Please enter your name');
    if (phoneNorm.length < 7 || phoneNorm.length > 15) throw bad('Please enter a valid phone number');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Please enter a valid email address');
    const contactPref = ['phone', 'whatsapp', 'email'].includes(c.contactPref) ? c.contactPref : 'phone';
    if (contactPref === 'email' && !email) throw bad('Add your email address to be contacted by email');

    const line1 = str(a.line1, 160);
    const city = str(a.city, 80);
    if (line1.length < 4) throw bad('Please enter your address');
    if (city.length < 2) throw bad('Please enter your city');

    const items = await buildItems(req.body.items);
    const subtotal = items.reduce((n, i) => n + i.unitPrice * i.qty, 0);

    const order = await Order.create({
      orderNumber: await newOrderNumber(),
      customer: { name, phone, phoneNorm, email, contactPref },
      address: { line1, line2: str(a.line2, 160), city, state: str(a.state, 80), pincode: str(a.pincode, 12), country: str(a.country, 60) },
      items,
      subtotal,
      total: subtotal,
      notes: text(req.body.notes, 800),
      history: [{ status: 'new', note: 'Order received. Our tailor will contact you shortly to confirm the details.', by: 'system' }],
    });

    res.status(201).json({ orderNumber: order.orderNumber, total: order.total, status: order.status, createdAt: order.createdAt });
  })
);

publicOrders.post(
  '/orders/track',
  trackLimiter,
  asyncHandler(async (req, res) => {
    const orderNumber = str(req.body.orderNumber, 30).toUpperCase();
    const phone = digits(req.body.phone);
    const order = orderNumber && phone.length >= 7 ? await Order.findOne({ orderNumber }) : null;
    // same message for "no such order" and "wrong phone" so order numbers can't be probed
    if (!order || order.customer.phoneNorm.slice(-10) !== phone.slice(-10)) throw bad('We could not find an order with those details', 404);

    res.json({
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      total: order.total,
      items: order.items.map((i) => ({
        name: i.name, lookName: i.lookName, image: i.image, color: i.color, colorHex: i.colorHex,
        size: i.size, qty: i.qty, unitPrice: i.unitPrice, madeToOrder: i.madeToOrder,
      })),
      history: order.history.map((h) => ({ status: h.status, note: h.note, at: h.at })),
    });
  })
);

// =====================================================================
// Admin / tailor panel — any logged-in staff
// =====================================================================
export const adminOrders = Router();
adminOrders.use(requireAuth);

const statusCounts = async () => {
  const rows = await Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
  rows.forEach((r) => (counts[r._id] = r.n));
  return counts;
};

adminOrders.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const counts = await statusCounts();
    const active = counts.new + counts.contacted + counts.stitching + counts.ready;
    const [revenue] = await Order.aggregate([{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: null, t: { $sum: '$total' } } }]);
    res.json({ counts, active, total: Object.values(counts).reduce((a, b) => a + b, 0), revenue: revenue?.t || 0 });
  })
);

adminOrders.get(
  '/staff',
  asyncHandler(async (req, res) => {
    res.json(await Admin.find({}, 'name email role').sort({ role: 1, name: 1 }));
  })
);

adminOrders.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (ORDER_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.mine === '1') filter.assignedTo = req.admin._id;
    const q = str(req.query.q, 60);
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const d = digits(q);
      filter.$or = [{ orderNumber: rx }, { 'customer.name': rx }, { 'customer.email': rx }, ...(d.length >= 4 ? [{ 'customer.phoneNorm': new RegExp(d) }] : [])];
    }
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(limit).populate('assignedTo', 'name email');
    res.json({ orders, counts: await statusCounts() });
  })
);

adminOrders.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('assignedTo', 'name email');
    if (!order) throw bad('Order not found', 404);
    res.json(order);
  })
);

const populate = (o) => o.populate('assignedTo', 'name email');
const who = (req) => req.admin.name || req.admin.email;

adminOrders.put(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const status = req.body.status;
    if (!ORDER_STATUSES.includes(status)) throw bad('Unknown status');
    const order = await Order.findById(req.params.id);
    if (!order) throw bad('Order not found', 404);
    if (order.status === status && !req.body.note) throw bad(`Order is already "${status}"`);

    const now = new Date();
    if (order.status !== status) {
      order.status = status;
      if (status === 'contacted' && !order.contactedAt) order.contactedAt = now;
      if (status === 'stitching' && !order.startedAt) order.startedAt = now;
      if (status === 'ready' && !order.readyAt) order.readyAt = now;
      if (status === 'delivered') order.deliveredAt = now;
      // whoever moves an unassigned order forward takes ownership of it
      if (!order.assignedTo && req.admin.role === 'tailor' && status !== 'cancelled') order.assignedTo = req.admin._id;
    }
    order.history.push({ status, note: text(req.body.note, 400), by: who(req), at: now });
    await order.save();
    res.json(await populate(order));
  })
);

adminOrders.put(
  '/:id/assign',
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw bad('Order not found', 404);
    const id = req.body.assignedTo;
    if (id) {
      if (!mongoose.isValidObjectId(id) || !(await Admin.exists({ _id: id }))) throw bad('Unknown staff member');
      order.assignedTo = id;
    } else {
      order.assignedTo = null;
    }
    await order.save();
    res.json(await populate(order));
  })
);

adminOrders.post(
  '/:id/notes',
  asyncHandler(async (req, res) => {
    const t = text(req.body.text, 600);
    if (!t) throw bad('Write a note first');
    const order = await Order.findById(req.params.id);
    if (!order) throw bad('Order not found', 404);
    order.internalNotes.push({ text: t, by: who(req) });
    await order.save();
    res.status(201).json(await populate(order));
  })
);

adminOrders.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.admin.role !== 'admin') throw bad('Only an admin can delete orders', 403);
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) throw bad('Order not found', 404);
    res.json({ ok: true });
  })
);
