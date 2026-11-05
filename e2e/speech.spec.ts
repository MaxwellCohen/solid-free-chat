import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const MD =
  '# Title\n\nSome **bold** text and a [link](https://x.test).\n\n```js\nconst a = 1\n```'

function seedState() {
  const now = Date.now()
  return {
    conversationOrder: ['c1'],
    conversationsById: {
      c1: { id: 'c1', title: 'Speech', updatedAt: now, skillIds: [] },
    },
    messagesByConversationId: {
      c1: [
        {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', content: 'hi' }],
          createdAt: new Date(now - 2000).toISOString(),
        },
        {
          id: 'm2',
          role: 'assistant',
          parts: [{ type: 'text', content: MD }],
          createdAt: new Date(now - 1000).toISOString(),
        },
      ],
    },
    currentConversationId: 'c1',
    selectedModel: 'openrouter/free',
    skills: [],
    enabledToolIds: [],
  }
}

async function open(page: Page) {
  await page.addInitScript((s) => {
    const w = window as unknown as Record<string, unknown>
    const log: { speak: string[]; cancel: number; stops: number } = {
      speak: [],
      cancel: 0,
      stops: 0,
    }
    w.__speech = log
    class FakeRecognition {
      onresult: ((e: unknown) => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      continuous = false
      interimResults = false
      lang = ''
      start() {
        w.__rec = this
        setTimeout(() => {
          this.onresult?.({
            resultIndex: 0,
            results: [{ isFinal: false, 0: { transcript: 'hello wor' } }],
          })
          setTimeout(
            () =>
              this.onresult?.({
                resultIndex: 0,
                results: [{ isFinal: true, 0: { transcript: 'hello world' } }],
              }),
            50,
          )
        }, 50)
      }
      stop() {
        log.stops++
      }
      abort() {
        log.stops++
      }
    }
    w.SpeechRecognition = FakeRecognition
    class FakeUtterance {
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    w.SpeechSynthesisUtterance = FakeUtterance
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u: { text: string }) => log.speak.push(u.text),
        cancel: () => log.cancel++,
      },
    })
    if (window !== window.top) return
    if (sessionStorage.getItem('e2e-seeded')) return
    sessionStorage.setItem('e2e-seeded', '1')
    sessionStorage.setItem(
      'solid-free-chat-openrouter-api-key',
      'sk-or-e2e-fake',
    )
    localStorage.setItem('solid-free-chat:v2', JSON.stringify(s))
  }, seedState())
  await page.goto('/')
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
}

const speechLog = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __speech: { speak: string[]; stops: number } })
        .__speech,
  )

test('dictation fills the draft and stops on Esc and on send', async ({
  page,
}) => {
  await open(page)
  const draft = page.getByPlaceholder('Message…')
  await draft.fill('start')
  await page.getByRole('button', { name: 'Start dictation' }).click()
  await expect(
    page.getByRole('button', { name: 'Stop dictation' }),
  ).toBeVisible()
  await expect(draft).toHaveValue('start hello world')

  await draft.focus()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: 'Start dictation' }),
  ).toBeVisible()
  expect((await speechLog(page)).stops).toBe(1)

  await page.getByRole('button', { name: 'Start dictation' }).click()
  await expect(draft).toHaveValue('start hello world hello world')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Start dictation' }),
  ).toBeVisible()
  expect((await speechLog(page)).stops).toBe(2)
})

test('read aloud speaks markdown-stripped text and toggles to Stop', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('button', { name: 'Read message aloud' }).click()
  const stop = page.getByRole('button', { name: 'Stop reading aloud' })
  await expect(stop).toBeVisible()
  await expect(stop).toHaveText(/Stop/)
  const log = await speechLog(page)
  expect(log.speak).toHaveLength(1)
  expect(log.speak[0]).toBe(
    'Title Some bold text and a link. code block omitted.',
  )
  await stop.click()
  await expect(
    page.getByRole('button', { name: 'Read message aloud' }),
  ).toBeVisible()
})
