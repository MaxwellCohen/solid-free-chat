import { describe, expect, it } from 'vitest'
import {
  clampMaxTokens,
  clampTemperature,
  mergeChatSettings,
  normalizeChatSettings,
} from './chat-settings'

describe('chat settings', () => {
  it('clamps temperature to 0-2', () => {
    expect(clampTemperature(5)).toBe(2)
    expect(clampTemperature(-1)).toBe(0)
    expect(clampTemperature(0.704)).toBe(0.7)
    expect(clampTemperature(NaN)).toBeUndefined()
    expect(clampTemperature('1')).toBeUndefined()
  })

  it('clamps max tokens to positive integers', () => {
    expect(clampMaxTokens(100.9)).toBe(100)
    expect(clampMaxTokens(0)).toBeUndefined()
    expect(clampMaxTokens(-5)).toBeUndefined()
    expect(clampMaxTokens(1e12)).toBe(1_000_000)
  })

  it('normalizes and drops defaults', () => {
    expect(normalizeChatSettings(null)).toBeUndefined()
    expect(normalizeChatSettings({ systemPrompt: '  ' })).toBeUndefined()
    expect(
      normalizeChatSettings({
        systemPrompt: ' hi ',
        temperature: 9,
        maxTokens: 'x',
      }),
    ).toEqual({ systemPrompt: 'hi', temperature: 2 })
  })

  it('merges patches and clears with undefined', () => {
    const a = mergeChatSettings(undefined, { temperature: 0.5 })
    expect(a).toEqual({ temperature: 0.5 })
    expect(mergeChatSettings(a, { maxTokens: 50 })).toEqual({
      temperature: 0.5,
      maxTokens: 50,
    })
    expect(mergeChatSettings(a, { temperature: undefined })).toBeUndefined()
  })
})
