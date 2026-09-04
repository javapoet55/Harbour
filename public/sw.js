self.addEventListener('push', (event) => {
  let data = { title: 'Harbour', body: 'You have a reminder.', url: '/notifications' };
  try { data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/favicon.ico', badge: '/favicon.ico', data: { url: data.url } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/notifications';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => new URL(client.url).pathname === url);
    return existing ? existing.focus() : clients.openWindow(url);
  }));
});
