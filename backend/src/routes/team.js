import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Admin, Order } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { indianMobile } from '../services/sms.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
const r = Router();
r.use(requireAuth, requireRole('admin'));

const ROLES = ['admin', 'tailor', 'delivery'];
// delivery partners log in with their phone, so their (unused) email is a placeholder
const placeholderEmail = (phone) => `delivery-${phone}@staff.local`;
const commissionOf = (v) => (v === null || v === '' || v === undefined ? null : Math.max(0, Math.min(100000, Number(v) || 0)));

r.get(
  '/',
  asyncHandler(async (req, res) => res.json(await Admin.find().sort({ role: 1, createdAt: 1 })))
);

r.post(
  '/',
  asyncHandler(async (req, res) => {
    const role = ROLES.includes(req.body.role) ? req.body.role : 'tailor';
    const name = String(req.body.name || '').trim().slice(0, 60);
    if (role === 'delivery') {
      const phone = indianMobile(req.body.phone);
      if (!phone) throw bad('Enter a valid 10-digit mobile number');
      if (!name) throw bad('Enter the name');
      if (await Admin.exists({ role: 'delivery', phone })) throw bad('A delivery partner with this number already exists');
      const doc = await Admin.create({
        email: placeholderEmail(phone),
        name,
        role,
        phone,
        phoneVerified: !!req.body.phoneVerified,
        commission: commissionOf(req.body.commission),
        passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10), // never used: OTP login only
      });
      return res.status(201).json(doc);
    }
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Enter a valid email');
    if (password.length < 8) throw bad('Password must be at least 8 characters');
    const doc = await Admin.create({
      email,
      name: name || email.split('@')[0],
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
    const self = doc._id.equals(req.admin._id);
    if (req.body.name !== undefined) doc.name = String(req.body.name).trim().slice(0, 60) || doc.name;
    if (req.body.role && req.body.role !== doc.role) {
      if (self) throw bad('You cannot change your own role');
      if (doc.role === 'delivery' || req.body.role === 'delivery') throw bad('Delivery partners are separate accounts: add a new one instead');
      doc.role = req.body.role === 'admin' ? 'admin' : 'tailor';
    }
    if (doc.role === 'delivery') {
      if (req.body.phone !== undefined) {
        const phone = indianMobile(req.body.phone);
        if (!phone) throw bad('Enter a valid 10-digit mobile number');
        if (phone !== doc.phone) {
          if (await Admin.exists({ role: 'delivery', phone, _id: { $ne: doc._id } })) throw bad('Another delivery partner has this number');
          doc.phone = phone;
          doc.email = placeholderEmail(phone);
          doc.phoneVerified = false; // a new number must be verified again
        }
      }
      if (req.body.phoneVerified !== undefined) doc.phoneVerified = !!req.body.phoneVerified;
      if (req.body.commission !== undefined) doc.commission = commissionOf(req.body.commission);
    } else if (req.body.password) {
      if (String(req.body.password).length < 8) throw bad('Password must be at least 8 characters');
      doc.passwordHash = await bcrypt.hash(String(req.body.password), 12);
    }
    if (req.body.active !== undefined) {
      if (self && !req.body.active) throw bad('You cannot switch off your own account');
      doc.active = !!req.body.active;
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
    if (doc.role === 'delivery' && (await Order.exists({ 'delivery.boy': doc._id }))) {
      throw bad('This partner has deliveries on record. Switch the account off instead of deleting it.');
    }
    await doc.deleteOne();
    res.json({ ok: true });
  })
);

export default r;
