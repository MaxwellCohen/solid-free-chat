import { expect, test } from '@playwright/test'
import { QA7_SHOTS, openSeeded, seedChats } from './helpers'

test.describe('zen mode', () => {
  for (const [w, h] of [
    [1280, 800],
    [390, 844],
  ] as const) {
    test(`hides chrome and exits with Esc (${w}px)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await openSeeded(page, seedChats([{ id: 'c1', title: 'Calm' }]))
      await page.keyboard.press('ControlOrMeta+Shift+u')
      const toolbar = page.getByTestId('chat-toolbar')
      await expect(toolbar).toBeVisible()

      await page.keyboard.press('ControlOrMeta+Shift+z')
      await expect(toolbar).toHaveCount(0)
      await expect(page.getByTestId('outline-panel')).toHaveCount(0)
      await expect(page.getByRole('complementary')).toHaveCount(0)
      await expect(page.getByTestId('context-meter')).toBeHidden()
      await expect(page.getByPlaceholder('Message…')).toBeVisible()
      await expect(page.getByText('quick brown fox')).toBeVisible()
      await expect(page.getByTestId('exit-zen')).toBeVisible()
      await page.screenshot({ path: `${QA7_SHOTS}/zen-${w}.png` })

      // Session-only persistence: survives a reload in the same tab.
      await page.reload()
      await expect(page.getByTestId('exit-zen')).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(page.getByTestId('exit-zen')).toHaveCount(0)
      await expect(page.getByTestId('chat-toolbar')).toBeVisible()
    })
  }

  test('palette toggles zen; pill exits; listed in shortcuts', async ({
    page,
  }) => {
    await openSeeded(page, seedChats([{ id: 'c1', title: 'Calm' }]))
    await page.keyboard.press('ControlOrMeta+k')
    await page.keyboard.type('zen mode')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('exit-zen')).toBeVisible()
    await page.getByTestId('exit-zen').click()
    await expect(page.getByTestId('exit-zen')).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+/')
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(dialog.getByText('Zen mode (Esc exits)')).toBeVisible()
    await expect(dialog.getByText('Toggle outline')).toBeVisible()
  })
})
