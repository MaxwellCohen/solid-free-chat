import { classifyChatError } from './chat-error'
import { idbAvailable, idbGet, idbSet } from './idb-kv'

export type GalleryStatus = 'drawing' | 'done'

export type GalleryItem = {
  id: string
  n: number
  prompt: string
  title: string
  svg: string
  status: GalleryStatus
}

export type GalleryRequest = { system: string; prompt: string }

/** Streams text deltas for one picture; injected so tests can fake it. */
export type GalleryRunner = (
  req: GalleryRequest,
  signal: AbortSignal,
) => AsyncIterable<string>

export const GALLERY_MAX_ITEMS = 200
export const GALLERY_MAX_FAILURES = 4

const MAX_SVG_CHARS = 200_000
const SVG_NS = 'http://www.w3.org/2000/svg'

export const GALLERY_TWISTS = [
  'flat geometric shapes',
  'night scene with glowing light',
  'extreme close-up',
  "bird's-eye view",
  'minimal two-colour palette',
  'bold outlines, sticker style',
  'soft pastel gradients',
  'isometric perspective',
  'pattern / tessellation',
  'silhouettes against a sunset',
  'retro poster',
  'abstract interpretation',
]

/** First complete <svg>…</svg> in the text, with xmlns ensured; null if none. */
export function extractSvg(text: string): string | null {
  const start = text.search(/<svg[\s>]/i)
  if (start < 0) return null
  const end = text.toLowerCase().lastIndexOf('</svg>')
  if (end < start) return null
  let svg = text.slice(start, end + '</svg>'.length)
  const tagEnd = svg.indexOf('>')
  if (!/\sxmlns\s*=/i.test(svg.slice(0, tagEnd))) {
    svg = `<svg xmlns="${SVG_NS}"${svg.slice(4)}`
  }
  return svg.length > MAX_SVG_CHARS ? null : svg
}

