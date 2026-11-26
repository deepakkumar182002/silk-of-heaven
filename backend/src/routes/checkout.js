import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Order } from '../models/index.js';
import { optionalCustomer } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { env } from '../config/env.js';
import { buildItems, newOrderNumber } from './orders.js';
import { indianMobile } from '../services/sms.js';
import { checkStock, confirmOrder, expireUnpaid, getSettings, priceCart, releaseStock, reserveStock } from '../services/shop.js';
import { createRzpOrder, fetchPayment, razorpayEnabled, validPaymentSignature, validWebhookSignature } from '../services/razorpay.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (v, max = 1000) => String(v ?? '').trim().slice(0, max);
const digits = (v) => String(v ?? '').replace(/\D/g, '');

const r = Router();
const limiter = (limit, message) => rateLimit({ windowMs: 60 * 60_000, limit, standardHeaders: true, legacyHeaders: false, message: { message } });

/**
 * Price breakdown for the cart: subtotal, coupon, shipping, GST, total, and which payment methods exist.
 * Stock problems come back as `stockError` (the cart stays editable).
 */
r.post(
  '/quote',
  limiter(300, 'Too many requests'),
  optionalCustomer,
  asyncHandler(async (req, res) => {
    const [items, settings] = await Promise.all([buildItems(req.body.items), getSettings()]);
    let stockError = '';
    await checkStock(items).catch((e) => (stockError = e.message));
    const price = await priceCart({ items, couponCode: req.body.couponCode, customerId: req.customer?._id, method: req.body.method, settings });
    res.json({ ...price, stockError });
  })
);

/**
 * Places the order. Online: creates a Razorpay order and returns what the Checkout popup needs; the order
 * waits in "awaiting_payment" until /verify. Cash on delivery: confirmed right away.
 */
r.post(
  '/order',
  limiter(30, 'Too many orders from this device. Please try again later.'),
  optionalCustomer,
  asyncHandler(async (req, res) => {
    expireUnpaid().catch(() => {});
    const c = req.body.customer || {};
    const a = req.body.address || {};
    const method = req.body.method === 'cod' ? 'cod' : 'razorpay';

    const name = str(c.name, 80);
    const phone = indianMobile(c.phone) || digits(c.phone);
    const email = str(c.email, 120).toLowerCase();
    if (name.length < 2) throw bad('Please enter your name');
    if (phone.length < 10 || phone.length > 15) throw bad('Please enter a valid mobile number');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Please enter your email address: order updates are sent there');
    const contactPref = c.contactPref === 'phone' ? 'phone' : 'email';
    const address = {
      line1: str(a.line1, 160),
      line2: str(a.line2, 160),
      city: str(a.city, 80),
      state: str(a.state, 80),
      pincode: str(a.pincode, 12),
      country: str(a.country, 60) || 'India',
    };
    if (address.line1.length < 4) throw bad('Please enter your address');
    if (address.city.length < 2) throw bad('Please enter your city');
    if (address.country === 'India' && !/^\d{6}$/.test(address.pincode)) throw bad('Please enter a 6-digit PIN code');

    const [items, settings] = await Promise.all([buildItems(req.body.items), getSettings()]);
    await checkStock(items);
    const price = await priceCart({ items, couponCode: req.body.couponCode, customerId: req.customer?._id, method, settings });
    if (req.body.couponCode && price.couponError) throw bad(price.couponError);
    if (method === 'cod' && !price.methods.cod) throw bad('Cash on delivery is not available');
    if (method === 'razorpay' && (!price.methods.razorpay || !razorpayEnabled())) throw bad('Online payment is not available right now');

    const order = new Order({
      orderNumber: await newOrderNumber(),
      customerRef: req.customer?._id || null,
      customer: { name, phone, phoneNorm: digits(phone), email: email || req.customer?.email || '', contactPref },
      address,
      items,
      subtotal: price.subtotal,
      discount: price.discount,
      couponCode: price.coupon?.code || '',
      shipping: price.shipping,
      codFee: price.codFee,
      tax: price.tax,
      taxRate: price.taxRate,
      taxIncluded: price.taxIncluded,
      total: price.total,
      currency: 'INR',
      notes: text(req.body.notes, 800),
      status: 'awaiting_payment',
      payment: { method, status: method === 'cod' ? 'unpaid' : 'pending' },
      history: [{ status: 'awaiting_payment', note: method === 'cod' ? 'Order placed (cash on delivery).' : 'Waiting for the online payment.', by: 'system' }],
    });
    await reserveStock(order);
    await order.save();

    // remember the address on the account
    if (req.customer && req.body.saveAddress && !req.customer.addresses.some((x) => x.line1 === address.line1 && x.pincode === address.pincode)) {
      req.customer.addresses.push({ ...address, name, phone, label: 'Home', isDefault: !req.customer.addresses.length });
      if (!req.customer.name) req.customer.name = name;
      await req.customer.save().catch(() => {});
    }

    if (method === 'cod') {
      await confirmOrder(order);
      return res.status(201).json({ orderNumber: order.orderNumber, total: order.total, status: order.status, method });
    }

    let rzp;
    try {
      rzp = await createRzpOrder({ amount: order.total, receipt: order.orderNumber, notes: { orderNumber: order.orderNumber } });
    } catch (e) {
      await releaseStock(order);
      order.status = 'cancelled';
      order.payment.status = 'failed';
      await order.save();
      throw e;
    }
    order.payment.razorpayOrderId = rzp.id;
    await order.save();
    res.status(201).json({
      orderNumber: order.orderNumber,
      total: order.total,
      status: order.status,
      method,
      razorpay: {
        key: env.razorpay.keyId,
        orderId: rzp.id,
        amount: rzp.amount,
        currency: rzp.currency,
        name: settings.store?.legalName || env.storeName,
        description: `Order ${order.orderNumber}`,
        prefill: { name, email: order.customer.email, contact: `+91${indianMobile(phone) || phone}` },
      },
    });
  })
);

