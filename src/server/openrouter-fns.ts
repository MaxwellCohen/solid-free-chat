import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import { chat } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { createServerFn } from '@tanstack/solid-start'
import { getRequest } from '@tanstack/solid-start/server'
import { startSpan } from '@sentry/core'
import type { ChatModelOption } from '../lib/chat-models'
import {
  resolveOpenRouterApiKeyFromRequest,
} from '../lib/openrouter-api-key.server'
import {
  getFreeTextChatModelOptionsCached,
  resolveAllowedChatModel,
} from '../lib/openrouter-user-models.server'

type GetFreeChatModelsInput = { apiKey?: string }

export const getFreeChatModels = createServerFn({ method: 'POST' })
  .inputValidator((input: GetFreeChatModelsInput | undefined) => {
    if (input != null && typeof input !== 'object') {
      throw new Error('Invalid request body')
    }
    return input ?? {}
  })
  .handler(async ({ data }): Promise<ChatModelOption[]> => {
    return startSpan(
      { name: 'getFreeChatModels', op: 'function.server' },
      async () => {
        const apiKey = resolveOpenRouterApiKeyFromRequest(getRequest(), data.apiKey)
        if (!apiKey) {
          return []
        }
        try {
          return await getFreeTextChatModelOptionsCached(apiKey)
        } catch (e) {
          const message =
            e instanceof Error
              ? e.message
              : 'Failed to load models from OpenRouter'
          throw new Error(message)
        }
      },
    )
  })

type StreamChatPayload = {
  messages: unknown
  /** Fallback if nested `data` is flattened by the RPC layer */
  apiKey?: string
  data?: { model?: string; customSystemMessage?: string; apiKey?: string }
}

function clientApiKeyFromStreamPayload(
  payload: StreamChatPayload,
): string | undefined {
  const nested = payload.data?.apiKey
  const top = payload.apiKey
  return nested ?? top
}

async function* streamMissingOpenRouterApiKey(): AsyncGenerator<StreamChunk> {
  yield {
    type: 'RUN_ERROR',
    timestamp: Date.now(),
    error: {
      message:
        'OpenRouter API key is missing. Add your key in the app (https://openrouter.ai/keys).',
    },
  }
}

export const streamOpenRouterChat = createServerFn({ method: 'POST' })
  .inputValidator((input: StreamChatPayload) => {
    if (!Array.isArray(input.messages)) {
      throw new Error('Expected messages array')
    }
    return input
  })
  .handler(async ({ data }) => {
    return startSpan(
      { name: 'streamOpenRouterChat', op: 'function.server' },
      async () => {
        const request = getRequest()
        const apiKey = resolveOpenRouterApiKeyFromRequest(
          request,
          clientApiKeyFromStreamPayload(data),
        )
        if (!apiKey) {
          return streamMissingOpenRouterApiKey()
        }

        const resolved = await resolveAllowedChatModel(apiKey, data.data?.model)
        if (!resolved.ok) {
          throw new Response(JSON.stringify({ error: resolved.error }), {
            status: resolved.status,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const abortController = new AbortController()
        const onAbort = () => abortController.abort()
        request.signal.addEventListener('abort', onAbort, { once: true })

        const httpReferer = process.env.OPENROUTER_HTTP_REFERER
        const xTitle = process.env.OPENROUTER_APP_TITLE

        const adapter = createOpenRouterText(resolved.model as never, apiKey, {
          ...(httpReferer ? { httpReferer } : {}),
          ...(xTitle ? { xTitle } : {}),
        })

        const rawCustom = data.data?.customSystemMessage
        const trimmedSystem =
          typeof rawCustom === 'string' ? rawCustom.trim() : ''
        // TanStack AI strips role=system UIMessages during conversion; OpenRouter
        // adapter injects via systemPrompts (see mapTextOptionsToSDK).
        return chat({
          adapter: adapter as unknown as AnyTextAdapter,
          messages: data.messages as never,
          ...(trimmedSystem.length > 0
            ? { systemPrompts: [trimmedSystem] }
            : {}),
          abortController,
        })
      },
    )
  })
