import { notifyCustomer, orderLink } from './notify.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Coupon, Item, Look, Order, Setting } from '../models/index.js';
import { ITEM_GROUP } from '../utils/pieces.js';
import { newOrderAlertMail, orderConfirmedMail, sendMail } from './mailer.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const round2 = (n) => Math.round(Number(n) * 100) / 100;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getSettings() {
  return (await Setting.findOne({ key: 'site' })) || Setting.create({ key: 'site' });
}

export const shopConfig = (s) => {
  const x = s?.shop || {};
  return {
    currency: 'INR',
    gstRate: x.gstRate ?? 5,
    pricesIncludeTax: x.pricesIncludeTax ?? true,
    shippingFee: x.shippingFee ?? 99,
    freeShippingOver: x.freeShippingOver ?? 1999,
    onlinePayments: x.onlinePayments ?? true,
    codEnabled: x.codEnabled ?? true,
    codFee: x.codFee ?? 0,
    codFreeOver: x.codFreeOver ?? 0,
    codFreeItems: x.codFreeItems ?? 0,
    deliveryCommission: x.deliveryCommission ?? 40,
    returnWindowDays: x.returnWindowDays ?? 7,
    reviewsAutoApprove: !!x.reviewsAutoApprove,
  };
};

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------
/** Validates a coupon for this cart; resolves { coupon, discount } or throws a customer-facing message. */
export async function applyCoupon(code, subtotal, customerId) {
  const c = await Coupon.findOne({ code: String(code || '').trim().toUpperCase(), active: true });
  if (!c) throw bad('This coupon code is not valid');
  const now = new Date();
  if (c.startsAt && now < c.startsAt) throw bad('This coupon is not active yet');
  if (c.endsAt && now > c.endsAt) throw bad('This coupon has expired');
  if (c.usageLimit && c.usedCount >= c.usageLimit) throw bad('This coupon has been fully used');
  if (subtotal < c.minSubtotal) throw bad(`Add items worth ₹${Math.ceil(c.minSubtotal - subtotal)} more to use this coupon`);
  if (c.firstOrderOnly || c.perCustomer) {
    if (!customerId) throw bad('Log in to use this coupon');
    const placed = { customerRef: customerId, status: { $nin: ['awaiting_payment', 'cancelled'] } };
    if (c.firstOrderOnly && (await Order.exists(placed))) throw bad('This coupon is for your first order only');
    if (c.perCustomer && (await Order.countDocuments({ ...placed, couponCode: c.code })) >= c.perCustomer) throw bad('You have already used this coupon');
  }
  let discount = c.type === 'percent' ? (subtotal * c.value) / 100 : c.value;
  if (c.type === 'percent' && c.maxDiscount) discount = Math.min(discount, c.maxDiscount);
  discount = round2(Math.min(discount, subtotal));
  return { coupon: c, discount };
}

// ---------------------------------------------------------------------------
// Pricing (all amounts in rupees, 2 decimals)
// ---------------------------------------------------------------------------
/**
 * subtotal − discount + shipping (+ COD fee) = total. GST is on the goods and shipping after discount:
 * already inside the prices (MRP style) or added on top, as configured.
 */
export async function priceCart({ items, couponCode, customerId, method, settings }) {
  const cfg = shopConfig(settings);
  const subtotal = round2(items.reduce((n, i) => n + i.unitPrice * i.qty, 0));
  let discount = 0;
  let coupon = null;
  let couponError = '';
  if (couponCode) {
    try {
      const r = await applyCoupon(couponCode, subtotal, customerId);
      discount = r.discount;
      coupon = { code: r.coupon.code, description: r.coupon.description, discount };
    } catch (e) {
      couponError = e.message;
    }
  }
  const afterDiscount = subtotal - discount;
  const shipping = cfg.freeShippingOver && afterDiscount >= cfg.freeShippingOver ? 0 : cfg.shippingFee;
  // COD charge: waived from an order value or a number of items, as set by the admin
  const count = items.reduce((n, i) => n + i.qty, 0);
  const codWaived = (cfg.codFreeOver > 0 && afterDiscount >= cfg.codFreeOver) || (cfg.codFreeItems > 0 && count >= cfg.codFreeItems);
  const codFeeIfCod = codWaived ? 0 : cfg.codFee;
  const codFee = method === 'cod' ? codFeeIfCod : 0;
  const taxable = afterDiscount + shipping + codFee;
  const rate = cfg.gstRate;
  const tax = round2(cfg.pricesIncludeTax ? (taxable * rate) / (100 + rate) : (taxable * rate) / 100);
  const total = round2(cfg.pricesIncludeTax ? taxable : taxable + tax);
  return {
    subtotal,
    discount,
    coupon,
    couponError,
    shipping,
    codFee,
    tax,
    taxRate: rate,
    taxIncluded: cfg.pricesIncludeTax,
    total,
    freeShippingOver: cfg.freeShippingOver,
    codCharge: codFeeIfCod, // what COD would add to this cart (to show next to the option)
    codFreeOver: cfg.codFreeOver,
    codFreeItems: cfg.codFreeItems,
    methods: { razorpay: cfg.onlinePayments && !!env.razorpay.keyId, cod: cfg.codEnabled },
  };
}

