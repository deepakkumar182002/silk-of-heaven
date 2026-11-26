import crypto from 'crypto';
import { env } from '../config/env.js';

/** Razorpay over its REST API (no SDK needed). Amounts are in paise. */
export const razorpayEnabled = () => !!(env.razorpay.keyId && env.razorpay.keySecret);

const fail = (message, status = 502) => Object.assign(new Error(message), { status, expose: true });

async function rzp(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64'),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw fail('Could not reach the payment gateway. Please try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn('[razorpay]', path, res.status, data?.error?.description);
    throw fail(data?.error?.description || 'Payment gateway error');
  }
  return data;
}

export const paise = (rupees) => Math.round(Number(rupees) * 100);

export const createRzpOrder = ({ amount, receipt, notes }) =>
  rzp('/orders', { method: 'POST', body: { amount: paise(amount), currency: 'INR', receipt, notes, payment_capture: 1 } });

export const fetchPayment = (id) => rzp(`/payments/${encodeURIComponent(id)}`);

export const refundPayment = (paymentId, amount, notes) =>
  rzp(`/payments/${encodeURIComponent(paymentId)}/refund`, { method: 'POST', body: { amount: paise(amount), notes } });

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Checkout success handler signature: HMAC-SHA256(order_id|payment_id, key secret). */
export const validPaymentSignature = (orderId, paymentId, signature) =>
  safeEqual(crypto.createHmac('sha256', env.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex'), signature);

/** Webhook signature: HMAC-SHA256(raw body, webhook secret). */
export const validWebhookSignature = (raw, signature) =>
  !!env.razorpay.webhookSecret && safeEqual(crypto.createHmac('sha256', env.razorpay.webhookSecret).update(raw).digest('hex'), signature);
