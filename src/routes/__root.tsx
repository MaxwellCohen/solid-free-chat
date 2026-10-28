import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/solid-router'
import '@fontsource/inter/400.css'

import { HydrationScript } from '@solidjs/web'
import { Loading } from 'solid-js'

import Header from '../components/Header'
import { ThemeProvider } from '../lib/theme-context'
import { createThemeController } from '../lib/create-theme-controller'
import { THEME_INLINE_INIT_SCRIPT } from '../lib/theme-preference'
import { contentSecurityPolicy } from '../lib/content-security-policy'

// Plain import so dev SSR CSS aggregation includes Tailwind (`?url` is excluded).
import '../styles.css'
import '../styles/markdown-highlight.css'

export const Route = createRootRouteWithContext()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'Solid Free Chat' },
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  shellComponent: RootComponent,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <main class="mx-auto max-w-2xl px-4 py-12">
      <section class="border-border bg-card text-card-foreground rounded-2xl border p-6 shadow-sm sm:p-8">
        <h1 class="text-foreground mb-3 text-3xl font-bold tracking-tight">
          Page not found
        </h1>
        <p class="text-muted-foreground mb-4">
          The page you're looking for doesn't exist.
        </p>
        <Link
          to="/"
          class="text-primary font-medium underline-offset-4 hover:underline"
        >
          Back to chat
        </Link>
      </section>
    </main>
  )
}

function RootComponent() {
  const theme = createThemeController()

  return (
    <html class={theme.htmlClass() || undefined} lang="en">
      <head>
        {/* First in <head> so it governs everything after it. */}
        <meta
          http-equiv="content-security-policy"
          content={contentSecurityPolicy()}
        />
        <script innerHTML={THEME_INLINE_INIT_SCRIPT} />
        <HydrationScript />
      </head>
      <body>
        <HeadContent />
        <Loading>
          <ThemeProvider value={theme}>
            <Header />
            <Outlet />
          </ThemeProvider>
        </Loading>
        <Scripts />
      </body>
    </html>
  )
}
