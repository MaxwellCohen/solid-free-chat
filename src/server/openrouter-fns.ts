import { chat } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { createServerFn } from '@tanstack/solid-start'
import { getRequest } from '@tanstack/solid-start/server'
import { startSpan } from '@sentry/core'
import type { ChatModelOption } from '../lib/chat-models'
import { readOpenRouterApiKey } from '../lib/openrouter-api-key.server'
import {
  getFreeTextChatModelOptionsCached,
  resolveAllowedChatModel,
} from '../lib/openrouter-user-models.server'

export const getFreeChatModels = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ChatModelOption[]> => {
    return startSpan(
      { name: 'getFreeChatModels', op: 'function.server' },
      async () => {
        const apiKey = readOpenRouterApiKey()
        if (!apiKey) {
          throw new Error(
            'OPENROUTER_API_KEY is missing or empty. Add it to .env.local (see https://openrouter.ai/keys).',
          )
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
  },
)

type StreamChatPayload = {
  messages: unknown
  data?: { model?: string }
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
        const apiKey = readOpenRouterApiKey()
        if (!apiKey) {
          throw new Error(
            'OPENROUTER_API_KEY is missing or empty. Add it to .env.local (see https://openrouter.ai/keys).',
          )
        }

        const resolved = await resolveAllowedChatModel(apiKey, data.data?.model)
        if (!resolved.ok) {
          throw new Response(JSON.stringify({ error: resolved.error }), {
            status: resolved.status,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const request = getRequest()
        const abortController = new AbortController()
        const onAbort = () => abortController.abort()
        request.signal.addEventListener('abort', onAbort, { once: true })

        const httpReferer = process.env.OPENROUTER_HTTP_REFERER
        const xTitle = process.env.OPENROUTER_APP_TITLE

        const adapter = createOpenRouterText(resolved.model as never, apiKey, {
          ...(httpReferer ? { httpReferer } : {}),
          ...(xTitle ? { xTitle } : {}),
        })

        return chat({
          adapter,
          messages: data.messages as never,
          abortController,
        })
      },
    )
  })
