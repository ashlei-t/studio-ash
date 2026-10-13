// Network-first cache of the app itself (HTML, JS, CSS, icons), so Studio Ash
// opens with no connection. Data never goes through here: entries live in
// IndexedDB, and Supabase requests are cross-origin and left alone.

const CACHE = 'studio-ash-shell-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('/')))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  // Every page load is the same single-page app, cached under '/'.
  const key = request.mode === 'navigate' ? '/' : request

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(key, copy))
        }
        return response
      })
      .catch(() => caches.match(key)),
  )
})
