import { createFileRoute } from '@tanstack/solid-router'
import { SANDBOX_DOCUMENT_HTML } from '../lib/harness/sandbox-document'

/**
 * Static host page for the code sandbox iframe. Deliberately served without the
 * app's CSP so sandboxed code can still `fetch` CORS-enabled URLs; the iframe's
 * `sandbox="allow-scripts"` gives it an opaque origin, so it cannot read the
 * app's storage (including the API key).
 */
function serveSandbox(): Response {
  return new Response(SANDBOX_DOCUMENT_HTML, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  })
}

export const Route = createFileRoute('/harness-sandbox')({
  server: {
    handlers: {
      GET: serveSandbox,
    },
  },
})
