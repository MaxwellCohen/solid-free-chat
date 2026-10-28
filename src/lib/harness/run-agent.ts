import type { AnyTextAdapter, StreamChunk, Tool } from '@tanstack/ai'
import { chat, maxIterations } from '@tanstack/ai'
import {
  createOpenRouterResponsesText,
  createOpenRouterText,
} from '@tanstack/ai-openrouter'
import { OPENROUTER_API_BASE_URL, OPENROUTER_APP_TITLE } from '../openrouter-api'

/** Upper bound on model ↔ tool round trips per user turn. */
export const MAX_AGENT_ITERATIONS = 12

export type RunAgentOptions = {
  apiKey: string
  model: string
  messages: unknown[]
  systemPrompt?: string
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
            p && typeof p === 'object' && (p as { type?: string }).type === 'document',
        )
      ) {
        return true
      }
    }
  }
  return false
}

/**
 * Runs the full agent loop in the browser: model calls go straight to
 * OpenRouter (the key never touches this app's server), and tools execute
 * locally.
 */
export function runAgent(options: RunAgentOptions): AsyncIterable<StreamChunk> {
  const adapterConfig = {
    serverURL: OPENROUTER_API_BASE_URL,
    httpReferer: location.origin,
    appTitle: OPENROUTER_APP_TITLE,
  }
  const adapter = messagesIncludeDocumentParts(options.messages)
    ? createOpenRouterResponsesText(
        options.model as never,
        options.apiKey,
        adapterConfig,
      )
    : createOpenRouterText(options.model as never, options.apiKey, adapterConfig)

  const abortController = new AbortController()
  if (options.abortSignal) {
    if (options.abortSignal.aborted) abortController.abort()
    else {
      options.abortSignal.addEventListener('abort', () => abortController.abort(), {
        once: true,
      })
    }
  }

  const systemPrompt = options.systemPrompt?.trim() ?? ''
  const tools = options.tools ?? []
  // TanStack AI strips role=system UIMessages during conversion; the OpenRouter
  // adapter injects via systemPrompts (see mapTextOptionsToSDK).
  return chat({
    adapter: adapter as unknown as AnyTextAdapter,
    messages: options.messages as never,
    ...(systemPrompt.length > 0 ? { systemPrompts: [systemPrompt] } : {}),
    ...(tools.length > 0
      ? { tools, agentLoopStrategy: maxIterations(MAX_AGENT_ITERATIONS) }
      : {}),
    abortController,
  })
}
