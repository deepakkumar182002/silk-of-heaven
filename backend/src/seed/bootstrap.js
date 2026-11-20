import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { GROUPS, normalizePiece } from '../utils/pieces.js';
import { env } from '../config/env.js';
import { Admin, Category, Filter, Identity, Look, Setting, TuneGroup } from '../models/index.js';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_FILTERS,
  DEFAULT_IDENTITIES,
  DEFAULT_LOOKS,
  DEFAULT_SETTINGS,
  DEFAULT_TUNE,
} from './defaults.js';

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when no admin exists. */
export async function ensureAdmin() {
  if (await Admin.exists({})) return;
  if (!env.adminEmail || !env.adminPassword) {
    console.warn('No admin account exists and ADMIN_EMAIL / ADMIN_PASSWORD are not set.');
    return;
  }
  await Admin.create({ email: env.adminEmail, passwordHash: await bcrypt.hash(env.adminPassword, 12) });
  console.log(`Created admin account: ${env.adminEmail}`);
}

/** Seeds each content collection only if it is empty. */
export async function ensureContent() {
  const seeds = [
    [Category, DEFAULT_CATEGORIES],
    [Look, DEFAULT_LOOKS],
    [Identity, DEFAULT_IDENTITIES],
    [TuneGroup, DEFAULT_TUNE],
    [Filter, DEFAULT_FILTERS],
    [Setting, [DEFAULT_SETTINGS]],
  ];
  for (const [Model, docs] of seeds) {
    if (!(await Model.exists({}))) {
      await Model.insertMany(docs);
      console.log(`Seeded ${docs.length} ${Model.modelName} document(s)`);
    }
  }
}

export async function resetContent() {
  await Promise.all([Category, Look, Identity, TuneGroup, Filter, Setting].map((M) => M.deleteMany({})));
}

/**
 * One-time / idempotent migration for data created before the shop feature:
 *  - admins without a role become "admin"
 *  - every piece gets a stable _id (carts & orders reference it)
 *  - pieces without sizes/colours/specs are back-filled with sensible defaults
 * Uses the raw collection so it never touches pieces that are already complete.
 */
export async function migrateShopData() {
  await Admin.collection.updateMany({ role: { $exists: false } }, { $set: { role: 'admin' } });

  const looks = await Look.collection.find({}).toArray();
  let fixed = 0;
  for (const look of looks) {
    let changed = false;
    const pieces = { ...(look.pieces || {}) };
    for (const g of GROUPS) {
      pieces[g] = (pieces[g] || []).map((p) => {
        let q = p;
        if (!q._id) {
          q = { ...q, _id: new mongoose.Types.ObjectId() };
          changed = true;
        }
        if (q.sizes === undefined || q.colors === undefined || q.fabric === undefined) {
          const n = normalizePiece(q, g);
          q = {
            ...q,
            description: q.description ?? n.description,
            fabric: q.fabric ?? n.fabric,
            care: q.care ?? n.care,
            sizes: q.sizes ?? n.sizes,
            colors: q.colors ?? n.colors,
            madeToOrder: q.madeToOrder ?? n.madeToOrder,
            leadTimeDays: q.leadTimeDays ?? n.leadTimeDays,
          };
          changed = true;
        }
        return q;
      });
    }
    if (changed) {
      await Look.collection.updateOne({ _id: look._id }, { $set: { pieces } });
      fixed++;
    }
  }
  if (fixed) console.log(`Migrated shop data on ${fixed} look(s)`);
}
