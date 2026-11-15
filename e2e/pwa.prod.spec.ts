import { expect, test } from '@playwright/test'

test('manifest is valid and its icons resolve', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  const res = await request.get(href!)
  expect(res.ok()).toBe(true)
  const m = await res.json()
  expect(m.name).toBeTruthy()
  expect(m.start_url).toBe('/')
  expect(m.display).toBe('standalone')
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  for (const icon of m.icons) {
    const r = await request.get(icon.src)
    expect(r.ok(), icon.src).toBe(true)
    expect(r.headers()['content-type']).toContain(icon.type.replace('+xml', ''))
  }
})

test('service worker registers, controls the page, and serves the shell offline', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
  await page.evaluate(() => navigator.serviceWorker.ready)
  // clients.claim() makes the active worker control this page.
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true)
  // Let the network-first page response land in the cache.
  await page.reload()
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByTestId('offline-banner')).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByTestId('offline-banner')).toBeHidden()
})
