export type MeterMessage = { id: string; role: string; text: string }

export type MeterLevel = 'ok' | 'warn' | 'critical'

/** Rough token count: ~4 characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Per-message overhead (role markers etc.) added to each estimate. */
const MESSAGE_OVERHEAD = 4

export function estimateConversationTokens(texts: string[]): number {
  return texts.reduce((sum, t) => sum + estimateTokens(t) + MESSAGE_OVERHEAD, 0)
}

export const WARN_RATIO = 0.7
export const CRITICAL_RATIO = 0.9
export const COMPACT_RATIO = 0.8

export type ContextUsage = {
  used: number
  limit: number
  ratio: number
  level: MeterLevel
  canCompact: boolean
}

/** Null when the model's context length is unknown. */
export function contextUsage(
  used: number,
  limit: number | undefined,
): ContextUsage | null {
  if (!limit || limit <= 0) return null
  const ratio = used / limit
  return {
    used,
    limit,
    ratio,
    level:
      ratio >= CRITICAL_RATIO
        ? 'critical'
        : ratio >= WARN_RATIO
          ? 'warn'
          : 'ok',
    canCompact: ratio > COMPACT_RATIO,
  }
}

export const KEEP_RECENT = 4

/**
 * Split into messages to summarize and recent ones kept verbatim. The kept
 * tail starts at a user message when possible. Null when nothing is worth
 * compacting.
 */
export function splitForCompact<T extends { role: string }>(
  messages: T[],
  keep = KEEP_RECENT,
): { older: T[]; recent: T[] } | null {
  let split = messages.length - keep
  while (split > 0 && messages[split].role !== 'user') split--
  if (split < 1) return null
  return { older: messages.slice(0, split), recent: messages.slice(split) }
}

export const COMPACT_SYSTEM_PROMPT =
  'You compress conversations. Summarize the transcript into a dense, faithful summary that preserves facts, decisions, names, code identifiers, constraints and open questions. Use short bullets. Reply with the summary only.'

const MAX_TRANSCRIPT_CHARS = 60_000

export function buildCompactMessages(
  older: Array<{ role: string; text: string }>,
): Array<{ role: 'user'; content: string }> {
  let transcript = older
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n\n')
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = '…' + transcript.slice(-MAX_TRANSCRIPT_CHARS)
  }
  return [
    {
      role: 'user',
      content: `Summarize this earlier part of a conversation:\n\n${transcript}`,
    },
  ]
}

export const SUMMARY_PREFIX = '[Summary of earlier conversation]\n\n'

export function summaryMessageText(summary: string): string {
  return SUMMARY_PREFIX + summary.trim()
}
