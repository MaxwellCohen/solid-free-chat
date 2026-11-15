/** Pollinations text-to-image (free, no key). The tool only builds a URL; the browser loads it as an <img>. */
export const IMAGE_HOST = 'https://image.pollinations.ai'
export const IMAGE_MIN_SIZE = 256
export const IMAGE_MAX_SIZE = 1536
export const IMAGE_DEFAULT_SIZE = 768
export const IMAGE_MAX_PROMPT_CHARS = 600

function clampSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return IMAGE_DEFAULT_SIZE
  return Math.min(
    IMAGE_MAX_SIZE,
    Math.max(IMAGE_MIN_SIZE, Math.round(n / 8) * 8),
  )
}

export type ImageUrlResult =
  | { ok: true; url: string; prompt: string; width: number; height: number }
  | { ok: false; error: string }

export function buildImageUrl(input: {
  prompt: unknown
  width?: unknown
  height?: unknown
  seed?: unknown
}): ImageUrlResult {
  const raw = typeof input.prompt === 'string' ? input.prompt : ''
  const prompt = raw
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, IMAGE_MAX_PROMPT_CHARS)
  if (!prompt) return { ok: false, error: 'prompt must be a non-empty string.' }
  const width = clampSize(input.width)
  const height = clampSize(input.height)
  const seedNum = Number(input.seed)
  const seed = Number.isFinite(seedNum)
    ? Math.abs(Math.trunc(seedNum)) % 1_000_000
    : Math.floor(Math.random() * 1_000_000)
  const url = `${IMAGE_HOST}/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`
  return { ok: true, url, prompt, width, height }
}

/** Only our generator host is rendered as an image card. */
export function isImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.origin === IMAGE_HOST
  } catch {
    return false
  }
}
