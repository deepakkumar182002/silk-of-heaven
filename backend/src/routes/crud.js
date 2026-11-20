import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const pick = (obj, fields) => Object.fromEntries(fields.filter((f) => obj[f] !== undefined).map((f) => [f, obj[f]]));

/**
 * Generic admin CRUD router. Every route requires a valid admin JWT.
 * fields: whitelist of writable fields (prevents mass assignment)
 * hooks: { afterUpdate(oldDoc, newDoc), afterDelete(doc) }
 */
export function crudRouter(Model, { fields, sort = { order: 1, createdAt: 1 }, hooks = {} }) {
  const r = Router();
  r.use(requireAuth, requireRole('admin'));

  r.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await Model.find().sort(sort));
    })
  );

  r.put(
    '/reorder',
    asyncHandler(async (req, res) => {
      const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
      await Model.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { order: i } } })));
      res.json(await Model.find().sort(sort));
    })
  );

  r.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const doc = await Model.findById(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Not found' });
      res.json(doc);
    })
  );

  r.post(
    '/',
    asyncHandler(async (req, res) => {
      const data = pick(req.body, fields);
      if (data.order === undefined && Model.schema.path('order')) {
        const last = await Model.findOne().sort({ order: -1 });
        data.order = last ? (last.order || 0) + 1 : 0;
      }
      res.status(201).json(await Model.create(data));
    })
  );

  r.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const old = await Model.findById(req.params.id);
      if (!old) return res.status(404).json({ message: 'Not found' });
      const before = old.toObject();
      old.set(pick(req.body, fields));
      const doc = await old.save();
      if (hooks.afterUpdate) await hooks.afterUpdate(before, doc);
      res.json(doc);
    })
  );

  r.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) return res.status(404).json({ message: 'Not found' });
      if (hooks.afterDelete) await hooks.afterDelete(doc);
      res.json({ ok: true });
    })
  );

  return r;
}
