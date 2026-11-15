export const MIN_CARDS = 5
export const MAX_CARDS = 12
const MAX_SOURCE_CHARS = 8000
const MAX_FIELD_CHARS = 400
const DAY_MS = 86_400_000
const AGAIN_DELAY_MS = 10 * 60_000

export type Grade = 'again' | 'good' | 'easy'

export type Card = {
  id: string
  q: string
  a: string
  /** Days until next review (0 = relearning). */
  interval: number
  ease: number
  reps: number
  /** Epoch ms. */
  due: number
}

export type Deck = {
  id: string
  name: string
  createdAt: number
  cards: Card[]
}

export const FLASHCARD_SYSTEM_PROMPT =
  'You write study flashcards. Reply ONLY with a JSON array of 5 to 12 objects like [{"q":"question","a":"short answer"}]. Questions must be self-contained; answers under 200 characters. No other text.'

export function buildFlashcardMessages(
  source: string,
): Array<{ role: 'user'; content: string }> {
  const text = source.trim()
  const clipped =
    text.length > MAX_SOURCE_CHARS
      ? text.slice(0, MAX_SOURCE_CHARS) + '…'
      : text
  return [
    {
      role: 'user',
      content: `Make flashcards from this material:\n\n${clipped}\n\nReply with a JSON array of {"q","a"} objects.`,
    },
  ]
}

const clip = (s: string) => s.trim().slice(0, MAX_FIELD_CHARS)

/** Tolerant parse: JSON array (fenced / embedded / loose keys) or "Q:/A:" lines. */
export function parseFlashcards(raw: string): Array<{ q: string; a: string }> {
  const text = raw.trim()
  const pairs: Array<{ q: string; a: string }> = []
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1))
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue
          const o = item as Record<string, unknown>
          const q = o.q ?? o.question ?? o.front
          const a = o.a ?? o.answer ?? o.back
          if (typeof q === 'string' && typeof a === 'string') {
            pairs.push({ q: clip(q), a: clip(a) })
          }
        }
      }
    } catch {
      /* fall through to Q:/A: lines */
    }
  }
  if (pairs.length === 0) {
    let q: string | null = null
    for (const line of text.split('\n')) {
      const mq = /^\s*(?:\d+[.)]\s*)?Q(?:uestion)?\s*[:.-]\s*(.+)$/i.exec(line)
      const ma = /^\s*A(?:nswer)?\s*[:.-]\s*(.+)$/i.exec(line)
      if (mq) q = mq[1]
      else if (ma && q) {
        pairs.push({ q: clip(q), a: clip(ma[1]) })
        q = null
      }
    }
  }
  const seen = new Set<string>()
  const out: Array<{ q: string; a: string }> = []
  for (const p of pairs) {
    if (!p.q || !p.a) continue
    const key = p.q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
    if (out.length === MAX_CARDS) break
  }
  return out
}

let counter = 0
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export function newCard(q: string, a: string, now = Date.now()): Card {
  return { id: uid('c'), q, a, interval: 0, ease: 2.5, reps: 0, due: now }
}

export function newDeck(
  name: string,
  pairs: Array<{ q: string; a: string }>,
  now = Date.now(),
): Deck {
  return {
    id: uid('d'),
    name: name.trim().slice(0, 80) || 'Untitled deck',
    createdAt: now,
    cards: pairs.map((p) => newCard(p.q, p.a, now)),
  }
}

/** SM-2-lite: again resets, good grows by ease, easy grows faster and raises ease. */
export function gradeCard(card: Card, grade: Grade, now = Date.now()): Card {
  if (grade === 'again') {
    return {
      ...card,
      reps: 0,
      interval: 0,
      ease: Math.max(1.3, +(card.ease - 0.2).toFixed(2)),
      due: now + AGAIN_DELAY_MS,
    }
  }
  const easy = grade === 'easy'
  const ease = easy ? +(card.ease + 0.15).toFixed(2) : card.ease
  let interval: number
  if (card.reps === 0) interval = easy ? 4 : 1
  else if (card.reps === 1) interval = easy ? 7 : 3
  else interval = Math.round(card.interval * ease * (easy ? 1.3 : 1))
  interval = Math.max(1, interval)
  return {
    ...card,
    reps: card.reps + 1,
    interval,
    ease,
    due: now + interval * DAY_MS,
  }
}

export const isDue = (card: Card, now = Date.now()) => card.due <= now

export const dueCards = (deck: Deck, now = Date.now()) =>
  deck.cards.filter((c) => isDue(c, now)).sort((a, b) => a.due - b.due)

export const dueCount = (deck: Deck, now = Date.now()) =>
  dueCards(deck, now).length

export function deckToJson(deck: Deck): string {
  return JSON.stringify(
    { name: deck.name, cards: deck.cards.map(({ q, a }) => ({ q, a })) },
    null,
    2,
  )
}

/** Anki-importable TSV: question<TAB>answer, tabs/newlines flattened. */
export function deckToTsv(deck: Deck): string {
  const flat = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim()
  return deck.cards.map((c) => `${flat(c.q)}\t${flat(c.a)}`).join('\n') + '\n'
}

const KEY = 'solid-free-chat-study-decks'

function sanitizeCard(v: unknown): Card | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const num = (x: unknown, d: number) =>
    typeof x === 'number' && Number.isFinite(x) ? x : d
  if (typeof o.id !== 'string' || typeof o.q !== 'string') return null
  if (typeof o.a !== 'string') return null
  return {
    id: o.id,
    q: o.q,
    a: o.a,
    interval: Math.max(0, num(o.interval, 0)),
    ease: Math.max(1.3, num(o.ease, 2.5)),
    reps: Math.max(0, Math.floor(num(o.reps, 0))),
    due: num(o.due, 0),
  }
}

export function loadDecks(
  storage: Pick<Storage, 'getItem'> = localStorage,
): Deck[] {
  try {
    const raw = storage.getItem(KEY)
    if (!raw) return []
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    const out: Deck[] = []
    for (const d of v) {
      if (!d || typeof d !== 'object') continue
      const o = d as Record<string, unknown>
      if (typeof o.id !== 'string' || typeof o.name !== 'string') continue
      const cards = Array.isArray(o.cards)
        ? o.cards.map(sanitizeCard).filter((c): c is Card => c !== null)
        : []
      out.push({
        id: o.id,
        name: o.name,
        createdAt: typeof o.createdAt === 'number' ? o.createdAt : 0,
        cards,
      })
    }
    return out
  } catch {
    return []
  }
}

export function saveDecks(
  decks: Deck[],
  storage: Pick<Storage, 'setItem'> = localStorage,
) {
  try {
    storage.setItem(KEY, JSON.stringify(decks))
  } catch {
    /* quota / unavailable */
  }
}
