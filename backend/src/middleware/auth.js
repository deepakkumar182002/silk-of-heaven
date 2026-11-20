import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Admin } from '../models/index.js';

export const signToken = (admin) =>
  jwt.sign({ sub: admin._id.toString(), email: admin.email, role: admin.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const admin = await Admin.findById(payload.sub);
    if (!admin) return res.status(401).json({ message: 'Account no longer exists' });
    req.admin = admin;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/** Use after requireAuth. e.g. requireRole('admin') */
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.admin?.role) ? next() : res.status(403).json({ message: 'You do not have access to this' });
