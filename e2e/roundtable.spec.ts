import { expect, test } from '@playwright/test'
import type { Route } from '@playwright/test'

const MODEL = 'e2e/model:free'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

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

test('roundtable turns render in order and can be saved as a chat', async ({
  page,
}) => {
  const systems: string[] = []
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
      systems.push(req.postData() ?? '')
      return route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'text/event-stream' },
        body: sse(`Reply number ${systems.length}`),
      })
    }
    return route.fulfill({ status: 404, headers: CORS, body: '{}' })
  })
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'solid-free-chat-openrouter-api-key',
      'sk-or-e2e-fake',
    )
  })
  await page.goto('/roundtable')
  await expect(page.getByRole('heading', { name: 'Roundtable' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByLabel('Roundtable model')).not.toHaveValue('')
  await page.getByLabel('Roundtable topic').fill('Is tea better than coffee?')
  await page.getByRole('button', { name: /Stoic Philosopher/ }).click()
  await page.getByRole('button', { name: /Pirate Captain/ }).click()
  await page.getByLabel('Rounds').fill('1')
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  const turns = page.getByTestId('roundtable-turn')
  await expect(turns).toHaveCount(2, { timeout: 20_000 })
  await expect(turns.nth(0)).toHaveAttribute(
    'data-speaker',
    'stoic-philosopher',
  )
  await expect(turns.nth(1)).toHaveAttribute('data-speaker', 'pirate-captain')
  await expect(turns.nth(0)).toContainText('Reply number 1')
  await expect(turns.nth(1)).toContainText('Reply number 2')
  expect(systems[0]).toContain(
    'You are Stoic Philosopher in a roundtable with Pirate Captain',
  )
  expect(systems[1]).toContain('Stoic Philosopher: Reply number 1')

  await page.getByLabel('Moderator message').fill('Keep it short')
  await page.getByRole('button', { name: 'Interject' }).click()
  await expect(turns).toHaveCount(3)
  await page.getByRole('button', { name: 'Another round' }).click()
  await expect(turns).toHaveCount(5, { timeout: 20_000 })
  expect(systems[2]).toContain('Moderator: Keep it short')

  await page.getByRole('button', { name: 'Save as chat' }).click()
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
  await expect(
    page.getByText('Is tea better than coffee?').first(),
  ).toBeVisible()
})
