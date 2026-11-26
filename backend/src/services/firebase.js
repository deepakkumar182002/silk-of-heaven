import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env.js';

/**
 * Google sign-in through Firebase Auth. The website signs in with Firebase and sends the ID token;
 * it is verified here against Google's public keys, so no service-account private key is needed.
 */
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export const googleEnabled = () => !!env.firebase.projectId;

export async function verifyFirebaseToken(idToken) {
  const id = env.firebase.projectId;
  const { payload } = await jwtVerify(String(idToken || ''), JWKS, {
    issuer: `https://securetoken.google.com/${id}`,
    audience: id,
    algorithms: ['RS256'],
  });
  if (!payload.sub) throw new Error('no subject');
  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : '',
    emailVerified: !!payload.email_verified,
    name: payload.name || '',
    picture: payload.picture || '',
    provider: payload.firebase?.sign_in_provider || '',
  };
}
