import { For, Show, onSettled } from 'solid-js'
import { bindModalFocus } from '../../lib/modal-focus'
import {
  CHAT_SHORTCUTS,
  formatShortcutChord,
} from '../../lib/keyboard-shortcuts'

export function ChatAppShortcutsModal(props: {
  open: () => boolean
  onClose: () => void
}) {
  return (
    <Show when={props.open()}>
      <ShortcutsModalDialog onClose={props.onClose} />
    </Show>
  )
}

function ShortcutsModalDialog(props: { onClose: () => void }) {
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
        aria-label="Close keyboard shortcuts"
        onClick={props.onClose}
      />
      <div
        ref={(el) => {
          dialogEl = el
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-modal-title"
        tabindex="-1"
        class="border-border bg-card text-card-foreground relative z-10 flex max-h-[min(85dvh,32rem)] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-xl border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-start justify-between gap-3">
          <h2
            id="keyboard-shortcuts-modal-title"
            class="text-foreground text-base font-semibold tracking-tight"
          >
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg px-2 py-1 text-sm"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>
        <ul class="flex flex-col gap-2">
          <For each={[...CHAT_SHORTCUTS]}>
            {(shortcut) => (
              <li class="flex items-center justify-between gap-4 text-sm">
                <span class="text-foreground">{shortcut.label}</span>
                <kbd class="border-border bg-muted text-muted-foreground inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono text-xs tracking-wide">
                  {formatShortcutChord(shortcut.keys)}
                </kbd>
              </li>
            )}
          </For>
        </ul>
        <p class="text-muted-foreground text-xs">
          Enter sends a message. Shift+Enter inserts a new line.
        </p>
      </div>
    </div>
  )
}
