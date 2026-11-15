import { classifyChatError } from './chat-error'

export const ARENA_MIN_MODELS = 2
export const ARENA_MAX_MODELS = 3

export type ArenaTarget = { providerId: string; modelId: string }

export type ArenaChunk =
  | { type: 'text'; delta: string }
  | {
      type: 'usage'
      promptTokens?: number
      completionTokens?: number
      totalTokens?: number
    }

/** Streams one model's answer; injected so tests can fake it. */
export type ArenaRunner = (
  target: ArenaTarget,
  prompt: string,
  signal: AbortSignal,
) => AsyncIterable<ArenaChunk>

export type ArenaStatus =
  'idle' | 'running' | 'done' | 'error' | 'rate-limited' | 'stopped'

export type ArenaColumn = {
  target: ArenaTarget
  status: ArenaStatus
  text: string
  error?: string
  elapsedMs: number
  totalTokens?: number
}

export function targetKey(t: ArenaTarget): string {
  return `${t.providerId}\n${t.modelId}`
}

export function newColumn(target: ArenaTarget): ArenaColumn {
  return { target, status: 'idle', text: '', elapsedMs: 0 }
}

/** Distinct targets, capped at the arena maximum. */
export function normalizeTargets(targets: ArenaTarget[]): ArenaTarget[] {
  const seen = new Set<string>()
  const out: ArenaTarget[] = []
  for (const t of targets) {
    const k = targetKey(t)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out.slice(0, ARENA_MAX_MODELS)
}

export function isFinished(status: ArenaStatus): boolean {
  return status !== 'idle' && status !== 'running'
}

/**
 * Runs the prompt against every target in parallel. Each column succeeds or
 * fails on its own; `onUpdate(index, column)` fires on every change.
 */
export async function runArena(opts: {
  prompt: string
  targets: ArenaTarget[]
  runner: ArenaRunner
  signal: AbortSignal
  onUpdate: (index: number, column: ArenaColumn) => void
  now?: () => number
}): Promise<ArenaColumn[]> {
  const now = opts.now ?? Date.now
  return Promise.all(
    opts.targets.map(async (target, index) => {
      const start = now()
      let col: ArenaColumn = { ...newColumn(target), status: 'running' }
      const push = (patch: Partial<ArenaColumn>) => {
        col = { ...col, ...patch, elapsedMs: now() - start }
        opts.onUpdate(index, col)
      }
      push({})
      try {
        for await (const chunk of opts.runner(
          target,
          opts.prompt,
          opts.signal,
        )) {
          if (opts.signal.aborted) break
          if (chunk.type === 'text') push({ text: col.text + chunk.delta })
          else {
            const total =
              chunk.totalTokens ??
              (chunk.promptTokens ?? 0) + (chunk.completionTokens ?? 0)
            if (total > 0) push({ totalTokens: total })
          }
        }
        push({ status: opts.signal.aborted ? 'stopped' : 'done' })
      } catch (e) {
        if (opts.signal.aborted) push({ status: 'stopped' })
        else {
          const info = classifyChatError(e)
          push({
            status: info.kind === 'rate-limit' ? 'rate-limited' : 'error',
            error:
              info.kind === 'rate-limit' ? 'Rate limited, retry' : info.detail,
          })
        }
      }
      return col
    }),
  )
}
