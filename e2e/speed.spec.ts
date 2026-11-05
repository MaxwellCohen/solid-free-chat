import { expect, test } from '@playwright/test'
import { openSeeded, seedChats } from './helpers'

test('speed line shows elapsed and tok/s, hidden by the usage pref', async ({
  page,
}) => {
  await openSeeded(page, seedChats([{ id: 'c1', title: 'Alpha' }], 4000))
  const line = page.locator('[data-speed-line]')
  await expect(line).toHaveText('4.0s · 12.5 tok/s')
  await expect(line).toBeVisible()
  await page.evaluate(() =>
    document.documentElement.setAttribute('data-hide-usage', '1'),
  )
  await expect(line).toBeHidden()
})
