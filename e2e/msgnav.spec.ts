import { expect, test } from '@playwright/test'
import { openSeeded, seedChats } from './helpers'

test.describe('message keyboard nav', () => {
  test('j/k move focus, b bookmarks, c copies, Esc clears, typing is ignored', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openSeeded(page, seedChats([{ id: 'c1', title: 'Alpha' }]))
    const focused = page.locator('[data-message-focused]')
    await expect(focused).toHaveCount(0)

    await page.keyboard.press('j')
    await expect(focused).toHaveCount(1)
    await expect(focused).toContainText('hello there')
    await page.keyboard.press('j')
    await expect(focused).toContainText('quick brown fox')
    await page.keyboard.press('k')
    await expect(focused).toContainText('hello there')
    await page.keyboard.press('j')

    await page.keyboard.press('b')
    await expect(
      page.getByRole('button', { name: 'Remove bookmark' }),
    ).toHaveCount(1)
    await page.keyboard.press('c')
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain('quick brown fox')

    await page.keyboard.press('Escape')
    await expect(focused).toHaveCount(0)

    // Typing in the composer never triggers shortcuts.
    const composer = page.getByPlaceholder('Message…')
    await composer.click()
    await composer.pressSequentially('jkbc')
    await expect(composer).toHaveValue('jkbc')
    await expect(focused).toHaveCount(0)
  })

  test('shortcuts modal lists the thread keys', async ({ page }) => {
    await openSeeded(page, seedChats([{ id: 'c1', title: 'Alpha' }]))
    await page.keyboard.press('ControlOrMeta+/')
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(dialog.getByText('Next message')).toBeVisible()
    await expect(dialog.getByText('Bookmark focused message')).toBeVisible()
  })
})
