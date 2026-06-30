/**
 * sw.js — Ornaza MIS Service Worker
 * Strategy:
 *   - App shell (HTML, CSS, JS, icons, manifest) → Cache First
 *   - API calls to Apps Script → Network Only (never cache API)
 *   - Background Sync tag 'outbox-sync' flushes offline mutations
 */

const CACHE_NAME = 'ornaza-mis-v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/config.js',
  './js/db.js',
  './js/api.js',
  './js/auth.js',
  './js/sync.js',
  './js/app.js',
  './js/views/login.js',
  './js/views/dashboard.js',
  './js/views/checkin.js',
  './js/views/employees.js',
  './js/views/attendance.js',
  './js/views/leaves.js',
  './js/views/payroll.js',
  './js/views/performance.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Poppins:wght@300;400;500;600&display=swap'
];

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Cache what we can; don't fail install if Google Fonts is unreachable
      return cache.addAll(SHELL_ASSETS.filter(function (url) {
        return !url.startsWith('https://fonts.googleapis.com');
      })).then(function () {
        return cache.add('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Poppins:wght@300;400;500;600&display=swap').catch(function () {});
      });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────────
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// ── Fetch: cache-first for shell, network-only for API ────────────────────────
self.addEventListener('fetch', function (event) {
  var url = event.request.url;

  // Never intercept API calls — Apps Script handles CORS, we must not cache
  if (url.includes('script.google.com') || url.includes('macros/')) {
    return; // fall through to network
  }

  // POST requests — don't cache
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;

      // Not in cache — fetch from network and cache
      return fetch(event.request).then(function (response) {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        var toCache = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, toCache);
        });
        return response;
      }).catch(function () {
        // Offline and not cached — return offline page for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// ── Background Sync: flush outbox when connection restored ────────────────────
self.addEventListener('sync', function (event) {
  if (event.tag === 'outbox-sync') {
    event.waitUntil(flushOutbox());
  }
});

/**
 * Opens the IndexedDB outbox and posts each pending mutation to the API.
 * On success removes the outbox entry. On failure leaves it for next sync.
 */
function flushOutbox() {
  return new Promise(function (resolve, reject) {
    var openReq = indexedDB.open('ornaza-mis', 1);

    openReq.onsuccess = function (e) {
      var db = e.target.result;

      // Read all outbox entries
      var tx = db.transaction('outbox', 'readonly');
      var store = tx.objectStore('outbox');
      var getAllReq = store.getAll();

      getAllReq.onsuccess = function () {
        var items = getAllReq.result || [];
        if (items.length === 0) { resolve(); return; }

        // Read token from meta store
        var metaTx = db.transaction('meta', 'readonly');
        var metaStore = metaTx.objectStore('meta');
        var tokenReq = metaStore.get('token');

        tokenReq.onsuccess = function () {
          var token = tokenReq.result ? tokenReq.result.value : null;
          if (!token) { resolve(); return; }

          // Read API_URL from meta
          var urlReq = metaStore.get('apiUrl');
          urlReq.onsuccess = function () {
            var apiUrl = urlReq.result ? urlReq.result.value : null;
            if (!apiUrl) { resolve(); return; }

            // Send all outbox items as one sync payload
            var mutations = items.map(function (item) { return item.mutation; });
            var payload = { action: 'sync', token: token, changes: mutations, since: {} };

            fetch(apiUrl, {
              method: 'POST',
              body: JSON.stringify(payload),
              headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            }).then(function (res) { return res.json(); }).then(function (data) {
              if (data.ok) {
                // Remove successfully synced items from outbox
                var ids = items.map(function (i) { return i.id; });
                var delTx = db.transaction('outbox', 'readwrite');
                var delStore = delTx.objectStore('outbox');
                ids.forEach(function (id) { delStore.delete(id); });
                delTx.oncomplete = function () { resolve(); };
              } else {
                resolve(); // leave in outbox for retry
              }
            }).catch(function () {
              resolve(); // network still down; leave in outbox
            });
          };
        };
      };
    };

    openReq.onerror = function () { resolve(); };
  });
}

// ── Push notifications (placeholder) ─────────────────────────────────────────
self.addEventListener('push', function (event) {
  var data = event.data ? event.data.json() : { title: 'Ornaza MIS', body: 'New notification' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Ornaza MIS', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png'
    })
  );
});
