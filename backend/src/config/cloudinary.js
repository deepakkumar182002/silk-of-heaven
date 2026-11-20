import { v2 as cloudinary } from 'cloudinary';
import { env } from './env.js';

const { folder, ...credentials } = env.cloudinary;
cloudinary.config({ ...credentials, secure: true });

export function uploadBuffer(buffer, subfolder = 'misc') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `${folder}/${subfolder}`, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

export async function destroyImage(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (e) {
    console.warn('Cloudinary destroy failed:', publicId, e.message);
  }
}

export default cloudinary;
