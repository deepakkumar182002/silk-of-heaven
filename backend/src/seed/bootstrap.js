import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { GROUPS, normalizePiece } from '../utils/pieces.js';
import { env } from '../config/env.js';
import { Admin, Body, Category, Filter, Identity, ItemCategory, Look, Setting, TuneGroup } from '../models/index.js';
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

const DEFAULT_ITEM_CATEGORIES = [
  { key: 'footwear', label: 'Footwear', slot: 'shoes', icon: 'tee', sizes: ['36', '37', '38', '39', '40', '41'] },
  { key: 'bags', label: 'Bags & potlis', slot: 'bag', icon: 'bag', sizes: ['One size'] },
  { key: 'jewellery', label: 'Jewellery', slot: 'jewellery', multi: true, icon: 'acc', sizes: ['One size'] },
  { key: 'dupattas', label: 'Dupattas & scarves', slot: 'drape', icon: 'acc', sizes: ['One size'] },
  { key: 'jackets', label: 'Jackets & layers', slot: 'outer', icon: 'hoodie', sizes: ['XS', 'S', 'M', 'L', 'XL'] },
  { key: 'headwear', label: 'Headwear & sunglasses', slot: 'head', icon: 'hair', sizes: ['One size'] },
];

/**
 * Body models (Women / Men / Kids) and the item library, added after the first release:
 *  - creates the "Women" body from the current model (Site Settings base model) when none exists
 *  - looks and characters without a body belong to the first body
 *  - seeds a few item categories once (the admin can rename, delete or add more)
 */
export async function migrateBodies() {
  if (!(await Body.exists({}))) {
    const s = await Setting.findOne({ key: 'site' }).lean();
    // the image stays owned by Site Settings (no publicId), so replacing it later never deletes that file
    await Body.create({ key: 'women', name: 'Women', audience: 'women', image: s?.baseModel || '', height: 168, order: 0 });
    console.log('Created the "Women" body model');
  }
  const first = await Body.findOne().sort({ order: 1, createdAt: 1 }).lean();
  const [l, i] = await Promise.all([
    Look.collection.updateMany({ body: { $exists: false } }, { $set: { body: first.key, items: [] } }),
    Identity.collection.updateMany({ body: { $exists: false } }, { $set: { body: first.key } }),
  ]);
  if (l.modifiedCount || i.modifiedCount) console.log(`Assigned ${l.modifiedCount} look(s) and ${i.modifiedCount} character(s) to "${first.name}"`);
  if (!(await ItemCategory.exists({}))) {
    await ItemCategory.insertMany(DEFAULT_ITEM_CATEGORIES.map((c, order) => ({ ...c, order })));
    console.log(`Seeded ${DEFAULT_ITEM_CATEGORIES.length} item categories`);
  }
}
