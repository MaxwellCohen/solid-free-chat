import { expect, test } from '@playwright/test'
import { QA_SHOTS, seedChats } from './helpers'

function seedKey(page: import('@playwright/test').Page, flag: boolean) {
  return page.addInitScript(
    ([s, f]) => {
      if (window !== window.top) return
      if (sessionStorage.getItem('e2e-seeded')) return
      sessionStorage.setItem('e2e-seeded', '1')
      sessionStorage.setItem(
        'solid-free-chat-openrouter-api-key',
        'sk-or-e2e-fake',
      )
      if (f) localStorage.setItem('tour-seen-v1', '1')
      localStorage.setItem('solid-free-chat:v2', JSON.stringify(s))
    },
    [seedChats([{ id: 'c1', title: 'Hello' }]), flag] as const,
  )
}

test('palette opens tour and Try it works', async ({ page }) => {
  await seedKey(page, true)
  await page.goto('/')
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('tour')
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: /What's new/ })
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: `${QA_SHOTS.replace('qa4', 'qa5')}/tour.png` })
  await page.getByTestId('tour-item-palette').getByRole('button').click()
  await expect(page.getByRole('dialog', { name: /What's new/ })).toHaveCount(0)
  await expect(page.getByPlaceholder(/search|type a command/i)).toBeVisible()
})

test('tour auto-shows once', async ({ page }) => {
  await seedKey(page, false)
  await page.goto('/')
  await expect(page.getByRole('dialog', { name: /What's new/ })).toBeVisible({
    timeout: 20_000,
  })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /What's new/ })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByRole('dialog', { name: /What's new/ })).toHaveCount(0)
})

test('tour screenshots', async ({ page }) => {
  await seedKey(page, false)
  const dir = QA_SHOTS.replace('qa4', 'qa5')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('dialog', { name: /What's new/ })).toBeVisible({
    timeout: 20_000,
  })
  await page.screenshot({ path: `${dir}/tour-desktop.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${dir}/tour-390.png` })
})

test('tour lists outline, zen and snippets', async ({ page }) => {
  await seedKey(page, true)
  await page.goto('/')
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type('tour')
  await page.keyboard.press('Enter')
  for (const id of ['outline', 'zen', 'snippets']) {
    await expect(page.getByTestId(`tour-item-${id}`)).toBeVisible()
  }
  await page.getByTestId('tour-item-snippets').getByRole('button').click()
  await expect(page.getByRole('dialog', { name: 'Snippets' })).toBeVisible()
})
