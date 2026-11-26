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
  clientOrigins: (process.env.CLIENT_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean),
};
