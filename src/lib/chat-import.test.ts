import { describe, expect, it } from 'vitest'

import { mergeImportedChats } from './chat-export'
import { parseChatGptExport } from './chat-import'

const msg = (
  id: string,
  role: string,
  text: string,
  parent: string | null,
) => ({
  id,
  parent,
  message: {
    id,
    author: { role },
    create_time: 1700000000,
    content: { content_type: 'text', parts: [text] },
  },
})

const fixture = [
  {
    conversation_id: 'abc',
    title: 'Greeting',
    update_time: 1700000100,
    current_node: 'a2',
    mapping: {
      root: { id: 'root', parent: null, message: null },
      sys: msg('sys', 'system', 'hidden', 'root'),
      u1: msg('u1', 'user', 'Hi', 'sys'),
      a1: msg('a1', 'assistant', 'old branch', 'u1'),
      a2: msg('a2', 'assistant', 'Hello!', 'u1'),
    },
  },
]

describe('parseChatGptExport', () => {
  it('follows current_node parents and keeps user/assistant text only', () => {
    const r = parseChatGptExport(JSON.stringify(fixture))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const id = r.state.conversationOrder[0]
    expect(r.state.conversationsById[id].title).toBe('Greeting')
    const msgs = r.state.messagesByConversationId[id]
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(msgs[1].parts).toEqual([{ type: 'text', content: 'Hello!' }])
  })
  it('rejects non-ChatGPT and invalid input', () => {
    expect(parseChatGptExport('nope').ok).toBe(false)
    expect(parseChatGptExport('{"a":1}').ok).toBe(false)
    expect(parseChatGptExport('[]').ok).toBe(false)
  })
  it('merges without clobbering ids', () => {
    const r = parseChatGptExport(JSON.stringify(fixture))
    if (!r.ok) throw new Error('x')
    const once = mergeImportedChats(r.state, r.state, () => 'fresh')
    expect(once.addedIds).toEqual(['fresh'])
    expect(once.state.conversationOrder).toHaveLength(2)
  })
})
