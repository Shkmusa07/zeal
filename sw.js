'use strict';

const CACHE_NAME = 'studyapp-v2';

// All files that form the app shell
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/app.js',
  './js/syllabus.js',
  './js/tasks.js',
  './js/reviews.js',
  './js/focus.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── Install: cache the app shell ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // addAll fails atomically; individual failures won't break the install
        return Promise.allSettled(
          SHELL_ASSETS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW] Failed to cache:', url, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first, falling back to network ──────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only intercept same-origin GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response.ok && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) =>
              cache.put(event.request, clone)
            );
          }
          return response;
        })
        .catch(() => {
          // Offline fallback: return cached index for navigation requests
          if (event.request.destination === 'document') {
            return caches.match('./index.html') || caches.match('./');
          }
        });
    })
  );
});

// ── Push ─────────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Study & Focus';
  const options = {
    body: data.body || 'Review or focus reminder due!',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: data.tag || 'studyapp-notification',
    renotify: true,
    data: data
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    })
  );
});