/** Text of the first <title>, trimmed to 80 chars; '' if none. */
export function svgTitle(svg: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(svg)
  if (!m) return ''
  return m[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
    .slice(0, 80)
}

/** Data URL for use in <img src> only; never inject the SVG as HTML. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function buildGalleryRequest(opts: {
  prompt: string
  n: number
  previousTitles: string[]
}): GalleryRequest {
  const system =
    'You are an SVG illustrator. Reply with ONLY one complete standalone <svg> element: no markdown fences, no commentary. ' +
    'It must have xmlns="http://www.w3.org/2000/svg" and viewBox="0 0 512 512". ' +
    'The first child must be a short <title> naming the piece. ' +
    'Fill the whole canvas with a background. Use shapes, paths and gradients. ' +
    'No <script>, no <foreignObject>, no external images, fonts or hrefs. ' +
    'Keep it under about 6000 characters so it is never cut off.'
  const lines = [
    `Theme: ${opts.prompt.trim()}`,
    `This is piece #${opts.n} in an endless gallery on this theme.`,
  ]
  if (opts.previousTitles.length > 0) {
    lines.push(
      'Already in the gallery (make something clearly different in subject, composition and palette): ' +
        opts.previousTitles.slice(-12).join('; '),
    )
  }
  lines.push(
    `Twist to try (ignore it if it conflicts with the theme): ${GALLERY_TWISTS[(opts.n - 1) % GALLERY_TWISTS.length]}`,
  )
  return { system, prompt: lines.join('\n') }
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done)
  })
}

/**
 * Keeps asking the runner for one SVG after another until aborted or too many
 * consecutive failures. `onUpdate(items)` fires on every change (oldest first).
 */
export async function runGallery(opts: {
  prompt: string
  items: GalleryItem[]
  runner: GalleryRunner
  signal: AbortSignal
  onUpdate: (items: GalleryItem[]) => void
  onStatus?: (status: string) => void
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  newId?: () => string
  pauseMs?: number
}): Promise<{ items: GalleryItem[]; error?: string }> {
  const { signal } = opts
  const sleep = opts.sleep ?? abortableSleep
  let counter = 0
  const newId = opts.newId ?? (() => `gal-${Date.now()}-${counter++}`)
  let items = opts.items
  let n = items.reduce((m, i) => Math.max(m, i.n), 0) + 1
  let failures = 0

  const emit = (next: GalleryItem[]) => {
    items =
      next.length > GALLERY_MAX_ITEMS ? next.slice(-GALLERY_MAX_ITEMS) : next
    opts.onUpdate(items)
  }
  const without = (id: string) => items.filter((i) => i.id !== id)

  while (!signal.aborted) {
    const id = newId()
    const placeholder: GalleryItem = {
      id,
      n,
      prompt: opts.prompt,
      title: '',
      svg: '',
      status: 'drawing',
    }
    emit([...items, placeholder])
    opts.onStatus?.(`Drawing #${n}…`)
    let message = ''
    let rateLimited = false
    try {
      const req = buildGalleryRequest({
        prompt: opts.prompt,
        n,
        previousTitles: items
          .filter((i) => i.status === 'done')
          .map((i) => i.title),
      })
      let text = ''
      for await (const delta of opts.runner(req, signal)) {
        if (signal.aborted) break
        text += delta
      }
      if (signal.aborted) {
        emit(without(id))
        return { items }
      }
      const svg = extractSvg(text)
      if (!svg) throw new Error('Model did not return a complete SVG')
      emit(
        items.map((i) =>
          i.id === id
            ? {
                ...i,
                status: 'done' as const,
                svg,
                title: svgTitle(svg) || `Untitled #${n}`,
              }
            : i,
        ),
      )
      failures = 0
      n++
      await sleep(opts.pauseMs ?? 1000, signal)
      continue
    } catch (e) {
      emit(without(id))
      if (signal.aborted) return { items }
      const info = classifyChatError(e)
      rateLimited = info.kind === 'rate-limit'
      message = rateLimited ? 'Rate limited' : info.detail
    }
    failures++
    if (failures >= GALLERY_MAX_FAILURES) return { items, error: message }
    if (rateLimited) {
      const s = Math.min(60, 15 * 2 ** (failures - 1))
      opts.onStatus?.(`Rate limited, retrying in ${s}s…`)
      await sleep(s * 1000, signal)
    } else {
      opts.onStatus?.('Retrying…')
      await sleep(2000, signal)
    }
  }
  return { items }
}

const GALLERY_KEY = 'solid-free-chat-gallery'

/** Finished pictures from a saved payload; [] for anything unreadable. */
export function parseSavedGallery(raw: string | null): GalleryItem[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return (data as Array<Partial<GalleryItem> | null>)
      .flatMap((i) =>
        i &&
        typeof i.id === 'string' &&
        typeof i.n === 'number' &&
        typeof i.svg === 'string' &&
        i.svg
          ? [
              {
                id: i.id,
                n: i.n,
                prompt: typeof i.prompt === 'string' ? i.prompt : '',
                title: typeof i.title === 'string' ? i.title : '',
                svg: i.svg,
                status: 'done' as const,
              },
            ]
          : [],
      )
      .slice(-GALLERY_MAX_ITEMS)
  } catch {
    return []
  }
}

export async function loadSavedGallery(): Promise<GalleryItem[]> {
  if (!idbAvailable()) return []
  try {
    return parseSavedGallery(await idbGet(GALLERY_KEY))
  } catch {
    return []
  }
}

/** Saves the finished pictures on this device; storage failures are ignored. */
export async function saveGallery(items: GalleryItem[]): Promise<void> {
  if (!idbAvailable()) return
  try {
    await idbSet(
      GALLERY_KEY,
      JSON.stringify(items.filter((i) => i.status === 'done')),
    )
  } catch {
    /* storage unavailable or full */
  }
}
