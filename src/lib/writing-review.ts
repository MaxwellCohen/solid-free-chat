export type ReviewKind = 'clarity' | 'style' | 'grammar' | 'structure' | 'tone'

export type ReviewComment = {
  id: string
  kind: ReviewKind
  quote: string
  comment: string
  suggestion?: string
}

export type ReviewFocus = 'editor' | 'copy-edit' | 'critique'

const KINDS: ReviewKind[] = ['clarity', 'style', 'grammar', 'structure', 'tone']

const FOCUS_INSTRUCTIONS: Record<ReviewFocus, string> = {
  editor:
    'Act as a developmental editor: flow, argument, structure, and reader engagement.',
  'copy-edit':
    'Act as a copy editor: grammar, spelling, punctuation, word choice, and consistency.',
  critique:
    'Act as a tough but fair critic: weak claims, vague language, filler, and missed opportunities.',
}

export function buildReviewSystemPrompt(focus: ReviewFocus): string {
  return [
    'You review blog posts and other writing. ' + FOCUS_INSTRUCTIONS[focus],
    'Respond with ONLY a JSON array (no prose, no code fences). Each item:',
    '{"kind":"clarity|style|grammar|structure|tone","quote":"<exact, verbatim substring of the text>","comment":"<brief explanation>","suggestion":"<optional replacement for the quote>"}',
    'Rules: quotes must be copied exactly and be short (a phrase or sentence); prefer 5-15 high-value items; omit suggestion when no direct rewrite applies.',
  ].join('\n')
}

/** Extracts the first JSON array from model output and keeps well-formed items. */
export function parseReviewComments(raw: string): ReviewComment[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  let data: unknown
  try {
    data = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: ReviewComment[] = []
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const { kind, quote, comment, suggestion } = item as Record<string, unknown>
    if (typeof quote !== 'string' || !quote || typeof comment !== 'string')
      continue
    out.push({
      id: `c${out.length}`,
      kind: KINDS.includes(kind as ReviewKind) ? (kind as ReviewKind) : 'style',
      quote,
      comment,
      ...(typeof suggestion === 'string' ? { suggestion } : {}),
    })
  }
  return out
}

export type ReviewSegment =
  | { type: 'text'; text: string }
  | { type: 'mark'; text: string; comment: ReviewComment }

/** Splits text into plain and annotated segments; comments whose quote is missing or overlaps an earlier one are dropped. */
export function segmentText(
  text: string,
  comments: ReviewComment[],
): { segments: ReviewSegment[]; unmatched: ReviewComment[] } {
  const located: { start: number; end: number; comment: ReviewComment }[] = []
  const unmatched: ReviewComment[] = []
  for (const comment of comments) {
    const start = text.indexOf(comment.quote)
    const end = start + comment.quote.length
    if (start === -1 || located.some((l) => start < l.end && end > l.start)) {
      unmatched.push(comment)
    } else {
      located.push({ start, end, comment })
    }
  }
  located.sort((a, b) => a.start - b.start)
  const segments: ReviewSegment[] = []
  let pos = 0
  for (const { start, end, comment } of located) {
    if (start > pos)
      segments.push({ type: 'text', text: text.slice(pos, start) })
    segments.push({ type: 'mark', text: text.slice(start, end), comment })
    pos = end
  }
  if (pos < text.length) segments.push({ type: 'text', text: text.slice(pos) })
  return { segments, unmatched }
}

/** Replaces the first occurrence of the comment's quote with its suggestion. */
export function applySuggestion(text: string, comment: ReviewComment): string {
  if (comment.suggestion === undefined) return text
  const i = text.indexOf(comment.quote)
  if (i === -1) return text
  return (
    text.slice(0, i) + comment.suggestion + text.slice(i + comment.quote.length)
  )
}
