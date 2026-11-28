import { Router } from 'express';
import mongoose from 'mongoose';
import { Admin, Order } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { getSettings, shopConfig } from '../services/shop.js';
import { notifyCustomer, orderLink } from '../services/notify.js';
import { sendMail, statusMail } from '../services/mailer.js';

/**
 * Own delivery partners: the admin assigns orders, the partner (role "delivery", logs in with phone + OTP)
 * picks them up, marks them out for delivery / delivered / not delivered, and sees their earnings.
 */
const bad = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const OPEN = ['new', 'contacted', 'stitching', 'ready', 'shipped', 'out_for_delivery'];
const startOf = (unit) => {
  const d = new Date(Date.now() + 5.5 * 3600e3); // India time
  if (unit === 'month') d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - 5.5 * 3600e3);
};
const amountDue = (o) => (o.payment?.method === 'cod' && o.payment?.status !== 'paid' ? Math.max(0, o.total - (o.payment?.refunded || 0)) : 0);

/** What a partner needs about one order (no internal notes, no payment ids). */
const forRider = (o) => ({
  _id: o._id,
  orderNumber: o.orderNumber,
  kind: o.kind || 'shop',
  status: o.status,
  customer: { name: o.customer.name, phone: o.customer.phone },
  address: o.address,
  items: o.items.map((i) => ({ name: i.name, qty: i.qty, size: i.size, color: i.color, image: i.image })),
  total: o.total,
  payment: { method: o.payment?.method, status: o.payment?.status },
  collect: amountDue(o),
  delivery: {
    assignedAt: o.delivery?.assignedAt,
    pickedAt: o.delivery?.pickedAt,
    outAt: o.delivery?.outAt,
    deliveredAt: o.delivery?.deliveredAt,
    attempts: o.delivery?.attempts || [],
    codCollected: o.delivery?.codCollected || 0,
    commission: o.delivery?.commission || 0,
    rating: o.delivery?.rating,
    ratingNote: o.delivery?.ratingNote,
  },
  createdAt: o.createdAt,
});

/** Totals for one partner (or every partner when boyId is omitted, grouped). */
async function statsFor(match) {
  const today = startOf('day');
  const month = startOf('month');
  const rows = await Order.aggregate([
    { $match: { 'delivery.boy': { $ne: null }, ...match } },
    {
      $group: {
        _id: '$delivery.boy',
        assigned: { $sum: 1 },
        onHand: { $sum: { $cond: [{ $in: ['$status', OPEN] }, 1, 0] } },
        delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
        deliveredToday: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'delivered'] }, { $gte: ['$delivery.deliveredAt', today] }] }, 1, 0] } },
        deliveredMonth: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'delivered'] }, { $gte: ['$delivery.deliveredAt', month] }] }, 1, 0] } },
        earned: { $sum: { $ifNull: ['$delivery.commission', 0] } },
        earnedMonth: { $sum: { $cond: [{ $gte: ['$delivery.deliveredAt', month] }, { $ifNull: ['$delivery.commission', 0] }, 0] } },
        cash: { $sum: { $ifNull: ['$delivery.codCollected', 0] } },
        cashToday: { $sum: { $cond: [{ $gte: ['$delivery.deliveredAt', today] }, { $ifNull: ['$delivery.codCollected', 0] }, 0] } },
        failed: { $sum: { $size: { $ifNull: ['$delivery.attempts', []] } } },
        ratingSum: { $sum: { $ifNull: ['$delivery.rating', 0] } },
        ratings: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$delivery.rating', 0] }, 0] }, 1, 0] } },
        last: { $max: { $ifNull: ['$delivery.deliveredAt', '$delivery.assignedAt'] } },
      },
    },
  ]);
  return new Map(
    rows.map(({ _id, ratingSum, ...r }) => [String(_id), { ...r, rating: r.ratings ? Math.round((ratingSum / r.ratings) * 10) / 10 : null }])
  );
}
const EMPTY = { assigned: 0, onHand: 0, delivered: 0, deliveredToday: 0, deliveredMonth: 0, earned: 0, earnedMonth: 0, cash: 0, cashToday: 0, failed: 0, ratings: 0, rating: null, last: null };

// =====================================================================
// Admin: monitoring + assigning
// =====================================================================
export const adminDelivery = Router();
adminDelivery.use(requireAuth, requireRole('admin'));

