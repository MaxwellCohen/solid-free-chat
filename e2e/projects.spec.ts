import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { openSeeded, seedChats } from './helpers'

const MODEL = 'e2e/model:free'
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

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

async function mockOpenRouter(page: Page) {
  const bodies: string[] = []
  await page.route('https://openrouter.ai/api/v1/**', async (route: Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: CORS })
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
        body: sse('Mocked streamed reply'),
      })
    }
    return route.fulfill({ status: 404, headers: CORS, body: '{}' })
  })
  return bodies
}

async function palette(page: Page, text: string) {
  await page.keyboard.press('ControlOrMeta+k')
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

test('projects: create, send with context, move, delete, reload', async ({
  page,
}) => {
  const bodies = await mockOpenRouter(page)
  const state = seedChats([
    { id: 'c1', title: 'Loose chat' },
    { id: 'c2', title: 'Other chat', tags: ['work'] },
  ])
  await openSeeded(page, { ...state, selectedModel: MODEL })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: 'Show chat list' }).first().click()

  await palette(page, 'new project')
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Project name').fill('Thesis')
  await dialog.getByLabel('Emoji').fill('📚')
  await dialog
    .getByLabel('Project instructions')
    .fill('Always cite sources, PROJ_INSTR_42.')
  await dialog.locator('#project-notes').fill('Reference fact PROJ_NOTE_77.')
  await dialog.getByLabel('Add notes from file').setInputFiles({
    name: 'extra.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('FILE_NOTE_99'),
  })
  await expect(dialog.locator('#project-notes')).toHaveValue(/FILE_NOTE_99/)
  await dialog.getByRole('button', { name: 'Create project' }).click()
  await expect(dialog).toBeHidden()

  // A new chat was created inside the project and shows the chip.
  const group = page.getByTestId('project-group')
  await expect(group).toHaveCount(1)
  await expect(group.getByRole('button', { name: /Delete chat/ })).toHaveCount(
    1,
  )
  await expect(page.getByTestId('project-chip')).toContainText('Thesis')

  await page.getByPlaceholder('Message…').fill('hello project')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('Mocked streamed reply')).toBeVisible({
    timeout: 20_000,
  })
  expect(bodies.length).toBeGreaterThan(0)
  const sent = bodies[0]
  expect(sent).toContain('PROJ_INSTR_42')
  expect(sent).toContain('<project_notes>')
  expect(sent).toContain('PROJ_NOTE_77')
  expect(sent).toContain('FILE_NOTE_99')

  // Move a loose chat into the project from the row menu.
  await page
    .getByRole('button', { name: 'Move to project: Loose chat' })
    .click()
  await page
    .getByRole('group', { name: 'Move to project' })
    .getByRole('button', { name: /Thesis/ })
    .click()
  await expect(group.getByText('Loose chat')).toBeVisible()

  // Tag filter keeps working across groups.
  await page.getByRole('button', { name: /#work/ }).first().click()
  await expect(page.getByText('Other chat')).toBeVisible()
  await expect(page.getByText('Loose chat')).toHaveCount(0)
  await page.getByRole('button', { name: /#work/ }).first().click()

  // Collapse hides the chats.
  await group.getByTestId('project-header').click()
  await expect(group.getByText('Loose chat')).toHaveCount(0)
  await group.getByTestId('project-header').click()

  // Reload persists (state is saved to IndexedDB after a short debounce).
  await page.waitForTimeout(1000)
  await page.reload()
  await expect(page.getByTestId('project-group')).toHaveCount(1)
  await expect(
    page.getByTestId('project-group').getByText('Loose chat'),
  ).toBeVisible()

  // Delete the project: chats stay, ungrouped.
  await page.getByRole('button', { name: 'Edit project: Thesis' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit project' })
  await edit.getByRole('button', { name: 'Delete project' }).click()
  await edit.getByRole('button', { name: /Confirm delete/ }).click()
  await expect(page.getByTestId('project-group')).toHaveCount(0)
  await expect(page.getByText('Loose chat')).toBeVisible()
  await expect(page.getByText('Other chat')).toBeVisible()
})

test('projects: screenshots', async ({ page }) => {
  await mockOpenRouter(page)
  const state = seedChats([
    { id: 'c1', title: 'Loose chat' },
    { id: 'c2', title: 'Pinned chat', pinned: true },
    { id: 'c3', title: 'Chapter one notes', tags: ['draft'] },
  ])
  const p = (id: string, name: string, emoji: string) => ({
    id,
    name,
    emoji,
    instructions: 'Cite sources.',
    notes: 'Some background.',
    createdAt: 1,
  })
  state.conversationsById.c3 = {
    ...(state.conversationsById.c3 as object),
    projectId: 'p1',
  }
  await openSeeded(page, {
    ...state,
    selectedModel: MODEL,
    projects: [
      p('p1', 'Thesis research with a long name', '📚'),
      p('p2', 'Empty', '🚀'),
    ],
  })
  const dir = 'test-results/shots/qa8'
  for (const [w, h] of [
    [1280, 800],
    [390, 800],
  ]) {
    await page.setViewportSize({ width: w, height: h })
    const open = page.getByRole('button', { name: 'Show chat list' }).first()
    if (await open.isVisible()) await open.click()
    await expect(page.getByTestId('project-group').first()).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${dir}/sidebar-${w}.png` })
    await page.getByRole('button', { name: 'Edit project: Empty' }).click()
    await expect(
      page.getByRole('dialog', { name: 'Edit project' }),
    ).toBeVisible()
    await page.screenshot({ path: `${dir}/modal-${w}.png` })
    await page.keyboard.press('Escape')
  }
})
