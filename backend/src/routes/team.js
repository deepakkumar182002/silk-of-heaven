import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Admin } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const r = Router();
r.use(requireAuth, requireRole('admin'));

r.get(
  '/',
  asyncHandler(async (req, res) => res.json(await Admin.find().sort({ role: 1, createdAt: 1 })))
);

r.post(
  '/',
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const role = req.body.role === 'admin' ? 'admin' : 'tailor';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email');
    if (password.length < 8) throw bad('Password must be at least 8 characters');
    const doc = await Admin.create({
      email,
      name: String(req.body.name || '').trim().slice(0, 60) || email.split('@')[0],
      role,
      passwordHash: await bcrypt.hash(password, 12),
    });
    res.status(201).json(doc);
  })
);

r.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await Admin.findById(req.params.id);
    if (!doc) throw bad('Not found', 404);
    if (req.body.name !== undefined) doc.name = String(req.body.name).trim().slice(0, 60) || doc.name;
    if (req.body.role && req.body.role !== doc.role) {
      if (doc._id.equals(req.admin._id)) throw bad('You cannot change your own role');
      doc.role = req.body.role === 'admin' ? 'admin' : 'tailor';
    }
    if (req.body.password) {
      if (String(req.body.password).length < 8) throw bad('Password must be at least 8 characters');
      doc.passwordHash = await bcrypt.hash(String(req.body.password), 12);
    }
    await doc.save();
    res.json(doc);
  })
);

r.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.admin._id.toString()) throw bad('You cannot delete your own account');
    const doc = await Admin.findById(req.params.id);
    if (!doc) throw bad('Not found', 404);
    if (doc.role === 'admin' && (await Admin.countDocuments({ role: 'admin' })) <= 1) throw bad('Keep at least one admin');
    await doc.deleteOne();
    res.json({ ok: true });
  })
);

export default r;