// ---------------------------------------------------------------------------
// Stock (ready-made items). stock === null means "not tracked".
// ---------------------------------------------------------------------------
const isItem = (line) => String(line.group || '').startsWith(ITEM_GROUP);
const qtyByProduct = (items) => {
  const m = new Map();
  for (const raw of items) {
    const i = raw?.toObject ? raw.toObject() : raw; // order lines are mongoose subdocuments
    const k = `${i.look}|${i.group}|${i.piece}`;
    m.set(k, { ...i, qty: (m.get(k)?.qty || 0) + i.qty });
  }
  return [...m.values()];
};

/** Current stock of an order line's product (null = unlimited). */
async function stockOf(line) {
  if (isItem(line)) return (await Item.findById(line.item || line.piece, 'stock').lean())?.stock ?? null;
  const look = await Look.findById(line.look, `pieces.${line.group}`).lean();
  return look?.pieces?.[line.group]?.find((p) => String(p._id) === String(line.piece))?.stock ?? null;
}

/** Throws when a line asks for more than is in stock. */
export async function checkStock(items) {
  for (const line of qtyByProduct(items)) {
    const s = await stockOf(line);
    if (s !== null && s < line.qty) throw bad(s === 0 ? `"${line.name}" is out of stock` : `Only ${s} left of "${line.name}"`, 409);
  }
}

async function moveStock(line, delta) {
  if (isItem(line)) {
    const filter = { _id: line.item || line.piece, stock: delta < 0 ? { $gte: -delta } : { $ne: null } };
    return (await Item.updateOne(filter, { $inc: { stock: delta } })).modifiedCount === 1;
  }
  const path = `pieces.${line.group}`;
  const r = await Look.updateOne(
    { _id: line.look },
    { $inc: { [`${path}.$[p].stock`]: delta } },
    { arrayFilters: [{ 'p._id': new mongoose.Types.ObjectId(String(line.piece)), 'p.stock': delta < 0 ? { $gte: -delta } : { $ne: null } }] }
  );
  return r.modifiedCount === 1;
}

/** Takes stock for every tracked line; all or nothing. */
export async function reserveStock(order) {
  if (order.stockReserved) return;
  const done = [];
  for (const line of qtyByProduct(order.items)) {
    if ((await stockOf(line)) === null) continue;
    if (!(await moveStock(line, -line.qty))) {
      for (const d of done) await moveStock(d, d.qty);
      throw bad(`"${line.name}" just sold out. Please update your cart.`, 409);
    }
    done.push(line);
  }
  order.stockReserved = true;
}

/** Gives the stock of an order (or some of its lines) back. */
export async function releaseStock(order, lines = null) {
  if (!order.stockReserved && !lines) return;
  for (const line of qtyByProduct(lines || order.items)) {
    if ((await stockOf(line)) !== null) await moveStock(line, line.qty);
  }
  if (!lines) order.stockReserved = false;
}

/** Online orders left unpaid for 30 minutes are cancelled and their stock released. */
export async function expireUnpaid() {
  const old = await Order.find({ status: 'awaiting_payment', createdAt: { $lt: new Date(Date.now() - 30 * 60_000) } }).limit(20);
  for (const o of old) {
    await releaseStock(o);
    o.status = 'cancelled';
    o.payment.status = o.payment.status === 'paid' ? 'paid' : 'failed';
    o.history.push({ status: 'cancelled', note: 'Payment was not completed.', by: 'system' });
    await o.save();
  }
}

// ---------------------------------------------------------------------------
// Invoice numbers: INV/2025-26/0001, consecutive per financial year (April–March)
// ---------------------------------------------------------------------------
const Counter = mongoose.models.Counter || mongoose.model('Counter', new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false }));
async function nextInvoiceNumber(date = new Date()) {
  const y = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  const fy = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  const c = await Counter.findOneAndUpdate({ _id: `invoice-${fy}` }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return `INV/${fy}/${String(c.seq).padStart(4, '0')}`;
}

/**
 * The order is real now (paid online, or cash on delivery placed): goes to the tailor queue, counts the
 * coupon, gets an invoice number, and the customer + store get an email.
 */
export async function confirmOrder(order, { note } = {}) {
  if (order.status === 'awaiting_payment') {
    order.status = 'new';
    order.history.push({
      status: 'new',
      note: note || (order.items.some((i) => i.madeToOrder) ? 'Order confirmed. Our tailor will contact you to confirm the details.' : 'Order confirmed.'),
      by: 'system',
    });
  }
  if (order.couponCode && !order.couponCounted) {
    await Coupon.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } });
    order.couponCounted = true;
  }
  if (!order.invoiceNumber) order.invoiceNumber = await nextInvoiceNumber();
  await order.save();
  await Promise.all([
    order.customer.email && sendMail(orderConfirmedMail(order)),
    sendMail(newOrderAlertMail(order)),
    notifyCustomer(order.customerRef, { title: `Order ${order.orderNumber} confirmed`, body: 'Thank you! We have received your order. You can follow it in My orders.', link: orderLink(order), image: order.items[0]?.image }),
  ]);
  return order;
}

