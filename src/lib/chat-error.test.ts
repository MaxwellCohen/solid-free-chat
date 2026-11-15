import { describe, expect, it } from 'vitest'
import { classifyChatError, formatRetryAfter } from './chat-error'

describe('classifyChatError', () => {
  it('detects auth errors by status property and message', () => {
    for (const status of [401, 403]) {
      const info = classifyChatError(
        Object.assign(new Error('nope'), { status }),
      )
      expect(info.kind).toBe('auth')
      expect(info.needsReconnect).toBe(true)
    }
    expect(classifyChatError(new Error('Request failed (401)')).kind).toBe(
      'auth',
    )
  })

  it('reads status from nested cause/response', () => {
    const err = new Error('x', { cause: { response: { status: 403 } } })
    expect(classifyChatError(err).kind).toBe('auth')
  })

  it('detects credits', () => {
    expect(
      classifyChatError(Object.assign(new Error('x'), { statusCode: 402 }))
        .kind,
    ).toBe('credits')
    expect(classifyChatError(new Error('Insufficient credits')).kind).toBe(
      'credits',
    )
  })

  it('detects rate limit with retry-after header (plain object and Headers)', () => {
    const a = classifyChatError(
      Object.assign(new Error('x'), {
        status: 429,
        headers: { 'retry-after': '30' },
      }),
    )
    expect(a).toMatchObject({ kind: 'rate-limit', retryAfterSeconds: 30 })
    const b = classifyChatError(
      Object.assign(new Error('x'), {
        status: 429,
        headers: new Headers({ 'retry-after': '90' }),
      }),
    )
    expect(b.retryAfterSeconds).toBe(90)
    expect(b.detail).toContain('2m')
  })

  it('parses retry-after from message and handles missing value', () => {
    expect(
      classifyChatError(new Error('Rate limit exceeded, retry after 12'))
        .retryAfterSeconds,
    ).toBe(12)
    const none = classifyChatError(new Error('429 too many requests'))
    expect(none.kind).toBe('rate-limit')
    expect(none.retryAfterSeconds).toBeUndefined()
  })

  it('detects network failures', () => {
    expect(classifyChatError(new TypeError('Failed to fetch')).kind).toBe(
      'network',
    )
    expect(classifyChatError(new Error('Load failed')).kind).toBe('network')
  })

  it('flags mid-stream failures only when a partial reply exists', () => {
    expect(
      classifyChatError(new Error('boom'), { hasPartialResponse: true }).kind,
    ).toBe('stream')
    const unknown = classifyChatError(new Error('boom'))
    expect(unknown.kind).toBe('unknown')
    expect(unknown.detail).toBe('boom')
  })

  it('handles non-Error values', () => {
    expect(classifyChatError(undefined).kind).toBe('unknown')
    expect(classifyChatError('429').kind).toBe('rate-limit')
  })
})

describe('formatRetryAfter', () => {
  it('formats seconds and minutes', () => {
    expect(formatRetryAfter(5)).toBe('5s')
    expect(formatRetryAfter(61)).toBe('2m')
  })
})

describe('classifyChatError provider name', () => {
  it('uses the given provider in auth and network messages', () => {
    expect(
      classifyChatError({ status: 401 }, { providerName: 'Groq' }).title,
    ).toBe('Groq key rejected')
    expect(
      classifyChatError(new TypeError('Failed to fetch'), {
        providerName: 'Groq',
      }).detail,
    ).toContain('Groq')
  })
})

describe('classifyChatError model unavailable', () => {
  it.each([
    new Error('models/gemini-9 is not found for API version v1beta'),
    new Error('No endpoints found for meta-llama/llama-3-8b:free.'),
    new Error('The model `llama3-8b-8192` has been decommissioned'),
    new Error(
      'The model `foo` does not exist or you do not have access to it.',
    ),
  ])('detects %s', (err) => {
    expect(classifyChatError(err).kind).toBe('model-unavailable')
  })

  it.each([
    'boom',
    'No endpoints found that support tool use.',
    'No endpoints found matching your data policy.',
    'The `max_tokens` parameter is deprecated.',
    'The model called tool `foo` which was not found',
    'Not Found',
  ])('ignores %s', (msg) => {
    expect(classifyChatError(new Error(msg)).kind).not.toBe('model-unavailable')
  })

  it('does not blame the model once it had replied', () => {
    const err = new Error('No endpoints found for x/y:free.')
    expect(classifyChatError(err, { hasPartialResponse: true }).kind).not.toBe(
      'model-unavailable',
    )
  })

  it('keeps a plain 403 as auth', () => {
    const err = Object.assign(new Error('Forbidden'), { status: 403 })
    expect(classifyChatError(err).kind).toBe('auth')
  })
})

it('treats a 403 for a gated model as unavailable, not auth', () => {
  const err = Object.assign(
    new Error(
      'thinkingmachines/inkling-2-small:free is only available on agentic harnesses.',
    ),
    { status: 403 },
  )
  expect(classifyChatError(err).kind).toBe('model-unavailable')
})
