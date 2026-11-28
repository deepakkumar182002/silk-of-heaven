import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { Customer, Order, Otp, Review } from '../models/index.js';
import { optionalCustomer, requireCustomer, signCustomerToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { env } from '../config/env.js';
import { indianMobile, sendOtpSms, smsEnabled } from '../services/sms.js';
import { googleEnabled, verifyFirebaseToken } from '../services/firebase.js';
import { mailEnabled, resetMail, returnMail, sendMail, statusMail } from '../services/mailer.js';
import { cancelOrder, getSettings, publicOrder } from '../services/shop.js';
import { invoicePdf } from '../services/invoice.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const limiter = (limit, minutes, message) =>
  rateLimit({ windowMs: minutes * 60_000, limit, standardHeaders: true, legacyHeaders: false, message: { message } });

const session = async (c, res) => {
  c.lastLoginAt = new Date();
  await c.save();
  res.json({ token: signCustomerToken(c), customer: c });
};

/** Password reset token: emailed in clear, stored as a hash, valid 30 minutes. */
export function makeResetToken(doc) {
  const token = crypto.randomBytes(32).toString('hex');
  doc.resetTokenHash = sha(token);
  doc.resetExpires = new Date(Date.now() + 30 * 60_000);
  return token;
}
export const resetHash = sha;

const r = Router();

// ===========================================================================
// Sign up / log in
// ===========================================================================
r.get('/auth/options', (req, res) =>
  res.json({ email: true, phone: smsEnabled() || !env.production, google: googleEnabled(), resetByEmail: mailEnabled() })
);

r.post(
  '/auth/register',
  limiter(10, 15, 'Too many attempts, try again in 15 minutes'),
  asyncHandler(async (req, res) => {
    const name = str(req.body.name, 80);
    const email = str(req.body.email, 120).toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2) throw bad('Please enter your name');
    if (!EMAIL.test(email)) throw bad('Please enter a valid email address');
    if (password.length < 8) throw bad('Password must be at least 8 characters');
    const existing = await Customer.findOne({ email });
    if (existing?.passwordHash) throw bad('An account with this email exists. Log in instead.', 409);
    const c = existing || new Customer({ email });
    c.name = c.name || name;
    c.passwordHash = await bcrypt.hash(password, 12);
    await session(c, res);
  })
);

r.post(
  '/auth/login',
  limiter(20, 15, 'Too many login attempts, try again in 15 minutes'),
  asyncHandler(async (req, res) => {
    const email = str(req.body.email, 120).toLowerCase();
    const c = await Customer.findOne({ email });
    const ok = c?.passwordHash && (await bcrypt.compare(String(req.body.password || ''), c.passwordHash));
    if (!ok) throw bad(c && !c.passwordHash ? 'This account uses phone or Google login. Use that, or reset your password.' : 'Wrong email or password', 401);
    if (c.blocked) throw bad('This account is blocked. Please contact us.', 403);
    await session(c, res);
  })
);

