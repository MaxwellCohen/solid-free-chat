import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Opt-in live checks against real OpenRouter free models.
// Run: LIVE_E2E=1 npm run test:e2e:live  (key read from env or .env.local, never logged).
function readKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  for (const f of ['.env.local', '.env']) {
    try {
      const m = /^OPENROUTER_API_KEY=(.+)$/m.exec(readFileSync(f, 'utf8'))
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    } catch {
      /* file absent */
    }
  }
  return ''
}
const KEY = readKey()

test.skip(
  !process.env.LIVE_E2E || !KEY,
  'set LIVE_E2E=1 and OPENROUTER_API_KEY',
)
test.use({ trace: 'off', screenshot: 'off', video: 'off' })
test.describe.configure({ mode: 'serial', timeout: 180_000 })

const CHAT_MODEL = 'google/gemma-4-31b-it:free'
const TOOL_MODELS = [
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
]
// Compact is only offered past 80% of the context window (~900k chars of seed here).
const COMPACT_MODEL = 'google/gemma-4-26b-a4b-it:free'
const ARENA_MODELS = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
]

test.beforeAll(async () => {
  const res = await fetch('https://openrouter.ai/api/v1/models')
  const { data } = (await res.json()) as {
    data: { id: string; pricing: Record<string, string> }[]
  }
  for (const id of new Set([
    CHAT_MODEL,
    COMPACT_MODEL,
    ...TOOL_MODELS,
    ...ARENA_MODELS,
  ])) {
    const m = data.find((x) => x.id === id)
    expect(m, `${id} listed`).toBeTruthy()
    expect(id.endsWith(':free')).toBe(true)
    for (const v of Object.values(m!.pricing)) expect(Number(v)).toBe(0)
  }
})

function seed(model: string, opts: { long?: boolean; tools?: boolean } = {}) {
  const now = Date.now()
  const long = 'lorem ipsum dolor sit amet '.repeat(4200)
  const messages = opts.long
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
      c1: { id: 'c1', title: 'Live chat', updatedAt: now, skillIds: [] },
    },
    messagesByConversationId: { c1: messages },
    currentConversationId: 'c1',
    selectedModel: model,
    skills: [],
    enabledToolIds: opts.tools ? ['calculate'] : [],
  }
}

type Body = Record<string, unknown>

async function boot(page: Page, path: string, state?: unknown) {
  await page.addInitScript(
    ([k, s]) => {
      if (window !== window.top) return
      const w = window as unknown as { __sent: Body[] }
      w.__sent = []
      const orig = window.fetch.bind(window)
      window.fetch = (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url.includes('openrouter.ai/api/v1/chat/completions')) {
          const rec = (t: string) => {
            try {
              w.__sent.push(JSON.parse(t))
            } catch {
              w.__sent.push({ _unparsed: typeof init?.body })
            }
          }
          if (input instanceof Request) {
            void input.clone().text().then(rec)
          } else if (typeof init?.body === 'string') {
            rec(init.body)
          } else {
            rec('')
          }
        }
        return orig(input, init)
      }
      if (sessionStorage.getItem('live-seeded')) return
      sessionStorage.setItem('live-seeded', '1')
      sessionStorage.setItem('solid-free-chat-openrouter-api-key', k as string)
      localStorage.setItem('tour-seen-v1', '1')
      if (s) localStorage.setItem('solid-free-chat:v2', JSON.stringify(s))
    },
    [KEY, state ?? null],
  )
  await page.goto(path)
}

const sentOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sent: Body[] }).__sent)

async function send(page: Page, text: string) {
  await page.getByPlaceholder('Message…').fill(text)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
}

const log = (page: Page) => page.getByRole('log', { name: 'Conversation' })

test('1 normal send streams a non-empty reply', async ({ page }) => {
  await boot(page, '/', seed(CHAT_MODEL))
  await expect(log(page)).toBeVisible({ timeout: 20_000 })
  await send(page, 'Say hello in one short sentence.')
  await expect
    .poll(async () => ((await log(page).innerText()) ?? '').length, {
      timeout: 90_000,
    })
    .toBeGreaterThan('Say hello in one short sentence.'.length + 10)
})

