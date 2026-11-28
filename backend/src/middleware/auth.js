import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Admin, Customer } from '../models/index.js';

export const signToken = (admin) =>
  jwt.sign({ sub: admin._id.toString(), email: admin.email, role: admin.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (payload.typ === 'customer') throw new Error('customer token'); // shop accounts never get staff access
    const admin = await Admin.findById(payload.sub);
    if (!admin) return res.status(401).json({ message: 'Account no longer exists' });
    if (admin.active === false) return res.status(401).json({ message: 'This account is switched off' });
    req.admin = admin;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/** Use after requireAuth. e.g. requireRole('admin') */
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.admin?.role) ? next() : res.status(403).json({ message: 'You do not have access to this' });

// ---------------------------------------------------------------------------
// Website customer accounts (separate from staff: tokens carry typ "customer")
// ---------------------------------------------------------------------------
export const signCustomerToken = (c) => jwt.sign({ sub: c._id.toString(), typ: 'customer' }, env.jwtSecret, { expiresIn: '30d' });

async function customerFrom(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret);
    if (payload.typ !== 'customer') return null;
    const c = await Customer.findById(payload.sub);
    return c && !c.blocked ? c : null;
  } catch {
    return null;
  }
}

export async function requireCustomer(req, res, next) {
  req.customer = await customerFrom(req);
  if (!req.customer) return res.status(401).json({ message: 'Please log in again' });
  next();
}

/** Attaches req.customer when a valid customer token is sent; guests continue as guests. */
export async function optionalCustomer(req, res, next) {
  req.customer = await customerFrom(req);
  next();
}
