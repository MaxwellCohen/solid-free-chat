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
const META = 'sw-meta'
const META_URL = '/__sw-meta'
const NETWORK_TIMEOUT_MS = 4000
const PRECACHE = ['/', '/manifest.json', '/favicon.svg', '/logo192.png']

async function readMeta() {
  const cache = await caches.open(META)
  const res = await cache.match(META_URL)
  return res ? res.json().catch(() => ({})) : {}
}

// Versions are commit hashes (unordered), so install records which asset cache
// was current before this one. Activate keeps that previous cache, because tabs
// still open on the old build keep lazy-loading its hashed `/assets/*` chunks.
async function recordPreviousAssets() {
  const meta = await readMeta()
  const previous = meta.current === ASSETS ? meta.previous : meta.current
  const cache = await caches.open(META)
  await cache.put(
    META_URL,
    new Response(JSON.stringify({ current: ASSETS, previous })),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(recordPreviousAssets)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    readMeta()
      .then(async (meta) => {
        const keep = new Set([PAGES, ASSETS, STATIC, META, meta.previous])
        const keys = await caches.keys()
        await Promise.all(
          keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)),
        )
      })
      .then(() => self.clients.claim()),
  )
})

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES)
  const exact = await cache.match(request, { ignoreSearch: true })
  const controller = new AbortController()
  // Only give up on a slow network when this exact page is already cached.
  const timer = exact
    ? setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS)
    : undefined
  try {
    const response = await fetch(request, { signal: controller.signal })
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (err) {
    const cached =
      exact || (await cache.match('/')) || (await caches.match('/'))
    if (cached) return cached
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS)
  // Fall back to any cache: tabs still on the previous build ask for its
  // chunks, which only the kept previous asset cache still has.
  const cached = (await cache.match(request)) || (await caches.match(request))
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
