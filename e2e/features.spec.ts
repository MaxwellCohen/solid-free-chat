import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const SHOTS =
  '/private/tmp/claude-501/-Users-maxcohen-code-solid-free-chat/aaae170d-3239-434e-9bce-a3e9911d2558/scratchpad'

function seedState(withMessages: boolean) {
  const now = Date.now()
  const msg = (
    id: string,
    role: 'user' | 'assistant',
    text: string,
    i: number,
  ) => ({
    id,
    role,
    parts: [{ type: 'text', content: text }],
    createdAt: new Date(now - i * 3_600_000).toISOString(),
    ...(role === 'assistant'
      ? {
          tokenUsage: {
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
            recordedAt: now - i * 3_600_000,
          },
        }
      : {}),
  })
  const conv = (id: string, title: string, i: number) => ({
    id,
    title,
    updatedAt: now - i * 3_600_000,
    skillIds: [],
  })
  const ids = ['c1', 'c2', 'c3']
  return {
    conversationOrder: ids,
    conversationsById: {
      c1: conv('c1', 'Alpha chat', 1),
      c2: conv('c2', 'Beta chat', 2),
      c3: conv('c3', 'Gamma chat', 3),
    },
    messagesByConversationId: withMessages
      ? {
          c1: [
            msg('m1', 'user', 'hello', 1),
            msg('m2', 'assistant', 'hi there', 1),
          ],
          c2: [
            msg('m3', 'user', 'question', 2),
            msg('m4', 'assistant', 'answer', 2),
          ],
          c3: [
            msg('m5', 'user', 'another', 30),
            msg('m6', 'assistant', 'reply', 30),
          ],
        }
      : { c1: [], c2: [], c3: [] },
    currentConversationId: 'c1',
    selectedModel: 'openrouter/free',
    skills: [],
    enabledToolIds: [],
  }
}

async function seed(page: Page, state: unknown) {
  await page.addInitScript((s) => {
    // Skip sandboxed preview iframes (opaque origin, no storage).
    if (window !== window.top) return
    // Seed once per tab so reloads exercise real persistence (IndexedDB).
    if (sessionStorage.getItem('e2e-seeded')) return
    sessionStorage.setItem('e2e-seeded', '1')
    // Fake key so the first-run sign-in modal stays closed (no requests are sent).
    sessionStorage.setItem(
      'solid-free-chat-openrouter-api-key',
      'sk-or-e2e-fake',
    )
    localStorage.setItem('tour-seen-v1', '1')
    localStorage.setItem('solid-free-chat:v2', JSON.stringify(s))
  }, state)
}

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // Dev-server noise unrelated to the app (network fetches blocked in CI).
    if (/Failed to load resource|favicon|net::ERR/i.test(t)) return
    errors.push(`console: ${t}`)
  })
  return errors
}

async function openChat(page: Page, withMessages = false) {
  await seed(page, seedState(withMessages))
  await page.goto('/')
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
}

