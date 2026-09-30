// Posta PWA — service worker mínimo y seguro.
// Solo cachea los íconos de la app. Todo lo demás (HTML, JS, CSS, API)
// pasa siempre por la red: nunca sirve contenido viejo de la app.
const CACHE = 'posta-icons-v1';
const ICONS = [
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ICONS)).then(() => self.skipWaiting()).catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (!ICONS.includes(url.pathname)) return; // la app siempre va por red
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }))
  );
});

// ---------- Push notifications (Web Push / VAPID) ----------
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = {}; }
  const title = data.title || 'Posty 💬';
  const body = data.body || '';
  const url = data.url || '/#/app/semana';
  const opts = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: Object.assign({ url }, data.data || {}),
    tag: 'posta-push',
    renotify: false,
  };
  if (data.image) opts.image = data.image;
  if (Array.isArray(data.actions) && data.actions.length) opts.actions = data.actions;
  e.waitUntil(self.registration.showNotification(title, opts));
});

function openPushUrl(url) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const c of clients) {
      try {
        const u = new URL(c.url);
        if (u.origin === self.location.origin) { c.navigate(url); return c.focus(); }
      } catch (err) { /* seguir */ }
    }
    return self.clients.openWindow(url);
  });
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const ndata = e.notification.data || {};
  const url = ndata.url || '/#/app/semana';
  const postId = ndata.postId;
  // Botones de aprobación (Posty te avisa): acción directa sin abrir la app.
  if ((e.action === 'approve' || e.action === 'reject') && postId) {
    const verb = e.action === 'approve' ? 'approve' : 'reject';
    const doneTitle = e.action === 'approve'
      ? '✅ ¡Aprobado! Sale a la hora indicada.'
      : '❌ Rechazado. No se va a publicar.';
    e.waitUntil((async () => {
      try {
        const r = await fetch('/api/posts/' + encodeURIComponent(postId) + '/' + verb, {
          method: 'POST',
          credentials: 'include',
        });
        if (!r.ok) throw new Error('http ' + r.status);
        await self.registration.showNotification(doneTitle, {
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          data: { url },
          tag: 'posta-push-confirm',
        });
      } catch (err) {
        // Si el fetch falla, abrir la URL igual (el usuario lo resuelve en la app).
        await openPushUrl(url);
      }
    })());
    return;
  }
  // Tap en el cuerpo de la notificación: comportamiento de siempre.
  e.waitUntil(openPushUrl(url));
});