// ---- phone OTP ----
r.post(
  '/auth/otp',
  limiter(8, 15, 'Too many OTP requests, try again in 15 minutes'),
  asyncHandler(async (req, res) => {
    const phone = indianMobile(req.body.phone);
    if (!phone) throw bad('Enter a valid 10-digit Indian mobile number');
    const last = await Otp.findOne({ phone }).sort({ createdAt: -1 });
    if (last && Date.now() - last.createdAt.getTime() < 45_000) throw bad('Please wait a few seconds before asking for a new OTP', 429);
    if ((await Otp.countDocuments({ phone, createdAt: { $gt: new Date(Date.now() - 3600_000) } })) >= 5) throw bad('Too many OTPs for this number. Try again in an hour.', 429);
    const code = String(crypto.randomInt(100000, 1000000));
    await Otp.create({ phone, codeHash: sha(`${phone}:${code}:${env.jwtSecret}`), expiresAt: new Date(Date.now() + 10 * 60_000) });
    const sent = await sendOtpSms(phone, code);
    res.json({ ok: true, phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`, ...(sent.dev ? { dev: 'SMS is not configured: the OTP is printed in the API console.' } : {}) });
  })
);

r.post(
  '/auth/otp/verify',
  limiter(20, 15, 'Too many attempts, try again in 15 minutes'),
  optionalCustomer,
  asyncHandler(async (req, res) => {
    const phone = indianMobile(req.body.phone);
    const code = String(req.body.otp || '').replace(/\D/g, '');
    const otp = phone && (await Otp.findOne({ phone, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }));
    if (!otp) throw bad('The OTP has expired. Ask for a new one.');
    if (otp.attempts >= 5) throw bad('Too many wrong tries. Ask for a new OTP.', 429);
    if (otp.codeHash !== sha(`${phone}:${code}:${env.jwtSecret}`)) {
      otp.attempts += 1;
      await otp.save();
      throw bad('Wrong OTP. Please check and try again.');
    }
    await Otp.deleteMany({ phone });

    // logged in already: add this phone to the account
    if (req.customer) {
      const other = await Customer.findOne({ phone, _id: { $ne: req.customer._id } });
      if (other) throw bad('This number is linked to another account', 409);
      req.customer.phone = phone;
      req.customer.phoneVerified = true;
      return session(req.customer, res);
    }
    let c = await Customer.findOne({ phone });
    if (!c) c = new Customer({ phone, name: str(req.body.name, 80) });
    if (c.blocked) throw bad('This account is blocked. Please contact us.', 403);
    c.phoneVerified = true;
    await session(c, res);
  })
);

// ---- Google (Firebase Auth ID token) ----
r.post(
  '/auth/google',
  limiter(30, 15, 'Too many attempts, try again later'),
  asyncHandler(async (req, res) => {
    if (!googleEnabled()) throw bad('Google login is not available', 503);
    let g;
    try {
      g = await verifyFirebaseToken(req.body.idToken);
    } catch {
      throw bad('Google login failed. Please try again.', 401);
    }
    let c = await Customer.findOne({ googleUid: g.uid });
    if (!c && g.email && g.emailVerified) c = await Customer.findOne({ email: g.email });
    if (!c) c = new Customer({ email: g.email || undefined, name: g.name });
    if (c.blocked) throw bad('This account is blocked. Please contact us.', 403);
    c.googleUid = g.uid;
    if (g.email && g.emailVerified && (!c.email || c.email === g.email)) {
      c.email = g.email;
      c.emailVerified = true;
    }
    c.name = c.name || g.name;
    c.avatar = c.avatar || g.picture;
    await session(c, res);
  })
);

// ---- forgot / reset password (email) ----
r.post(
  '/auth/forgot',
  limiter(5, 15, 'Too many requests, try again in 15 minutes'),
  asyncHandler(async (req, res) => {
    const email = str(req.body.email, 120).toLowerCase();
    const c = EMAIL.test(email) && (await Customer.findOne({ email }));
    if (c && !c.blocked) {
      const token = makeResetToken(c);
      await c.save();
      await sendMail(resetMail(email, `${env.siteUrl}/reset-password?token=${token}`, `your ${env.storeName} account`));
    }
    // same answer either way, so emails cannot be probed
    res.json({ ok: true, message: 'If an account exists for this email, a reset link is on its way.' });
  })
);

r.post(
  '/auth/reset',
  limiter(10, 15, 'Too many attempts, try again in 15 minutes'),
  asyncHandler(async (req, res) => {
    const password = String(req.body.password || '');
    if (password.length < 8) throw bad('Password must be at least 8 characters');
    const c = await Customer.findOne({ resetTokenHash: sha(String(req.body.token || '')), resetExpires: { $gt: new Date() } });
    if (!c) throw bad('This reset link is invalid or has expired. Ask for a new one.');
    c.passwordHash = await bcrypt.hash(password, 12);
    c.resetTokenHash = undefined;
    c.resetExpires = undefined;
    c.emailVerified = true; // they opened the email
    await session(c, res);
  })
);

// ===========================================================================
// Account
// ===========================================================================
r.get('/me', requireCustomer, (req, res) => res.json({ customer: req.customer }));

r.put(
  '/me',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const c = req.customer;
    if (req.body.name !== undefined) {
      const name = str(req.body.name, 80);
      if (name.length < 2) throw bad('Please enter your name');
      c.name = name;
    }
    if (req.body.email !== undefined && str(req.body.email, 120).toLowerCase() !== (c.email || '')) {
      const email = str(req.body.email, 120).toLowerCase();
      if (email && !EMAIL.test(email)) throw bad('Please enter a valid email address');
      if (c.emailVerified && c.googleUid) throw bad('This email comes from your Google login and cannot be changed here');
      if (email && (await Customer.exists({ email, _id: { $ne: c._id } }))) throw bad('Another account uses this email', 409);
      c.email = email || undefined;
      c.emailVerified = false;
    }
    await c.save();
    res.json({ customer: c });
  })
);

r.put(
  '/me/password',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const c = req.customer;
    const next = String(req.body.newPassword || '');
    if (next.length < 8) throw bad('New password must be at least 8 characters');
    if (c.passwordHash && !(await bcrypt.compare(String(req.body.currentPassword || ''), c.passwordHash))) throw bad('Current password is incorrect');
    if (!c.email) throw bad('Add an email address first, it is your login for the password');
    c.passwordHash = await bcrypt.hash(next, 12);
    await c.save();
    res.json({ customer: c });
  })
);

// ---- addresses ----
const cleanAddress = (a = {}) => {
  const x = {
    label: str(a.label, 30) || 'Home',
    name: str(a.name, 80),
    phone: str(a.phone, 20),
    line1: str(a.line1, 160),
    line2: str(a.line2, 160),
    city: str(a.city, 80),
    state: str(a.state, 80),
    pincode: str(a.pincode, 10),
    country: str(a.country, 60) || 'India',
    isDefault: !!a.isDefault,
  };
  if (x.line1.length < 4) throw bad('Please enter the address');
  if (x.city.length < 2) throw bad('Please enter the city');
  if (x.country === 'India' && x.pincode && !/^\d{6}$/.test(x.pincode)) throw bad('PIN code must be 6 digits');
  return x;
};
const setDefault = (c, id) => c.addresses.forEach((a) => (a.isDefault = String(a._id) === String(id)));

r.post(
  '/me/addresses',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const c = req.customer;
    if (c.addresses.length >= 10) throw bad('You can save up to 10 addresses');
    c.addresses.push(cleanAddress(req.body));
    const added = c.addresses[c.addresses.length - 1];
    if (added.isDefault || c.addresses.length === 1) setDefault(c, added._id);
    await c.save();
    res.status(201).json({ customer: c });
  })
);
r.put(
  '/me/addresses/:id',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const c = req.customer;
    const a = c.addresses.id(req.params.id);
    if (!a) throw bad('Address not found', 404);
    a.set(cleanAddress({ ...a.toObject(), ...req.body }));
    if (req.body.isDefault) setDefault(c, a._id);
    await c.save();
    res.json({ customer: c });
  })
);
r.delete(
  '/me/addresses/:id',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const c = req.customer;
    const a = c.addresses.id(req.params.id);
    if (!a) throw bad('Address not found', 404);
    const wasDefault = a.isDefault;
    a.deleteOne();
    if (wasDefault && c.addresses.length) c.addresses[0].isDefault = true;
    await c.save();
    res.json({ customer: c });
  })
);

// ---- wishlist (the website merges the guest list after login) ----
r.put(
  '/me/wishlist',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const list = (Array.isArray(req.body.items) ? req.body.items : [])
      .map((w) => ({ lookId: str(w.lookId, 40), group: str(w.group, 60), pieceId: str(w.pieceId, 40) }))
      .filter((w) => w.pieceId)
      .filter((w, i, a) => a.findIndex((x) => x.pieceId === w.pieceId) === i)
      .slice(0, 200);
    req.customer.wishlist = list;
    await req.customer.save();
    res.json({ customer: req.customer });
  })
);

// ===========================================================================
// My orders
// ===========================================================================
/** Orders of this account: placed while logged in, or with its verified phone / email. */
const myOrders = (c) => ({
  $or: [
    { customerRef: c._id },
    ...(c.phoneVerified && c.phone ? [{ 'customer.phoneNorm': new RegExp(`${c.phone}$`) }] : []),
    ...(c.emailVerified && c.email ? [{ 'customer.email': c.email }] : []),
  ],
  status: { $ne: 'awaiting_payment' },
});

async function findMine(req) {
  const o = await Order.findOne({ ...myOrders(req.customer), orderNumber: str(req.params.orderNumber, 30).toUpperCase() });
  if (!o) throw bad('Order not found', 404);
  return o;
}

r.get(
  '/me/orders',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const [orders, settings] = await Promise.all([Order.find(myOrders(req.customer)).sort({ createdAt: -1 }).limit(100), getSettings()]);
    res.json({ orders: orders.map((o) => publicOrder(o, settings)) });
  })
);

r.get(
  '/me/orders/:orderNumber',
  requireCustomer,
  asyncHandler(async (req, res) => {
    res.json(publicOrder(await findMine(req), await getSettings()));
  })
);

r.get(
  '/me/orders/:orderNumber/invoice',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const o = await findMine(req);
    if (!o.invoiceNumber || o.status === 'cancelled') throw bad('The invoice is not available for this order', 404);
    const pdf = await invoicePdf(o, await getSettings());
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="invoice-${o.orderNumber}.pdf"` });
    res.send(pdf);
  })
);

