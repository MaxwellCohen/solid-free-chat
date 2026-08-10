import type { UIMessage } from '@tanstack/ai-solid'
import type { ChatUIMessage } from '../store/chat.store'

/** Soft cap on the encoded hash body (`#` + payload). Warn when exceeded; still allow copy. */
export const MAX_SHARE_HASH_BYTES = 1_048_576

const SHARE_VERSION_PREFIX = 'v1.'

export type SharedTextPart = { type: 'text'; content: string }

export type SharedThinkingPart = { type: 'thinking'; content: string }

export type SharedToolCallPart = {
  type: 'tool-call'
  id: string
  name: string
  arguments: string
}

export type SharedToolResultPart = {
  type: 'tool-result'
  toolCallId: string
  content: string
}

export type SharedMessagePart =
  | SharedTextPart
  | SharedThinkingPart
  | SharedToolCallPart
  | SharedToolResultPart

export type SharedMessage = {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: SharedMessagePart[]
  createdAt?: string
}

export type SharedChatV1 = {
  v: 1
  title: string
  model: string
  messages: SharedMessage[]
}

export type ShareLinkResult = {
  url: string
  hash: string
  byteLength: number
  overLimit: boolean
}

export type BuildShareInput = {
  title: string
  model: string
  messages: ChatUIMessage[]
  /** Origin + path without hash, e.g. `https://example.com/share` */
  baseUrl: string
}

/**
 * Build a shareable URL with a gzip+base64url snapshot in the hash.
 * Always returns a link; `overLimit` is true when the hash exceeds 1 MiB.
 */
export async function buildShareLink(
  input: BuildShareInput,
): Promise<ShareLinkResult> {
  const shared = toSharedChat(input)
  const hash = await encodeSharedChat(shared)
  const byteLength = new TextEncoder().encode(hash).length
  const base = input.baseUrl.replace(/#.*$/, '').replace(/\/$/, '')
  return {
    url: `${base}${hash}`,
    hash,
    byteLength,
    overLimit: byteLength > MAX_SHARE_HASH_BYTES,
  }
}

export function toSharedChat(input: {
  title: string
  model: string
  messages: ChatUIMessage[]
}): SharedChatV1 {
  return {
    v: 1,
    title: input.title.trim() || 'Shared chat',
    model: input.model,
    messages: input.messages.map(sanitizeMessage),
  }
}

export async function encodeSharedChat(chat: SharedChatV1): Promise<string> {
  const json = JSON.stringify(chat)
  const compressed = await gzipBytes(new TextEncoder().encode(json))
  return `#${SHARE_VERSION_PREFIX}${bytesToBase64Url(compressed)}`
}

export async function decodeSharedChat(
  hash: string,
): Promise<SharedChatV1 | null> {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw.startsWith(SHARE_VERSION_PREFIX)) return null
  const payload = raw.slice(SHARE_VERSION_PREFIX.length)
  if (!payload) return null
  try {
    const compressed = base64UrlToBytes(payload)
    const jsonBytes = await gunzipBytes(compressed)
    const parsed: unknown = JSON.parse(new TextDecoder().decode(jsonBytes))
    return normalizeSharedChat(parsed)
  } catch {
    return null
  }
}

/** Convert a decoded share into UIMessages for the read-only viewer. */
export function sharedChatToUIMessages(chat: SharedChatV1): ChatUIMessage[] {
  return chat.messages.map((message) => {
    const ui: ChatUIMessage = {
      id: message.id,
      role: message.role,
      parts: message.parts.map(sharedPartToUIPart),
    }
    if (message.createdAt) {
      const createdAt = new Date(message.createdAt)
      if (!Number.isNaN(createdAt.getTime())) {
        ui.createdAt = createdAt
      }
    }
    return ui
  })
}

