import { expect, test } from '@playwright/test'
import { QA_SHOTS, openSeeded, seedChats } from './helpers'

const selectFox = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const p = [...document.querySelectorAll('.chat-bubble p')].find((e) =>
      e.textContent?.includes('quick brown fox'),
    )!
    const r = document.createRange()
    r.setStart(p.firstChild!, 4)
    r.setEnd(p.firstChild!, 19)
    const s = window.getSelection()!
    s.removeAllRanges()
    s.addRange(r)
  })

test.describe('quote reply', () => {
  test('quote button inserts a blockquote into the composer', async ({
    page,
  }) => {
    await openSeeded(page, seedChats([{ id: 'c1', title: 'Alpha' }]))
    await selectFox(page)
    const btn = page.getByRole('button', { name: 'Quote' })
    await expect(btn).toBeVisible()
    await page.screenshot({
      path: `${QA_SHOTS}/quote-${test.info().project.name}.png`,
    })
    await btn.click()
    const composer = page.getByPlaceholder('Message…')
    await expect(composer).toHaveValue('> quick brown fox\n\n')
    await expect(composer).toBeFocused()
    await expect(btn).toBeHidden()
  })

  test('hidden for selections outside messages and on Esc', async ({
    page,
  }) => {
    await openSeeded(page, seedChats([{ id: 'c1', title: 'Alpha' }]))
    await page.evaluate(() => {
      const el = document.querySelector('h2')!
      const r = document.createRange()
      r.selectNodeContents(el)
      const s = window.getSelection()!
      s.removeAllRanges()
      s.addRange(r)
    })
    await expect(page.getByRole('button', { name: 'Quote' })).toBeHidden()
    await selectFox(page)
    await expect(page.getByRole('button', { name: 'Quote' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Quote' })).toBeHidden()
  })
})
