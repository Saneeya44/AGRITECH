const CACHE_NAME = 'agritech-v4';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './login.html',
    './signup.html',
    './style.css',
    './auth.css',
    './auth.js',
    './db.js',
    './app.js',
    './ml.js',
    './translations.js',
    './weather.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs',
    'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event (Cache First Strategy for offline support)
self.addEventListener('fetch', (event) => {
    // We only want to handle GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version if found
                if (response) {
                    return response;
                }
                
                // Otherwise fetch from network
                return fetch(event.request).then((networkResponse) => {
                    // Don't cache if not a valid response
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }

                    // Clone response to put in cache
                    const responseToCache = networkResponse.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            // Don't try to cache chrome-extension:// or data: URLs
                            if(event.request.url.startsWith('http')){
                                cache.put(event.request, responseToCache);
                            }
                        });

                    return networkResponse;
                });
            }).catch(() => {
                // If both cache and network fail, maybe return an offline page (optional)
                console.log("Fetch failed, offline.");
            })
    );
});
