import { describe, expect, it } from 'vitest'
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
})
