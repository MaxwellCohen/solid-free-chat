import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

const LINKS = [
  ['Chat', '/'],
  ['Review', '/review'],
  ['Saved', '/saved'],
  ['Insights', '/insights'],
  ['Arena', '/arena'],
  ['Roundtable', '/roundtable'],
  ['Dev', '/dev'],
  ['About', '/about'],
] as const

const noHScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  )

test('mobile menu reaches every link, closes on navigate/Esc/outside', async ({
  page,
}) => {
  await page.goto('/about')
  const menu = page.getByRole('button', { name: 'Menu' })
  await expect(menu).toBeVisible({ timeout: 20_000 })
  await expect(menu).toHaveAttribute('aria-expanded', 'false')

  for (const [label, path] of LINKS) {
    await menu.click()
    await expect(menu).toHaveAttribute('aria-expanded', 'true')
    const nav = page.getByRole('navigation', { name: 'Main' })
    for (const [l] of LINKS) {
      await expect(
        nav.getByRole('link', { name: l, exact: true }),
      ).toBeVisible()
    }
    await nav.getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : path}$`))
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(await noHScroll(page)).toBe(true)
  }

  await menu.click()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(menu).toBeFocused()

  await menu.click()
  await page.mouse.click(200, 700)
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
})
