import { createEffect, createMemo, createSignal, onSettled } from 'solid-js'
import { maybe } from '../../lib/nullable'
import { findInMessages, stepMatch } from '../../lib/find-in-chat'
import { requestScrollToMessage } from '../../lib/scroll-to-message'

type HighlightRegistry = {
  set: (name: string, h: unknown) => void
  delete: (name: string) => void
}

function highlightApi(): {
  registry: HighlightRegistry
  Highlight: new (...r: Range[]) => unknown
} | null {
  const css = globalThis.CSS as unknown as
    { highlights?: HighlightRegistry } | undefined
  const H = (
    globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }
  ).Highlight
  return css?.highlights && H
    ? { registry: css.highlights, Highlight: H }
    : null
}

function clearHighlights() {
  const api = highlightApi()
  api?.registry.delete('find-match')
  api?.registry.delete('find-current')
}

/** Highlights every rendered occurrence; returns nothing if the API is missing. */
function paint(
  query: string,
  current: { id: string; occurrence: number } | null,
) {
  clearHighlights()
  const api = highlightApi()
  const q = query.trim().toLowerCase()
  if (!api || !q) return
  const all: Range[] = []
  const cur: Range[] = []
  for (const article of document.querySelectorAll('[data-message-id]')) {
    const id = article.getAttribute('data-message-id')
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT)
    let occurrence = 0
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.nodeValue ?? '').toLowerCase()
      let from = 0
      for (;;) {
        const at = text.indexOf(q, from)
        if (at === -1) break
        const r = new Range()
        r.setStart(n, at)
        r.setEnd(n, at + q.length)
        all.push(r)
        if (current && current.id === id && current.occurrence === occurrence) {
          cur.push(r)
        }
        occurrence++
        from = at + q.length
      }
    }
  }
  if (all.length) api.registry.set('find-match', new api.Highlight(...all))
  if (cur.length) api.registry.set('find-current', new api.Highlight(...cur))
}

export function ChatFindBar(props: {
  messages: () => { id: string; text: string }[]
  onClose: () => void
}) {
  const [query, setQuery] = createSignal('')
  const [index, setIndex] = createSignal(-1)
  let input: HTMLInputElement | undefined

  const matches = createMemo(() => findInMessages(props.messages(), query()))
  const current = () => maybe(matches()[index()]) ?? null

  onSettled(() => {
    input?.focus()
    input?.select()
    return clearHighlights
  })

  createEffect(
    () => [query(), matches().length] as const,
    ([, n]) => {
      setIndex(n ? 0 : -1)
    },
  )

  createEffect(
    () => [query(), current()] as const,
    ([q, cur]) => {
      if (cur) requestScrollToMessage(cur.messageId)
      // Virtualized rows mount after the scroll settles.
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          paint(
            q,
            cur ? { id: cur.messageId, occurrence: cur.occurrence } : null,
          ),
        ),
      )
    },
  )

  const step = (dir: 1 | -1) =>
    setIndex((i) => stepMatch(i, matches().length, dir))

  return (
    <div
      data-testid="find-bar"
      role="search"
      class="border-border bg-card absolute top-2 right-3 z-20 flex items-center gap-1.5 rounded-lg border p-1.5 shadow-md"
    >
      <input
        ref={(el) => {
          input = el
        }}
        type="text"
        aria-label="Find in chat"
        placeholder="Find in chat"
        class="border-input bg-background w-44 rounded border px-2 py-1 text-sm"
        value={query()}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            props.onClose()
          }
        }}
      />
      <span
        data-testid="find-count"
        class="text-muted-foreground min-w-14 text-center text-xs tabular-nums"
        aria-live="polite"
      >
        {query().trim()
          ? matches().length
            ? `${index() + 1} of ${matches().length}`
            : 'No results'
          : ''}
      </span>
      <button
        type="button"
        class="hover:bg-muted rounded px-1.5 py-0.5 text-sm"
        aria-label="Previous match"
        onClick={() => step(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        class="hover:bg-muted rounded px-1.5 py-0.5 text-sm"
        aria-label="Next match"
        onClick={() => step(1)}
      >
        ↓
      </button>
      <button
        type="button"
        class="hover:bg-muted rounded px-1.5 py-0.5 text-sm"
        aria-label="Close find"
        onClick={props.onClose}
      >
        ✕
      </button>
    </div>
  )
}
