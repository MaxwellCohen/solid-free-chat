import { defineConfig } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3000)

// Every spec runs against one production build served by `vite preview`: the
// dev server compiles routes lazily and re-optimizes deps mid-run, which made
// cold runs slow and flaky.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  workers: process.env.CI ? 2 : 5,
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: 'dev', testIgnore: /\.prod\.spec\.ts$/ },
    // Service worker specs (prod-only).
    { name: 'prod', testMatch: /\.prod\.spec\.ts$/ },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
