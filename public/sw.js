// Service Worker for PWA
const CACHE_NAME = 'sales-processor-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Basic pass-through fetch handler
  event.respondWith(fetch(event.request));
});