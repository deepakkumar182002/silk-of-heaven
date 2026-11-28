import crypto from 'crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { Admin, Item, ItemCategory, Look, Order, ORDER_STATUSES, RETURN_STATUSES } from '../models/index.js';
import { requireRole, requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { GROUPS, ITEM_GROUP, normalizeItem, normalizePiece } from '../utils/pieces.js';
import { cancelOrder, getSettings, publicOrder, releaseStock } from '../services/shop.js';
import { refundPayment } from '../services/razorpay.js';
import { invoicePdf } from '../services/invoice.js';
import { STATUS_TEXT, returnMail, sendMail, statusMail } from '../services/mailer.js';
import { notifyCustomer, orderLink } from '../services/notify.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (v, max = 1000) => String(v ?? '').trim().slice(0, max);
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : undefined;
};

export async function newOrderNumber() {
  const d = new Date();
  const day = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  for (let i = 0; i < 6; i++) {
    const rnd = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
    const n = `SOH-${day}-${rnd}`;
    if (!(await Order.exists({ orderNumber: n }))) return n;
  }
  throw new Error('Could not generate an order number');
}

/** Builds trusted order items from the client's cart: names, prices, options all come from the DB. */
export async function buildItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw bad('Your cart is empty');
  if (rawItems.length > 25) throw bad('Too many items in one order');

  const lookIds = [...new Set(rawItems.map((i) => String(i.lookId)))].filter((id) => mongoose.isValidObjectId(id));
  const looks = await Look.find({ _id: { $in: lookIds }, active: true });
  const byId = new Map(looks.map((l) => [l._id.toString(), l]));

  // item-library products (group "x:<category>")
  const itemIds = rawItems
    .filter((i) => String(i.group).startsWith(ITEM_GROUP) && mongoose.isValidObjectId(String(i.pieceId)))
    .map((i) => String(i.pieceId));
  const [items, cats] = itemIds.length
    ? await Promise.all([Item.find({ _id: { $in: itemIds }, active: true }), ItemCategory.find()])
    : [[], []];
  const itemById = new Map(items.map((it) => [it._id.toString(), it]));
  const catByKey = new Map(cats.map((c) => [c.key, c]));

  return rawItems.map((raw) => {
    const look = byId.get(String(raw.lookId));
    const group = String(raw.group);
    let piece = null;
    let spec = null;
    let item = null;
    if (look && group.startsWith(ITEM_GROUP)) {
      // must still be attached to that look and in that category
      item = itemById.get(String(raw.pieceId));
      const cat = item && item.category === group.slice(ITEM_GROUP.length) && catByKey.get(item.category);
      const onLook = item && (look.items || []).some((a) => String(a.item) === String(item._id));
      if (cat && onLook) {
        piece = item;
        spec = normalizeItem(item.toObject(), cat.toObject());
      }
    } else if (look && GROUPS.includes(group)) {
      piece = look.pieces[group].find((p) => p._id?.toString() === String(raw.pieceId));
      if (piece) spec = normalizePiece(piece.toObject(), group);
    }
    if (!look || !piece) throw bad(`"${str(raw.name, 60) || 'An item'}" is no longer available. Please remove it from your cart.`, 409);

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
      ...(item ? { item: item._id } : {}),
      name: piece.name,
      image: (item && item.photo) || look.image,
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

// Orders are placed through /api/public/checkout (payment, GST, coupons, stock).
publicOrders.post('/orders', orderLimiter, (req, res) =>
  res.status(410).json({ message: 'Please refresh the page: checkout has been updated.' })
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

    res.json(publicOrder(order, await getSettings()));
  })
);

// =====================================================================
// Admin / tailor panel — any logged-in staff
// =====================================================================
export const adminOrders = Router();
adminOrders.use(requireAuth, requireRole('admin', 'tailor')); // delivery partners use /api/delivery

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
    const active = counts.new + counts.contacted + counts.stitching + counts.ready + counts.shipped + counts.out_for_delivery;
    const [revenue] = await Order.aggregate([
      { $match: { status: { $nin: ['cancelled', 'awaiting_payment'] } } },
      { $group: { _id: null, t: { $sum: { $subtract: ['$total', { $ifNull: ['$payment.refunded', 0] }] } } } },
    ]);
    res.json({ counts, active, total: Object.values(counts).reduce((a, b) => a + b, 0), revenue: revenue?.t || 0 });
  })
);

