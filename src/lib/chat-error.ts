export type ChatErrorKind =
  | 'auth'
  | 'rate-limit'
  | 'credits'
  | 'network'
  | 'stream'
  | 'unknown'

export type ChatErrorInfo = {
  kind: ChatErrorKind
  title: string
  detail: string
  /** Seconds to wait before retrying, when the server said so. */
  retryAfterSeconds?: number
  /** Whether the key/OAuth modal is the way to fix this. */
  needsReconnect: boolean
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

function readStatus(err: unknown, depth = 0): number | undefined {
  if (!err || typeof err !== 'object' || depth > 2) return undefined
  const o = err as Record<string, unknown>
  for (const k of ['status', 'statusCode', 'code']) {
    const n = num(o[k])
    if (n !== undefined && n >= 100 && n < 600) return n
  }
  const fromResponse = readStatus(o.response, depth + 1)
  if (fromResponse !== undefined) return fromResponse
  const fromError = readStatus(o.error, depth + 1)
  if (fromError !== undefined) return fromError
  return readStatus(o.cause, depth + 1)
}

function readHeader(err: unknown, name: string): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const o = err as Record<string, unknown>
  for (const holder of [o.headers, (o.response as Record<string, unknown> | undefined)?.headers]) {
    if (!holder) continue
    if (typeof (holder as Headers).get === 'function') {
      const v = (holder as Headers).get(name)
      if (v) return v
    } else if (typeof holder === 'object') {
      const v = (holder as Record<string, unknown>)[name]
      if (typeof v === 'string') return v
    }
  }
  return undefined
}

function readRetryAfter(err: unknown, message: string): number | undefined {
  const header = readHeader(err, 'retry-after')
  const fromHeader = num(header)
  if (fromHeader !== undefined && fromHeader >= 0) return Math.ceil(fromHeader)
  const match = /retry[- ]after[:\s]+(\d+(?:\.\d+)?)/i.exec(message)
  return match ? Math.ceil(Number(match[1])) : undefined
}

function statusFromMessage(message: string): number | undefined {
  const match = /\b(401|402|403|429)\b/.exec(message)
  return match ? Number(match[1]) : undefined
}

export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes}m`
}

/**
 * Maps an error from the chat stream to a user-facing state. `hasPartialResponse`
 * means an assistant reply had already started streaming when it failed.
 */
export function classifyChatError(
  error: unknown,
  options: { hasPartialResponse?: boolean } = {},
): ChatErrorInfo {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  const status = readStatus(error) ?? statusFromMessage(message)

  if (status === 401 || status === 403) {
    return {
      kind: 'auth',
      title: 'OpenRouter key rejected',
      detail:
        'Your OpenRouter key is invalid, expired or revoked. Reconnect OpenRouter to continue.',
      needsReconnect: true,
    }
  }
  if (status === 402 || /insufficient (credits|funds)/i.test(message)) {
    return {
      kind: 'credits',
      title: 'Out of OpenRouter credits',
      detail:
        'This model needs credits your account does not have. Add credits on openrouter.ai or pick a free model, then retry.',
      needsReconnect: false,
    }
  }
  if (status === 429 || /rate.?limit|too many requests/i.test(message)) {
    const retryAfterSeconds = readRetryAfter(error, message)
    return {
      kind: 'rate-limit',
      title: 'Rate limited',
      detail:
        retryAfterSeconds !== undefined
          ? `Too many requests. Try again in ${formatRetryAfter(retryAfterSeconds)}.`
          : 'Too many requests. Wait a moment, then retry.',
      retryAfterSeconds,
      needsReconnect: false,
    }
  }
  const name = error instanceof Error ? error.name : ''
  if (
    name === 'TypeError' ||
    name === 'NetworkError' ||
    /failed to fetch|network ?error|load failed|networkerror|offline|ECONN|ENOTFOUND/i.test(
      message,
    )
  ) {
    return {
      kind: 'network',
      title: 'Connection problem',
      detail: 'Could not reach OpenRouter. Check your connection, then retry.',
      needsReconnect: false,
    }
  }
  if (options.hasPartialResponse) {
    return {
      kind: 'stream',
      title: 'Response interrupted',
      detail: 'The reply stopped part-way through. Retry to generate it again.',
      needsReconnect: false,
    }
  }
  return {
    kind: 'unknown',
    title: 'Something went wrong',
    detail: message || 'The request failed. Retry to try again.',
    needsReconnect: false,
  }
}
