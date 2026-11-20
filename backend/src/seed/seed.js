// Usage: npm run seed          -> seeds empty collections + first admin
//        npm run seed:reset    -> wipes content (not admins) and re-seeds defaults
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { ensureAdmin, ensureContent, migrateShopData, resetContent } from './bootstrap.js';

try {
  await connectDB();
  if (process.argv.includes('--reset')) {
    await resetContent();
    console.log('Content collections cleared');
  }
  await ensureAdmin();
  await ensureContent();
  await migrateShopData();
  console.log('Seed complete');
} catch (e) {
  console.error('Seed failed:', e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