r.post(
  '/me/orders/:orderNumber/cancel',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const o = await findMine(req);
    if (!['awaiting_payment', 'new'].includes(o.status)) throw bad('This order is already being prepared and cannot be cancelled here. Please contact us.');
    await cancelOrder(o, { by: 'customer', note: str(req.body.reason, 300) ? `Cancelled by customer: ${str(req.body.reason, 300)}` : 'Cancelled by customer.' });
    if (o.customer.email) await sendMail(statusMail(o, 'cancelled', o.payment.status === 'refunded' ? 'Your payment has been refunded to the original payment method (5–7 working days).' : ''));
    res.json(publicOrder(o, await getSettings()));
  })
);

r.post(
  '/me/orders/:orderNumber/return',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const [o, settings] = await Promise.all([findMine(req), getSettings()]);
    const view = publicOrder(o, settings);
    if (!view.canReturn) throw bad(`Returns are possible within ${view.returnWindowDays} days of delivery, one request at a time`);
    const reason = str(req.body.reason, 120);
    if (!reason) throw bad('Please choose a reason');
    const items = (Array.isArray(req.body.items) ? req.body.items : [])
      .map((x) => {
        const line = o.items.id(String(x.id));
        const qty = Math.round(Number(x.qty));
        return line && line.size !== 'Custom' && qty >= 1 && qty <= line.qty ? { item: line._id, name: line.name, qty } : null;
      })
      .filter(Boolean);
    if (!items.length) throw bad('Choose the items to return (custom-fit items cannot be returned)');
    o.returns.push({ items, reason, details: str(req.body.details, 600) });
    o.history.push({ status: o.status, note: `Return requested: ${items.map((i) => `${i.qty} × ${i.name}`).join(', ')}`, by: 'customer' });
    await o.save();
    if (o.customer.email) await sendMail(returnMail(o, o.returns[o.returns.length - 1]));
    res.status(201).json(publicOrder(o, settings));
  })
);

