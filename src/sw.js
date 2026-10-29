/**
 * Service worker: makes the app installable and lets it open offline.
 * - Pages: network-first, falling back to the last cached copy (or `/`).
 * - Hashed `/assets/*` files: cache-first (their URLs change on every build).
 * - Other same-origin static files: stale-while-revalidate.
 * Cross-origin requests (OpenRouter, Sentry) and non-GETs are never touched.
 */
// Replaced at build time with the git commit hash (see vite.config.ts).
const VERSION = '__SW_VERSION__'
const PAGES = `pages-${VERSION}`
const ASSETS = `assets-${VERSION}`
const STATIC = `static-${VERSION}`
const PRECACHE = ['/', '/manifest.json', '/favicon.svg', '/logo192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  const keep = new Set([PAGES, ASSETS, STATIC])
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (err) {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (await caches.match('/'))
    if (cached) return cached
    throw err
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(STATIC)
  const cached = await cache.match(event.request)
  const network = fetch(event.request).then((response) => {
    if (response.ok) cache.put(event.request, response.clone())
    return response
  })
  if (cached) {
    event.waitUntil(network.catch(() => {}))
    return cached
  }
  return network
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Server functions / API calls must always hit the network.
  if (url.pathname.startsWith('/_serverFn') || url.pathname.startsWith('/api/'))
    return

  if (request.mode === 'navigate') {
    // OAuth callbacks carry a one-time `?code=`; never serve those from cache.
    if (url.searchParams.has('code')) return
    event.respondWith(networkFirstPage(request))
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
  } else {
    event.respondWith(staleWhileRevalidate(event))
  }
})