test('2 calculate tool is called and result appears', async ({ page }) => {
  let ok = false
  for (const model of TOOL_MODELS) {
    const ctx = await page.context().browser()!.newContext()
    const p = await ctx.newPage()
    await boot(p, '/', seed(model, { tools: true }))
    await expect(log(p)).toBeVisible({ timeout: 20_000 })
    await send(p, 'Use the calculate tool to compute 1234*5678')
    try {
      await expect(log(p)).toContainText(/7,?006,?652/, { timeout: 90_000 })
      expect(JSON.stringify((await sentOf(p))[0])).toContain('calculate')
      ok = true
      console.log(`calculate worked with ${model}`)
    } catch {
      console.log(`calculate did NOT work with ${model}`)
    }
    await ctx.close()
    if (ok) break
  }
  expect(ok).toBe(true)
})

test('3 per-chat max tokens=20 truncates the reply', async ({ page }) => {
  await boot(page, '/', seed(CHAT_MODEL))
  await expect(log(page)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Chat settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Chat settings' })
  await dialog.getByLabel('Max tokens').fill('20')
  await dialog.getByLabel('Max tokens').blur()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await send(page, 'Write a very long essay of 800 words about the ocean.')
  await expect
    .poll(async () => (await sentOf(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(0)
  const sent = await sentOf(page)
  const keys = Object.keys(sent[0]).filter((k) => /max/i.test(k))
  console.log(`max-token request keys sent: ${keys.join(',')}`)
  const limit = sent[0].max_completion_tokens ?? sent[0].max_tokens
  expect(limit).toBe(20)
  await page.waitForTimeout(15_000)
  const text = await log(page).innerText()
  console.log(`reply log length: ${text.length}`)
  expect(text.length).toBeGreaterThan(60)
  expect(text.length).toBeLessThan(600)
})

test('4 arena returns text in both columns', async ({ page }) => {
  await boot(page, '/arena')
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible({
    timeout: 20_000,
  })
  await page
    .getByLabel('Arena model 1')
    .selectOption({ value: `openrouter\n${ARENA_MODELS[0]}` })
  await page
    .getByLabel('Arena model 2')
    .selectOption({ value: `openrouter\n${ARENA_MODELS[1]}` })
  await page.getByLabel('Arena prompt').fill('Name a colour in one word.')
  await page.getByRole('button', { name: 'Compare' }).click()
  const cols = page.getByLabel(/ answer$/)
  await expect(cols).toHaveCount(2)
  for (const i of [0, 1]) {
    await expect
      .poll(async () => (await cols.nth(i).innerText()).trim().length, {
        timeout: 90_000,
      })
      .toBeGreaterThan(2)
  }
})

test('5 roundtable 2 personas x 1 round completes', async ({ page }) => {
  await boot(page, '/roundtable')
  await expect(page.getByRole('heading', { name: 'Roundtable' })).toBeVisible({
    timeout: 20_000,
  })
  await page
    .getByLabel('Roundtable model')
    .selectOption({ value: `openrouter\n${CHAT_MODEL}` })
  await page.getByLabel('Roundtable topic').fill('Is tea better than coffee?')
  await page.getByRole('button', { name: /Stoic Philosopher/ }).click()
  await page.getByRole('button', { name: /Pirate Captain/ }).click()
  await page.getByLabel('Rounds').fill('1')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const turns = page.getByTestId('roundtable-turn')
  await expect(turns).toHaveCount(2, { timeout: 120_000 })
  for (const i of [0, 1]) {
    await expect
      .poll(async () => (await turns.nth(i).innerText()).trim().length, {
        timeout: 90_000,
      })
      .toBeGreaterThan(20)
  }
})

test('6 follow-up suggestions yield a chip', async ({ page }) => {
  await boot(page, '/', seed(TOOL_MODELS[0]))
  await expect(log(page)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Chat settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Chat settings' })
  await dialog.getByLabel('Suggest follow-up questions').setChecked(true)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await send(page, 'Explain what a prime number is in two sentences.')
  await expect(
    page.getByLabel('Suggested follow-up questions').getByRole('button'),
  ).not.toHaveCount(0, { timeout: 120_000 })
})

test('7 compact chat produces a summary', async ({ page }) => {
  await boot(page, '/', seed(COMPACT_MODEL, { long: true }))
  await expect(log(page)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Compact chat' }).click()
  await expect(page.getByRole('button', { name: 'Undo compact' })).toBeVisible({
    timeout: 120_000,
  })
})
