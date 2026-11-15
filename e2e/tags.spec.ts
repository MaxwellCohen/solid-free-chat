import { expect, test } from '@playwright/test'
import { QA_SHOTS, openSeeded, seedChats } from './helpers'

const chats = [
  { id: 'c1', title: 'Alpha chat', tags: ['work', 'ideas'] },
  { id: 'c2', title: 'Beta chat', tags: ['work'] },
  { id: 'c3', title: 'Gamma chat' },
]

test.describe('chat tags', () => {
  test('chips, filter toggle, and search together', async ({ page }) => {
    await openSeeded(page, seedChats(chats))
    const nav = page.getByRole('navigation', { name: 'Conversations' })
    if (!(await nav.isVisible())) {
      await page.getByRole('button', { name: 'Show chat list' }).first().click()
    }
    await expect(nav.getByText('#ideas')).toBeVisible()
    await page.screenshot({
      path: `${QA_SHOTS}/tags-${test.info().project.name}.png`,
    })
    await page.locator('[data-tag-filter="work"]').click()
    await expect(nav.getByText('Gamma chat')).toBeHidden()
    await expect(nav.getByText('Beta chat')).toBeVisible()
    await page.getByLabel('Search chats').fill('beta')
    await expect(
      page
        .getByRole('navigation', { name: 'Search results' })
        .getByText('Beta chat'),
    ).toBeVisible()
    await page.getByLabel('Search chats').fill('gamma')
    await expect(page.getByText('No matching chats.')).toBeVisible()
    await page.getByLabel('Search chats').fill('')
    await page.locator('[data-tag-filter="work"]').click()
    await expect(nav.getByText('Gamma chat')).toBeVisible()
  })

  test('edit tags from the row popover and the palette', async ({ page }) => {
    await openSeeded(page, seedChats(chats))
    const nav = page.getByRole('navigation', { name: 'Conversations' })
    if (!(await nav.isVisible())) {
      await page.getByRole('button', { name: 'Show chat list' }).first().click()
    }
    await page.getByRole('button', { name: 'Edit tags: Gamma chat' }).click()
    const input = page.getByLabel('Add tag')
    await input.fill('Fresh Tag')
    await input.press('Enter')
    await expect(
      nav.getByTestId('row-tags').getByText('#fresh-tag'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Remove tag fresh-tag' }).click()
    await expect(
      nav.getByTestId('row-tags').getByText('#fresh-tag'),
    ).toBeHidden()
    await input.press('Escape')

    await page.keyboard.press('ControlOrMeta+k')
    await page.getByPlaceholder(/Type a command/).fill('Tag current')
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Add tag')).toBeFocused()
    await page.getByLabel('Add tag').fill('via-palette,')
    await expect(
      nav.getByTestId('row-tags').getByText('#via-palette'),
    ).toBeVisible()
  })
})
