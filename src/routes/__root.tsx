import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/solid-router'
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'

import '@fontsource/inter/400.css'

import { HydrationScript } from 'solid-js/web'
import { Show, Suspense } from 'solid-js'

import Header from '../components/Header'
import { ThemeProvider } from '../lib/theme-context'
import { createThemeController } from '../lib/create-theme-controller'
import { THEME_INLINE_INIT_SCRIPT } from '../lib/theme-preference'

// Plain import so dev SSR CSS aggregation includes Tailwind (`?url` is excluded).
import '../styles.css'
import '../styles/markdown-highlight.css'

const theme = createThemeController()

export const Route = createRootRouteWithContext()({
  shellComponent: RootComponent,
})

function RootComponent() {
  return (
    <html class={theme.htmlClass() || undefined} lang="en">
      <head>
        <script innerHTML={THEME_INLINE_INIT_SCRIPT} />
        <HydrationScript />
      </head>
      <body>
        <HeadContent />
        <Suspense>
          <ThemeProvider value={theme}>
            <Header />
            <Outlet />
            <Show when={import.meta.env.DEV}>
              <TanStackRouterDevtools />
            </Show>
          </ThemeProvider>
        </Suspense>
        <Scripts />
      </body>
    </html>
  )
}
