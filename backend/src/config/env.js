import 'dotenv/config';

const required = ['MONGO_URI', 'JWT_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

export const env = {
  port: Number(process.env.PORT) || 5050,
  mongoUri: process.env.MONGO_URI,
  mongoDb: process.env.MONGO_DB || 'vell',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || 'vell',
  },
  // Optional: AI try-on (dress fitting, mix & match layers, face swap). Disabled when no key is set.
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  },
  // Website face swap. engine: auto (free local Python service, else Gemini) | local | gemini
  face: {
    url: (process.env.FACE_SERVICE_URL || 'http://127.0.0.1:5065').replace(/\/+$/, ''),
    engine: ['local', 'gemini'].includes(process.env.FACE_ENGINE) ? process.env.FACE_ENGINE : 'auto',
    perHour: Number(process.env.FACE_SWAP_PER_HOUR) || 20,
    // shared secret, must match FACE_SERVICE_TOKEN on the face service when it is deployed online
    token: process.env.FACE_SERVICE_TOKEN || '',
  },
  // browser push notifications (Web Push / VAPID); empty = push off, the bell still works
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
  },
  clientOrigins: (process.env.CLIENT_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),

  production: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
  // links in emails (password reset, order pages)
  siteUrl: (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  adminUrl: (process.env.ADMIN_URL || 'http://localhost:5174').replace(/\/+$/, ''),
  storeName: process.env.STORE_NAME || 'Silk of Heaven',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  mail: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    notify: process.env.STORE_NOTIFY_EMAIL || process.env.EMAIL_USER || '',
  },
  sms: {
    apiKey: process.env.SMS_GH_API_KEY || '',
    senderId: process.env.SMS_GH_SENDER_ID || '',
    entityId: process.env.SMS_GH_ENTITY_ID || '',
    templateId: process.env.SMS_GH_DLT_TEMPLATE_ID || '',
    route: process.env.SMS_GH_ROUTE || '',
    text: process.env.SMS_GH_OTP_TEXT || 'Your OTP is {{otp}}',
  },
  firebase: { projectId: process.env.FIREBASE_PROJECT_ID || '' },
};
