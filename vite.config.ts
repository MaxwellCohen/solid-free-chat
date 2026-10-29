import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { devtools } from '@tanstack/devtools-vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

import { tanstackStart } from '@tanstack/solid-start/plugin/vite'

import solidPlugin from '@solidjs/vite-plugin'

// `@tanstack/solid-query-devtools@6.0.0-rc.4` imports Solid patch-channel exports
// removed in solid-js 2.0.0-rc.8. Those names are unused in the published build.
function stripRemovedSolidImports() {
  const removed = /\b(?:patchableRaw|registerRowOps|registerSlotPatch|registerPatch)\s*,\s*/g

  return {
    name: 'strip-removed-solid-imports',
    transform(code: string, id: string) {
      if (!id.includes('@tanstack/solid-query-devtools') || !removed.test(code)) return
      removed.lastIndex = 0
      return code.replace(removed, '')
    },
  }
}

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
      emitFile: (file: { type: 'asset'; fileName: string; source: string }) => void
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
  optimizeDeps: {
    // Must share the unbundled `@solidjs/web/server-functions/client` instance
    // that `@tanstack/solid-start` configures, or `enableRichArguments()` is lost.
    exclude: ['@solidjs/web/server-functions/rich-args'],
  },
  plugins: [
    stripRemovedSolidImports(),
    serviceWorker(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    devtools(),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    solidPlugin({ ssr: true }),
  ],
})
