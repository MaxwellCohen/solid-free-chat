import { For, Show, createMemo, createSignal, onSettled } from 'solid-js'
import { bindModalFocus } from '../../lib/modal-focus'
import { rankPaletteItems } from '../../lib/command-palette'
import type { PaletteItem } from '../../lib/command-palette'

export type PaletteCommand = PaletteItem & { run: () => void }

export function ChatAppCommandPalette(props: {
  open: () => boolean
  initialQuery: () => string
  items: () => PaletteCommand[]
  onClose: () => void
}) {
  return (
    <Show when={props.open()}>
      <PaletteDialog
        initialQuery={props.initialQuery()}
        items={props.items}
        onClose={props.onClose}
      />
    </Show>
  )
}

function PaletteDialog(props: {
  initialQuery: string
  items: () => PaletteCommand[]
  onClose: () => void
}) {
  let dialogEl: HTMLDivElement | undefined
  const [query, setQuery] = createSignal(props.initialQuery)
  const [active, setActive] = createSignal(0)

  onSettled(() => bindModalFocus(dialogEl))

  const results = createMemo(() => rankPaletteItems(props.items(), query()))

  function run(item: PaletteCommand | undefined) {
    if (!item) return
    props.onClose()
    item.run()
  }

  function onKeyDown(e: KeyboardEvent) {
    const n = results().length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (n) setActive((i) => (i + 1) % n)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (n) setActive((i) => (i - 1 + n) % n)
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault()
      run(results()[active()])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      props.onClose()
    }
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-start justify-center p-4 sm:pt-[15vh]"
      role="presentation"
    >
      <button
        type="button"
        tabindex="-1"
        class="absolute inset-0 bg-black/50"
        aria-label="Close command palette"
        onClick={props.onClose}
      />
      <div
        ref={(el) => {
          dialogEl = el
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabindex="-1"
        class="border-border bg-card text-card-foreground relative z-10 flex max-h-[min(80dvh,28rem)] w-full max-w-lg flex-col gap-2 rounded-xl border p-3 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={
            results().length ? `command-palette-item-${active()}` : undefined
          }
          class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
          placeholder="Type a command or search chats…"
          value={query()}
          onInput={(e) => {
            setQuery(e.currentTarget.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        <ul
          id="command-palette-list"
          role="listbox"
          class="min-h-0 flex-1 overflow-y-auto"
        >
          <For each={results()}>
            {(item, i) => (
              <li
                id={`command-palette-item-${i()}`}
                role="option"
                aria-selected={i() === active() ? 'true' : 'false'}
                class={[
                  'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm',
                  { 'bg-muted text-foreground': i() === active() },
                ]}
                onMouseMove={() => setActive(i())}
                onClick={() => run(item)}
              >
                <span class="min-w-0 truncate">{item.label}</span>
                <Show when={item.hint}>
                  <span class="text-muted-foreground shrink-0 text-xs">
                    {item.hint}
                  </span>
                </Show>
              </li>
            )}
          </For>
          <Show when={results().length === 0}>
            <li class="text-muted-foreground px-3 py-2 text-sm italic">
              No matching commands.
            </li>
          </Show>
        </ul>
      </div>
    </div>
  )
}
