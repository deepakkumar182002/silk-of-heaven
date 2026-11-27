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

export async function destroyImage(publicId, resourceType = 'image') {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (e) {
    console.warn('Cloudinary destroy failed:', publicId, e.message);
  }
}

/**
 * Signature for a direct browser → Cloudinary upload (used for videos and big GIFs, which are
 * larger than a serverless request may be). The browser posts the file to `url` with these fields.
 */
export function uploadSignature(subfolder = 'misc') {
  const timestamp = Math.round(Date.now() / 1000);
  const params = { folder: `${folder}/${subfolder}`, timestamp };
  return {
    url: `https://api.cloudinary.com/v1_1/${credentials.cloud_name}/auto/upload`,
    fields: { ...params, api_key: credentials.api_key, signature: cloudinary.utils.api_sign_request(params, credentials.api_secret) },
  };
}

export default cloudinary;
