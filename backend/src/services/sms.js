import { env } from '../config/env.js';

/**
 * OTP by SMS through SMSGatewayHub (DLT registered sender + template, India).
 * The text must match the approved DLT template exactly, only {{otp}} changes.
 */
export const smsEnabled = () => !!(env.sms.apiKey && env.sms.senderId && env.sms.templateId);

/** 10-digit Indian mobile from any input ("+91 98765-43210" → "9876543210"), or '' when invalid. */
export function indianMobile(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
}

export async function sendOtpSms(phone, otp) {
  if (!smsEnabled()) {
    if (env.production) throw Object.assign(new Error('Phone login is not available right now.'), { status: 503, expose: true });
    console.log(`[sms] (not configured) OTP for ${phone}: ${otp}`);
    return { dev: true };
  }
  const q = new URLSearchParams({
    APIKey: env.sms.apiKey,
    senderid: env.sms.senderId,
    channel: '2',
    DCS: '0',
    flashsms: '0',
    number: `91${phone}`,
    text: env.sms.text.replace('{{otp}}', otp),
    route: env.sms.route,
    EntityId: env.sms.entityId,
    dlttemplateid: env.sms.templateId,
  });
  let data;
  try {
    const res = await fetch(`https://www.smsgatewayhub.com/api/mt/SendSMS?${q}`, { signal: AbortSignal.timeout(15_000) });
    data = await res.json().catch(() => ({}));
  } catch {
    throw Object.assign(new Error('Could not send the OTP. Please try again.'), { status: 502, expose: true });
  }
  if (!['000', '0'].includes(String(data.ErrorCode))) {
    console.warn('[sms] gateway error', data.ErrorCode, data.ErrorMessage);
    throw Object.assign(new Error('Could not send the OTP. Please try again in a minute.'), { status: 502, expose: true });
  }
  return { jobId: data.JobId };
}
