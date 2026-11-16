import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { nitro } from 'nitro/vite'
import { devtools } from '@tanstack/devtools-vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

import { tanstackStart } from '@tanstack/solid-start/plugin/vite'

import solidPlugin from '@solidjs/vite-plugin'

function gitCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return `build-${Date.now()}`
  }
}

// Emits `/sw.js` with its cache version set to the current commit, so each
// deploy drops the previous build's caches.
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build' as const,
    generateBundle(this: {
      environment: { name: string }
      emitFile: (file: {
        type: 'asset'
        fileName: string
        source: string
      }) => void
    }) {
      if (this.environment.name !== 'client') return
      const source = readFileSync('src/sw.js', 'utf8').replace(
        '__SW_VERSION__',
        gitCommitHash(),
      )
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  ssr: {
    // One shared Solid instance between the router/start packages and the app,
    // or `lazy()` can't see the manifest `renderToStream` sets.
    noExternal: ['solid-js', '@solidjs/web'],
  },
  optimizeDeps: {
    // Must share the unbundled `@solidjs/web/server-functions/client` instance
    // that `@tanstack/solid-start` configures, or `enableRichArguments()` is lost.
    exclude: ['@solidjs/web/server-functions/rich-args'],
  },
  plugins: [
    serviceWorker(),
    devtools(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: 'cloudflare_module',
      compatibilityDate: '2026-04-08',
      minify: true,
      sourcemap: false,
      // Cloudflare compresses static assets at the edge.
      compressPublicAssets: false,
      cloudflare: { deployConfig: true, nodeCompat: true },
      // Clickjacking / sniffing protection for every server-rendered response.
      // SAMEORIGIN (not DENY) because the app frames its own `/harness-sandbox`.
      routeRules: {
        '/**': {
          headers: {
            'x-frame-options': 'SAMEORIGIN',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'strict-origin-when-cross-origin',
          },
        },
      },
    }),
    solidPlugin({ ssr: true }),
  ],
})
