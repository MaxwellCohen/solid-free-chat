import { classifyChatError } from './chat-error'
import { idbAvailable, idbGet, idbSet } from './idb-kv'
import { pickFrom } from './harness/random'
import type { Rng } from './harness/random'

export type GalleryStatus = 'drawing' | 'done'

export type GalleryItem = {
  id: string
  n: number
  prompt: string
  title: string
  svg: string
  status: GalleryStatus
}

export type GallerySession = {
  id: string
  title: string
  prompt: string
  items: GalleryItem[]
  createdAt: number
  updatedAt: number
}

export type GalleryLibrary = {
  sessions: GallerySession[]
  currentId: string | null
}

export type GalleryRequest = { system: string; prompt: string }

/** Streams text deltas for one picture; injected so tests can fake it. */
export type GalleryRunner = (
  req: GalleryRequest,
  signal: AbortSignal,
) => AsyncIterable<string>

export const GALLERY_MAX_ITEMS = 200
export const GALLERY_MAX_FAILURES = 4
export const GALLERY_CONCURRENCY = 4
export const GALLERY_MAX_SESSIONS = 40
/** Slight creativity bump so parallel fresh threads diverge. */
export const GALLERY_TEMPERATURE = 0.95
/** Hard cap so a rambling model can't hold a slot for minutes. */
export const GALLERY_MAX_TOKENS = 3500
/** A cut-off picture this long is still worth keeping (closed up). */
const SALVAGE_MIN_CHARS = 600

const MAX_SVG_CHARS = 200_000
const SVG_NS = 'http://www.w3.org/2000/svg'
const PREVIEW_MIN_MS = 120

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

const GALLERY_MOODS = [
  'playful',
  'serene',
  'dramatic',
  'whimsical',
  'mysterious',
  'energetic',
  'melancholy',
  'triumphant',
]

const GALLERY_KEY = 'solid-free-chat-gallery'
const GALLERY_LIBRARY_KEY = 'solid-free-chat-gallery-library'

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

const TAG_RE = /<(\/?)([a-zA-Z][\w:.-]*)\b[^<>]*?(\/?)>/g

/**
 * Turns a cut-off SVG into well-formed XML: drops the trailing half-written
 * tag, then closes every element still open. Browsers refuse to paint an
 * <img> whose SVG isn't well-formed, so this is what makes partial output
 * visible. Null if no <svg> start tag has finished yet.
 */
export function repairPartialSvg(text: string): string | null {
  const start = text.search(/<svg[\s>]/i)
  if (start < 0) return null
  let svg = text.slice(start)
  const lastOpen = svg.lastIndexOf('<')
  const lastClose = svg.lastIndexOf('>')
  // Inside an unfinished tag: drop it.
  if (lastOpen > lastClose) svg = svg.slice(0, lastOpen)
  if (svg.indexOf('>') < 0) return null
  // Drop an unfinished comment / CDATA.
  const comment = svg.lastIndexOf('<!--')
  if (comment >= 0 && svg.indexOf('-->', comment) < 0) {
    svg = svg.slice(0, comment)
  }
  const stack: string[] = []
  for (const m of svg.matchAll(TAG_RE)) {
    const [, closing, name, selfClosing] = m
    if (selfClosing) continue
    if (closing) {
      const at = stack.lastIndexOf(name)
      if (at >= 0) stack.length = at
    } else {
      stack.push(name)
    }
  }
  if (stack.length === 0) return null
  // Unclosed text (e.g. a half-written <title>) is fine as-is once closed.
  svg += stack
    .reverse()
    .map((n) => `</${n}>`)
    .join('')
  const tagEnd = svg.indexOf('>')
  if (!/\sxmlns\s*=/i.test(svg.slice(0, tagEnd))) {
    svg = `<svg xmlns="${SVG_NS}"${svg.slice(4)}`
  }
  return svg.length > MAX_SVG_CHARS ? null : svg
}

/**
 * Best-effort SVG for live preview: complete extract when possible, otherwise
 * a repaired, well-formed version of the partial output.
 */
