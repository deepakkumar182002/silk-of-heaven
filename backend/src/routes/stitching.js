import { Router } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { Order, StitchRequest } from '../models/index.js';
import { requireAuth, requireRole, requireCustomer } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { uploadBuffer } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { newOrderNumber } from './orders.js';
import { confirmOrder, getSettings, shopConfig } from '../services/shop.js';
import { createRzpOrder, razorpayEnabled } from '../services/razorpay.js';
import { indianMobile } from '../services/sms.js';
import { notifyCustomer } from '../services/notify.js';
import { sendMail } from '../services/mailer.js';

/**
 * Custom stitching: a customer asks for their own dress to be stitched (fabric details, design photos,
 * measurements). The admin sends a quote; when the customer accepts and pays (online or on delivery),
 * a stitching order is created and follows the tailoring steps (stitching → ready → delivery).
 * Kept apart from shop orders on the website; shares the order pipeline in the admin.
 */
const bad = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const round2 = (n) => Math.round(n * 100) / 100;

export const GARMENTS = ['Blouse', 'Kurti / Kurta', 'Salwar suit', 'Lehenga', 'Saree fall & pico', 'Anarkali', 'Gown / Dress', 'Shirt', 'Trousers', 'Sherwani / Kurta set', 'Kids wear', 'Alteration', 'Other'];
export const MEASURES = ['bust', 'waist', 'hips', 'shoulder', 'sleeve', 'armhole', 'length', 'neckFront', 'neckBack', 'inseam', 'thigh'];

