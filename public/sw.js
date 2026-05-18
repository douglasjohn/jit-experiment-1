// Service Worker to intercept and redirect /web/ requests
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Intercept requests to /web/model.json and /web/worker.js
  if (url.pathname.startsWith('/web/')) {
    // Redirect from /web/... to /jit-experiment-1/web/...
    const newPathname = '/jit-experiment-1' + url.pathname;
    const newUrl = new URL(url);
    newUrl.pathname = newPathname;
    
    event.respondWith(fetch(newUrl.toString()));
  }
});
