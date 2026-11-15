import { For, Show, createEffect, createSignal, onSettled } from 'solid-js'
import { activeOutlineKey, pickActiveMessage } from '../../lib/outline'
import type { OutlineItem } from '../../lib/outline'
import { requestScrollToMessage } from '../../lib/scroll-to-message'

const INDENT = ['pl-2', 'pl-2', 'pl-5', 'pl-8'] as const

/** Message id nearest the top of the rendered (virtualized) conversation log. */
function readActiveMessageId(): string | null {
  const log = document.querySelector('[role="log"]')
  if (!log) return null
  const logTop = log.getBoundingClientRect().top
  const tops = Array.from(
    log.querySelectorAll<HTMLElement>('[data-message-id]'),
  )
    .map((el) => ({
      id: el.dataset.messageId ?? '',
      top: el.getBoundingClientRect().top - logTop,
    }))
    .sort((a, b) => a.top - b.top)
  // Reading line: the message crossing the vertical middle of the viewport.
  return pickActiveMessage(tops, log.clientHeight / 2)
}

export function ChatAppOutline(props: {
  items: () => OutlineItem[]
  onClose: () => void
}) {
  const [activeId, setActiveId] = createSignal<string | null>(null)
  const refresh = () => setActiveId(readActiveMessageId())

  onSettled(() => {
    let settle: ReturnType<typeof setTimeout> | undefined
    const onScroll = (e: Event) => {
      if ((e.target as Element).getAttribute('role') === 'log') {
        refresh()
        // The virtualized list re-renders after scroll; re-read once it settles.
        clearTimeout(settle)
        settle = setTimeout(refresh, 150)
      }
    }
    // Scroll does not bubble; capture it from the document instead.
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', refresh)
    refresh()
    return () => {
      clearTimeout(settle)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', refresh)
    }
  })

  // Re-measure after the list changes (new message, conversation switch).
  createEffect(
    () => props.items().length,
    () => {
      requestAnimationFrame(refresh)
    },
  )

  const activeKey = () => {
    const id = activeId()
    const items = props.items()
    const index = id
      ? items.find((i) => i.messageId === id)?.messageIndex
      : null
    if (index !== undefined && index !== null) {
      return activeOutlineKey(items, index)
    }
    // Active message has no item (e.g. reply without headings): use its position.
    const el = id
      ? document.querySelector<HTMLElement>(
          `[role="log"] [data-message-id="${CSS.escape(id)}"]`,
        )
      : null
    const idx = el ? Number(el.dataset.index) : NaN
    return Number.isNaN(idx) ? null : activeOutlineKey(items, idx)
  }

  return (
    <aside
      aria-label="Conversation outline"
      data-testid="outline-panel"
      class="border-border bg-card text-card-foreground hidden min-h-0 w-64 shrink-0 flex-col border-l lg:flex"
    >
      <div class="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 class="text-foreground text-sm font-semibold">Outline</h2>
        <button
          type="button"
          class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg px-2 py-0.5 text-xs"
          onClick={props.onClose}
        >
          Hide
        </button>
      </div>
      <Show
        when={props.items().length > 0}
        fallback={
          <p class="text-muted-foreground p-3 text-xs">
            Messages and reply headings will appear here.
          </p>
        }
      >
        <nav class="min-h-0 flex-1 overflow-y-auto p-1.5">
          <ul class="flex flex-col gap-px">
            <For each={props.items()}>
              {(item) => (
                <li>
                  <button
                    type="button"
                    data-outline-key={item.key}
                    aria-current={activeKey() === item.key ? 'true' : undefined}
                    class={[
                      'hover:bg-muted block w-full truncate rounded-md py-1 pr-2 text-left text-xs',
                      INDENT[item.level],
                      item.kind === 'user'
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground',
                      {
                        'bg-primary/10 text-foreground':
                          activeKey() === item.key,
                      },
                    ]}
                    title={item.text}
                    onClick={() => {
                      setActiveId(item.messageId)
                      requestScrollToMessage(item.messageId)
                    }}
                  >
                    {item.text}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </nav>
      </Show>
    </aside>
  )
}
