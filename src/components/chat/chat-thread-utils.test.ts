import { describe, expect, it } from 'vitest'
import type { UIMessage } from '@tanstack/ai-client'
import {
  messageToPlainText,
  messagesBefore,
  withEditedText,
} from './chat-thread-utils'

describe('messagesBefore', () => {
  const msgs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  it('truncates exclusive and inclusive', () => {
    expect(messagesBefore(msgs, 'b')).toEqual([{ id: 'a' }])
    expect(messagesBefore(msgs, 'b', true)).toEqual([{ id: 'a' }, { id: 'b' }])
  })
  it('returns null for unknown id', () => {
    expect(messagesBefore(msgs, 'x')).toBeNull()
  })
})

describe('messageToPlainText', () => {
  it('joins text parts only', () => {
    const m = {
      id: '1',
      role: 'assistant',
      parts: [
        { type: 'text', content: 'one' },
        { type: 'thinking', content: 'hmm' },
        { type: 'text', content: 'two' },
      ],
    } as unknown as UIMessage
    expect(messageToPlainText(m)).toBe('one\n\ntwo')
  })
})

describe('withEditedText', () => {
  it('replaces text and keeps attachments', () => {
    const img = {
      type: 'image',
      source: { type: 'data', value: 'x', mimeType: 'image/png' },
    } as const
    expect(
      withEditedText([{ type: 'text', content: 'old' }, img], 'new'),
    ).toEqual([{ type: 'text', content: 'new' }, img])
    expect(withEditedText([{ type: 'text', content: 'old' }, img], '')).toEqual(
      [img],
    )
  })
})
