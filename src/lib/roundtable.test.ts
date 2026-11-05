import { describe, expect, it } from 'vitest'

import {
  addModeratorTurn,
  buildTurnRequest,
  clampRounds,
  roundQueue,
  runTurns,
  transcriptToChat,
} from './roundtable'
import type { RoundtableRunner, RoundtableTurn } from './roundtable'
import type { Persona } from './personas'

const P: Persona[] = [
  { id: 'a', emoji: 'A', name: 'Alice', tagline: '', instructions: 'Be A.' },
  { id: 'b', emoji: 'B', name: 'Bob', tagline: '', instructions: 'Be B.' },
  { id: 'c', emoji: 'C', name: 'Cy', tagline: '', instructions: 'Be C.' },
]

let seq = 0
const newId = () => `t${seq++}`

describe('roundtable', () => {
  it('clamps rounds and builds the queue', () => {
    expect(clampRounds(0)).toBe(1)
    expect(clampRounds(99)).toBe(5)
    expect(clampRounds(NaN)).toBe(2)
    expect(roundQueue(3, 2)).toEqual([0, 1, 2, 0, 1, 2])
  })

  it('builds the system prompt and transcript context', () => {
    const t: RoundtableTurn[] = addModeratorTurn(
      [{ id: '1', speaker: 'a', text: 'Hi there', status: 'done' }],
      ' focus please ',
      '2',
    )
    const r = buildTurnRequest({
      topic: 'Cats?',
      personas: P,
      speakerIndex: 1,
      transcript: t,
    })
    expect(r.system).toContain('Be B.')
    expect(r.system).toContain('You are Bob in a roundtable with Alice, Cy')
    expect(r.system).toContain('under ~120 words')
    expect(r.prompt).toContain('Topic: Cats?')
    expect(r.prompt).toContain('Alice: Hi there')
    expect(r.prompt).toContain('Moderator: focus please')
  })

  it('runs turns in order and each sees earlier turns', async () => {
    const prompts: string[] = []
    const runner: RoundtableRunner = async function* (req) {
      prompts.push(req.prompt)
      yield `r${prompts.length}`
      yield '!'
    }
    const updates: number[] = []
    const res = await runTurns({
      topic: 'T',
      personas: P.slice(0, 2),
      transcript: [],
      queue: roundQueue(2, 2),
      runner,
      signal: new AbortController().signal,
      onUpdate: (t) => updates.push(t.length),
      newId,
    })
    expect(res.remaining).toEqual([])
    expect(res.transcript.map((t) => [t.speaker, t.text])).toEqual([
      ['a', 'r1!'],
      ['b', 'r2!'],
      ['a', 'r3!'],
      ['b', 'r4!'],
    ])
    expect(prompts[0]).not.toContain('Conversation so far')
    expect(prompts[3]).toContain('Alice: r3!')
    expect(Math.max(...updates)).toBe(4)
  })

  it('stops on error, returns the failed speaker first, and resumes', async () => {
    let calls = 0
    const runner: RoundtableRunner = async function* () {
      calls++
      if (calls === 2) throw new Error('boom')
      yield 'ok'
    }
    const sig = new AbortController().signal
    const first = await runTurns({
      topic: 'T',
      personas: P,
      transcript: [],
      queue: [0, 1, 2],
      runner,
      signal: sig,
      onUpdate: () => {},
      newId,
    })
    expect(first.remaining).toEqual([1, 2])
    expect(first.transcript[1].status).toBe('error')
    const retryBase = first.transcript.filter((t) => t.status !== 'error')
    const second = await runTurns({
      topic: 'T',
      personas: P,
      transcript: retryBase,
      queue: first.remaining,
      runner,
      signal: sig,
      onUpdate: () => {},
      newId,
    })
    expect(second.remaining).toEqual([])
    expect(second.transcript.map((t) => t.speaker)).toEqual(['a', 'b', 'c'])
  })

  it('abort marks the turn stopped and keeps the queue', async () => {
    const ac = new AbortController()
    const runner: RoundtableRunner = async function* () {
      yield 'part'
      ac.abort()
      yield 'more'
    }
    const res = await runTurns({
      topic: 'T',
      personas: P,
      transcript: [],
      queue: [0, 1],
      runner,
      signal: ac.signal,
      onUpdate: () => {},
      newId,
    })
    expect(res.transcript).toHaveLength(1)
    expect(res.transcript[0]).toMatchObject({ status: 'stopped', text: 'part' })
    expect(res.remaining).toEqual([0, 1])
  })

  it('converts a transcript to chat messages', () => {
    const msgs = transcriptToChat('Topic', P, [
      { id: '1', speaker: 'a', text: 'x', status: 'done' },
      { id: '2', speaker: 'moderator', text: 'y', status: 'done' },
      { id: '3', speaker: 'b', text: '', status: 'error' },
    ])
    expect(msgs).toEqual([
      { role: 'user', content: 'Topic' },
      { role: 'assistant', content: '**A Alice:** x' },
      { role: 'user', content: 'y' },
    ])
  })

  it('feeds injected moderator turns to later speakers', async () => {
    const prompts: string[] = []
    let pending: RoundtableTurn[] = []
    const runner: RoundtableRunner = async function* (req) {
      prompts.push(req.prompt)
      if (prompts.length === 1) {
        pending = addModeratorTurn([], 'be nice', 'm1')
      }
      yield 'x'
    }
    await runTurns({
      topic: 'T',
      personas: P.slice(0, 2),
      transcript: [],
      queue: [0, 1],
      runner,
      signal: new AbortController().signal,
      onUpdate: () => {},
      inject: () => {
        const out = pending
        pending = []
        return out
      },
      newId,
    })
    expect(prompts[0]).not.toContain('be nice')
    expect(prompts[1]).toContain('Moderator: be nice')
  })
})
