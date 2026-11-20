import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { uploadBuffer } from '../config/cloudinary.js';

const ALLOWED = ['image/png', 'image/webp', 'image/jpeg', 'image/avif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Only PNG, WebP, JPEG or AVIF images are allowed'), { status: 400 }));
  },
});

const r = Router();

// POST /api/upload?folder=looks   (multipart field: "file")
r.post(
  '/',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded (field name must be "file")' });
    const folder = String(req.query.folder || 'misc').replace(/[^a-z0-9_-]/gi, '') || 'misc';
    const result = await uploadBuffer(req.file.buffer, folder);
    res.status(201).json({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    });
  })
);

export default r;
