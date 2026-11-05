import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export const QA_SHOTS =
  '/private/tmp/claude-501/-Users-maxcohen-code-solid-free-chat/aaae170d-3239-434e-9bce-a3e9911d2558/scratchpad/qa4'

type Conv = { id: string; title: string; tags?: string[]; pinned?: boolean }

/** Seeds local storage with chats; c1 holds a short user/assistant exchange. */
export function seedChats(convs: Conv[], assistantElapsedMs?: number) {
  const now = Date.now()
  const conversationsById: Record<string, unknown> = {}
  const messagesByConversationId: Record<string, unknown[]> = {}
  convs.forEach((c, i) => {
    conversationsById[c.id] = {
      ...c,
      updatedAt: now - i * 3_600_000,
      skillIds: [],
    }
    messagesByConversationId[c.id] = [
      {
        id: `${c.id}-u`,
        role: 'user',
        parts: [{ type: 'text', content: 'hello there' }],
        createdAt: new Date(now - 60_000).toISOString(),
      },
      {
        id: `${c.id}-a`,
        role: 'assistant',
        parts: [
          {
            type: 'text',
            content:
              'The quick brown fox jumps over the lazy dog.\n\n```js\nconst a = 1\n```',
          },
        ],
        createdAt: new Date(now - 30_000).toISOString(),
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 50,
          totalTokens: 60,
          recordedAt: now,
        },
        ...(assistantElapsedMs ? { elapsedMs: assistantElapsedMs } : {}),
      },
    ]
  })
  return {
    conversationOrder: convs.map((c) => c.id),
    conversationsById,
    messagesByConversationId,
    currentConversationId: convs[0].id,
    selectedModel: 'openrouter/free',
    skills: [],
    enabledToolIds: [],
  }
}

export async function openSeeded(page: Page, state: unknown) {
  await page.addInitScript((s) => {
    if (window !== window.top) return
    if (sessionStorage.getItem('e2e-seeded')) return
    sessionStorage.setItem('e2e-seeded', '1')
    sessionStorage.setItem(
      'solid-free-chat-openrouter-api-key',
      'sk-or-e2e-fake',
    )
    localStorage.setItem('tour-seen-v1', '1')
    localStorage.setItem('solid-free-chat:v2', JSON.stringify(s))
  }, state)
  await page.goto('/')
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible({
    timeout: 20_000,
  })
}

export const QA7_SHOTS = QA_SHOTS.replace('qa4', 'qa7')

/** Seed with a long multi-turn chat where replies contain headings. */
export function seedOutlineChat() {
  const state = seedChats([{ id: 'c1', title: 'Outline' }])
  const msgs: unknown[] = []
  const filler = Array.from(
    { length: 12 },
    () => 'Lorem ipsum dolor sit amet.',
  ).join('\n\n')
  for (let i = 1; i <= 6; i++) {
    msgs.push({
      id: `u${i}`,
      role: 'user',
      parts: [
        { type: 'text', content: `Question number ${i} about topic ${i}` },
      ],
      createdAt: new Date(Date.now() - (20 - i) * 60_000).toISOString(),
    })
    msgs.push({
      id: `a${i}`,
      role: 'assistant',
      parts: [
        {
          type: 'text',
          content: `# Answer ${i}\n\n${filler}\n\n## Details ${i}\n\n${filler}\n\n\`\`\`sh\n# not a heading ${i}\n\`\`\``,
        },
      ],
      createdAt: new Date(Date.now() - (20 - i) * 60_000 + 1000).toISOString(),
    })
  }
  ;(state.messagesByConversationId as Record<string, unknown[]>).c1 = msgs
  return state
}
