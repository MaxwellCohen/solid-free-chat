import { describe, expect, it } from 'vitest'
import { buildImageUrl, isImageUrl } from './image-url'

describe('buildImageUrl', () => {
  it('builds an encoded url', () => {
    const r = buildImageUrl({ prompt: 'a red fox & "moon"', seed: 7 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.url).toBe(
      'https://image.pollinations.ai/prompt/a%20red%20fox%20%26%20%22moon%22?width=768&height=768&seed=7&nologo=true',
    )
    expect(isImageUrl(r.url)).toBe(true)
  })
  it('clamps dimensions', () => {
    const r = buildImageUrl({ prompt: 'x', width: 10, height: 99999, seed: 1 })
    expect(r.ok && [r.width, r.height]).toEqual([256, 1536])
  })
  it('defaults bad dimensions and caps prompt', () => {
    const r = buildImageUrl({ prompt: 'a'.repeat(5000), width: 'abc' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.prompt.length).toBe(600)
      expect(r.width).toBe(768)
    }
  })
  it('rejects empty prompt and non-generator urls', () => {
    expect(buildImageUrl({ prompt: '  ' }).ok).toBe(false)
    expect(buildImageUrl({ prompt: 5 }).ok).toBe(false)
    expect(isImageUrl('https://evil.example/x.png')).toBe(false)
    expect(isImageUrl('http://image.pollinations.ai/prompt/x')).toBe(false)
    expect(isImageUrl(undefined)).toBe(false)
  })
})
