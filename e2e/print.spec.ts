import { expect, test } from '@playwright/test'
import { openSeeded, seedChats } from './helpers'

test('print entry exists and print media hides the sidebar', async ({
  page,
}) => {
  await openSeeded(page, seedChats([{ id: 'c1', title: 'Alpha' }]))
  if (
    !(await page
      .getByRole('button', { name: 'Hide chat list' })
      .first()
      .isVisible())
  ) {
    await page.getByRole('button', { name: 'Show chat list' }).first().click()
  }
  await page.getByText('Export / import').click()
  await expect(
    page.getByRole('button', { name: 'Print / Save as PDF' }),
  ).toBeVisible()
  await expect(page.locator('#chat-sidebar')).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('#chat-sidebar')).toBeHidden()
  await page.emulateMedia({ media: 'screen' })

  // The print view expands the full transcript.
  await page.evaluate(() => {
    window.print = () => {}
  })
  await page.getByRole('button', { name: 'Print / Save as PDF' }).click()
  await expect(page.locator('#print-root .print-msg')).toHaveCount(2)
})
