import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { dbName: env.mongoDb, serverSelectionTimeoutMS: 15000 });
  console.log(`MongoDB connected (db: ${env.mongoDb})`);
}
