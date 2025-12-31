
const CACHE_NAME = 'day-app-v2';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Utilisation de chemins relatifs pour éviter les erreurs d'origine
      return cache.addAll(ASSETS).catch(err => console.error('Caching failed:', err));
    })
  );
});

self.addEventListener('activate', (event) => {
  // Nettoyage des anciens caches pour forcer la mise à jour
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Stratégie : Network First avec fallback sur le cache
  // Cela garantit que l'utilisateur voit toujours la dernière version si connecté.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la réponse est valide, on met à jour le cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Si le réseau échoue (offline), on cherche dans le cache
        return caches.match(event.request);
      })
  );
});
