import {
  HeadContent,
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
})

function RootComponent() {
  const theme = createThemeController()

  return (
    <html class={theme.htmlClass() || undefined} lang="en">
      <head>
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