export function previewSvg(text: string): string | null {
  return extractSvg(text) ?? repairPartialSvg(text)
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

export function gallerySessionTitle(prompt: string): string {
  const t = prompt.trim().replace(/\s+/g, ' ')
  if (!t) return 'Untitled gallery'
  return t.length <= 48 ? t : `${t.slice(0, 47)}…`
}

/** Fresh one-shot thread prompt with a random twist, mood, and seed. */
export function buildGalleryRequest(opts: {
  prompt: string
  n: number
  previousTitles: string[]
  rng?: Rng
}): GalleryRequest {
  const rng = opts.rng ?? Math.random
  const twistPick = pickFrom(GALLERY_TWISTS, 1, rng)
  const moodPick = pickFrom(GALLERY_MOODS, 1, rng)
  const twist = twistPick.ok ? twistPick.picks[0] : GALLERY_TWISTS[0]
  const mood = moodPick.ok ? moodPick.picks[0] : GALLERY_MOODS[0]
  const seed = Math.floor(rng() * 1_000_000)
  const system =
    'You are a fast SVG illustrator. Reply with ONLY one <svg> element: no markdown fences, no commentary, no thinking out loud. ' +
    'Start with <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">, then a short <title> naming the piece, ' +
    'then a full-canvas background, then the main shapes from back to front. ' +
    'Write compact SVG: no indentation or blank lines, no comments, integer coordinates, short hex colours, ' +
    'reuse fills via <defs>/<use> or <g> where helpful. Aim for 2500-3500 characters total. ' +
    'No <script>, no <foreignObject>, no <text> blocks beyond the title, no external images, fonts or hrefs. ' +
    'This is a brand-new request; invent a unique composition.\n'
  const lines = [
    `Theme: ${opts.prompt.trim()}`,
    `This is piece #${opts.n} in an endless gallery on this theme.`,
    `Variation seed: ${seed}. Mood: ${mood}.`,
  ]
  if (opts.previousTitles.length > 0) {
    lines.push(
      'Already in the gallery (make something clearly different in subject, composition and palette): ' +
        opts.previousTitles.slice(-8).join('; '),
    )
  }
  lines.push(
    `Twist to try (ignore it if it conflicts with the theme): ${twist}`,
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

function parseItem(raw: unknown): GalleryItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const i = raw as Partial<GalleryItem>
  if (
    typeof i.id !== 'string' ||
    typeof i.n !== 'number' ||
    typeof i.svg !== 'string' ||
    !i.svg
  ) {
    return null
  }
  return {
    id: i.id,
    n: i.n,
    prompt: typeof i.prompt === 'string' ? i.prompt : '',
    title: typeof i.title === 'string' ? i.title : '',
    svg: i.svg,
    status: 'done',
  }
}

/** Finished pictures from a legacy flat-array payload; [] for anything unreadable. */
export function parseSavedGallery(raw: string | null): GalleryItem[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .flatMap((i) => {
        const item = parseItem(i)
        return item ? [item] : []
      })
      .slice(-GALLERY_MAX_ITEMS)
  } catch {
    return []
  }
}

function parseSession(raw: unknown): GallerySession | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = raw as Partial<GallerySession>
  if (typeof s.id !== 'string' || !s.id) return null
  const prompt = typeof s.prompt === 'string' ? s.prompt : ''
  const items = Array.isArray(s.items)
    ? s.items
        .flatMap((i) => {
          const item = parseItem(i)
          return item ? [item] : []
        })
        .slice(-GALLERY_MAX_ITEMS)
    : []
  const createdAt =
    typeof s.createdAt === 'number' && Number.isFinite(s.createdAt)
      ? s.createdAt
      : Date.now()
  const updatedAt =
    typeof s.updatedAt === 'number' && Number.isFinite(s.updatedAt)
      ? s.updatedAt
      : createdAt
  return {
    id: s.id,
    title:
      typeof s.title === 'string' && s.title.trim()
        ? s.title.trim().slice(0, 80)
        : gallerySessionTitle(prompt),
    prompt,
    items,
    createdAt,
    updatedAt,
  }
}

/** Library payload; empty library for anything unreadable. */
export function parseGalleryLibrary(raw: string | null): GalleryLibrary {
  if (!raw) return { sessions: [], currentId: null }
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { sessions: [], currentId: null }
    }
    const obj = data as Partial<GalleryLibrary>
    const sessions = Array.isArray(obj.sessions)
      ? obj.sessions
          .flatMap((s) => {
            const session = parseSession(s)
            return session ? [session] : []
          })
          .slice(0, GALLERY_MAX_SESSIONS)
      : []
    const currentId =
      typeof obj.currentId === 'string' &&
      sessions.some((s) => s.id === obj.currentId)
        ? obj.currentId
        : (sessions[0]?.id ?? null)
    return { sessions, currentId }
  } catch {
    return { sessions: [], currentId: null }
  }
}

