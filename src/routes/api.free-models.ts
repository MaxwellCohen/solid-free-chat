import { createFileRoute } from '@tanstack/solid-router'
import type { FreeModelsCatalog } from '../lib/free-models-catalog'
import {
  MODELS_DEV_URL,
  buildFreeModelsCatalog,
} from '../lib/free-models-catalog'

const FRESH_MS = 15 * 60_000
const BACKOFF_MS = 60_000
let memo: { body: string; fetchedAt: number } | undefined
let inflight: Promise<void> | undefined

async function refreshMemo(): Promise<void> {
  try {
    const res = await fetch(MODELS_DEV_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`models.dev ${res.status}`)
    const catalog: FreeModelsCatalog = buildFreeModelsCatalog(await res.json())
    memo = { body: JSON.stringify(catalog), fetchedAt: Date.now() }
  } catch {
    if (memo) memo.fetchedAt = Date.now() - FRESH_MS + BACKOFF_MS
  }
}

/**
 * Small, cacheable catalog of free-tier chat models per provider. It holds no
 * user data (the browser still calls providers directly with its own key), so
 * the CDN and browsers may cache it. Falls back to the last good copy if
 * models.dev is down.
 */
async function serveFreeModels(): Promise<Response> {
  if (!memo || Date.now() - memo.fetchedAt > FRESH_MS) {
    inflight ??= refreshMemo().finally(() => {
      inflight = undefined
    })
    await inflight
  }
  if (!memo) {
    return new Response(JSON.stringify({ error: 'catalog unavailable' }), {
      status: 502,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    })
  }
  return new Response(memo.body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control':
        'public, max-age=900, s-maxage=900, stale-while-revalidate=86400',
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
