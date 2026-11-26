import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

/**
 * Email (SMTP, e.g. Gmail with an app password). Every send is awaited with a time limit, because on
 * serverless hosts (Vercel) work after the response is not guaranteed to run. A failed email never fails
 * the request that triggered it.
 */
export const mailEnabled = () => !!(env.mail.user && env.mail.pass);

let transport = null;
const transporter = () => {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.port === 465,
      auth: { user: env.mail.user, pass: env.mail.pass },
    });
  }
  return transport;
};

export async function verifyMail() {
  if (!mailEnabled()) return false;
  try {
    await transporter().verify();
    return true;
  } catch (e) {
    console.warn('[mail] SMTP check failed:', e.message);
    return false;
  }
}

export async function sendMail({ to, subject, html, text, attachments, replyTo }) {
  if (!mailEnabled() || !to) return false;
  try {
    await Promise.race([
      transporter().sendMail({ from: `"${env.storeName}" <${env.mail.user}>`, to, subject, html, text, attachments, replyTo }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12_000)),
    ]);
    return true;
  } catch (e) {
    console.warn(`[mail] could not send "${subject}" to ${to}:`, e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: Number(n) % 1 ? 2 : 0 })}`;

const layout = (title, body) => `<!doctype html><html><body style="margin:0;background:#f4f2f5;font-family:Arial,Helvetica,sans-serif;color:#1d1b20">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="padding:22px 28px;background:#1d1b20;color:#fff;font-size:18px;letter-spacing:.08em"><b>${esc(env.storeName)}</b></td></tr>
<tr><td style="padding:26px 28px;font-size:15px;line-height:1.55"><h2 style="margin:0 0 14px;font-size:20px">${esc(title)}</h2>${body}</td></tr>
<tr><td style="padding:16px 28px;background:#faf9fb;color:#77737c;font-size:12px">This email was sent by ${esc(env.storeName)}. Please do not reply with passwords or card details.</td></tr>
</table></td></tr></table></body></html>`;

const button = (href, label) =>
  `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#1d1b20;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;display:inline-block">${esc(label)}</a></p>`;

const itemsTable = (o) => `<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:12px 0">
${o.items
  .map(
    (i) => `<tr style="border-bottom:1px solid #eee"><td>${esc(i.name)}<br><span style="color:#77737c;font-size:12px">${esc(i.color)} · Size ${esc(i.size)} · Qty ${i.qty}</span></td><td align="right">${inr(i.unitPrice * i.qty)}</td></tr>`
  )
  .join('')}
<tr><td>Subtotal</td><td align="right">${inr(o.subtotal)}</td></tr>
${o.discount ? `<tr><td>Discount${o.couponCode ? ` (${esc(o.couponCode)})` : ''}</td><td align="right">−${inr(o.discount)}</td></tr>` : ''}
<tr><td>Shipping</td><td align="right">${o.shipping ? inr(o.shipping) : 'Free'}</td></tr>
${o.codFee ? `<tr><td>Cash on delivery fee</td><td align="right">${inr(o.codFee)}</td></tr>` : ''}
<tr><td>GST ${o.taxRate}%${o.taxIncluded ? ' (included)' : ''}</td><td align="right">${inr(o.tax)}</td></tr>
<tr><td><b>Total</b></td><td align="right"><b>${inr(o.total)}</b></td></tr></table>`;

const payLine = (o) =>
  o.payment?.method === 'cod'
    ? `<p>Payment: <b>Cash on delivery</b> (${inr(o.total)} to pay on delivery).</p>`
    : o.payment?.status === 'paid'
      ? `<p>Payment: <b>Paid online</b>.</p>`
      : '';

export const orderUrl = (o) => `${env.siteUrl}/account/orders/${encodeURIComponent(o.orderNumber)}`;

export function orderConfirmedMail(o) {
  return {
    to: o.customer.email,
    subject: `Order ${o.orderNumber} confirmed`,
    html: layout(
      `Thank you, ${o.customer.name.split(' ')[0]}!`,
      `<p>We have received your order <b>${esc(o.orderNumber)}</b>.</p>${payLine(o)}${itemsTable(o)}
<p style="color:#55515a;font-size:13px">Delivery to: ${esc([o.address.line1, o.address.line2, o.address.city, o.address.state, o.address.pincode].filter(Boolean).join(', '))}</p>
${o.items.some((i) => i.madeToOrder) ? '<p>Our tailor will contact you to confirm measurements before stitching starts.</p>' : ''}
${button(orderUrl(o), 'View your order')}`
    ),
  };
}

export function newOrderAlertMail(o) {
  return {
    to: env.mail.notify,
    subject: `New order ${o.orderNumber} · ${inr(o.total)} · ${o.payment?.method === 'cod' ? 'COD' : 'paid online'}`,
    html: layout(
      `New order ${o.orderNumber}`,
      `<p><b>${esc(o.customer.name)}</b> · ${esc(o.customer.phone)}${o.customer.email ? ` · ${esc(o.customer.email)}` : ''}</p>${payLine(o)}${itemsTable(o)}
${o.notes ? `<p>Note: ${esc(o.notes)}</p>` : ''}${button(`${env.adminUrl}/orders?open=${o._id}`, 'Open in admin')}`
    ),
  };
}

const STATUS_TEXT = {
  contacted: 'We have confirmed the details of your order with you.',
  stitching: 'Your order is being stitched.',
  ready: 'Your order is ready.',
  shipped: 'Your order is on its way.',
  delivered: 'Your order has been delivered. We hope you love it!',
  cancelled: 'Your order has been cancelled.',
};
export function statusMail(o, status, note) {
  const t = o.tracking?.number ? `<p>Tracking: ${esc(o.tracking.carrier)} ${esc(o.tracking.number)}${o.tracking.url ? ` · <a href="${esc(o.tracking.url)}">track</a>` : ''}</p>` : '';
  return {
    to: o.customer.email,
    subject: `Order ${o.orderNumber}: ${status}`,
    html: layout(`Order ${o.orderNumber}`, `<p>${esc(STATUS_TEXT[status] || `Status: ${status}`)}</p>${note ? `<p>${esc(note)}</p>` : ''}${status === 'shipped' ? t : ''}${button(orderUrl(o), 'View your order')}`),
  };
}

export function returnMail(o, ret) {
  return {
    to: o.customer.email,
    subject: `Return for order ${o.orderNumber}: ${ret.status}`,
    html: layout(
      'Your return',
      `<p>Your return request for order <b>${esc(o.orderNumber)}</b> is now <b>${esc(ret.status)}</b>.</p>${ret.note ? `<p>${esc(ret.note)}</p>` : ''}${ret.refundAmount ? `<p>Refund: ${inr(ret.refundAmount)}</p>` : ''}${button(orderUrl(o), 'View your order')}`
    ),
  };
}

export function resetMail(to, link, who = 'your account') {
  return {
    to,
    subject: `Reset your ${env.storeName} password`,
    html: layout(
      'Reset your password',
      `<p>Someone (hopefully you) asked to reset the password for ${esc(who)}.</p>${button(link, 'Choose a new password')}<p style="color:#77737c;font-size:13px">The link works for 30 minutes. If you did not ask for this, ignore this email; your password stays the same.</p>`
    ),
  };
}

export function contactMail({ name, email, phone, message }) {
  return {
    to: env.mail.notify,
    replyTo: email || undefined,
    subject: `Contact form: ${name}`,
    html: layout('New message from the website', `<p><b>${esc(name)}</b> · ${esc(email)} · ${esc(phone)}</p><p style="white-space:pre-wrap">${esc(message)}</p>`),
  };
}
