import { expect, test } from '@playwright/test'

test('home loads with the conversation log', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
})

test('app recovers after a reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
  await page.reload()
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
})

test('dev workspace route renders', async ({ page }) => {
  await page.goto('/dev')
  await expect(page.getByTitle('Preview')).toBeVisible({ timeout: 20_000 })
})

test('unknown route shows not-found page', async ({ page }) => {
  await page.goto('/nope')
  await expect(page.getByText('Page not found')).toBeVisible({
    timeout: 20_000,
  })
})
