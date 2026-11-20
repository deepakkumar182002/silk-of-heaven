import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import contentRoutes, { publicRouter } from './routes/content.js';
import { errorHandler, notFound } from './middleware/error.js';
import teamRoutes from './routes/team.js';
import { adminOrders, publicOrders } from './routes/orders.js';
import { ensureAdmin, ensureContent, migrateShopData } from './seed/bootstrap.js';

const app = express();

app.disable('x-powered-by');
app.use(
  cors({
    origin: (origin, cb) => {
      // allow same-origin / tools without Origin header, and whitelisted frontends
      if (!origin || env.clientOrigins.length === 0 || env.clientOrigins.includes(origin)) return cb(null, true);
      cb(Object.assign(new Error(`Origin ${origin} not allowed by CORS`), { status: 403 }));
    },
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/public', publicRouter); // website (no auth)
app.use('/api/public', publicOrders); // place + track orders (no auth)
app.use('/api/auth', authRoutes); // admin login
app.use('/api/upload', uploadRoutes); // admin → Cloudinary
app.use('/api/admin/orders', adminOrders); // orders — admin + tailor
app.use('/api/admin/team', teamRoutes); // staff accounts — admin only
app.use('/api/admin', contentRoutes); // admin CRUD (JWT protected)

app.use(notFound);
app.use(errorHandler);

try {
  await connectDB();
  await ensureAdmin();
  await ensureContent();
  await migrateShopData();
  app.listen(env.port, () => console.log(`VELL API listening on http://localhost:${env.port}`));
} catch (e) {
  console.error('Failed to start:', e.message);
  process.exit(1);
}
