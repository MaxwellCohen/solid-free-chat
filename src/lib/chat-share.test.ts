import { describe, expect, it } from 'vitest'
import type { ChatUIMessage } from '../store/chat.store'
import {
  MAX_SHARE_HASH_BYTES,
  buildShareLink,
  decodeSharedChat,
  encodeSharedChat,
  sharedChatToUIMessages,
  toSharedChat,
} from './chat-share'

function textMessage(
  id: string,
  role: ChatUIMessage['role'],
  content: string,
): ChatUIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', content }],
  }
}

describe('chat-share', () => {
  it('round-trips title, model, and text messages', async () => {
    const shared = toSharedChat({
      title: 'Hello',
      model: 'openrouter/free',
      messages: [
        textMessage('u1', 'user', 'Hi'),
        textMessage('a1', 'assistant', 'Hello there'),
      ],
    })
    const hash = await encodeSharedChat(shared)
    expect(hash.startsWith('#v1.')).toBe(true)
    const decoded = await decodeSharedChat(hash)
    expect(decoded).toEqual(shared)
    const ui = sharedChatToUIMessages(decoded!)
    expect(ui).toHaveLength(2)
    expect(ui[0].parts[0]).toEqual({ type: 'text', content: 'Hi' })
  })

  it('replaces image and document parts with placeholders', () => {
    const shared = toSharedChat({
      title: 'Media',
      model: 'm',
      messages: [
        {
          id: 'u1',
          role: 'user',
          parts: [
            { type: 'text', content: 'see' },
            {
              type: 'image',
              source: {
                type: 'data',
                value: 'AAAA',
                mimeType: 'image/png',
              },
            },
            {
              type: 'document',
              source: {
                type: 'data',
                value: 'BBBB',
                mimeType: 'application/pdf',
              },
              metadata: { filename: 'notes.pdf' },
            },
          ],
        },
      ],
    })
    expect(shared.messages[0].parts).toEqual([
      { type: 'text', content: 'see' },
      { type: 'text', content: '[image omitted]' },
      { type: 'text', content: '[document omitted: notes.pdf]' },
    ])
  })

  it('returns null for invalid hashes', async () => {
    expect(await decodeSharedChat('')).toBeNull()
    expect(await decodeSharedChat('#v2.abc')).toBeNull()
    expect(await decodeSharedChat('#v1.not-valid-base64!!!')).toBeNull()
  })

  it('buildShareLink reports size and overLimit', async () => {
    const result = await buildShareLink({
      baseUrl: 'https://example.com/share',
      title: 'T',
      model: 'm',
      messages: [textMessage('u1', 'user', 'short')],
    })
    expect(result.url.startsWith('https://example.com/share#v1.')).toBe(true)
    expect(result.byteLength).toBeGreaterThan(0)
    expect(result.overLimit).toBe(false)
    expect(result.byteLength).toBeLessThanOrEqual(MAX_SHARE_HASH_BYTES)
  })

  it('marks overLimit when hash exceeds 1 MiB', async () => {
    // Large repetitive text compresses well; use high-entropy-ish unique chunks.
    const chunks: string[] = []
    for (let i = 0; i < 80_000; i++) {
      chunks.push(`line-${i}-${Math.random().toString(36).slice(2)}`)
    }
    const result = await buildShareLink({
      baseUrl: 'http://localhost:3000/share',
      title: 'Huge',
      model: 'm',
      messages: [textMessage('u1', 'user', chunks.join('\n'))],
    })
    expect(result.byteLength).toBeGreaterThan(MAX_SHARE_HASH_BYTES)
    expect(result.overLimit).toBe(true)
    const decoded = await decodeSharedChat(result.hash)
    expect(decoded?.title).toBe('Huge')
  })
})
