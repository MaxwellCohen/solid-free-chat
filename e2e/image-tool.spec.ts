import { expect, test } from '@playwright/test'
import { QA_SHOTS, openSeeded, seedChats } from './helpers'

const SHOTS = QA_SHOTS.replace('qa4', 'qa6')
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function state(url: string) {
  const s = seedChats([{ id: 'c1', title: 'Image chat' }])
  const msgs = s.messagesByConversationId.c1 as Array<Record<string, unknown>>
  msgs[1].parts = [
    {
      type: 'tool-call',
      id: 'tc1',
      name: 'generate_image',
      arguments: '{"prompt":"a red fox"}',
      input: { prompt: 'a red fox' },
      state: 'input-complete',
      output: { ok: true, url, prompt: 'a red fox' },
    },
    { type: 'text', content: 'Here is your fox.' },
  ]
  return s
}

const URL_OK =
  'https://image.pollinations.ai/prompt/a%20red%20fox?width=768&height=768&seed=1&nologo=true'

for (const width of [1280, 390])
  test(`generate_image result renders an image card with safe attributes @${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    let referer: string | undefined
    await page.route('https://image.pollinations.ai/**', (route) => {
      referer = route.request().headers()['referer']
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    })
    await openSeeded(page, state(URL_OK))
    const card = page.getByTestId('image-card')
    await expect(card).toBeVisible()
    const img = card.getByRole('img', { name: 'a red fox' })
    await img.scrollIntoViewIfNeeded()
    await expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    await expect(img).not.toHaveAttribute('crossorigin', /.*/)
    await expect(card.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      URL_OK,
    )
    await expect(card.getByRole('link', { name: 'Download' })).toBeVisible()
    await expect(card.getByTestId('image-skeleton')).toHaveCount(0)
    expect(referer).toBeUndefined()
    await page.screenshot({
      path: `${SHOTS}/image-${page.viewportSize()?.width}.png`,
    })
  })

test('generate_image shows a fallback when the image fails', async ({
  page,
}) => {
  await page.route('https://image.pollinations.ai/**', (route) =>
    route.fulfill({ status: 500, body: 'no' }),
  )
  await openSeeded(page, state(URL_OK))
  await expect(page.getByTestId('image-card').getByRole('alert')).toHaveText(
    'Could not load the image.',
  )
})

test('non-generator urls are not rendered as images', async ({ page }) => {
  await openSeeded(page, state('https://evil.example/x.png'))
  await expect(page.getByText('Here is your fox.')).toBeVisible()
  await expect(page.getByTestId('image-card')).toHaveCount(0)
})
