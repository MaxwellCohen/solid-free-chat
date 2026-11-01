import { describe, expect, it } from 'vitest'
import { NON_CHAT } from './provider-models'

describe('NON_CHAT', () => {
  it('skips speech/audio/guard models and keeps chat models', () => {
    for (const id of [
      'canopylabs/orpheus-arabic-saudi',
      'canopylabs/orpheus-v1-english',
      'whisper-large-v3',
      'meta-llama/llama-guard-4-12b',
    ]) {
      expect(NON_CHAT.test(id)).toBe(true)
    }
    for (const id of [
      'llama-3.3-70b-versatile',
      'qwen/qwen3-32b',
      'openai/gpt-oss-20b',
    ]) {
      expect(NON_CHAT.test(id)).toBe(false)
    }
  })
})
