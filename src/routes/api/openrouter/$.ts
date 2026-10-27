import { createFileRoute } from '@tanstack/solid-router'

/**
 * Dumb pass-through proxy: `/api/openrouter/v1/*` → `https://openrouter.ai/api/v1/*`.
 *
 * All harness logic (agent loop, tools, model selection) runs in the browser.
 * This route only forwards the request and streams the response back. The
 * client's `Authorization` header is forwarded as-is; `OPENROUTER_API_KEY` is
 * used only when the client sends none (local dev convenience).
 */
const UPSTREAM_ORIGIN = 'https://openrouter.ai/api/'

const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type']

const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control']

function normalizeBearer(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined
  let k = raw.trim()
  if (k.toLowerCase().startsWith('bearer ')) k = k.slice(7).trim()
  return k.length > 0 ? k : undefined
}

async function proxy({
  request,
  params,
}: {
  request: Request
  params: { _splat?: string }
}): Promise<Response> {
  const path = params._splat ?? ''
  if (!path.startsWith('v1/') || path.includes('..')) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const target = new URL(path, UPSTREAM_ORIGIN)
  target.search = new URL(request.url).search

  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const apiKey =
    normalizeBearer(request.headers.get('authorization')) ??
    normalizeBearer(process.env.OPENROUTER_API_KEY)
  if (apiKey) headers.set('authorization', `Bearer ${apiKey}`)
  if (process.env.OPENROUTER_HTTP_REFERER) {
    headers.set('http-referer', process.env.OPENROUTER_HTTP_REFERER)
  }
  if (process.env.OPENROUTER_APP_TITLE) {
    headers.set('x-title', process.env.OPENROUTER_APP_TITLE)
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    signal: request.signal,
  })

  const responseHeaders = new Headers()
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

export const Route = createFileRoute('/api/openrouter/$')({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
    },
  },
})
