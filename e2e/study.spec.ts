import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { QA_SHOTS } from './helpers'

const SHOTS = QA_SHOTS.replace('qa4', 'qa6')
const MODEL = 'e2e/model:free'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}
const CARDS = Array.from({ length: 6 }, (_, i) => ({
  q: `Question ${i + 1}?`,
  a: `Answer ${i + 1}`,
}))

function sse(text: string) {
  const chunk = (delta: object, finish: string | null) =>
    `data: ${JSON.stringify({
      id: 'gen-e2e',
      object: 'chat.completion.chunk',
      created: 1,
      model: MODEL,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`
  return (
    chunk({ role: 'assistant', content: text }, null) +
    chunk({}, 'stop') +
    'data: [DONE]\n\n'
  )
}

async function mock(page: Page, reply: string) {
  const bodies: string[] = []
  await page.route('https://openrouter.ai/api/v1/**', async (route: Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS })
    }
    if (req.url().includes('/models')) {
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
    if (req.url().includes('/chat/completions')) {
      bodies.push(req.postData() ?? '')
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'text/event-stream' },
        body: sse(reply),
      })
    }
    return route.fulfill({ status: 404, headers: CORS, body: '{}' })
  })
  return bodies
}

async function withKey(page: Page) {
  await page.addInitScript(() => {
    if (window !== window.top) return
    sessionStorage.setItem(
      'solid-free-chat-openrouter-api-key',
      'sk-or-e2e-fake',
    )
    localStorage.setItem('tour-seen-v1', '1')
  })
}

for (const width of [1280, 390])
  test(`generate flashcards, grade with keyboard, persist, export, delete @${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    const bodies = await mock(
      page,
      '```json\n' + JSON.stringify(CARDS) + '\n```',
    )
    await withKey(page)
    await page.goto('/study')
    await expect(page.getByRole('heading', { name: 'Study' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByLabel('Study model')).not.toHaveValue('')
    const gen = page.getByRole('button', { name: 'Generate flashcards' })
    await expect(gen).toBeDisabled()
    await page
      .getByLabel('Study source text')
      .fill('Photosynthesis notes here.')
    await page.getByLabel('Deck name').fill('Biology')
    await expect(gen).toBeEnabled()
    await gen.click()

    await expect(page.getByTestId('card-q')).toHaveText('Question 1?')
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toContain('You write study flashcards')
    expect(bodies[0]).toContain('Photosynthesis notes here.')
    await expect(page.getByTestId('remaining')).toHaveText('6 left')
    await page.screenshot({
      path: `${SHOTS}/study-review-${page.viewportSize()?.width}.png`,
    })

    // Card 1: flip with Space, grade Again -> returns at the end.
    await page.keyboard.press('Space')
    await expect(page.getByTestId('card-a')).toHaveText('Answer 1')
    await page.keyboard.press('1')
    await expect(page.getByTestId('card-q')).toHaveText('Question 2?')
    await expect(page.getByTestId('remaining')).toHaveText('6 left')
    // Cards 2-6: Good (2) / Easy (3).
    for (let i = 2; i <= 6; i++) {
      await expect(page.getByTestId('card-q')).toHaveText(`Question ${i}?`)
      await page.keyboard.press('Space')
      await page.keyboard.press(i === 6 ? '3' : '2')
    }
    // Grading before flipping is ignored.
    await expect(page.getByTestId('card-q')).toHaveText('Question 1?')
    await page.keyboard.press('2')
    await expect(page.getByTestId('card-q')).toHaveText('Question 1?')
    await page.getByRole('button', { name: 'Show answer' }).click()
    await page.getByRole('button', { name: /^Good/ }).click()
    await expect(page.getByText('All caught up')).toBeVisible()

    await page.getByRole('button', { name: 'Back to decks' }).click()
    const row = page.getByTestId('deck-row')
    await expect(row).toContainText('Biology')
    await expect(row).toContainText('6 cards')
    // Again-card is due in 10 minutes -> not due now, so all 6 are scheduled.
    await expect(row.getByTestId('due-count')).toHaveText('0')
    await page.screenshot({
      path: `${SHOTS}/study-decks-${page.viewportSize()?.width}.png`,
    })

    await page.reload()
    await expect(page.getByTestId('deck-row')).toContainText('Biology')
    await expect(page.getByTestId('due-count')).toHaveText('0')

    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export Biology as Anki TSV' }).click(),
    ])
    expect(dl.suggestedFilename()).toBe('biology.tsv')

    page.once('dialog', (d) => void d.accept())
    await page.getByRole('button', { name: 'Delete Biology' }).click()
    await expect(page.getByTestId('deck-row')).toHaveCount(0)
    await expect(page.getByText('No decks yet')).toBeVisible()
  })

test('bad model output shows an error and creates no deck', async ({
  page,
}) => {
  await mock(page, 'I cannot do that.')
  await withKey(page)
  await page.goto('/study')
  await expect(page.getByLabel('Study model')).not.toHaveValue('', {
    timeout: 20_000,
  })
  await page.getByLabel('Study source text').fill('some text')
  await page.getByRole('button', { name: 'Generate flashcards' }).click()
  await expect(page.getByRole('alert')).toContainText('usable flashcards')
  await expect(page.getByTestId('deck-row')).toHaveCount(0)
})

test('no key shows the connect hint and disables generation', async ({
  page,
}) => {
  await page.route('https://openrouter.ai/api/v1/models*', (route) =>
    route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: '{"data":[]}',
    }),
  )
  await page.goto('/study')
  await expect(page.getByRole('status')).toContainText('Add an API key')
  await page.getByLabel('Study source text').fill('text')
  await expect(
    page.getByRole('button', { name: 'Generate flashcards' }),
  ).toBeDisabled()
})