// ---------------------------------------------------------------------------
// What a customer may see of an order (tracking page, account)
// ---------------------------------------------------------------------------
export function publicOrder(o, settings) {
  const cfg = shopConfig(settings);
  const deliveredDays = o.deliveredAt ? (Date.now() - new Date(o.deliveredAt).getTime()) / 86_400_000 : null;
  const openReturn = (o.returns || []).some((r) => ['requested', 'approved', 'received'].includes(r.status));
  return {
    orderNumber: o.orderNumber,
    invoiceNumber: o.invoiceNumber || '',
    status: o.status,
    createdAt: o.createdAt,
    deliveredAt: o.deliveredAt,
    customer: { name: o.customer.name, phone: o.customer.phone, email: o.customer.email },
    address: o.address,
    items: o.items.map((i) => ({
      id: i._id,
      lookId: i.look,
      group: i.group,
      pieceId: i.piece,
      name: i.name,
      lookName: i.lookName,
      image: i.image,
      color: i.color,
      colorHex: i.colorHex,
      size: i.size,
      qty: i.qty,
      unitPrice: i.unitPrice,
      madeToOrder: i.madeToOrder,
      returnable: i.size !== 'Custom',
    })),
    subtotal: o.subtotal,
    discount: o.discount,
    couponCode: o.couponCode,
    shipping: o.shipping,
    codFee: o.codFee,
    tax: o.tax,
    taxRate: o.taxRate,
    taxIncluded: o.taxIncluded,
    total: o.total,
    currency: o.currency,
    payment: { method: o.payment?.method, status: o.payment?.status, refunded: o.payment?.refunded || 0 },
    tracking: o.tracking?.number ? o.tracking : null,
    // customer-facing steps: skip staff-only repeats of the same status without a note
    history: o.history
      .filter((h, i, a) => i === 0 || h.note || h.status !== a[i - 1].status)
      .map((h) => ({ status: h.status, note: h.note, at: h.at })),
    kind: o.kind || 'shop',
    delivery: o.delivery?.boy
      ? {
          partner: o.delivery.partnerName || '',
          phone: ['out_for_delivery'].includes(o.status) ? o.delivery.partnerPhone || '' : '',
          outAt: o.delivery.outAt,
          rating: o.delivery.rating || null,
          ratingNote: o.delivery.ratingNote || '',
        }
      : null,
    canRateDelivery: o.status === 'delivered' && !!o.delivery?.boy && !o.delivery?.rating,
    returns: (o.returns || []).map((r) => ({ id: r._id, items: r.items, reason: r.reason, status: r.status, refundAmount: r.refundAmount, note: r.note, requestedAt: r.requestedAt })),
    canCancel: ['awaiting_payment', 'new'].includes(o.status),
    canReturn: o.status === 'delivered' && !openReturn && deliveredDays !== null && deliveredDays <= cfg.returnWindowDays && o.items.some((i) => i.size !== 'Custom'),
    returnWindowDays: cfg.returnWindowDays,
    hasInvoice: !!o.invoiceNumber && o.status !== 'cancelled',
  };
}

/** Cancels an order: stock back, full refund when it was paid online. */
export async function cancelOrder(order, { by = 'system', note = '' } = {}) {
  const { refundPayment } = await import('./razorpay.js');
  await releaseStock(order);
  if (order.payment?.status === 'paid' && order.payment.method === 'razorpay' && order.payment.razorpayPaymentId) {
    const left = Math.round((order.total - (order.payment.refunded || 0)) * 100) / 100;
    if (left > 0) {
      const r = await refundPayment(order.payment.razorpayPaymentId, left, { order: order.orderNumber });
      order.payment.refunds.push({ id: r.id, amount: left, note: 'Order cancelled' });
      order.payment.refunded = (order.payment.refunded || 0) + left;
      order.payment.status = 'refunded';
    }
  }
  order.status = 'cancelled';
  order.history.push({ status: 'cancelled', note: note || 'Order cancelled.', by, at: new Date() });
  await order.save();
  return order;
}
