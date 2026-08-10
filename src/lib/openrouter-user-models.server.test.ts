import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHAT_MODEL, FREE_MODELS_ROUTER_ID } from './chat-models'
import { resolveAllowedChatModel } from './openrouter-user-models.server'

describe('resolveAllowedChatModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('falls back to DEFAULT_CHAT_MODEL when catalog fails and model is omitted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )

    const result = await resolveAllowedChatModel('sk-test', undefined)
    expect(result).toEqual({ ok: true, model: DEFAULT_CHAT_MODEL })
  })

  it('allows Free Models Router when catalog fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )

    const result = await resolveAllowedChatModel('sk-test', FREE_MODELS_ROUTER_ID)
    expect(result).toEqual({ ok: true, model: DEFAULT_CHAT_MODEL })
  })

  it('rejects arbitrary provider/model ids when catalog fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )

    const result = await resolveAllowedChatModel(
      'sk-test',
      'openai/gpt-4o',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(503)
    }
  })

  it('allowlists models from a successful catalog response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/models/user')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'vendor/free-model',
                  name: 'Free Model',
                  pricing: { prompt: '0', completion: '0' },
                  architecture: {
                    input_modalities: ['text'],
                    output_modalities: ['text'],
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('not found', { status: 404 })
      }),
    )

    const allowed = await resolveAllowedChatModel(
      'sk-test-success',
      'vendor/free-model',
    )
    expect(allowed).toEqual({ ok: true, model: 'vendor/free-model' })

    const denied = await resolveAllowedChatModel(
      'sk-test-success',
      'openai/gpt-4o',
    )
    expect(denied).toEqual({
      ok: false,
      error: 'Unknown or disallowed model',
      status: 400,
    })
  })
})
