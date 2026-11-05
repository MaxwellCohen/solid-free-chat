import { For, Show, createSignal, onSettled } from 'solid-js'
import { bindModalFocus } from '../../lib/modal-focus'
import { BUILT_IN_SNIPPETS, addSnippet } from '../../lib/snippets'
import type { Snippet } from '../../lib/snippets'

export function ChatAppSnippetsModal(props: {
  open: () => boolean
  snippets: () => Snippet[]
  onChange: (next: Snippet[]) => void
  onClose: () => void
}) {
  return (
    <Show when={props.open()}>
      <SnippetsDialog
        snippets={props.snippets}
        onChange={props.onChange}
        onClose={props.onClose}
      />
    </Show>
  )
}

function SnippetsDialog(props: {
  snippets: () => Snippet[]
  onChange: (next: Snippet[]) => void
  onClose: () => void
}) {
  let dialogEl: HTMLDivElement | undefined
  const [trigger, setTrigger] = createSignal(';')
  const [text, setText] = createSignal('')
  const [error, setError] = createSignal<string | null>(null)
  onSettled(() => bindModalFocus(dialogEl))

  function add(t: string, body: string) {
    const result = addSnippet(props.snippets(), t, body)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setError(null)
    props.onChange(result.snippets)
    return true
  }

  const missingExamples = () =>
    BUILT_IN_SNIPPETS.filter(
      (b) =>
        !props
          .snippets()
          .some((s) => s.trigger.toLowerCase() === b.trigger.toLowerCase()),
    )

  return (
    <div
      class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/50"
        aria-label="Close snippets"
        onClick={props.onClose}
      />
      <div
        ref={(el) => {
          dialogEl = el
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="snippets-modal-title"
        tabindex="-1"
        class="border-border bg-card text-card-foreground relative z-10 flex max-h-[min(88dvh,36rem)] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-xl border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            props.onClose()
          }
        }}
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2
              id="snippets-modal-title"
              class="text-foreground text-base font-semibold tracking-tight"
            >
              Snippets
            </h2>
            <p class="text-muted-foreground text-xs">
              Type a trigger then space in the composer to expand it.
              Placeholders: {'{{date}}'}, {'{{time}}'}, {'{{clipboard}}'}.
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

        <ul class="flex flex-col gap-1.5" aria-label="Your snippets">
          <For
            each={props.snippets()}
            fallback={
              <li class="text-muted-foreground text-xs">No snippets yet.</li>
            }
          >
            {(s) => (
              <li
                class="border-border flex items-start gap-2 rounded-lg border p-2"
                data-testid="snippet-row"
              >
                <code class="bg-muted shrink-0 rounded px-1.5 py-0.5 text-xs">
                  {s.trigger}
                </code>
                <span class="text-muted-foreground min-w-0 flex-1 text-xs break-words whitespace-pre-wrap">
                  {s.text}
                </span>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-destructive shrink-0 text-xs"
                  aria-label={`Delete ${s.trigger}`}
                  onClick={() =>
                    props.onChange(
                      props.snippets().filter((x) => x.id !== s.id),
                    )
                  }
                >
                  Delete
                </button>
              </li>
            )}
          </For>
        </ul>

        <form
          class="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (add(trigger(), text())) {
              setTrigger(';')
              setText('')
            }
          }}
        >
          <div class="flex gap-2">
            <input
              class="border-input bg-background w-28 shrink-0 rounded-lg border px-2 py-1.5 text-sm"
              aria-label="Trigger"
              placeholder=";sig"
              value={trigger()}
              onInput={(e) => setTrigger(e.currentTarget.value)}
            />
            <textarea
              class="border-input bg-background min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm"
              aria-label="Expansion text"
              placeholder="Expansion text"
              rows={2}
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          </div>
          <Show when={error()} keyed>
            {(msg) => (
              <p class="text-destructive text-xs" role="alert">
                {msg}
              </p>
            )}
          </Show>
          <button
            type="submit"
            class="bg-primary text-primary-foreground self-end rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            Add snippet
          </button>
        </form>

        <Show when={missingExamples().length > 0}>
          <div class="border-border flex flex-col gap-1.5 border-t pt-3">
            <h3 class="text-muted-foreground text-xs font-medium">Examples</h3>
            <For each={missingExamples()}>
              {(b) => (
                <div class="flex items-center gap-2 text-xs">
                  <code class="bg-muted shrink-0 rounded px-1.5 py-0.5">
                    {b.trigger}
                  </code>
                  <span class="text-muted-foreground min-w-0 flex-1 truncate">
                    {b.text.replace(/\n/g, ' ')}
                  </span>
                  <button
                    type="button"
                    class="border-border hover:bg-muted shrink-0 rounded-md border px-2 py-0.5"
                    onClick={() => add(b.trigger, b.text)}
                  >
                    Add {b.trigger}
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
