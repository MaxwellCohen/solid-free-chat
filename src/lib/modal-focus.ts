import { onCleanup } from 'solid-js'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
}

/**
 * Call from a `createEffect` while a dialog is mounted. Focuses the first
 * focusable control, traps Tab inside the dialog, and restores focus on cleanup.
 */
export function bindModalFocus(dialog: HTMLElement | undefined): void {
  if (!dialog) return

  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

  const focusFirst = () => {
    const items = focusableElements(dialog)
    const target = items[0] ?? dialog
    target.focus()
  }

  queueMicrotask(focusFirst)

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return
    const items = focusableElements(dialog)
    if (items.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey) {
      if (active === first || !dialog.contains(active)) {
        event.preventDefault()
        last.focus()
      }
      return
    }
    if (active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  dialog.addEventListener('keydown', onKeyDown)

  onCleanup(() => {
    dialog.removeEventListener('keydown', onKeyDown)
    previouslyFocused?.focus()
  })
}
