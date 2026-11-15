import { expect, test } from '@playwright/test'

test('arena page renders, pickers work, no console errors', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (/Failed to load resource|favicon|net::ERR/i.test(t)) return
    errors.push(`console: ${t}`)
  })
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'solid-free-chat-openrouter-api-key',
      'sk-or-e2e-fake',
    )
  })
  await page.goto('/arena')
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible({
    timeout: 20_000,
  })
  const p1 = page.getByLabel('Arena model 1')
  const p2 = page.getByLabel('Arena model 2')
  await expect(page.getByLabel('Arena model 3')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compare' })).toBeDisabled()
  // Model list comes from the network; add options locally if it is blocked.
  await page.evaluate(() => {
    for (const label of ['Arena model 1', 'Arena model 2']) {
      const el = document.querySelector<HTMLSelectElement>(
        `select[aria-label="${label}"]`,
      )!
      if (el.options.length <= 1) {
        for (const id of ['x/a', 'x/b']) {
          const o = document.createElement('option')
          o.value = `openrouter\n${id}`
          o.textContent = id
          el.appendChild(o)
        }
      }
    }
  })
  await p1.selectOption({ index: 1 })
  await p2.selectOption({ index: 2 })
  await expect(p1).not.toHaveValue('')
  await expect(p2).not.toHaveValue('')
  await page.getByLabel('Arena prompt').fill('hello')
  await expect(page.getByRole('button', { name: 'Compare' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Stop all' })).toBeDisabled()
  expect(errors).toEqual([])
})
