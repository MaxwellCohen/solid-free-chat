import { classifyChatError } from './chat-error'
import type { Persona } from './personas'

export const ROUNDTABLE_MIN_PERSONAS = 2
export const ROUNDTABLE_MAX_PERSONAS = 4
export const ROUNDTABLE_MAX_ROUNDS = 5
export const ROUNDTABLE_DEFAULT_ROUNDS = 2
export const MODERATOR = 'moderator'

export type TurnStatus = 'running' | 'done' | 'error' | 'stopped'

export type RoundtableTurn = {
  id: string
  /** Persona id, or MODERATOR for user interjections. */
  speaker: string
  text: string
  status: TurnStatus
  error?: string
}

export type TurnRequest = {
  system: string
  /** A single user message holding the topic and transcript so far. */
  prompt: string
}

/** Streams text deltas for one turn; injected so tests can fake it. */
export type RoundtableRunner = (
  req: TurnRequest,
  signal: AbortSignal,
) => AsyncIterable<string>

export function clampRounds(n: number): number {
  if (!Number.isFinite(n)) return ROUNDTABLE_DEFAULT_ROUNDS
  return Math.min(ROUNDTABLE_MAX_ROUNDS, Math.max(1, Math.round(n)))
}

/** Speaker indexes (into the personas list) for `rounds` full rounds. */
export function roundQueue(personaCount: number, rounds: number): number[] {
  const out: number[] = []
  for (let r = 0; r < clampRounds(rounds); r++) {
    for (let i = 0; i < personaCount; i++) out.push(i)
  }
  return out
}

export function speakerName(speaker: string, personas: Persona[]): string {
  if (speaker === MODERATOR) return 'Moderator'
  return personas.find((p) => p.id === speaker)?.name ?? speaker
}

function transcriptText(turns: RoundtableTurn[], personas: Persona[]): string {
  return turns
    .filter((t) => t.status !== 'error' && t.text.trim())
    .map((t) => `${speakerName(t.speaker, personas)}: ${t.text.trim()}`)
    .join('\n\n')
}

export function buildTurnRequest(opts: {
  topic: string
  personas: Persona[]
  speakerIndex: number
  transcript: RoundtableTurn[]
}): TurnRequest {
  const me = opts.personas[opts.speakerIndex]
  const others = opts.personas
    .filter((_, i) => i !== opts.speakerIndex)
    .map((p) => p.name)
  const system = `${me.instructions}\n\nYou are ${me.name} in a roundtable with ${others.join(', ')}. Keep replies under ~120 words, respond to what others said, stay in character. Reply with only your own words, without a name prefix.`
  const so = transcriptText(opts.transcript, opts.personas)
  const prompt =
    `Topic: ${opts.topic.trim()}\n\n` +
    (so ? `Conversation so far:\n\n${so}\n\n` : '') +
    `Now it is your turn, ${me.name}.`
  return { system, prompt }
}

/**
 * Runs the queued speakers one at a time. Stops at the first failure or abort
 * and returns the speakers still waiting (the failed one first) so the caller
 * can resume. `onUpdate(transcript)` fires on every change.
 */
export async function runTurns(opts: {
  topic: string
  personas: Persona[]
  transcript: RoundtableTurn[]
  queue: number[]
  runner: RoundtableRunner
  signal: AbortSignal
  onUpdate: (transcript: RoundtableTurn[]) => void
  /** Drains moderator turns added mid-run; called before each turn. */
  inject?: () => RoundtableTurn[]
  newId?: () => string
}): Promise<{ transcript: RoundtableTurn[]; remaining: number[] }> {
  let n = 0
  const newId = opts.newId ?? (() => `rt-${Date.now()}-${n++}`)
  let transcript = opts.transcript
  const isAborted = () => opts.signal.aborted
  const queue = [...opts.queue]
  while (queue.length > 0) {
    if (opts.signal.aborted) break
    const idx = queue[0]
    const persona = opts.personas[idx]
    const id = newId()
    const base = [...transcript, ...(opts.inject?.() ?? [])]
    const req = buildTurnRequest({
      topic: opts.topic,
      personas: opts.personas,
      speakerIndex: idx,
      transcript: base,
    })
    let turn: RoundtableTurn = {
      id,
      speaker: persona.id,
      text: '',
      status: 'running',
    }
    const push = (patch: Partial<RoundtableTurn>) => {
      turn = { ...turn, ...patch }
      transcript = [...base, turn]
      opts.onUpdate(transcript)
    }
    push({})
    try {
      for await (const delta of opts.runner(req, opts.signal)) {
        if (isAborted()) break
        push({ text: turn.text + delta })
      }
      push({ status: isAborted() ? 'stopped' : 'done' })
    } catch (e) {
      if (isAborted()) push({ status: 'stopped' })
      else {
        const info = classifyChatError(e)
        push({
          status: 'error',
          error:
            info.kind === 'rate-limit' ? 'Rate limited, retry' : info.detail,
        })
      }
    }
    if (transcript[transcript.length - 1].status === 'done') queue.shift()
    else break
  }
  return { transcript, remaining: queue }
}

export function addModeratorTurn(
  transcript: RoundtableTurn[],
  text: string,
  id: string,
): RoundtableTurn[] {
  const t = text.trim()
  if (!t) return transcript
  return [...transcript, { id, speaker: MODERATOR, text: t, status: 'done' }]
}

/** Plain messages for converting the roundtable into a normal conversation. */
export function transcriptToChat(
  topic: string,
  personas: Persona[],
  transcript: RoundtableTurn[],
): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: topic.trim() },
  ]
  for (const t of transcript) {
    if (t.status === 'error' || !t.text.trim()) continue
    if (t.speaker === MODERATOR) {
      out.push({ role: 'user', content: t.text.trim() })
    } else {
      const p = personas.find((x) => x.id === t.speaker)
      out.push({
        role: 'assistant',
        content: `**${p ? `${p.emoji} ${p.name}` : t.speaker}:** ${t.text.trim()}`,
      })
    }
  }
  return out
}
