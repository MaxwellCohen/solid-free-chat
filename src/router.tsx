import { setupRouterSsrQueryIntegration } from '@tanstack/solid-router-ssr-query'
import { createRouter as createTanStackRouter } from '@tanstack/solid-router'
import * as Sentry from '@sentry/browser'
import { routeTree } from './routeTree.gen'

import { getContext } from './integrations/tanstack-query/provider'

function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (typeof dsn !== 'string' || !dsn.trim()) return
  Sentry.init({
    dsn: dsn.trim(),
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
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