adminOrders.get(
  '/staff',
  asyncHandler(async (req, res) => {
    res.json(await Admin.find({ active: { $ne: false } }, 'name email role phone phoneVerified').sort({ role: 1, name: 1 }));
  })
);

adminOrders.get(
  '/',
  asyncHandler(async (req, res) => {
    // unpaid online checkouts are not real orders yet: only shown when asked for
    const filter = { status: { $ne: 'awaiting_payment' } };
    if (ORDER_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.returns === '1') filter['returns.status'] = { $in: ['requested', 'approved', 'received'] };
    if (req.query.customer && mongoose.isValidObjectId(req.query.customer)) filter.customerRef = req.query.customer;
    if (req.query.mine === '1') filter.assignedTo = req.admin._id;
    if (['shop', 'stitching'].includes(req.query.kind)) filter.kind = req.query.kind === 'shop' ? { $ne: 'stitching' } : 'stitching';
    const q = str(req.query.q, 60);
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const d = digits(q);
      filter.$or = [{ orderNumber: rx }, { 'customer.name': rx }, { 'customer.email': rx }, ...(d.length >= 4 ? [{ 'customer.phoneNorm': new RegExp(d) }] : [])];
    }
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(limit).populate('assignedTo', 'name email').populate('delivery.boy', 'name phone');
    res.json({ orders, counts: await statusCounts() });
  })
);

adminOrders.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('assignedTo', 'name email').populate('delivery.boy', 'name phone').populate('stitchRequest');
    if (!order) throw bad('Order not found', 404);
    res.json(order);
  })
);

const populate = (o) => o.populate([{ path: 'assignedTo', select: 'name email' }, { path: 'delivery.boy', select: 'name phone' }, { path: 'stitchRequest' }]);
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
    const note = text(req.body.note, 400);
    if (status === 'cancelled' && order.status !== 'cancelled') {
      if (req.admin.role !== 'admin' && order.payment?.status === 'paid') throw bad('Only an admin can cancel a paid order');
      await cancelOrder(order, { by: who(req), note: note || 'Cancelled by the store.' });
      if (order.customer.email && req.body.notify !== false) await sendMail(statusMail(order, 'cancelled', note));
      if (req.body.notify !== false) await notifyCustomer(order.customerRef, { title: `Order ${order.orderNumber} cancelled`, body: [STATUS_TEXT.cancelled, note].filter(Boolean).join(' '), link: orderLink(order), image: order.items[0]?.image });
      return res.json(await populate(order));
    }
    if (status === 'shipped' && req.body.tracking) {
      const t = req.body.tracking;
      order.tracking = { carrier: str(t.carrier, 60), number: str(t.number, 60), url: str(t.url, 300) };
    }
    if (order.status !== status) {
      order.status = status;
      if (status === 'shipped' && !order.shippedAt) order.shippedAt = now;
      if (status === 'out_for_delivery' && !order.delivery?.outAt) order.set('delivery.outAt', now);
      if (status === 'contacted' && !order.contactedAt) order.contactedAt = now;
      if (status === 'stitching' && !order.startedAt) order.startedAt = now;
      if (status === 'ready' && !order.readyAt) order.readyAt = now;
      if (status === 'delivered') order.deliveredAt = now;
      // whoever moves an unassigned order forward takes ownership of it
      if (!order.assignedTo && req.admin.role === 'tailor' && status !== 'cancelled') order.assignedTo = req.admin._id;
    }
    order.history.push({ status, note, by: who(req), at: now });
    await order.save();
    // tell the customer (not for internal steps like "contacted")
    if (order.customer.email && req.body.notify !== false && ['contacted', 'stitching', 'ready', 'shipped', 'out_for_delivery', 'delivered'].includes(status)) {
      await sendMail(statusMail(order, status, note));
    }
    if (req.body.notify !== false && ['stitching', 'ready', 'shipped', 'out_for_delivery', 'delivered'].includes(status)) {
      const track = status === 'shipped' && order.tracking?.number ? ` Tracking: ${[order.tracking.carrier, order.tracking.number].filter(Boolean).join(' ')}.` : '';
      await notifyCustomer(order.customerRef, { title: `Order ${order.orderNumber}: ${status.replace(/_/g, ' ')}`, body: `${STATUS_TEXT[status]}${track}${note ? ` ${note}` : ''}`, link: orderLink(order), image: order.items[0]?.image });
    }
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

