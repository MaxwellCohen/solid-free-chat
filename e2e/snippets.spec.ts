import { expect, test } from '@playwright/test'
import { openSeeded, seedChats } from './helpers'

async function openSnippets(page: import('@playwright/test').Page) {
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('snippets')
  await page.keyboard.press('Enter')
  return page.getByRole('dialog', { name: 'Snippets' })
}

test.describe('snippets', () => {
  test('add, expand on space and Enter, placeholders, slash unaffected', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openSeeded(page, seedChats([{ id: 'c1', title: 'S' }]))
    const dialog = await openSnippets(page)
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Add ;sig' }).click()
    await expect(dialog.getByTestId('snippet-row')).toHaveCount(1)
    await dialog.getByLabel('Trigger').fill(';hi')
    await dialog.getByLabel('Expansion text').fill('Hello on {{date}}')
    await dialog.getByRole('button', { name: 'Add snippet' }).click()
    await expect(dialog.getByTestId('snippet-row')).toHaveCount(2)
    // Invalid / duplicate triggers are rejected.
    await dialog.getByLabel('Trigger').fill('nope')
    await dialog.getByLabel('Expansion text').fill('x')
    await dialog.getByRole('button', { name: 'Add snippet' }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    const composer = page.getByPlaceholder('Message…')
    await composer.click()
    await composer.pressSequentially('thanks ;sig ')
    await expect(composer).toHaveValue('thanks Best regards,\n ')

    await composer.fill('')
    await composer.pressSequentially(';hi')
    await composer.press('Enter')
    const today = await page.evaluate(() => {
      const d = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    })
    await expect(composer).toHaveValue(`Hello on ${today}`)

    // Not at a word boundary: no expansion.
    await composer.fill('')
    await composer.pressSequentially('x;sig ')
    await expect(composer).toHaveValue('x;sig ')

    // Slash popup still works.
    await composer.fill('')
    await composer.pressSequentially('/he')
    await expect(
      page.getByRole('listbox', { name: 'Slash commands' }),
    ).toBeVisible()

    // Persisted.
    await page.reload()
    await expect(composer).toBeVisible()
    const again = await openSnippets(page)
    await expect(again.getByTestId('snippet-row')).toHaveCount(2)
  })

  test('clipboard placeholder', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openSeeded(page, seedChats([{ id: 'c1', title: 'S' }]))
    const dialog = await openSnippets(page)
    await dialog.getByRole('button', { name: 'Add ;quote' }).click()
    await page.keyboard.press('Escape')
    await page.evaluate(() => navigator.clipboard.writeText('copied text'))
    const composer = page.getByPlaceholder('Message…')
    await composer.click()
    await composer.pressSequentially(';quote ')
    await expect(composer).toHaveValue('> copied text\n\n ')
  })
})
