import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_REF_PREFIX,
  attachmentKey,
  createMemoryAttachmentBackend,
  isAttachmentRef,
  openAttachmentBackend,
} from './attachment-store'

describe('attachment-store', () => {
  it('recognises ref markers', () => {
    expect(ATTACHMENT_REF_PREFIX).toBe('idb:')
    expect(isAttachmentRef('idb:image/png:3:abc')).toBe(true)
    expect(isAttachmentRef('iVBORw0KGgo=')).toBe(false)
    expect(isAttachmentRef(undefined)).toBe(false)
  })

  it('derives stable content-based keys', () => {
    const a = { value: 'AAAA', mimeType: 'image/png' }
    const b = { value: 'AAAA', mimeType: 'image/png' }
    expect(attachmentKey(a)).toBe(attachmentKey(b))
    expect(attachmentKey(a)).toMatch(/^image\/png:4:[0-9a-z]+$/)
    expect(attachmentKey({ value: 'AAAB', mimeType: 'image/png' })).not.toBe(
      attachmentKey(a),
    )
    expect(attachmentKey({ value: 'AAAA', mimeType: 'image/jpeg' })).not.toBe(
      attachmentKey(a),
    )
  })

  it('round-trips through a backend', async () => {
    const backend = createMemoryAttachmentBackend()
    await backend.put('k1', 'v1')
    await backend.put('k2', 'v2')
    expect(await backend.getMany(['k1', 'nope'])).toEqual(
      new Map([['k1', 'v1']]),
    )
    expect((await backend.keys()).sort()).toEqual(['k1', 'k2'])
    await backend.deleteMany(['k1'])
    expect(await backend.keys()).toEqual(['k2'])
  })

  it('resolves null without IndexedDB', async () => {
    expect(await openAttachmentBackend()).toBeNull()
  })
})
