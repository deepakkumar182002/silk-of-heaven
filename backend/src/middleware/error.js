import mongoose from 'mongoose';
import multer from 'multer';

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, res) {
  res.status(404).json({ message: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ message: `Invalid ${err.path}` });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ message: `Duplicate value for ${Object.keys(err.keyValue || {}).join(', ')}` });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  // `expose` = message written for users (e.g. "AI is not configured"), safe to show even for 5xx
  res.status(status).json({ message: status >= 500 && !err.expose ? 'Server error' : err.message });
}
