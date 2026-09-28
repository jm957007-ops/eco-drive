// Service worker mínimo: permite instalar la app y muestra un aviso si no hay internet.
// No guarda copias de la app, así siempre se carga la versión más reciente.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<body style="font-family:system-ui;padding:40px 24px;color:#0B3140;background:#FFB400">'
    + '<h1>Sin conexión</h1><p>Eco Drive necesita internet. Revisa tus datos o tu WiFi y vuelve a abrir la app.</p>'
    + '<button onclick="location.reload()" style="font-size:18px;padding:12px 20px;border:0;border-radius:12px;background:#0B3140;color:#fff">Reintentar</button></body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )));
});
