// Consola: solo para recibir avisos en el teléfono (no guarda nada sin conexión).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'Consola Mi Gym', {
    body: d.body || '', icon: '/icons/consola-192.png', badge: '/icons/consola-192.png', data: { url: d.url || '/' }, tag: d.url || 'consola'
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { c.navigate ? c.navigate(url) : null; return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