test.describe('new features smoke', () => {
  test('starter cards fill the draft', async ({ page }) => {
    const errors = trackErrors(page)
    await openChat(page)
    const card = page.getByRole('button', { name: /Explain a concept/ })
    await expect(card).toBeVisible()
    await card.click()
    await expect(page.getByPlaceholder('Message…')).toHaveValue(
      /public-key cryptography/,
    )
    expect(errors).toEqual([])
  })

  test('command palette opens, filters, closes on Esc', async ({ page }) => {
    const errors = trackErrors(page)
    await openChat(page)
    await page.keyboard.press('ControlOrMeta+k')
    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    await expect(dialog).toBeVisible()
    const options = dialog.getByRole('option')
    const before = await options.count()
    expect(before).toBeGreaterThan(1)
    await dialog.getByRole('combobox').fill('Beta')
    await expect(options.first()).toContainText('Beta')
    expect(await options.count()).toBeLessThan(before)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect(errors).toEqual([])
  })

  test('typing / shows the slash command popup', async ({ page }) => {
    const errors = trackErrors(page)
    await openChat(page)
    await page.getByPlaceholder('Message…').fill('/')
    const list = page.getByRole('listbox', { name: 'Slash commands' })
    await expect(list).toBeVisible()
    expect(await list.getByRole('option').count()).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  test('chat settings modal saves and shows indicator', async ({ page }) => {
    const errors = trackErrors(page)
    await openChat(page)
    await page
      .getByRole('button', { name: 'Chat settings', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Chat settings' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Max tokens').fill('512')
    await dialog.getByLabel('Max tokens').blur()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByRole('button', { name: 'Chat settings (customized)' }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Chat settings (customized)' })
      .click()
    await expect(dialog.getByLabel('Max tokens')).toHaveValue('512')
    expect(errors).toEqual([])
  })

  test('pin and rename persist across reload', async ({ page }) => {
    const errors = trackErrors(page)
    await openChat(page)
    await page.getByRole('button', { name: 'Show chat list' }).click()
    await page.getByRole('button', { name: 'Pin chat: Beta chat' }).click()
    await expect(
      page.getByRole('button', { name: 'Unpin chat: Beta chat' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Rename chat: Gamma chat' }).click()
    const input = page.getByRole('textbox', { name: 'Chat title' })
    await input.fill('Renamed gamma')
    await input.press('Enter')
    await expect(page.getByText('Renamed gamma')).toBeVisible()
    await page.waitForTimeout(800) // persistence debounce
    await page.reload()
    await expect(page.getByText('Renamed gamma')).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      page.getByRole('button', { name: 'Unpin chat: Beta chat' }),
    ).toBeVisible()
    expect(errors).toEqual([])
  })

  test('insights renders with seeded chats', async ({ page }) => {
    const errors = trackErrors(page)
    await seed(page, seedState(true))
    await page.goto('/insights')
    await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible()
    await expect(page.getByText('Messages', { exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText('No conversations yet')).toHaveCount(0)
    await expect(
      page.locator('.chat-chart svg, .chat-chart canvas').first(),
    ).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText('Could not draw chart')).toHaveCount(0)
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.evaluate((s) => {
        document.documentElement.dataset.theme = s
        document.documentElement.classList.toggle('dark', s === 'dark')
      }, scheme)
      await page.waitForTimeout(500) // let color transitions settle
      await page.screenshot({
        path: `${SHOTS}/insights-${scheme}.png`,
        fullPage: true,
      })
    }
    expect(errors).toEqual([])
  })

  test('insights shows empty state', async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto('/insights')
    await expect(page.getByText('No conversations yet')).toBeVisible({
      timeout: 20_000,
    })
    expect(errors).toEqual([])
  })
})

test('find in chat: opens, counts, steps, closes', async ({ page }) => {
  const errors = trackErrors(page)
  await openChat(page, true)
  await page.keyboard.press('ControlOrMeta+f')
  const bar = page.getByTestId('find-bar')
  await expect(bar).toBeVisible()
  await bar.getByRole('textbox').fill('h')
  await expect(page.getByTestId('find-count')).toHaveText('1 of 3')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('find-count')).toHaveText('2 of 3')
  await page.keyboard.press('Shift+Enter')
  await expect(page.getByTestId('find-count')).toHaveText('1 of 3')
  await page.keyboard.press('Escape')
  await expect(bar).toBeHidden()
  expect(errors).toEqual([])
})

test('code block: copy, download and sandboxed preview', async ({ page }) => {
  const errors = trackErrors(page)
  const state = seedState(true)
  state.messagesByConversationId.c1 = [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', content: 'html please' }],
      createdAt: new Date().toISOString(),
    },
    {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', content: '```html\n<h1 id="x">Hi</h1>\n```' }],
      createdAt: new Date().toISOString(),
    },
  ]
  await seed(page, state)
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Copy', exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible()
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  const frame = page.locator('iframe[title="Code preview"]')
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(
    page.frameLocator('iframe[title="Code preview"]').locator('#x'),
  ).toHaveText('Hi')
  expect(errors).toEqual([])
})

test('skills library: add a built-in skill', async ({ page }) => {
  const errors = trackErrors(page)
  await openChat(page)
  await page.keyboard.press('ControlOrMeta+k')
  await page
    .getByRole('dialog', { name: 'Command palette' })
    .getByRole('combobox')
    .fill('skills')
  await page.getByRole('option', { name: /Open skills/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Skills' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Add built-in skill: ELI5' }).click()
  await expect(dialog.getByText('ELI5', { exact: true })).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Add built-in skill: ELI5' }),
  ).toHaveCount(0)
  expect(errors).toEqual([])
})

test.describe('personas and onboarding', () => {
  test('picking a persona starts a new chat with its settings', async ({
    page,
  }) => {
    const errors = trackErrors(page)
    await openChat(page)
    await page.keyboard.press('ControlOrMeta+k')
    await page
      .getByRole('combobox', { name: /Type a command/ })
      .fill('Personas')
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Personas' })
    await expect(dialog).toBeVisible()
    await dialog
      .getByRole('button', { name: 'Start chat with Pirate Captain' })
      .click()
    await expect(dialog).toBeHidden()
    await expect(page.getByLabel('Active persona')).toContainText(
      'Pirate Captain',
    )
    await page
      .getByRole('button', { name: /settings/i })
      .first()
      .click()
    await expect(
      page.getByPlaceholder(/Added to the system prompt/),
    ).toHaveValue(/pirate captain/i)
    expect(errors).toEqual([])
  })

  test('first run shows the onboarding card without a key', async ({
    page,
  }) => {
    const errors = trackErrors(page)
    await page.goto('/')
    const modal = page.getByRole('dialog').first()
    await expect(modal).toBeVisible({ timeout: 20_000 })
    await page.keyboard.press('Escape')
    const card = page.getByRole('region', { name: 'Get started' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Sign in with OpenRouter')
    await expect(card).toContainText('free')
    await card.getByRole('button', { name: 'Sign in with OpenRouter' }).click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('seeded key hides the onboarding card', async ({ page }) => {
    await openChat(page)
    await expect(page.getByRole('region', { name: 'Get started' })).toHaveCount(
      0,
    )
  })
})