function sanitizeMessage(message: ChatUIMessage): SharedMessage {
  const parts: SharedMessagePart[] = []
  for (const part of message.parts) {
    const next = sanitizePart(part)
    if (next) parts.push(next)
  }
  if (parts.length === 0) {
    parts.push({ type: 'text', content: '' })
  }
  const shared: SharedMessage = {
    id: message.id,
    role: message.role,
    parts,
  }
  if (message.createdAt) {
    shared.createdAt = new Date(message.createdAt).toISOString()
  }
  return shared
}

function sanitizePart(
  part: UIMessage['parts'][number],
): SharedMessagePart | null {
  if (part.type === 'text') {
    return { type: 'text', content: part.content }
  }
  if (part.type === 'thinking') {
    return { type: 'thinking', content: part.content }
  }
  if (part.type === 'tool-call') {
    return {
      type: 'tool-call',
      id: part.id,
      name: part.name,
      arguments:
        typeof part.arguments === 'string'
          ? part.arguments
          : JSON.stringify(part.arguments ?? {}),
    }
  }
  if (part.type === 'tool-result') {
    const content =
      typeof part.content === 'string'
        ? part.content
        : JSON.stringify(part.content ?? null)
    return {
      type: 'tool-result',
      toolCallId: part.toolCallId,
      content,
    }
  }
  if (part.type === 'image') {
    return { type: 'text', content: '[image omitted]' }
  }
  if (part.type === 'document') {
    const meta = part.metadata as { filename?: string } | undefined
    const name = meta?.filename?.trim()
    return {
      type: 'text',
      content: name ? `[document omitted: ${name}]` : '[document omitted]',
    }
  }
  return null
}

function sharedPartToUIPart(
  part: SharedMessagePart,
): UIMessage['parts'][number] {
  if (part.type === 'text') {
    return { type: 'text', content: part.content }
  }
  if (part.type === 'thinking') {
    return { type: 'thinking', content: part.content }
  }
  if (part.type === 'tool-call') {
    return {
      type: 'tool-call',
      id: part.id,
      name: part.name,
      arguments: part.arguments,
      state: 'complete',
    }
  }
  return {
    type: 'tool-result',
    toolCallId: part.toolCallId,
    content: part.content,
    state: 'complete',
  }
}

function normalizeSharedChat(raw: unknown): SharedChatV1 | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.v !== 1) return null
  if (typeof o.title !== 'string' || typeof o.model !== 'string') return null
  if (!Array.isArray(o.messages)) return null
  const messages: SharedMessage[] = []
  for (const item of o.messages) {
    const message = normalizeSharedMessage(item)
    if (!message) return null
    messages.push(message)
  }
  return {
    v: 1,
    title: o.title,
    model: o.model,
    messages,
  }
}

function normalizeSharedMessage(raw: unknown): SharedMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== 'string') return null
  if (o.role !== 'system' && o.role !== 'user' && o.role !== 'assistant') {
    return null
  }
  if (!Array.isArray(o.parts)) return null
  const parts: SharedMessagePart[] = []
  for (const part of o.parts) {
    const normalized = normalizeSharedPart(part)
    if (!normalized) return null
    parts.push(normalized)
  }
  const message: SharedMessage = {
    id: o.id,
    role: o.role,
    parts,
  }
  if (typeof o.createdAt === 'string') {
    message.createdAt = o.createdAt
  }
  return message
}

function normalizeSharedPart(raw: unknown): SharedMessagePart | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.type === 'text' && typeof o.content === 'string') {
    return { type: 'text', content: o.content }
  }
  if (o.type === 'thinking' && typeof o.content === 'string') {
    return { type: 'thinking', content: o.content }
  }
  if (
    o.type === 'tool-call' &&
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.arguments === 'string'
  ) {
    return {
      type: 'tool-call',
      id: o.id,
      name: o.name,
      arguments: o.arguments,
    }
  }
  if (
    o.type === 'tool-result' &&
    typeof o.toolCallId === 'string' &&
    typeof o.content === 'string'
  ) {
    return {
      type: 'tool-result',
      toolCallId: o.toolCallId,
      content: o.content,
    }
  }
  return null
}

async function gzipBytes(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzipBytes(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (padded.length % 4)) % 4
  const base64 = padded + '='.repeat(padLen)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
