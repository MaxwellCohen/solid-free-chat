import { setupRouterSsrQueryIntegration } from '@tanstack/solid-router-ssr-query'
import { createRouter as createTanStackRouter } from '@tanstack/solid-router'
import * as Sentry from '@sentry/browser'
import { enableRichArguments } from '@solidjs/web/server-functions/rich-args'
import { routeTree } from './routeTree.gen'

import { getContext } from './integrations/tanstack-query/provider'

// Chat messages carry `Date`s (`createdAt`) and optional `undefined` fields,
// which the default JSON-only server function encoding rejects.
enableRichArguments()

/** OpenRouter keys (`sk-or-…`) and OAuth callback codes must never reach Sentry. */
const SECRET_PATTERNS: [RegExp, string][] = [
  [/sk-or-[A-Za-z0-9_-]+/g, '[redacted-key]'],
  [/([?&]code=)[^&#\s"]+/g, '$1[redacted]'],
  [/(bearer\s+)[^\s"]+/gi, '$1[redacted]'],
]

/** Returns a redacted copy, or `null` (drop it) if it can't be serialized. */
function scrubSecrets<T>(value: T): T | null {
  try {
    let json = JSON.stringify(value)
    for (const [pattern, replacement] of SECRET_PATTERNS) {
      json = json.replace(pattern, replacement)
    }
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (typeof dsn !== 'string' || !dsn.trim()) return
  Sentry.init({
    dsn: dsn.trim(),
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // Only same-origin requests get trace headers; never add them to OpenRouter.
    tracePropagationTargets: [/^\/(?!\/)/],
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.data) {
        delete breadcrumb.data.request_headers
        delete breadcrumb.data.response_headers
      }
      return scrubSecrets(breadcrumb)
    },
    beforeSend: (event) => {
      if (event.request) delete event.request.headers
      return scrubSecrets(event)
    },
    beforeSendTransaction: (event) => scrubSecrets(event),
  })
}

initSentry()

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,

    context,

    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient: context.queryClient,
  })

  return router
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
