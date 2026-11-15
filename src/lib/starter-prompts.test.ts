import { describe, expect, it } from 'vitest'
import { STARTER_PROMPTS } from './starter-prompts'

describe('STARTER_PROMPTS', () => {
  it('has unique ids and non-empty prompts', () => {
    const ids = new Set(STARTER_PROMPTS.map((p) => p.id))
    expect(ids.size).toBe(STARTER_PROMPTS.length)
    for (const p of STARTER_PROMPTS) expect(p.prompt.trim()).not.toBe('')
  })
})
