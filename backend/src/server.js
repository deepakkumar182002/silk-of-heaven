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
import { adminNotifications, publicNotifications } from './routes/notifications.js';
import { adminDelivery, riderRoutes } from './routes/delivery.js';
import { adminStitching, customerStitching } from './routes/stitching.js';
import { adminAi, publicAi } from './routes/ai.js';
import customerRoutes from './routes/customer.js';
import checkoutRoutes, { razorpayWebhook } from './routes/checkout.js';
import shopAdminRoutes from './routes/shopAdmin.js';
import { asyncHandler } from './middleware/error.js';
import { ensureAdmin, ensureContent, migrateBodies, migrateShopData } from './seed/bootstrap.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

function isOriginAllowed(origin) {
  // Allow requests with no origin (like mobile apps, curl, or same-origin)
  if (!origin) return true;

  // Wildcard allowed or no origins specified -> allow all
  if (env.clientOrigins.includes('*') || env.clientOrigins.length === 0) return true;

  const clean = origin.trim().replace(/\/+$/, '').toLowerCase();

  // Explicitly whitelisted frontend origins
  if (env.clientOrigins.some((o) => o.toLowerCase() === clean)) return true;

  // Automatically allow any Vercel deployment (production or preview)
  if (/^https:\/\/[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.vercel\.app$/i.test(clean)) return true;

  // Allow localhost during development
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean)) return true;

  return false;
}

const corsMiddleware = cors({
  origin: (origin, cb) => {
    if (isOriginAllowed(origin)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 200,
});

app.use(corsMiddleware);
app.options('*', corsMiddleware);

// keep the raw body: the Razorpay webhook signature is computed over the exact bytes
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => (req.rawBody = buf) }));

app.get('/', (req, res) => res.json({ ok: true, name: 'Silk of Heaven API' }));
app.get('/api', (req, res) => res.json({ ok: true, name: 'Silk of Heaven API' }));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/public', publicRouter); // website (no auth)
app.use('/api/public', publicOrders); // place + track orders (no auth)
app.use('/api/public/tryon', publicAi); // face swap (rate limited)
app.use('/api/public/notifications', publicNotifications); // bell + browser push subscriptions
app.use('/api/public/checkout', checkoutRoutes); // quote, place order, Razorpay verify
app.post('/api/public/payments/razorpay-webhook', asyncHandler(razorpayWebhook));
app.use('/api/customer/stitching', customerStitching); // custom stitching requests
app.use('/api/customer', customerRoutes); // website accounts: login, orders, addresses, wishlist, reviews
app.use('/api/auth', authRoutes); // admin login
app.use('/api/upload', uploadRoutes); // admin → Cloudinary
app.use('/api/admin/orders', adminOrders); // orders — admin + tailor
app.use('/api/admin/notifications', adminNotifications); // custom notifications — admin only
app.use('/api/admin/stitching', adminStitching); // stitching requests: quotes — admin + tailor
app.use('/api/admin/delivery', adminDelivery); // delivery partners: monitoring + assigning — admin only
app.use('/api/delivery', riderRoutes); // the delivery partner's own orders and earnings
app.use('/api/admin/team', teamRoutes); // staff accounts — admin only
app.use('/api/admin/ai', adminAi); // AI dress fitting + mix & match layers
app.use('/api/admin', shopAdminRoutes); // coupons, reviews, customers, reports
app.use('/api/admin', contentRoutes); // admin CRUD (JWT protected)

app.use(notFound);
app.use(errorHandler);

try {
  await connectDB();
  await ensureAdmin();
  await ensureContent();
  await migrateShopData();
  await migrateBodies();
  app.listen(env.port, () => console.log(`API listening on http://localhost:${env.port}`));
} catch (e) {
  console.error('Failed to start:', e.message);
  process.exit(1);
}

export default app;
