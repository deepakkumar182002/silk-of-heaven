import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { Admin, Otp } from '../models/index.js';
import { indianMobile, sendOtpSms } from '../services/sms.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { env } from '../config/env.js';
import { mailEnabled, resetMail, sendMail } from '../services/mailer.js';
import { makeResetToken, resetHash } from './customer.js';

const r = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts, try again in 15 minutes' },
});

r.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const admin = await Admin.findOne({ email });
    const ok = admin && (await bcrypt.compare(password, admin.passwordHash));
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    if (admin.role === 'delivery') return res.status(400).json({ message: 'Delivery partners log in with their mobile number' });
    if (admin.active === false) return res.status(403).json({ message: 'This account is switched off. Ask the store admin.' });
    res.json({ token: signToken(admin), admin });
  })
);

// ---- delivery partners: mobile number + OTP (the number must be verified by the admin) ----
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const otpKey = (phone) => `staff:${phone}`; // kept apart from customer OTPs
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many OTP requests, try again in 15 minutes' } });

r.post(
  '/delivery/otp',
  otpLimiter,
  asyncHandler(async (req, res) => {
    const phone = indianMobile(req.body.phone);
    if (!phone) return res.status(400).json({ message: 'Enter a valid 10-digit mobile number' });
    const boy = await Admin.findOne({ role: 'delivery', phone });
    if (!boy) return res.status(404).json({ message: 'This number is not registered as a delivery partner' });
    if (!boy.phoneVerified) return res.status(403).json({ message: 'Your number is not verified yet. Ask the store admin to verify it.' });
    if (boy.active === false) return res.status(403).json({ message: 'Your account is switched off. Ask the store admin.' });
    const key = otpKey(phone);
    const last = await Otp.findOne({ phone: key }).sort({ createdAt: -1 });
    if (last && Date.now() - last.createdAt.getTime() < 45_000) return res.status(429).json({ message: 'Please wait a few seconds before asking for a new OTP' });
    const code = String(crypto.randomInt(100000, 1000000));
    await Otp.create({ phone: key, codeHash: sha(`${key}:${code}:${env.jwtSecret}`), expiresAt: new Date(Date.now() + 10 * 60_000) });
    const sent = await sendOtpSms(phone, code);
    res.json({ ok: true, ...(sent.dev ? { dev: 'SMS is not configured: the OTP is printed in the API console.' } : {}) });
  })
);

r.post(
  '/delivery/verify',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const phone = indianMobile(req.body.phone);
    const key = phone && otpKey(phone);
    const code = String(req.body.otp || '').replace(/\D/g, '');
    const otp = key && (await Otp.findOne({ phone: key, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }));
    if (!otp) return res.status(400).json({ message: 'The OTP has expired. Ask for a new one.' });
    if (otp.attempts >= 5) return res.status(429).json({ message: 'Too many wrong tries. Ask for a new OTP.' });
    if (otp.codeHash !== sha(`${key}:${code}:${env.jwtSecret}`)) {
      otp.attempts += 1;
      await otp.save();
      return res.status(400).json({ message: 'Wrong OTP. Please check and try again.' });
    }
    await Otp.deleteMany({ phone: key });
    const boy = await Admin.findOne({ role: 'delivery', phone });
    if (!boy || !boy.phoneVerified || boy.active === false) return res.status(403).json({ message: 'This account cannot log in. Ask the store admin.' });
    res.json({ token: signToken(boy), admin: boy });
  })
);

r.get('/me', requireAuth, (req, res) => res.json({ admin: req.admin }));

// ---- forgot / reset password (link by email, valid 30 minutes) ----
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, try again in 15 minutes' },
});

r.post(
  '/forgot',
  resetLimiter,
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').toLowerCase().trim();
    const admin = email && (await Admin.findOne({ email }));
    if (admin) {
      const token = makeResetToken(admin);
      await admin.save();
      await sendMail(resetMail(email, `${env.adminUrl}/reset-password?token=${token}`, `the ${env.storeName} admin panel (${email})`));
    }
    if (!mailEnabled()) return res.status(503).json({ message: 'Email is not set up on the server (EMAIL_USER / EMAIL_PASS). Ask the developer to reset it.' });
    // same answer either way, so staff emails cannot be probed
    res.json({ ok: true, message: 'If this email belongs to a staff account, a reset link is on its way. Check your inbox and spam folder.' });
  })
);

r.post(
  '/reset',
  resetLimiter,
  asyncHandler(async (req, res) => {
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    const admin = await Admin.findOne({ resetTokenHash: resetHash(String(req.body.token || '')), resetExpires: { $gt: new Date() } });
    if (!admin) return res.status(400).json({ message: 'This reset link is invalid or has expired. Ask for a new one.' });
    admin.passwordHash = await bcrypt.hash(password, 12);
    admin.resetTokenHash = undefined;
    admin.resetExpires = undefined;
    await admin.save();
    res.json({ token: signToken(admin), admin });
  })
);

r.put(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword = '', newPassword = '' } = req.body;
    if (String(newPassword).length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters' });
    const ok = await bcrypt.compare(String(currentPassword), req.admin.passwordHash);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });
    req.admin.passwordHash = await bcrypt.hash(String(newPassword), 12);
    await req.admin.save();
    res.json({ ok: true });
  })
);

export default r;
