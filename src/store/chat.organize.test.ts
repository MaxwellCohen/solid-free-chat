import { beforeEach, describe, expect, it } from 'vitest'
import {
  NEW_CHAT_TITLE,
  chatActions,
  chatSelectors,
  chatStore,
  normalizeChatAppState,
} from './chat.store'

function ids() {
  return chatSelectors.conversationList(chatStore.state).map((c) => c.id)
}

describe('pin and rename', () => {
  let a = ''
  let b = ''
  let c = ''
  beforeEach(() => {
    chatActions.resetToEmpty()
    chatActions.createConversation()
    chatActions.createConversation()
    chatActions.createConversation()
    ;[a, b, c] = chatStore.state.conversationOrder
  })

  it('togglePinned pins and unpins, listing pinned first in stable order', () => {
    chatActions.togglePinned(c)
    expect(ids()).toEqual([c, a, b])
    chatActions.togglePinned(a)
    expect(ids()).toEqual([a, c, b])
    chatActions.togglePinned(c)
    expect(chatStore.state.conversationsById[c].pinned).toBeUndefined()
    expect(ids()).toEqual([a, b, c])
  })

  it('renameConversation trims, locks title, and falls back when empty', () => {
    chatActions.renameConversation(a, '  Hello  ')
    expect(chatStore.state.conversationsById[a].title).toBe('Hello')
    expect(chatStore.state.conversationsById[a].titleLocked).toBe(true)
    chatActions.renameConversation(b, '   ')
    expect(chatStore.state.conversationsById[b].title).toBe(NEW_CHAT_TITLE)
    expect(chatStore.state.conversationsById[b].titleLocked).toBeUndefined()
  })

  it('does not auto-title a locked conversation', () => {
    const msg = {
      id: 'm1',
      role: 'user',
      parts: [{ type: 'text', content: 'Auto title me' }],
    } as never
    chatActions.renameConversation(a, NEW_CHAT_TITLE + ' ')
    chatActions.setConversationMessages(a, [msg])
    expect(chatStore.state.conversationsById[a].title).toBe(NEW_CHAT_TITLE)
    chatActions.setConversationMessages(b, [msg])
    expect(chatStore.state.conversationsById[b].title).not.toBe(NEW_CHAT_TITLE)
  })

  it('normalizes pinned/titleLocked and loads old data without them', () => {
    const state = normalizeChatAppState({
      conversationOrder: ['x', 'y'],
      conversationsById: {
        x: { id: 'x', title: 'X', updatedAt: 1, pinned: true, titleLocked: true },
        y: { id: 'y', title: 'Y', updatedAt: 1, pinned: 'yes' },
      },
      messagesByConversationId: {},
    })
    expect(state?.conversationsById.x.pinned).toBe(true)
    expect(state?.conversationsById.x.titleLocked).toBe(true)
    expect(state?.conversationsById.y.pinned).toBeUndefined()
  })
})
