import { expect, test } from '@playwright/test'
import { QA7_SHOTS, openSeeded, seedOutlineChat } from './helpers'

test.describe('conversation outline', () => {
  test('lists messages and headings, jumps, highlights, remembers state', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openSeeded(page, seedOutlineChat())
    const panel = page.getByTestId('outline-panel')
    await expect(panel).toHaveCount(0)

    await page.keyboard.press('ControlOrMeta+Shift+u')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('button')).toHaveCount(1 + 6 * 3)
    await expect(
      panel.getByRole('button', { name: 'Question number 3 about topic 3' }),
    ).toBeVisible()
    // Code-fence comment is not a heading.
    await expect(panel.getByText('not a heading')).toHaveCount(0)

    await panel
      .getByRole('button', { name: 'Question number 2 about topic 2' })
      .click()
    await expect(page.locator('[data-message-id="u2"]')).toBeInViewport()
    await expect(
      panel.getByRole('button', { name: 'Question number 2 about topic 2' }),
    ).toHaveAttribute('aria-current', 'true')
    await page.screenshot({ path: `${QA7_SHOTS}/outline-1280.png` })

    // Scrolling the thread moves the highlight.
    await page.getByRole('log', { name: 'Conversation' }).evaluate((el) => {
      el.scrollTop = 0
    })
    // The long first reply crosses the reading line, so its heading is active.
    await expect(
      panel.getByRole('button', { name: 'Answer 1', exact: true }),
    ).toHaveAttribute('aria-current', 'true')

    await page.reload()
    await expect(page.getByTestId('outline-panel')).toBeVisible()
    await page
      .getByTestId('outline-panel')
      .getByRole('button', { name: 'Hide' })
      .click()
    await expect(page.getByTestId('outline-panel')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible()
    await expect(page.getByTestId('outline-panel')).toHaveCount(0)
  })

  test('toolbar button and palette toggle; hidden below lg', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openSeeded(page, seedOutlineChat())
    await page.getByRole('button', { name: 'Toggle outline' }).click()
    await expect(page.getByTestId('outline-panel')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+k')
    await page.keyboard.type('toggle outline')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('outline-panel')).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+Shift+u')
    await expect(page.getByTestId('outline-panel')).toBeVisible()
    await page.setViewportSize({ width: 800, height: 800 })
    await expect(page.getByTestId('outline-panel')).toBeHidden()
  })
})