async function newRequestNumber() {
  const d = new Date(Date.now() + 5.5 * 3600e3);
  const day = d.toISOString().slice(2, 10).replace(/-/g, '');
  for (;;) {
    const n = `STR-${day}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    if (!(await StitchRequest.exists({ number: n }))) return n;
  }
}

/** What the customer sees: no staff notes. The linked order adds payment and progress. */
function forCustomer(r, order) {
  return {
    number: r.number,
    garment: r.garment,
    fabricSource: r.fabricSource,
    fabricDetails: r.fabricDetails,
    designNotes: r.designNotes,
    images: (r.images || []).map((x) => x.url),
    measurements: Object.fromEntries(r.measurements instanceof Map ? r.measurements : Object.entries(r.measurements || {})),
    measureVisit: r.measureVisit,
    neededBy: r.neededBy,
    address: r.address,
    status: r.status,
    quote: r.status === 'submitted' ? null : r.quote?.price ? { price: r.quote.price, days: r.quote.days, note: r.quote.note, at: r.quote.at } : null,
    reason: r.status === 'rejected' ? r.adminNote : '',
    history: (r.history || []).map((h) => ({ status: h.status, note: h.note, at: h.at })),
    order: order
      ? { orderNumber: order.orderNumber, status: order.status, payment: { method: order.payment?.method, status: order.payment?.status }, total: order.total }
      : null,
    createdAt: r.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------
export const customerStitching = Router();
customerStitching.use(requireCustomer);

const limiter = (limit, message) => rateLimit({ windowMs: 60 * 60_000, limit, standardHeaders: true, legacyHeaders: false, message: { message } });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 }, // the website shrinks photos before sending
  fileFilter: (req, file, cb) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('Only JPG, PNG or WebP photos'), { status: 400, expose: true })),
});

// photo of the design or fabric (customers only, rate limited)
customerStitching.post(
  '/upload',
  limiter(40, 'Too many uploads, please try again later'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw bad('Choose a photo');
    const r = await uploadBuffer(req.file.buffer, 'stitching');
    res.status(201).json({ url: r.secure_url, publicId: r.public_id });
  })
);

customerStitching.get(
  '/options',
  asyncHandler(async (req, res) => {
    const cfg = shopConfig(await getSettings());
    res.json({ garments: GARMENTS, measures: MEASURES, payments: { razorpay: cfg.onlinePayments && razorpayEnabled(), cod: cfg.codEnabled } });
  })
);

customerStitching.post(
  '/',
  limiter(10, 'Too many requests, please try again later'),
  asyncHandler(async (req, res) => {
    const garment = str(req.body.garment, 60);
    if (!garment) throw bad('Choose what to stitch');
    const name = str(req.body.name, 80) || req.customer.name;
    const phone = indianMobile(req.body.phone) || req.customer.phone;
    if (!name) throw bad('Please enter your name');
    if (!phone) throw bad('Please enter a valid 10-digit mobile number');
    const a = req.body.address || {};
    const address = { line1: str(a.line1, 160), line2: str(a.line2, 160), city: str(a.city, 80), state: str(a.state, 80), pincode: str(a.pincode, 12), country: 'India' };
    if (address.line1.length < 4 || address.city.length < 2 || !/^\d{6}$/.test(address.pincode)) throw bad('Please enter the full address with a 6-digit PIN code');
    const images = (Array.isArray(req.body.images) ? req.body.images : [])
      .filter((x) => x && typeof x.url === 'string' && x.url.startsWith('https://res.cloudinary.com/'))
      .slice(0, 6)
      .map((x) => ({ url: x.url, publicId: String(x.publicId || '').slice(0, 200) }));
    const measurements = {};
    for (const k of MEASURES) {
      const v = Number(req.body.measurements?.[k]);
      if (Number.isFinite(v) && v > 0 && v < 120) measurements[k] = Math.round(v * 10) / 10;
    }
    const measureVisit = !!req.body.measureVisit;
    if (!measureVisit && Object.keys(measurements).length < 2) throw bad('Add your measurements, or ask our tailor to take them');
    const neededBy = req.body.neededBy ? new Date(req.body.neededBy) : null;
    const doc = await StitchRequest.create({
      number: await newRequestNumber(),
      customer: req.customer._id,
      contact: { name, phone, email: req.customer.email || str(req.body.email, 120) },
      garment,
      fabricSource: req.body.fabricSource === 'store' ? 'store' : 'mine',
      fabricDetails: text(req.body.fabricDetails, 1000),
      designNotes: text(req.body.designNotes, 2000),
      images,
      measurements,
      measureVisit,
      neededBy: neededBy && !Number.isNaN(neededBy.getTime()) && neededBy > new Date() ? neededBy : null,
      address,
      history: [{ status: 'submitted', note: 'Request received. We will send you a price soon.', by: 'customer' }],
    });
    await sendMail({
      to: env.mail.notify || env.mail.user,
      subject: `New stitching request ${doc.number}: ${garment}`,
      html: `<p>${name} (+91 ${phone}) asked for: <b>${garment}</b>.</p><p>Open the admin panel → Stitching requests to send a quote.</p>`,
    }).catch(() => {});
    res.status(201).json(forCustomer(doc, null));
  })
);

customerStitching.get(
  '/',
  asyncHandler(async (req, res) => {
    const list = await StitchRequest.find({ customer: req.customer._id }).sort({ createdAt: -1 }).limit(50).populate('order');
    res.json(list.map((r) => forCustomer(r, r.order)));
  })
);

const findMine = async (req) => {
  const r = await StitchRequest.findOne({ customer: req.customer._id, number: str(req.params.number, 30).toUpperCase() }).populate('order');
  if (!r) throw bad('Request not found', 404);
  return r;
};

customerStitching.get('/:number', asyncHandler(async (req, res) => {
  const r = await findMine(req);
  res.json(forCustomer(r, r.order));
}));

customerStitching.post(
  '/:number/cancel',
  asyncHandler(async (req, res) => {
    const r = await findMine(req);
    if (!['submitted', 'quoted'].includes(r.status)) throw bad('This request can no longer be cancelled here. Please contact us.');
    r.status = 'cancelled';
    r.history.push({ status: 'cancelled', note: 'Cancelled by you.', by: 'customer' });
    await r.save();
    res.json(forCustomer(r, r.order));
  })
);

/** Accept the quote: a stitching order is created and paid online (Razorpay) or on delivery. */
customerStitching.post(
  '/:number/accept',
  limiter(20, 'Too many requests'),
  asyncHandler(async (req, res) => {
    const r = await findMine(req);
    const live = r.order && !['cancelled', 'awaiting_payment'].includes(r.order.status);
    if (live) throw bad('This quote is already accepted');
    if (!['quoted', 'accepted'].includes(r.status) || !r.quote?.price) throw bad('There is no price to accept yet');
    const method = req.body.method === 'cod' ? 'cod' : 'razorpay';
    const settings = await getSettings();
    const cfg = shopConfig(settings);
    if (method === 'cod' && !cfg.codEnabled) throw bad('Pay on delivery is not available');
    if (method === 'razorpay' && !(cfg.onlinePayments && razorpayEnabled())) throw bad('Online payment is not available right now');

    // an earlier unpaid try is dropped
    if (r.order && r.order.status === 'awaiting_payment') {
      r.order.status = 'cancelled';
      r.order.history.push({ status: 'cancelled', note: 'Replaced by a new payment attempt.', by: 'system' });
      await r.order.save();
    }
    const price = round2(r.quote.price);
    const rate = cfg.gstRate;
    const order = new Order({
      orderNumber: await newOrderNumber(),
      kind: 'stitching',
      stitchRequest: r._id,
      customerRef: req.customer._id,
      customer: { name: r.contact.name, phone: r.contact.phone, phoneNorm: digits(r.contact.phone), email: r.contact.email || '', contactPref: 'phone' },
      address: { ...r.address, country: 'India' },
      items: [
        {
          name: `Stitching: ${r.garment}`,
          image: r.images?.[0]?.url || '',
          size: 'Custom',
          qty: 1,
          unitPrice: price,
          madeToOrder: true,
          leadTimeDays: r.quote.days || 0,
          notes: `Request ${r.number}`,
        },
      ],
      subtotal: price,
      shipping: 0,
      codFee: 0,
      tax: round2(cfg.pricesIncludeTax ? (price * rate) / (100 + rate) : (price * rate) / 100),
      taxRate: rate,
      taxIncluded: cfg.pricesIncludeTax,
      total: cfg.pricesIncludeTax ? price : round2(price + (price * rate) / 100),
      status: 'awaiting_payment',
      payment: { method, status: method === 'cod' ? 'unpaid' : 'pending' },
      notes: `Stitching request ${r.number}`,
      history: [{ status: 'awaiting_payment', note: `Quote accepted for ${r.garment}.`, by: 'customer' }],
    });
    await order.save();
    r.order = order._id;
    r.status = 'accepted';
    r.history.push({ status: 'accepted', note: method === 'cod' ? 'Quote accepted. You pay on delivery.' : 'Quote accepted. Waiting for the payment.', by: 'customer' });
    await r.save();

    if (method === 'cod') {
      await confirmOrder(order, { note: `Stitching of your ${r.garment} is confirmed. Our tailor will start soon.` });
      return res.status(201).json({ orderNumber: order.orderNumber, method, total: order.total });
    }
    const rzp = await createRzpOrder({ amount: order.total, receipt: order.orderNumber, notes: { orderNumber: order.orderNumber, request: r.number } });
    order.payment.razorpayOrderId = rzp.id;
    await order.save();
    res.status(201).json({
      orderNumber: order.orderNumber,
      method,
      total: order.total,
      razorpay: {
        key: env.razorpay.keyId,
        orderId: rzp.id,
        amount: rzp.amount,
        currency: rzp.currency,
        name: settings.store?.legalName || env.storeName,
        description: `Stitching ${r.number}`,
        prefill: { name: r.contact.name, email: r.contact.email, contact: `+91${r.contact.phone}` },
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const adminStitching = Router();
adminStitching.use(requireAuth, requireRole('admin', 'tailor'));

adminStitching.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = ['submitted', 'quoted', 'accepted', 'rejected', 'cancelled'].includes(req.query.status) ? { status: req.query.status } : {};
    const q = str(req.query.q, 60);
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ number: rx }, { 'contact.name': rx }, { 'contact.phone': rx }, { garment: rx }];
    }
    const [list, counts] = await Promise.all([
      StitchRequest.find(filter).sort({ createdAt: -1 }).limit(200).populate('order', 'orderNumber status payment total'),
      StitchRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    res.json({ list, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) });
  })
);

const findOne = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw bad('Not found', 404);
  const r = await StitchRequest.findById(id).populate('order', 'orderNumber status payment total');
  if (!r) throw bad('Not found', 404);
  return r;
};
adminStitching.get('/:id', asyncHandler(async (req, res) => res.json(await findOne(req.params.id))));

adminStitching.put(
  '/:id/quote',
  asyncHandler(async (req, res) => {
    if (req.admin.role !== 'admin') throw bad('Only an admin can send prices', 403);
    const r = await findOne(req.params.id);
    if (!['submitted', 'quoted'].includes(r.status)) throw bad(`This request is ${r.status}`);
    const price = Number(req.body.price);
    const days = Math.round(Number(req.body.days));
    if (!(price > 0 && price < 10000000)) throw bad('Enter the price');
    if (!(days >= 1 && days <= 365)) throw bad('Enter how many days it takes');
    r.quote = { price: round2(price), days, note: text(req.body.note, 600), at: new Date() };
    r.status = 'quoted';
    r.history.push({ status: 'quoted', note: `Price ₹${r.quote.price}, ready in about ${days} days.${r.quote.note ? ` ${r.quote.note}` : ''}`, by: req.admin.name || req.admin.email });
    await r.save();
    await notifyCustomer(r.customer, { title: `Price for your ${r.garment}: ₹${r.quote.price}`, body: `Ready in about ${days} days. Open your stitching request to accept and pay.${r.quote.note ? ` ${r.quote.note}` : ''}`, link: `/account/stitching/${r.number}`, image: r.images?.[0]?.url });
    if (r.contact.email) {
      await sendMail({
        to: r.contact.email,
        subject: `Your stitching request ${r.number}: price ₹${r.quote.price}`,
        html: `<p>Hello ${r.contact.name},</p><p>The price for your <b>${r.garment}</b> is <b>₹${r.quote.price}</b>, ready in about ${days} days.</p>${r.quote.note ? `<p>${r.quote.note}</p>` : ''}<p><a href="${env.siteUrl}/account/stitching/${r.number}">Accept and pay</a></p>`,
      }).catch(() => {});
    }
    res.json(await findOne(r._id));
  })
);

adminStitching.put(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    if (req.admin.role !== 'admin') throw bad('Only an admin can decline requests', 403);
    const r = await findOne(req.params.id);
    if (!['submitted', 'quoted'].includes(r.status)) throw bad(`This request is ${r.status}`);
    const note = text(req.body.note, 600);
    if (!note) throw bad('Write a short reason for the customer');
    r.status = 'rejected';
    r.adminNote = note;
    r.history.push({ status: 'rejected', note, by: req.admin.name || req.admin.email });
    await r.save();
    await notifyCustomer(r.customer, { title: `About your ${r.garment} request`, body: note, link: `/account/stitching/${r.number}` });
    res.json(await findOne(r._id));
  })
);