// ---------------------------------------------------------------------------
// Invoice, payments, refunds, returns
// ---------------------------------------------------------------------------
adminOrders.get(
  '/:id/invoice',
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw bad('Order not found', 404);
    if (!order.invoiceNumber) throw bad('This order has no invoice yet (not confirmed)');
    const pdf = await invoicePdf(order, await getSettings());
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="invoice-${order.orderNumber}.pdf"` });
    res.send(pdf);
  })
);

// cash collected on delivery, or a payment taken outside the website
adminOrders.put(
  '/:id/payment',
  asyncHandler(async (req, res) => {
    if (req.admin.role !== 'admin') throw bad('Only an admin can change payments', 403);
    const order = await Order.findById(req.params.id);
    if (!order) throw bad('Order not found', 404);
    if (!['paid', 'unpaid'].includes(req.body.status)) throw bad('Unknown payment status');
    if (order.payment.method === 'razorpay') throw bad('Online payments are updated by Razorpay');
    order.payment.status = req.body.status;
    order.payment.paidAt = req.body.status === 'paid' ? new Date() : undefined;
    order.history.push({ status: order.status, note: req.body.status === 'paid' ? 'Payment received.' : 'Payment marked as not received.', by: who(req) });
    await order.save();
    res.json(await populate(order));
  })
);

async function refund(order, amount, note, by) {
  const left = Math.round((order.total - (order.payment.refunded || 0)) * 100) / 100;
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!(amt > 0) || amt > left) throw bad(`Refund must be between ₹1 and ₹${left}`);
  let id = 'manual';
  if (order.payment.method === 'razorpay' && order.payment.status !== 'refunded') {
    if (!order.payment.razorpayPaymentId) throw bad('This order has no online payment to refund');
    id = (await refundPayment(order.payment.razorpayPaymentId, amt, { order: order.orderNumber })).id;
  }
  order.payment.refunds.push({ id, amount: amt, note });
  order.payment.refunded = Math.round(((order.payment.refunded || 0) + amt) * 100) / 100;
  order.payment.status = order.payment.refunded >= order.total ? 'refunded' : 'partially_refunded';
  order.history.push({ status: order.status, note: `Refund of ₹${amt}${id === 'manual' ? ' (recorded, paid outside Razorpay)' : ' sent to the original payment method'}.`, by });
}

adminOrders.post(
  '/:id/refund',
  asyncHandler(async (req, res) => {
    if (req.admin.role !== 'admin') throw bad('Only an admin can refund', 403);
    const order = await Order.findById(req.params.id);
    if (!order) throw bad('Order not found', 404);
    await refund(order, req.body.amount, str(req.body.note, 200), who(req));
    await order.save();
    res.json(await populate(order));
  })
);

adminOrders.put(
  '/:id/returns/:rid',
  asyncHandler(async (req, res) => {
    if (req.admin.role !== 'admin') throw bad('Only an admin can handle returns', 403);
    const order = await Order.findById(req.params.id);
    if (!order) throw bad('Order not found', 404);
    const ret = order.returns.id(req.params.rid);
    if (!ret) throw bad('Return not found', 404);
    const status = req.body.status;
    if (!RETURN_STATUSES.includes(status)) throw bad('Unknown return status');
    ret.status = status;
    ret.note = text(req.body.note ?? ret.note, 400);
    if (['rejected', 'refunded'].includes(status)) ret.resolvedAt = new Date();
    // items came back: ready-made stock goes back on the shelf
    if (['received', 'refunded'].includes(status) && !ret.restocked && req.body.restock !== false) {
      const lines = ret.items
        .map((x) => {
          const l = order.items.id(x.item);
          return l && { ...l.toObject(), qty: x.qty };
        })
        .filter(Boolean);
      await releaseStock(order, lines);
      ret.restocked = true;
    }
    if (status === 'refunded') {
      const amount = Number(req.body.refundAmount) || ret.items.reduce((n, x) => n + (order.items.id(x.item)?.unitPrice || 0) * x.qty, 0);
      if (order.payment.status === 'paid' || order.payment.status === 'partially_refunded') await refund(order, amount, `Return ${ret._id}`, who(req));
      ret.refundAmount = amount;
    }
    order.history.push({ status: order.status, note: `Return ${status}${ret.note ? `: ${ret.note}` : ''}`, by: who(req) });
    await order.save();
    if (order.customer.email) await sendMail(returnMail(order, ret));
    await notifyCustomer(order.customerRef, { title: `Return for ${order.orderNumber}: ${ret.status}`, body: ret.note || `Your return request is now ${ret.status}.`, link: orderLink(order) });
    res.json(await populate(order));
  })
);
