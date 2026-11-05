import type { UIMessage } from '@tanstack/ai-client'
import type { ContentPart } from '@tanstack/ai'
import { formatCost } from '../../lib/usage-cost'
import type { TokenUsageSnapshot } from '../../store/chat.store'

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

export function formatReplyTokenLine(usage: TokenUsageSnapshot): string {
  const cost = usage.cost === undefined ? '' : ` · ${formatCost(usage.cost)}`
  return `Reply: ${formatTokenCount(usage.promptTokens)} context · ${formatTokenCount(usage.completionTokens)} out${cost}`
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_PDF_BYTES = 12 * 1024 * 1024

export function parseDataUrl(dataUrl: string): {
  mimeType: string
  base64: string
} {
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
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
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

/** Splits dropped/pasted files by kind, gated on what the model accepts. */
export function partitionAttachableFiles(
  files: File[],
  caps: { image: boolean; document: boolean },
): { images: File[]; pdfs: File[]; error: string | null } {
  const images: File[] = []
  const pdfs: File[] = []
  let blocked = false
  let unsupported = false
  for (const f of files) {
    if (isPdfFile(f)) {
      if (caps.document) pdfs.push(f)
      else blocked = true
    } else if (isImageFile(f)) {
      if (caps.image) images.push(f)
      else blocked = true
    } else unsupported = true
  }
  let error: string | null = null
  if (blocked) {
    error =
      'This model can’t accept some of those files. Switch models to attach them.'
  } else if (unsupported) {
    error = 'Only images and PDFs can be attached.'
  }
  return { images, pdfs, error }
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
export function userMessageToResendParts(
  message: UIMessage,
): ContentPart[] | null {
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

/** Messages strictly before `id` (or through it when `inclusive`); null if not found. */
export function messagesBefore<T extends { id: string }>(
  messages: T[],
  id: string,
  inclusive = false,
): T[] | null {
  const idx = messages.findIndex((m) => m.id === id)
  if (idx === -1) return null
  return messages.slice(0, inclusive ? idx + 1 : idx)
}

/** Concatenated text parts of a message, for copying. */
export function messageToPlainText(message: UIMessage): string {
  const out: string[] = []
  for (const p of message.parts) {
    if (p.type === 'text') out.push(p.content)
  }
  return out.join('\n\n')
}

/** Resend parts with all text replaced by `text` (attachments kept). */
export function withEditedText(
  parts: ContentPart[],
  text: string,
): ContentPart[] {
  const rest = parts.filter((p) => p.type !== 'text')
  return text ? [{ type: 'text', content: text }, ...rest] : rest
}

export const FINAL_ANSWER_NUDGE =
  'Please give your final answer using the tool results.'

/** True when a finished run ended on tool activity with no answer text after it, and was not already nudged. */
export function needsFinalAnswerNudge(messages: UIMessage[]): boolean {
  const last = messages[messages.length - 1] as UIMessage | undefined
  if (last?.role !== 'assistant') {
    return false
  }
  let lastToolIdx = -1
  last.parts.forEach((p, i) => {
    if (p.type === 'tool-call' || p.type === 'tool-result') lastToolIdx = i
  })
  if (lastToolIdx < 0) return false
  return !last.parts
    .slice(lastToolIdx + 1)
    .some((p) => p.type === 'text' && p.content.trim().length > 0)
}

/** True when the latest user message is the automatic nudge. */
export function wasNudged(messages: UIMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messageToPlainText(messages[i]).trim() === FINAL_ANSWER_NUDGE
    }
  }
  return false
}
