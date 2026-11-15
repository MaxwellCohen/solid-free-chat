import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { seedChats } from './helpers'

const TAGS = ['wcag2a', 'wcag2aa', 'best-practice']
const SCHEMES = ['light', 'dark'] as const

async function seed(page: Page, path: string) {
  const state = seedChats([{ id: 'c1', title: 'Hello' }])
  await page.addInitScript((s) => {
    if (window !== window.top) return
    if (sessionStorage.getItem('e2e-seeded')) return
    sessionStorage.setItem('e2e-seeded', '1')
    sessionStorage.setItem(
      'solid-free-chat-openrouter-api-key',
      'sk-or-e2e-fake',
    )
    localStorage.setItem('tour-seen-v1', '1')
    localStorage.setItem('solid-free-chat:v2', JSON.stringify(s))
  }, state)
  await page.goto(path)
  if (path === '/') {
    await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText('quick brown fox')).toBeVisible()
  } else {
    await expect(page.getByRole('heading').first()).toBeVisible({
      timeout: 20_000,
    })
  }
}

async function audit(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  return violations.map(
    (v) =>
      `${v.impact} ${v.id}: ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')} (${v.nodes.length})`,
  )
}

const PAGES = [
  '/',
  '/arena',
  '/roundtable',
  '/insights',
  '/saved',
  '/study',
  '/about',
]

/** Palette command label -> dialog accessible name. */
const MODALS: [string, string, RegExp][] = [
  ['palette', '', /command palette/i],
  ['settings', 'Display settings', /settings/i],
  ['personas', 'Personas', /personas/i],
  ['skills', 'Open skills', /skills/i],
  ['tour', 'Tour', /what's new/i],
  ['shortcuts', 'Keyboard shortcuts', /shortcuts/i],
]

for (const scheme of SCHEMES) {
  test.describe(`axe (${scheme})`, () => {
    test.use({ colorScheme: scheme })

    for (const path of PAGES) {
      test(`page ${path}`, async ({ page }) => {
        await seed(page, path)
        expect(await audit(page)).toEqual([])
      })
    }

    for (const [name, command, dialogName] of MODALS) {
      test(`modal ${name}`, async ({ page }) => {
        await seed(page, '/')
        await page.keyboard.press('ControlOrMeta+k')
        if (command) {
          await page.keyboard.type(command)
          await page.keyboard.press('Enter')
        }
        await expect(
          page.getByRole('dialog', { name: dialogName }),
        ).toBeVisible()
        expect(await audit(page)).toEqual([])
      })
    }
  })
}

test.describe('modal focus', () => {
  const activeInside = (page: Page) =>
    page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))

  async function trapAndRestore(page: Page, dialogName: RegExp) {
    const dialog = page.getByRole('dialog', { name: dialogName })
    await expect(dialog).toBeVisible()
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      expect(await activeInside(page)).toBe(true)
    }
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await activeInside(page)).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }

  test('palette traps focus and restores it', async ({ page }) => {
    await seed(page, '/')
    const composer = page.getByPlaceholder('Message…')
    await composer.focus()
    await page.keyboard.press('ControlOrMeta+k')
    await trapAndRestore(page, /command palette/i)
    await expect(composer).toBeFocused()
  })

  test('settings traps focus and restores it', async ({ page }) => {
    await seed(page, '/')
    const trigger = page.getByRole('button', { name: /^Chat settings/ })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await trapAndRestore(page, /settings/i)
    await expect(trigger).toBeFocused()
  })

  test('tour traps focus and restores it', async ({ page }) => {
    await seed(page, '/')
    const trigger = page.getByRole('button', { name: "What's new / Tour" })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await trapAndRestore(page, /what's new/i)
    await expect(trigger).toBeFocused()
  })
})
