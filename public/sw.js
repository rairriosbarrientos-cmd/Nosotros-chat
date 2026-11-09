/* Service worker: notificaciones push + abrir sin señal.
 * Páginas: primero la red (siempre la versión nueva si hay internet); sin señal, la última copia.
 * Archivos de /_next/static: nunca cambian (llevan hash), así que se sirven de la copia. */

const VERSION = 'v1';
const SHELL = `nosotros-shell-${VERSION}`;
const STATIC = 'nosotros-static';
const PAGES = ['/', '/login'];
const NAV_TIMEOUT_MS = 4500;

/** Guarda la página y todos los archivos que necesita para abrir sin señal. */
async function precache() {
  const shell = await caches.open(SHELL);
  const stat = await caches.open(STATIC);
  for (const p of PAGES) {
    try {
      const res = await fetch(new Request(p, { cache: 'reload' }));
      if (!res.ok) continue;
      const html = await res.clone().text();
      await shell.put(p, res);
      const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
      await Promise.all(
        assets.map(async (a) => {
          if (await stat.match(a)) return;
          const r = await fetch(a).catch(() => null);
          if (r && r.ok) await stat.put(a, r);
        }),
      );
    } catch {
      // sin red al instalar: se guardará la próxima vez
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nosotros-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function page(request) {
  const url = new URL(request.url);
  const key = PAGES.includes(url.pathname) ? url.pathname : '/';
  try {
    const res = await withTimeout(fetch(request), NAV_TIMEOUT_MS);
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(key, copy)).catch(() => {});
    }
    return res;
  } catch {
    const cached = (await caches.match(key)) || (await caches.match('/'));
    return cached || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function asset(request, immutable) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit && immutable) return hit;
  let res;
  try {
    res = await fetch(request);
  } catch (e) {
    if (hit) return hit;
    throw e;
  }
  if (res.ok && res.type === 'basic') {
    cache.put(request, res.clone()).then(async () => {
      const keys = await cache.keys();
      if (keys.length > 400) await Promise.all(keys.slice(0, keys.length - 300).map((k) => cache.delete(k)));
    }).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(page(req));
    return;
  }
  const immutable = url.pathname.startsWith('/_next/static/');
  if (immutable || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(asset(req, immutable).catch(() => caches.match(req).then((r) => r || Response.error())));
  }
});

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
