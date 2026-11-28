import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { uploadBuffer, uploadSignature } from '../config/cloudinary.js';

const ALLOWED = ['image/png', 'image/webp', 'image/jpeg', 'image/avif', 'image/gif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Only PNG, WebP, JPEG, AVIF or GIF images are allowed'), { status: 400 }));
  },
});

const r = Router();

// POST /api/upload?folder=looks   (multipart field: "file")
r.post(
  '/',
  requireAuth,
  requireRole('admin', 'tailor'),
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

// GET /api/upload/sign?folder=promos → signed form fields for a direct upload to Cloudinary (videos, big GIFs)
r.get('/sign', requireAuth, requireRole('admin'), (req, res) => {
  const folder = String(req.query.folder || 'misc').replace(/[^a-z0-9_-]/gi, '') || 'misc';
  res.json(uploadSignature(folder));
});

export default r;
