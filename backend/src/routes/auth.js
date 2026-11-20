import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { Admin } from '../models/index.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

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
