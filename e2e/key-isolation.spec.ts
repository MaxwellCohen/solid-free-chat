import { expect, test } from '@playwright/test'
import { openSeeded, seedChats } from './helpers'

test('no non-OpenRouter request carries the API key', async ({ page }) => {
  const leaks: string[] = []
  page.on('request', (req) => {
    const u = new URL(req.url())
    const h = req.headers()
    const carries =
      'authorization' in h ||
      req.url().includes('sk-or-e2e-fake') ||
      (req.postData() ?? '').includes('sk-or-e2e-fake')
    if (carries && u.hostname !== 'openrouter.ai') leaks.push(req.url())
  })
  await page.route('https://openrouter.ai/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"data":[]}',
    }),
  )
  await openSeeded(page, seedChats([{ id: 'c1', title: 'Key chat' }]))
  await page.waitForTimeout(1500)
  expect(leaks).toEqual([])
  const stored = await page.evaluate(() =>
    localStorage.getItem('solid-free-chat:v2'),
  )
  expect(stored).not.toContain('sk-or-')
})
