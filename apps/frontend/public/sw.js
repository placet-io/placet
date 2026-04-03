// Placet Push Notification Service Worker
// This runs independently of the main page — it stays alive even when the tab
// is backgrounded or closed, ensuring push notifications always arrive.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Placet', body: event.data.text() };
  }

  const { title = 'Placet', body = '', channelId = '' } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicons/android-chrome-192x192.png',
      badge: '/favicons/android-chrome-192x192.png',
      tag: `hp-push-${channelId}`,
      renotify: true,
      data: { channelId },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const channelId = event.notification.data?.channelId;
  const url = channelId ? `/chats/${channelId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If an existing window is open, focus and navigate it
      for (const client of clientList) {
        if ('focus' in client && 'navigate' in client) {
          return client.focus().then((c) => c.navigate(url));
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    }),
  );
});
