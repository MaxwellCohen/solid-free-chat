import { For, Show, onSettled } from 'solid-js'
import { bindModalFocus } from '../../lib/modal-focus'
import { TOUR_ITEMS } from '../../lib/tour-items'
import type { TourItem } from '../../lib/tour-items'

export function ChatAppTourModal(props: {
  open: () => boolean
  onTry: (item: TourItem) => void
  onClose: () => void
}) {
  return (
    <Show when={props.open()}>
      <TourModalDialog onTry={props.onTry} onClose={props.onClose} />
    </Show>
  )
}

function TourModalDialog(props: {
  onTry: (item: TourItem) => void
  onClose: () => void
}) {
  let dialogEl: HTMLDivElement | undefined

  onSettled(() => bindModalFocus(dialogEl))

  return (
    <div
      class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/50"
        aria-label="Close tour"
        onClick={props.onClose}
      />
      <div
        ref={(el) => {
          dialogEl = el
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-modal-title"
        tabindex="-1"
        class="border-border bg-card text-card-foreground relative z-10 flex max-h-[min(88dvh,44rem)] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-t-xl border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2
              id="tour-modal-title"
              class="text-foreground text-base font-semibold tracking-tight"
            >
              What's new / Tour
            </h2>
            <p class="text-muted-foreground text-xs">
              Features worth knowing about. Hit Try it to jump right in.
            </p>
          </div>
          <button
            type="button"
            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg px-2 py-1 text-sm"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>
        <ul class="grid gap-2 sm:grid-cols-2">
          <For each={[...TOUR_ITEMS]}>
            {(item) => (
              <li
                class="border-border flex flex-col gap-1.5 rounded-lg border p-3"
                data-testid={`tour-item-${item.id}`}
              >
                <div class="flex items-center gap-2">
                  <span class="text-lg" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <h3 class="text-foreground text-sm font-medium">
                    {item.title}
                  </h3>
                </div>
                <p class="text-muted-foreground text-xs">{item.description}</p>
                <div class="mt-auto flex items-center justify-between gap-2 pt-1">
                  <kbd class="border-border bg-muted text-muted-foreground min-w-0 rounded-md border px-1.5 py-0.5 font-mono text-[11px]">
                    {item.how}
                  </kbd>
                  <button
                    type="button"
                    class="bg-primary text-primary-foreground shrink-0 rounded-md px-2.5 py-1 text-xs font-medium"
                    onClick={() => props.onTry(item)}
                  >
                    {item.actionLabel ?? 'Try it'}
                  </button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  )
}