adminDelivery.get(
  '/',
  asyncHandler(async (req, res) => {
    const [boys, stats, settings] = await Promise.all([Admin.find({ role: 'delivery' }).sort({ active: -1, name: 1 }).lean(), statsFor({}), getSettings()]);
    const fee = shopConfig(settings).deliveryCommission;
    const base = { status: { $in: ['new', 'contacted', 'stitching', 'ready'] } };
    const [waiting, onTheWay] = await Promise.all([
      Order.find({ ...base, 'delivery.boy': null }).sort({ createdAt: 1 }).limit(100).lean(),
      Order.find({ 'delivery.boy': { $ne: null }, status: { $in: OPEN } }).sort({ 'delivery.assignedAt': 1 }).limit(200).populate('delivery.boy', 'name phone').lean(),
    ]);
    const brief = (o) => ({
      _id: o._id,
      orderNumber: o.orderNumber,
      kind: o.kind || 'shop',
      status: o.status,
      customer: o.customer.name,
      city: o.address?.city,
      pincode: o.address?.pincode,
      total: o.total,
      collect: amountDue(o),
      items: o.items.reduce((n, i) => n + i.qty, 0),
      createdAt: o.createdAt,
      boy: o.delivery?.boy || null,
      assignedAt: o.delivery?.assignedAt,
      attempts: o.delivery?.attempts?.length || 0,
    });
    res.json({
      defaultCommission: fee,
      partners: boys.map((b) => ({
        _id: b._id,
        name: b.name,
        phone: b.phone,
        phoneVerified: !!b.phoneVerified,
        active: b.active !== false,
        commission: b.commission ?? fee,
        ...EMPTY,
        ...(stats.get(String(b._id)) || {}),
      })),
      waiting: waiting.map(brief),
      onTheWay: onTheWay.map(brief),
    });
  })
);

adminDelivery.put(
  '/orders/:id/assign',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad('Order not found', 404);
    const order = await Order.findById(req.params.id);
    if (!order) throw bad('Order not found', 404);
    if (['delivered', 'cancelled', 'awaiting_payment'].includes(order.status)) throw bad(`This order is ${order.status.replace(/_/g, ' ')}`);
    const by = req.admin.name || req.admin.email;
    if (!req.body.boy) {
      if (order.status === 'out_for_delivery') throw bad('This order is out for delivery. Ask the partner to mark it first.');
      order.set('delivery.boy', null);
      order.set('delivery.partnerName', '');
      order.set('delivery.partnerPhone', '');
      order.history.push({ status: order.status, note: '', by: `${by} (delivery partner removed)` });
      await order.save();
      return res.json({ ok: true });
    }
    const boy = await Admin.findOne({ _id: req.body.boy, role: 'delivery' });
    if (!boy || boy.active === false) throw bad('Choose an active delivery partner');
    if (order.status === 'out_for_delivery' && String(order.delivery?.boy) !== String(boy._id)) throw bad('This order is already out for delivery');
    order.set('delivery.boy', boy._id);
    order.set('delivery.partnerName', boy.name);
    order.set('delivery.partnerPhone', boy.phone || '');
    order.set('delivery.assignedAt', new Date());
    order.history.push({ status: order.status, note: '', by: `${by} → delivery by ${boy.name}` });
    await order.save();
    res.json({ ok: true });
  })
);

// =====================================================================
// Delivery partner app (inside the admin panel, role "delivery")
// =====================================================================
export const riderRoutes = Router();
riderRoutes.use(requireAuth, requireRole('delivery'));

riderRoutes.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const done = req.query.scope === 'done';
    const filter = { 'delivery.boy': req.admin._id, status: done ? { $in: ['delivered', 'cancelled'] } : { $in: OPEN } };
    const orders = await Order.find(filter)
      .sort(done ? { 'delivery.deliveredAt': -1, updatedAt: -1 } : { 'delivery.assignedAt': 1 })
      .limit(done ? 100 : 200)
      .lean();
    res.json(orders.map(forRider));
  })
);

