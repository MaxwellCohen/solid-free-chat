import { createFileRoute } from '@tanstack/solid-router'
import {
  MODELS_DEV_URL,
  buildFreeModelsCatalog,
  type FreeModelsCatalog,
} from '../lib/free-models-catalog'

const FRESH_MS = 60 * 60_000
let memo: { body: string; fetchedAt: number } | undefined

/**
 * Small, cacheable catalog of free-tier chat models per provider. It holds no
 * user data (the browser still calls providers directly with its own key), so
 * the CDN and browsers may cache it. Falls back to the last good copy if
 * models.dev is down.
 */
async function serveFreeModels(): Promise<Response> {
  if (!memo || Date.now() - memo.fetchedAt > FRESH_MS) {
    try {
      const res = await fetch(MODELS_DEV_URL, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`models.dev ${res.status}`)
      const catalog: FreeModelsCatalog = buildFreeModelsCatalog(
        await res.json(),
      )
      memo = { body: JSON.stringify(catalog), fetchedAt: Date.now() }
    } catch {
      if (!memo) {
        return new Response(JSON.stringify({ error: 'catalog unavailable' }), {
          status: 502,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
        })
      }
    }
  }
  return new Response(memo.body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control':
        'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'x-content-type-options': 'nosniff',
    },
  })
}

export const Route = createFileRoute('/api/free-models')({
  server: {
    handlers: {
      GET: serveFreeModels,
    },
  },
})
