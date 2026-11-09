/* Service worker: solo notificaciones push. No cachea nada a propósito (cero riesgo de versiones viejas pegadas). */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Nuevo mensaje', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Nuevo mensaje';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'chat', // los mensajes seguidos se agrupan en una sola notificación
    renotify: true,
    data: { url: data.url || '/' },
  };

  // iOS exige mostrar SIEMPRE una notificación al recibir un push
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          return client.focus().then((c) => {
            // Si la notificación es de otro chat, lleva a esa conversación
            if (c && 'navigate' in c && url !== '/') return c.navigate(url);
            return c;
          });
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
