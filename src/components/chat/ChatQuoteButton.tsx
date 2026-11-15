import { Show, createSignal, onSettled } from 'solid-js'
import { Quote } from '../icons'

type Pos = { top: number; left: number }

/** Selected text when the selection lies wholly inside one rendered message body. */
function selectionInMessage(): { text: string; rect: DOMRect } | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const body = (n: Node) =>
    (n instanceof Element ? n : n.parentElement)?.closest('.chat-bubble')
  const start = body(range.startContainer)
  if (!start || start !== body(range.endContainer)) return null
  const text = sel.toString()
  if (!text.trim()) return null
  return { text, rect: range.getBoundingClientRect() }
}

/** Floating "Quote" button shown near a text selection inside a message. */
export function ChatQuoteButton(props: { onQuote: (text: string) => void }) {
  const [pos, setPos] = createSignal<Pos | null>(null)
  let text = ''

  onSettled(() => {
    const update = () => {
      const hit = selectionInMessage()
      if (!hit) {
        setPos(null)
        return
      }
      text = hit.text
      const left = Math.min(
        Math.max(8, hit.rect.left + hit.rect.width / 2 - 28),
        window.innerWidth - 80,
      )
      const above = hit.rect.top - 40
      setPos({ left, top: above < 8 ? hit.rect.bottom + 8 : above })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPos(null)
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!(
        e.target instanceof Element && e.target.closest('[data-quote-btn]')
      ))
        setPos(null)
    }
    document.addEventListener('selectionchange', update)
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', update, true)
    return () => {
      document.removeEventListener('selectionchange', update)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', update, true)
    }
  })

  return (
    <Show when={pos()}>
      {(p) => (
        <button
          type="button"
          data-quote-btn
          class="bg-foreground text-background fixed z-40 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-lg"
          style={{ top: `${p().top}px`, left: `${p().left}px` }}
          // Keep the selection alive while pressing the button.
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            props.onQuote(text)
            setPos(null)
            window.getSelection()?.removeAllRanges()
          }}
        >
          <Quote class="size-3 shrink-0" aria-hidden="true" />
          Quote
        </button>
      )}
    </Show>
  )
}
