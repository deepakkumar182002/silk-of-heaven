import webpush from 'web-push';
import { env } from '../config/env.js';
import { Notification, PushSub } from '../models/index.js';

/**
 * Notifications: every one is saved (the website's bell lists them) and sent as a browser push
 * (Web Push with our VAPID keys — the same standard Firebase Cloud Messaging uses on the web,
 * without needing a Firebase service account).
 */
export const pushEnabled = () => !!(env.push.publicKey && env.push.privateKey);

let ready = false;
function setup() {
  if (ready) return;
  // the push services need a contact: the site URL (https) or an email
  const subject = env.siteUrl.startsWith('https://') ? env.siteUrl : `mailto:${env.mail.user || 'admin@localhost'}`;
  webpush.setVapidDetails(subject, env.push.publicKey, env.push.privateKey);
  ready = true;
}

const absolute = (u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : `${env.siteUrl}${u.startsWith('/') ? '' : '/'}${u}`);

/** Push one notification to these subscriptions. Dead subscriptions (browser unsubscribed) are removed. */
export async function pushTo(subs, n) {
  if (!pushEnabled() || !subs.length) return { sent: 0, failed: 0 };
  setup();
  const payload = JSON.stringify({
    id: String(n._id || ''),
    title: n.title.slice(0, 120),
    body: (n.body || '').slice(0, 300),
    image: n.pushImage === false ? '' : absolute(n.image),
    url: absolute(n.link || '/'),
  });
  let sent = 0;
  let failed = 0;
  const dead = [];
  const queue = [...subs];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 3 * 24 * 3600, timeout: 8000 });
        sent++;
      } catch (e) {
        failed++;
        if (e.statusCode === 404 || e.statusCode === 410) dead.push(s._id);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(20, subs.length) }, worker));
  if (dead.length) await PushSub.deleteMany({ _id: { $in: dead } });
  return { sent, failed: failed - dead.length, removed: dead.length };
}

/** Save a notification and push it to its audience. */
export async function sendNotification(data) {
  const n = await Notification.create(data);
  const subs = await PushSub.find(n.audience === 'all' ? {} : { customer: { $in: n.recipients } }).lean();
  const r = await pushTo(subs, { ...n.toObject(), pushImage: data.pushImage });
  n.push = { sent: r.sent, failed: r.failed };
  await n.save();
  return n;
}

/** Order / return updates for one customer. Never throws: an order must not fail because of a notification. */
export async function notifyCustomer(customerId, { title, body, link, image }) {
  if (!customerId) return null;
  try {
    return await sendNotification({ title, body, link, image: image || '', pushImage: false, type: 'order', audience: 'selected', recipients: [customerId], sentBy: 'system' });
  } catch (e) {
    console.warn('Notification failed:', e.message);
    return null;
  }
}

export const orderLink = (o) => `/account/orders/${encodeURIComponent(o.orderNumber)}`;
