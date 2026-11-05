import type { AnyTextAdapter, StreamChunk, Tool } from '@tanstack/ai'
import { chat, maxIterations } from '@tanstack/ai'
import {
  createOpenRouterResponsesText,
  createOpenRouterText,
} from '@tanstack/ai-openrouter'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'
import {
  OPENROUTER_API_BASE_URL,
  OPENROUTER_APP_TITLE,
} from '../openrouter-api'
import { getProvider } from '../providers'

/** Upper bound on model ↔ tool round trips per user turn. */
export const MAX_AGENT_ITERATIONS = 12

export type RunAgentOptions = {
  providerId?: string
  apiKey: string
  model: string
  messages: unknown[]
  systemPrompt?: string
  /** Undefined = provider default. */
  temperature?: number
  maxTokens?: number
  tools?: Tool[]
  abortSignal?: AbortSignal
}

/** Chat Completions adapter rejects inline document data; Responses supports it. */
function messagesIncludeDocumentParts(messages: unknown[]): boolean {
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue
    for (const key of ['parts', 'content'] as const) {
      const list = (message as Record<string, unknown>)[key]
      if (
        Array.isArray(list) &&
        list.some(
          (p) =>
            p &&
            typeof p === 'object' &&
            (p as { type?: string }).type === 'document',
        )
      ) {
        return true
      }
    }
  }
  return false
}

/** Providers' CORS preflights reject the OpenAI SDK's `x-stainless-*` headers. */
function fetchWithoutStainlessHeaders(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers)
  for (const name of [...headers.keys()]) {
    if (name.startsWith('x-stainless-')) headers.delete(name)
  }
  return fetch(input, { ...init, headers })
}

/**
 * Runs the full agent loop in the browser: model calls go straight to
 * OpenRouter (the key never touches this app's server), and tools execute
 * locally.
 */
export function runAgent(options: RunAgentOptions): AsyncIterable<StreamChunk> {
  const provider = getProvider(options.providerId)
  const adapterConfig = {
    serverURL: OPENROUTER_API_BASE_URL,
    httpReferer: location.origin,
    appTitle: OPENROUTER_APP_TITLE,
  }
  const adapter =
    provider.id !== 'openrouter'
      ? createOpenaiChatCompletions(options.model as never, options.apiKey, {
          baseURL: provider.baseUrl,
          dangerouslyAllowBrowser: true,
          fetch: fetchWithoutStainlessHeaders,
        })
      : messagesIncludeDocumentParts(options.messages)
        ? createOpenRouterResponsesText(
            options.model as never,
            options.apiKey,
            adapterConfig,
          )
        : createOpenRouterText(
            options.model as never,
            options.apiKey,
            adapterConfig,
          )

  const abortController = new AbortController()
  if (options.abortSignal) {
    if (options.abortSignal.aborted) abortController.abort()
    else {
      options.abortSignal.addEventListener(
        'abort',
        () => abortController.abort(),
        {
          once: true,
        },
      )
    }
  }

  const systemPrompt = options.systemPrompt?.trim() ?? ''
  const tools = options.tools ?? []
  // Each adapter spells the limit differently (request body shape).
  const { temperature, maxTokens } = options
  const usesResponses =
    provider.id === 'openrouter' &&
    messagesIncludeDocumentParts(options.messages)
  const maxKey =
    provider.id !== 'openrouter'
      ? 'max_tokens'
      : usesResponses
        ? 'maxOutputTokens'
        : 'maxCompletionTokens'
  const modelOptions = {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { [maxKey]: maxTokens } : {}),
  }
  // TanStack AI strips role=system UIMessages during conversion; the OpenRouter
  // adapter injects via systemPrompts (see mapTextOptionsToSDK).
  return chat({
    adapter: adapter as unknown as AnyTextAdapter,
    messages: options.messages as never,
    ...(systemPrompt.length > 0 ? { systemPrompts: [systemPrompt] } : {}),
    ...(Object.keys(modelOptions).length > 0 ? { modelOptions } : {}),
    ...(tools.length > 0
      ? { tools, agentLoopStrategy: maxIterations(MAX_AGENT_ITERATIONS) }
      : {}),
    abortController,
  })
}
