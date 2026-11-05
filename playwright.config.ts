import { defineConfig } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3000)
const prodPort = port + 1

export default defineConfig({
  testDir: './e2e',
  projects: [
    {
      name: 'dev',
      testIgnore: /\.prod\.spec\.ts$/,
      use: { baseURL: `http://localhost:${port}` },
    },
    {
      // Runs against the production build (service worker is prod-only).
      name: 'prod',
      testMatch: /\.prod\.spec\.ts$/,
      use: { baseURL: `http://localhost:${prodPort}` },
    },
  ],
  webServer: [
    {
      command: `npx vite dev --port ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run build && npx vite preview --port ${prodPort} --strictPort`,
      url: `http://localhost:${prodPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
})
