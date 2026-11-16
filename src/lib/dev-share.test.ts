import { describe, expect, it } from 'vitest'
import { MAX_SHARE_HASH_CHARS } from './chat-share'
import { decodeWorkspace, encodeWorkspace } from './dev-share'

describe('dev-share', () => {
  it('round-trips files', async () => {
    const files = { 'index.html': '<div id="app"></div>', 'main.js': 'a$&b' }
    expect(await decodeWorkspace(await encodeWorkspace(files))).toEqual(files)
  })
  it('rejects junk', async () => {
    expect(await decodeWorkspace('#w1.!!!')).toBeNull()
    expect(await decodeWorkspace('#other')).toBeNull()
  })

  it('rejects an oversized hash', async () => {
    expect(
      await decodeWorkspace(`#w1.${'A'.repeat(MAX_SHARE_HASH_CHARS)}`),
    ).toBeNull()
  })
})
