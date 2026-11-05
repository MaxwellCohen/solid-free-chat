import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

const MODEL = 'e2e/model:free'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

type ChatBody = Record<string, unknown> & { messages?: unknown[] }

function sse(text: string) {
  const chunk = (delta: object, finish: string | null, extra = {}) =>
    `data: ${JSON.stringify({
      id: 'gen-e2e',
      object: 'chat.completion.chunk',
      created: 1,
      model: MODEL,
      choices: [{ index: 0, delta, finish_reason: finish }],
      ...extra,
    })}\n\n`
  return (
    chunk({ role: 'assistant', content: text }, null) +
    chunk({}, 'stop', {
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
    }) +
    'data: [DONE]\n\n'
  )
}

/** Mocks OpenRouter; records chat-completion bodies and picks a reply per request kind. */
async function mockOpenRouter(page: Page) {
  const requests: ChatBody[] = []
  await page.route('https://openrouter.ai/api/v1/**', async (route: Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS })
    }
    const url = req.url()
    if (url.includes('/models')) {
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({
          data: [
            {
              id: MODEL,
              name: 'E2E Model',
              context_length: 1000,
              pricing: { prompt: '0', completion: '0' },
              architecture: {
                input_modalities: ['text'],
                output_modalities: ['text'],
              },
              supported_parameters: ['temperature', 'max_tokens'],
            },
          ],
        }),
      })
    }
    if (url.includes('/chat/completions')) {
      const body = JSON.parse(req.postData() ?? '{}') as ChatBody
      requests.push(body)
      const raw = JSON.stringify(body)
      const reply = raw.includes('You suggest follow-up questions')
        ? '["Why is that?","How does it scale?","Any caveats?"]'
        : raw.includes('You compress conversations')
          ? '- E2E summary bullet'
          : 'Mocked streamed reply'
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'text/event-stream' },
        body: sse(reply),
      })
    }
    return route.fulfill({ status: 404, headers: CORS, body: '{}' })
  })
  return requests
}

const isFollowUp = (b: ChatBody) =>
  JSON.stringify(b).includes('You suggest follow-up questions')
const isCompact = (b: ChatBody) =>
  JSON.stringify(b).includes('You compress conversations')

function seedState(longChat = false) {
  const now = Date.now()
  const long = 'lorem ipsum dolor sit amet '.repeat(26) // ~700 chars
  const messages = longChat
    ? Array.from({ length: 8 }, (_, i) => ({
        id: `m${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        parts: [{ type: 'text', content: `msg${i} ${long}` }],
        createdAt: new Date(now - (10 - i) * 60_000).toISOString(),
      }))
    : []
  return {
    conversationOrder: ['c1'],
    conversationsById: {
      c1: { id: 'c1', title: 'E2E chat', updatedAt: now, skillIds: [] },
    },
    messagesByConversationId: { c1: messages },
    currentConversationId: 'c1',
    selectedModel: MODEL,
    skills: [],
    enabledToolIds: [],
  }
}

async function open(page: Page, state: unknown) {
  const requests = await mockOpenRouter(page)
  await page.addInitScript((s) => {
    if (window !== window.top) return
    if (sessionStorage.getItem('e2e-seeded')) return
    sessionStorage.setItem('e2e-seeded', '1')
    sessionStorage.setItem(
      'solid-free-chat-openrouter-api-key',
      'sk-or-e2e-fake',
    )
    localStorage.setItem('solid-free-chat:v2', JSON.stringify(s))
  }, state)
  await page.goto('/')
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
  return requests
}

async function send(page: Page, text: string) {
  await page.getByPlaceholder('Message…').fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

async function setFollowUps(page: Page, on: boolean) {
  await page.getByRole('button', { name: 'Chat settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Chat settings' })
  await dialog.getByLabel('Suggest follow-up questions').setChecked(on)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
}

test('normal send renders the streamed reply', async ({ page }) => {
  const requests = await open(page, seedState())
  await send(page, 'hello there')
  await expect(page.getByText('Mocked streamed reply')).toBeVisible({
    timeout: 20_000,
  })
  expect(requests).toHaveLength(1)
  expect(requests[0].model).toBe(MODEL)
  expect(requests[0].stream).toBe(true)
})

test('per-chat max tokens and temperature reach the request body', async ({
  page,
}) => {
  const requests = await open(page, seedState())
  await page.getByRole('button', { name: 'Chat settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Chat settings' })
  await dialog.getByLabel('Max tokens').fill('321')
  await dialog.getByLabel('Max tokens').blur()
  await dialog.getByLabel('Temperature').fill('0.3')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await send(page, 'hi')
  await expect(page.getByText('Mocked streamed reply')).toBeVisible({
    timeout: 20_000,
  })
  expect(requests).toHaveLength(1)
  expect(requests[0].temperature).toBe(0.3)
  const limit = requests[0].max_completion_tokens ?? requests[0].max_tokens
  expect(limit).toBe(321)
})

test('compact chat summarizes, replaces messages, and undo restores', async ({
  page,
}) => {
  const requests = await open(page, seedState(true))
  await expect(page.getByText(/^msg0 /)).toBeVisible()
  await page.getByRole('button', { name: 'Compact chat' }).click()
  await expect(page.getByText('E2E summary bullet')).toBeVisible({
    timeout: 20_000,
  })
  expect(requests.filter(isCompact)).toHaveLength(1)
  await expect(page.getByText(/^msg0 /)).toHaveCount(0)
  await expect(page.getByText(/^msg7 /)).toBeVisible()
  await page.getByRole('button', { name: 'Undo compact' }).click()
  await expect(page.getByText(/^msg0 /)).toBeVisible()
  await expect(page.getByText('E2E summary bullet')).toHaveCount(0)
})

test('follow-up suggestions: ON issues the extra request, OFF does not', async ({
  page,
}) => {
  const requests = await open(page, seedState())
  await send(page, 'first')
  await expect(page.getByText('Mocked streamed reply')).toBeVisible({
    timeout: 20_000,
  })
  await page.waitForTimeout(500)
  expect(requests.filter(isFollowUp)).toHaveLength(0)
  await expect(page.getByLabel('Suggested follow-up questions')).toHaveCount(0)

  await setFollowUps(page, true)
  await send(page, 'second')
  const chips = page.getByLabel('Suggested follow-up questions')
  await expect(chips.getByRole('button', { name: 'Why is that?' })).toBeVisible(
    { timeout: 20_000 },
  )
  await expect(chips.getByRole('button')).toHaveCount(3)
  expect(requests.filter(isFollowUp)).toHaveLength(1)
})

test('skills export downloads JSON and re-import merges without duplicates', async ({
  page,
}) => {
  await open(page, seedState())
  await page.keyboard.press('ControlOrMeta+k')
  await page
    .getByRole('dialog', { name: 'Command palette' })
    .getByRole('combobox')
    .fill('skills')
  await page.getByRole('option', { name: /Open skills/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Skills' })
  await dialog.getByRole('button', { name: 'Add built-in skill: ELI5' }).click()
  await expect(dialog.getByText('ELI5', { exact: true })).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Export skills' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('solid-free-chat-skills.json')
  const path = await download.path()
  const json = JSON.parse(
    (await import('node:fs')).readFileSync(path, 'utf8'),
  ) as { skills: Array<{ name: string }> }
  expect(json.skills.map((s) => s.name)).toEqual(['ELI5'])

  await dialog.getByLabel('Import skills file').setInputFiles(path)
  await expect(dialog.getByRole('status')).toContainText('0 added, 0 updated')
  await expect(dialog.getByText('ELI5', { exact: true })).toHaveCount(1)
})
