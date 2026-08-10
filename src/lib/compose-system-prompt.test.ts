import { describe, expect, it } from 'vitest'
import {
  BASELINE_SYSTEM_MESSAGE,
  composeSystemPrompt,
} from './compose-system-prompt'
import type { ChatSkill } from '../store/chat.store'

const skills: ChatSkill[] = [
  {
    id: 's1',
    name: 'Concise',
    instructions: 'Keep answers short.',
    updatedAt: 1,
  },
  {
    id: 's2',
    name: 'Spanish',
    instructions: '  Reply in Spanish.  ',
    updatedAt: 2,
  },
  {
    id: 's3',
    name: 'Empty',
    instructions: '   ',
    updatedAt: 3,
  },
]

describe('composeSystemPrompt', () => {
  it('returns only the baseline when no skills are attached', () => {
    expect(composeSystemPrompt([], skills)).toBe(BASELINE_SYSTEM_MESSAGE)
  })

  it('appends attached skill instructions in order', () => {
    expect(composeSystemPrompt(['s1', 's2'], skills)).toBe(
      `${BASELINE_SYSTEM_MESSAGE}\n\nKeep answers short.\n\nReply in Spanish.`,
    )
  })

  it('skips missing skill ids and empty instructions', () => {
    expect(composeSystemPrompt(['missing', 's3', 's1'], skills)).toBe(
      `${BASELINE_SYSTEM_MESSAGE}\n\nKeep answers short.`,
    )
  })
})
