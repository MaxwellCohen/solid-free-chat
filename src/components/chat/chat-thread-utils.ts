import type { UIMessage } from '@tanstack/ai-solid'
import type { ContentPart } from '@tanstack/ai'
import type { TokenUsageSnapshot } from '../../store/chat.store'

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

export function formatReplyTokenLine(usage: TokenUsageSnapshot): string {
  return `Reply: ${formatTokenCount(usage.promptTokens)} context · ${formatTokenCount(usage.completionTokens)} out`
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_PDF_BYTES = 12 * 1024 * 1024

export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const m = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl.replace(/\s/g, ''))
  if (!m) throw new Error('Invalid data URL')
  return { mimeType: m[1], base64: m[2] }
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      if (typeof r.result === 'string') resolve(r.result)
      else reject(new Error('read failed'))
    }
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(file)
  })
}

export function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  )
}

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif)$/i

export function guessImageMimeFromFilename(name: string): string | null {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  if (!m) return null
  const ext = m[1]
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    heic: 'image/heic',
    heif: 'image/heif',
  }
  return map[ext] ?? null
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name)
}

export function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  if (value == null || typeof value !== 'object') return false
  return (
    typeof (value as { [Symbol.asyncIterator]?: unknown })[
      Symbol.asyncIterator
    ] === 'function'
  )
}

export type PendingImage = {
  id: string
  mimeType: string
  base64: string
  previewUrl: string
}

export type PendingFile = {
  id: string
  name: string
  mimeType: string
  base64: string
}

/** Parts we can round-trip through sendMessage for resend. */
export function userMessageToResendParts(message: UIMessage): ContentPart[] | null {
  if (message.role !== 'user') return null
  const out: ContentPart[] = []
  for (const p of message.parts) {
    if (p.type === 'text') {
      out.push({ type: 'text', content: p.content })
    } else if (p.type === 'image') {
      out.push({
        type: 'image',
        source: p.source,
        ...(p.metadata != null ? { metadata: p.metadata } : {}),
      })
    } else if (p.type === 'document') {
      out.push({
        type: 'document',
        source: p.source,
        ...(p.metadata != null ? { metadata: p.metadata } : {}),
      })
    }
  }
  return out.length > 0 ? out : null
}
