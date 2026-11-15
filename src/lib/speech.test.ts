import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isDictationSupported,
  isSpeechSynthesisSupported,
  joinDictation,
  markdownToSpeechText,
} from './speech'

afterEach(() => vi.unstubAllGlobals())

describe('markdownToSpeechText', () => {
  it('replaces code blocks and strips markdown', () => {
    const out = markdownToSpeechText(
      '# Title\n\nSee [docs](http://x.y) and **bold** `code`.\n\n```js\nconst a = 1\n```\n\n- item',
    )
    expect(out).toBe('Title See docs and bold code. code block omitted. item')
  })
  it('handles unterminated fences', () => {
    expect(markdownToSpeechText('hi\n```\nx')).toBe('hi code block omitted.')
  })
})

describe('joinDictation', () => {
  it('joins with spacing', () => {
    expect(joinDictation('a', 'b')).toBe('a b')
    expect(joinDictation('a ', 'b')).toBe('a b')
    expect(joinDictation('', ' b')).toBe('b')
    expect(joinDictation('a', '  ')).toBe('a')
  })
})

describe('support detection', () => {
  it('detects SpeechRecognition', () => {
    expect(isDictationSupported()).toBe(false)
    vi.stubGlobal('webkitSpeechRecognition', class {})
    expect(isDictationSupported()).toBe(true)
  })
  it('detects speechSynthesis', () => {
    expect(isSpeechSynthesisSupported()).toBe(false)
    vi.stubGlobal('speechSynthesis', {})
    vi.stubGlobal('SpeechSynthesisUtterance', class {})
    expect(isSpeechSynthesisSupported()).toBe(true)
  })
})
