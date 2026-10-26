// service worker: caches the app so it opens with no internet (FDA lookups still need a connection).
// bump CACHE when files change so phones pick up the new version.

const CACHE = 'careclock-v3';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'vendor/qrcode.js',
  'fonts/public-sans-latin.woff2', 'fonts/public-sans-latin-ext.woff2', 'fonts/public-sans-vietnamese.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'js/app.js', 'js/store.js', 'js/schedule.js', 'js/util.js', 'js/i18n.js', 'js/fda.js', 'js/ics.js', 'js/icons.js',
  'js/charts.js', 'js/demo.js', 'js/reminders.js', 'js/ui.js', 'js/sanitize.js', 'js/pin.js', 'js/config.js',
  'js/views/common.js', 'js/views/today.js', 'js/views/meds.js', 'js/views/history.js', 'js/views/health.js',
  'js/views/settings.js', 'js/views/card.js', 'js/views/onboarding.js', 'js/views/legal.js',
  'js/locales/en.js', 'js/locales/es.js', 'js/locales/zh.js', 'js/locales/vi.js', 'js/locales/tl.js', 'js/locales/ko.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // FDA api etc: straight to network
  // network first so updates show up right away, cache when offline
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});

// tapping a reminder notification opens/focuses the app on today's screen
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const c = list[0];
      if (c) {
        c.postMessage({ type: 'open' });
        return c.focus();
      }
      return self.clients.openWindow('./#/today');
    }),
  );
});