// rate the delivery partner after delivery (once)
r.post(
  '/me/orders/:orderNumber/rate-delivery',
  requireCustomer,
  asyncHandler(async (req, res) => {
    const o = await findMine(req);
    const rating = Math.round(Number(req.body.rating));
    if (!(rating >= 1 && rating <= 5)) throw bad('Choose 1 to 5 stars');
    if (o.status !== 'delivered' || !o.delivery?.boy) throw bad('You can rate the delivery after it arrives');
    if (o.delivery.rating) throw bad('You have already rated this delivery');
    o.set('delivery.rating', rating);
    o.set('delivery.ratingNote', str(req.body.note, 300));
    o.set('delivery.ratedAt', new Date());
    await o.save();
    res.json(publicOrder(o, await getSettings()));
  })
);

// ===========================================================================
// Reviews
// ===========================================================================
r.get(
  '/me/reviews',
  requireCustomer,
  asyncHandler(async (req, res) => res.json(await Review.find({ customer: req.customer._id }).sort({ createdAt: -1 })))
);

r.post(
  '/reviews',
  requireCustomer,
  limiter(20, 60, 'Too many reviews, try again later'),
  asyncHandler(async (req, res) => {
    const productId = str(req.body.productId, 40);
    if (!mongoose.isValidObjectId(productId)) throw bad('Unknown product');
    const rating = Math.round(Number(req.body.rating));
    if (!(rating >= 1 && rating <= 5)) throw bad('Choose 1 to 5 stars');
    const text = String(req.body.text || '').trim().slice(0, 1500);
    const settings = await getSettings();
    const verified = !!(await Order.exists({ ...myOrders(req.customer), status: 'delivered', 'items.piece': productId }));
    const review = await Review.findOneAndUpdate(
      { productId, customer: req.customer._id },
      {
        $set: {
          productName: str(req.body.productName, 120),
          lookId: str(req.body.lookId, 40),
          name: req.customer.name || 'Customer',
          rating,
          title: str(req.body.title, 100),
          text,
          verified,
          status: settings.shop?.reviewsAutoApprove ? 'approved' : 'pending',
        },
      },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json({ review, message: review.status === 'approved' ? 'Thanks! Your review is live.' : 'Thanks! Your review will appear after a quick check.' });
  })
);

export default r;