riderRoutes.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [stats, settings, recent, rated] = await Promise.all([
      statsFor({ 'delivery.boy': req.admin._id }),
      getSettings(),
      Order.find({ 'delivery.boy': req.admin._id }).sort({ updatedAt: -1 }).limit(25).lean(),
      Order.find({ 'delivery.boy': req.admin._id, 'delivery.rating': { $gte: 1 } }).sort({ 'delivery.ratedAt': -1 }).limit(10).lean(),
    ]);
    // activity: the partner's own steps, newest first
    const activity = recent
      .flatMap((o) => {
        const d = o.delivery || {};
        return [
          d.assignedAt && { at: d.assignedAt, text: `Assigned ${o.orderNumber}` },
          d.pickedAt && { at: d.pickedAt, text: `Picked up ${o.orderNumber}` },
          d.outAt && { at: d.outAt, text: `Out for delivery ${o.orderNumber}` },
          ...(d.attempts || []).map((a) => ({ at: a.at, text: `Not delivered ${o.orderNumber}${a.note ? `: ${a.note}` : ''}` })),
          d.deliveredAt && { at: d.deliveredAt, text: `Delivered ${o.orderNumber}${d.codCollected ? ` · collected ₹${d.codCollected}` : ''}` },
        ].filter(Boolean);
      })
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 30);
    res.json({
      name: req.admin.name,
      phone: req.admin.phone,
      commission: req.admin.commission ?? shopConfig(settings).deliveryCommission,
      ...EMPTY,
      ...(stats.get(String(req.admin._id)) || {}),
      activity,
      reviews: rated.map((o) => ({ orderNumber: o.orderNumber, rating: o.delivery.rating, note: o.delivery.ratingNote, at: o.delivery.ratedAt })),
    });
  })
);

riderRoutes.put(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad('Order not found', 404);
    const order = await Order.findOne({ _id: req.params.id, 'delivery.boy': req.admin._id });
    if (!order) throw bad('Order not found', 404);
    const action = String(req.body.action || '');
    const note = str(req.body.note, 300);
    const now = new Date();
    const by = `${req.admin.name} (delivery)`;
    if (!OPEN.includes(order.status)) throw bad(`This order is already ${order.status.replace(/_/g, ' ')}`);

    if (action === 'picked') {
      if (order.delivery?.pickedAt) throw bad('Already picked up');
      order.set('delivery.pickedAt', now);
      order.history.push({ status: order.status, note: '', by: `${by}: picked up` });
    } else if (action === 'out') {
      order.set('delivery.pickedAt', order.delivery?.pickedAt || now);
      order.set('delivery.outAt', now);
      order.status = 'out_for_delivery';
      order.history.push({ status: 'out_for_delivery', note: note || 'Your order is out for delivery.', by });
    } else if (action === 'delivered') {
      if (order.status !== 'out_for_delivery') throw bad('Mark it out for delivery first');
      const due = amountDue(order);
      if (due) {
        const got = Number(req.body.collected);
        if (!(got >= due - 0.5)) throw bad(`Collect ₹${due} in cash before marking it delivered`);
        order.set('delivery.codCollected', due);
        order.set('payment.status', 'paid');
        order.set('payment.paidAt', now);
      }
      const settings = await getSettings();
      order.set('delivery.commission', req.admin.commission ?? shopConfig(settings).deliveryCommission);
      order.set('delivery.deliveredAt', now);
      order.status = 'delivered';
      order.deliveredAt = now;
      order.history.push({ status: 'delivered', note: note || '', by });
    } else if (action === 'failed') {
      if (!note) throw bad('Write why it could not be delivered');
      order.delivery.attempts.push({ note, at: now });
      order.status = 'ready';
      order.set('delivery.outAt', undefined);
      order.history.push({ status: 'ready', note: `Delivery attempt failed: ${note}. We will try again.`, by });
    } else {
      throw bad('Unknown action');
    }
    await order.save();

    // tell the customer
    if (action === 'out' || action === 'delivered' || action === 'failed') {
      const status = action === 'out' ? 'out_for_delivery' : action === 'delivered' ? 'delivered' : null;
      if (status && order.customer.email) await sendMail(statusMail(order, status, ''));
      await notifyCustomer(order.customerRef, {
        title:
          action === 'out' ? `Order ${order.orderNumber} is out for delivery` : action === 'delivered' ? `Order ${order.orderNumber} delivered` : `We missed you: order ${order.orderNumber}`,
        body:
          action === 'out'
            ? `${req.admin.name} is bringing your order today.`
            : action === 'delivered'
              ? 'We hope you love it! Tap to rate your delivery.'
              : `Our delivery partner could not deliver: ${note}. We will try again.`,
        link: orderLink(order),
        image: order.items[0]?.image,
      });
    }
    res.json(forRider(order.toObject()));
  })
);
