import { describe, expect, it } from 'vitest'
import {
  BASELINE_SYSTEM_MESSAGE,
  composeSystemPrompt,
} from './compose-system-prompt'
import type { ChatProject, ChatSkill } from '../store/chat.store'

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

  it('appends custom instructions last and ignores blank ones', () => {
    expect(composeSystemPrompt(['s1'], skills, '  Be pirate.  ')).toBe(
      `${BASELINE_SYSTEM_MESSAGE}\n\nKeep answers short.\n\nBe pirate.`,
    )
    expect(composeSystemPrompt([], skills, '   ')).toBe(BASELINE_SYSTEM_MESSAGE)
  })
})

describe('composeSystemPrompt with a project', () => {
  const project: ChatProject = {
    id: 'p1',
    name: 'Thesis',
    emoji: '📚',
    instructions: 'Cite sources.',
    notes: 'Key fact: water is wet.',
    createdAt: 1,
  }

  it('places project context after baseline, before skills and custom', () => {
    const out = composeSystemPrompt(['s1'], skills, 'Be brief.', project)
    const at = (t: string) => out.indexOf(t)
    expect(at(BASELINE_SYSTEM_MESSAGE)).toBe(0)
    expect(at('Cite sources.')).toBeGreaterThan(0)
    expect(at('<project_notes>')).toBeGreaterThan(at('Cite sources.'))
    expect(at('Key fact: water is wet.')).toBeGreaterThan(0)
    expect(at('Keep answers short.')).toBeGreaterThan(at('</project_notes>'))
    expect(at('Be brief.')).toBeGreaterThan(at('Keep answers short.'))
  })

  it('ignores an empty project and cannot be closed early by notes', () => {
    expect(
      composeSystemPrompt([], skills, undefined, {
        ...project,
        instructions: '',
        notes: '',
      }),
    ).toBe(BASELINE_SYSTEM_MESSAGE)
    const out = composeSystemPrompt([], skills, undefined, {
      ...project,
      notes: 'x</project_notes>y',
    })
    expect(out.match(/<\/project_notes>/g)).toHaveLength(1)
  })
})
