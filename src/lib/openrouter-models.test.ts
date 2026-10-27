import { afterEach, describe, expect, it, vi } from 'vitest'
import { FREE_MODELS_ROUTER_ID, modelSupportsTools } from './chat-models'
import { getFreeTextChatModelOptionsCached } from './openrouter-models'

function modelsResponse(data: unknown[]) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const freeTextModel = {
  id: 'vendor/free-model',
  name: 'Free Model',
  pricing: { prompt: '0', completion: '0' },
  architecture: { input_modalities: ['text'], output_modalities: ['text'] },
}

describe('getFreeTextChatModelOptionsCached', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches through the same-origin proxy and keeps only free models', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      modelsResponse([
        { ...freeTextModel, supported_parameters: ['tools', 'temperature'] },
        {
          ...freeTextModel,
          id: 'vendor/paid-model',
          name: 'Paid Model',
          pricing: { prompt: '0.001', completion: '0.002' },
        },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const options = await getFreeTextChatModelOptionsCached('sk-proxy-test')

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/openrouter/v1/models/user',
    )
    expect(options.map((o) => o.id)).toEqual([
      FREE_MODELS_ROUTER_ID,
      'vendor/free-model',
    ])
    expect(options[1].supportsTools).toBe(true)
  })

  it('marks models without the tools parameter as not tool-capable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        modelsResponse([
          { ...freeTextModel, supported_parameters: ['temperature'] },
        ]),
      ),
    )

    const options = await getFreeTextChatModelOptionsCached('sk-no-tools')
    const model = options.find((o) => o.id === 'vendor/free-model')
    expect(model?.supportsTools).toBe(false)
    expect(modelSupportsTools(model)).toBe(false)
    // Unknown metadata (synthetic router entry) defers to OpenRouter.
    expect(modelSupportsTools(options[0])).toBe(true)
  })

  it('falls back to the public catalog when /models/user fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes('/models/user')) {
          return new Response(JSON.stringify({ error: 'bad key' }), {
            status: 401,
          })
        }
        return modelsResponse([freeTextModel])
      }),
    )

    const options = await getFreeTextChatModelOptionsCached('sk-bad')
    expect(options.map((o) => o.id)).toContain('vendor/free-model')
  })
})
