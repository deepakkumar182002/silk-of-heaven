/* Silk of Heaven: browser push notifications.
   The API sends { id, title, body, image, url }; tapping opens the notification inside the website. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : '' };
  }
  const title = d.title || 'Silk of Heaven';
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: d.body || '',
        image: d.image || undefined,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        tag: d.id || undefined,
        data: { id: d.id || '', url: d.url || '/' },
      }),
      // open tabs refresh their bell
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'soh:notification', id: d.id }))),
    ])
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const { id, url } = e.notification.data || {};
  const target = id ? new URL(`/shop?n=${encodeURIComponent(id)}`, self.location.origin).href : url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const tab = cs.find((c) => new URL(c.url).origin === self.location.origin);
      if (tab) {
        tab.postMessage({ type: 'soh:open', id });
        return tab.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
