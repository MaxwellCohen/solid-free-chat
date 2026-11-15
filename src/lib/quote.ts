/** Longest quote inserted into the composer; longer selections are truncated. */
export const MAX_QUOTE_CHARS = 1000

/** Turns selected text into a markdown blockquote followed by a blank line; '' when blank. */
export function selectionToBlockquote(
  text: string,
  max = MAX_QUOTE_CHARS,
): string {
  let t = text.replace(/\r\n?/g, '\n').trim()
  if (!t) return ''
  if (t.length > max) t = `${t.slice(0, max - 1).trimEnd()}…`
  const lines = t.split('\n').map((l) => (l.trim() ? `> ${l.trimEnd()}` : '>'))
  return `${lines.join('\n')}\n\n`
}

/** Appends a quote to an existing draft, separating it with a blank line. */
export function appendQuoteToDraft(draft: string, quote: string): string {
  if (!quote) return draft
  if (!draft.trim()) return quote
  return `${draft.replace(/\s+$/, '')}\n\n${quote}`
}
