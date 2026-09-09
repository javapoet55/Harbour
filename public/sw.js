self.addEventListener('push', (event) => {
  let data = { title: 'Nexdo', body: 'You have a reminder.', url: '/notifications' };
  try { data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/nexdo-app-192.png', data: { url: data.url } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/notifications';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => new URL(client.url).pathname === url);
    return existing ? existing.focus() : clients.openWindow(url);
  }));
});