export function createGallerySession(
  prompt = '',
  newId: () => string = () => `gal-s-${Date.now()}`,
): GallerySession {
  const now = Date.now()
  return {
    id: newId(),
    title: gallerySessionTitle(prompt),
    prompt: prompt.trim(),
    items: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** Upsert session (newest first); drops oldest beyond the cap. */
export function upsertGallerySession(
  library: GalleryLibrary,
  session: GallerySession,
): GalleryLibrary {
  const rest = library.sessions.filter((s) => s.id !== session.id)
  return {
    sessions: [session, ...rest].slice(0, GALLERY_MAX_SESSIONS),
    currentId: session.id,
  }
}

export function deleteGallerySession(
  library: GalleryLibrary,
  id: string,
): GalleryLibrary {
  const sessions = library.sessions.filter((s) => s.id !== id)
  return {
    sessions,
    currentId:
      library.currentId === id ? (sessions[0]?.id ?? null) : library.currentId,
  }
}

export async function loadGalleryLibrary(): Promise<GalleryLibrary> {
  if (!idbAvailable()) return { sessions: [], currentId: null }
  try {
    const modern = parseGalleryLibrary(await idbGet(GALLERY_LIBRARY_KEY))
    if (modern.sessions.length > 0) return modern
    const legacy = parseSavedGallery(await idbGet(GALLERY_KEY))
    if (legacy.length === 0) return modern
    const prompt = legacy.at(-1)?.prompt ?? ''
    const session: GallerySession = {
      id: `gal-migrated-${Date.now()}`,
      title: gallerySessionTitle(prompt),
      prompt,
      items: legacy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const library = { sessions: [session], currentId: session.id }
    await saveGalleryLibrary(library)
    return library
  } catch {
    return { sessions: [], currentId: null }
  }
}

export async function saveGalleryLibrary(
  library: GalleryLibrary,
): Promise<void> {
  if (!idbAvailable()) return
  try {
    const cleaned: GalleryLibrary = {
      currentId: library.currentId,
      sessions: library.sessions.map((s) => ({
        ...s,
        items: s.items.filter((i) => i.status === 'done'),
      })),
    }
    await idbSet(GALLERY_LIBRARY_KEY, JSON.stringify(cleaned))
  } catch {
    /* storage unavailable or full */
  }
}

/** @deprecated Prefer loadGalleryLibrary; kept for callers expecting a flat list. */
export async function loadSavedGallery(): Promise<GalleryItem[]> {
  const lib = await loadGalleryLibrary()
  const cur = lib.sessions.find((s) => s.id === lib.currentId)
  return cur?.items ?? []
}

/** @deprecated Prefer saveGalleryLibrary. */
export async function saveGallery(items: GalleryItem[]): Promise<void> {
  const lib = await loadGalleryLibrary()
  const current = lib.sessions.find((s) => s.id === lib.currentId)
  if (!current) {
    if (items.length === 0) return
    const session = createGallerySession(items.at(-1)?.prompt ?? '')
    session.items = items.filter((i) => i.status === 'done')
    await saveGalleryLibrary(upsertGallerySession(lib, session))
    return
  }
  await saveGalleryLibrary(
    upsertGallerySession(lib, {
      ...current,
      items: items.filter((i) => i.status === 'done'),
      updatedAt: Date.now(),
    }),
  )
}

/**
 * Keeps asking the runner for SVGs (several in parallel, each a fresh thread)
 * until aborted or too many consecutive failures. `onUpdate(items)` fires on
 * every change (oldest first).
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
  concurrency?: number
  rng?: Rng
  now?: () => number
}): Promise<{ items: GalleryItem[]; error?: string }> {
  const { signal } = opts
  const sleep = opts.sleep ?? abortableSleep
  const now = opts.now ?? Date.now
  const concurrency = Math.max(1, opts.concurrency ?? GALLERY_CONCURRENCY)
  let counter = 0
  const newId = opts.newId ?? (() => `gal-${Date.now()}-${counter++}`)
  let items = opts.items
  let nextN = items.reduce((m, i) => Math.max(m, i.n), 0) + 1
  let failures = 0
  let stopError: string | undefined
  const inFlight = new Map<string, Promise<void>>()

  const emit = (next: GalleryItem[]) => {
    items =
      next.length > GALLERY_MAX_ITEMS ? next.slice(-GALLERY_MAX_ITEMS) : next
    opts.onUpdate(items)
  }
  const without = (id: string) => items.filter((i) => i.id !== id)
  const patch = (id: string, patch: Partial<GalleryItem>) =>
    emit(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  const drawingLabel = () => {
    const ns = items
      .filter((i) => i.status === 'drawing')
      .map((i) => i.n)
      .sort((a, b) => a - b)
    if (ns.length === 0) return 'Starting…'
    return ns.length === 1
      ? `Drawing #${ns[0]}…`
      : `Drawing #${ns[0]}–#${ns[ns.length - 1]} (${ns.length})…`
  }

  const drawOne = async (id: string, n: number): Promise<void> => {
    let message = ''
    let rateLimited = false
    // Per-picture abort so we can hang up as soon as </svg> arrives.
    const local = new AbortController()
    const hangUp = () => local.abort()
    if (signal.aborted) local.abort()
    else signal.addEventListener('abort', hangUp, { once: true })
    try {
      const req = buildGalleryRequest({
        prompt: opts.prompt,
        n,
        previousTitles: items
          .filter((i) => i.status === 'done' && i.title)
          .map((i) => i.title),
        rng: opts.rng,
      })
      let text = ''
      let lastPreview = 0
      for await (const delta of opts.runner(req, local.signal)) {
        if (signal.aborted) break
        text += delta
        // Done drawing: stop paying for any trailing chatter.
        if (/<\/svg>/i.test(text.slice(-delta.length - 6))) break
        const t = now()
        if (t - lastPreview < PREVIEW_MIN_MS) continue
        lastPreview = t
        const preview = previewSvg(text)
        if (preview) {
          patch(id, {
            svg: preview,
            title: svgTitle(preview) || `Drawing #${n}…`,
          })
        }
      }
      if (signal.aborted) {
        emit(without(id))
        return
      }
      let svg = extractSvg(text)
      if (!svg) {
        // Cut off (token cap / dropped stream): keep it if there's enough.
        const salvaged = repairPartialSvg(text)
        if (salvaged && salvaged.length >= SALVAGE_MIN_CHARS) svg = salvaged
      }
      if (!svg) throw new Error('Model did not return a complete SVG')
      patch(id, {
        status: 'done',
        svg,
        title: svgTitle(svg) || `Untitled #${n}`,
      })
      failures = 0
      return
    } catch (e) {
      emit(without(id))
      if (signal.aborted) return
      const info = classifyChatError(e)
      rateLimited = info.kind === 'rate-limit'
      message = rateLimited ? 'Rate limited' : info.detail
    } finally {
      signal.removeEventListener('abort', hangUp)
      local.abort()
    }
    failures++
    if (failures >= GALLERY_MAX_FAILURES) {
      stopError = message
      return
    }
    if (rateLimited) {
      const s = Math.min(60, 15 * 2 ** (failures - 1))
      opts.onStatus?.(`Rate limited, retrying in ${s}s…`)
      await sleep(s * 1000, signal)
    } else {
      opts.onStatus?.('Retrying…')
      await sleep(2000, signal)
    }
  }

  while (!signal.aborted && !stopError) {
    while (
      inFlight.size < concurrency &&
      !signal.aborted &&
      !stopError &&
      failures < GALLERY_MAX_FAILURES
    ) {
      const id = newId()
      const n = nextN++
      emit([
        ...items,
        {
          id,
          n,
          prompt: opts.prompt,
          title: '',
          svg: '',
          status: 'drawing',
        },
      ])
      opts.onStatus?.(drawingLabel())
      const job = drawOne(id, n).finally(() => {
        inFlight.delete(id)
      })
      inFlight.set(id, job)
      await sleep(opts.pauseMs ?? 0, signal)
    }
    if (inFlight.size === 0) break
    await Promise.race(inFlight.values())
    if (!stopError) opts.onStatus?.(drawingLabel())
  }

  if (signal.aborted) {
    emit(items.filter((i) => i.status === 'done'))
  } else if (inFlight.size > 0) {
    await Promise.allSettled([...inFlight.values()])
  }
  return { items, error: stopError }
}