/** The Checkout popup succeeded: check the signature, then the order is confirmed. */
r.post(
  '/verify',
  limiter(60, 'Too many requests'),
  asyncHandler(async (req, res) => {
    const orderId = str(req.body.razorpay_order_id, 60);
    const paymentId = str(req.body.razorpay_payment_id, 60);
    const order = orderId && (await Order.findOne({ 'payment.razorpayOrderId': orderId }));
    if (!order) throw bad('Order not found', 404);
    if (!validPaymentSignature(orderId, paymentId, str(req.body.razorpay_signature, 200))) throw bad('Payment could not be verified. If money was deducted, it will be refunded automatically.', 400);
    await markPaid(order, paymentId);
    res.json({ orderNumber: order.orderNumber, total: order.total, status: order.status, method: 'razorpay', paid: true });
  })
);

/** The customer closed the popup without paying: give the stock back. */
r.post(
  '/cancel',
  limiter(60, 'Too many requests'),
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ 'payment.razorpayOrderId': str(req.body.razorpay_order_id, 60), status: 'awaiting_payment' });
    if (order && order.payment.status !== 'paid') {
      await releaseStock(order);
      order.status = 'cancelled';
      order.payment.status = 'failed';
      order.history.push({ status: 'cancelled', note: 'Payment was not completed.', by: 'system' });
      await order.save();
    }
    res.json({ ok: true });
  })
);

async function markPaid(order, paymentId) {
  if (order.payment.status === 'paid') return order;
  if (order.status === 'cancelled') {
    // paid after we gave up on it (late payment): put it back if the stock is still there
    order.status = 'awaiting_payment';
    await reserveStock(order).catch(() => {
      order.history.push({ status: 'awaiting_payment', note: 'Paid after the order expired and some stock is gone. Please check.', by: 'system' });
    });
  }
  order.payment.status = 'paid';
  order.payment.razorpayPaymentId = paymentId;
  order.payment.paidAt = new Date();
  return confirmOrder(order, { note: 'Payment received. Order confirmed.' });
}

/**
 * Razorpay webhook (payment.captured / order.paid): confirms orders even if the customer closed the tab
 * before /verify ran. Set it up in the Razorpay dashboard with RAZORPAY_WEBHOOK_SECRET.
 */
export async function razorpayWebhook(req, res) {
  if (!validWebhookSignature(req.rawBody || Buffer.from(''), req.get('x-razorpay-signature') || '')) return res.status(400).json({ ok: false });
  const ev = req.body || {};
  const pay = ev.payload?.payment?.entity;
  if (['payment.captured', 'order.paid'].includes(ev.event) && pay?.order_id) {
    const order = await Order.findOne({ 'payment.razorpayOrderId': pay.order_id });
    if (order) {
      // double check with Razorpay itself
      const p = await fetchPayment(pay.id).catch(() => null);
      if (p?.status === 'captured' && p.order_id === pay.order_id) await markPaid(order, pay.id);
    }
  }
  res.json({ ok: true });
}

export default r;
