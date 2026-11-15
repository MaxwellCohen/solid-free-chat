import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_PERSONAS,
  createCustomPersona,
  deleteCustomPersona,
  parseCustomPersonas,
  personaChatSetup,
} from './personas'
import { normalizeChatSettings } from './chat-settings'

describe('personas', () => {
  it('ships ~10 unique built-ins', () => {
    expect(BUILT_IN_PERSONAS.length).toBeGreaterThanOrEqual(10)
    expect(new Set(BUILT_IN_PERSONAS.map((p) => p.id)).size).toBe(
      BUILT_IN_PERSONAS.length,
    )
  })
  it('creates, rejects invalid, and deletes custom personas', () => {
    const a = createCustomPersona(
      { name: ' Chef ', emoji: '🍳', instructions: 'Cook.' },
      [],
    )
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ name: 'Chef', emoji: '🍳', custom: true })
    expect(createCustomPersona({ name: '', instructions: 'x' }, a)).toBe(a)
    expect(deleteCustomPersona(a[0].id, a)).toEqual([])
  })
  it('parses stored data tolerantly', () => {
    expect(parseCustomPersonas('nope')).toEqual([])
    const list = parseCustomPersonas([
      { id: 'x', name: 'A', instructions: 'i' },
      { name: 'bad' },
    ])
    expect(list).toHaveLength(1)
    expect(list[0].emoji).toBe('🙂')
  })
  it('setup survives settings normalization', () => {
    const setup = personaChatSetup(BUILT_IN_PERSONAS[0])
    const s = normalizeChatSettings(setup.settings)
    expect(s?.systemPrompt).toBe(BUILT_IN_PERSONAS[0].instructions)
    expect(s?.persona?.name).toBe('Socratic Tutor')
    expect(setup.title).toContain('Socratic Tutor')
  })
})
