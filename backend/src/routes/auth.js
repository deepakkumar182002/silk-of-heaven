import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Admin } from '../models/index.js';
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
    res.json({ token: signToken(admin), admin });
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
