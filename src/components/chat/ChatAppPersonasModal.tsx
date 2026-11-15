import { For, Show, createSignal, onSettled } from 'solid-js'
import { bindModalFocus } from '../../lib/modal-focus'
import type { Persona, PersonaDraft } from '../../lib/personas'

const INPUT_CLASS =
  'border-input bg-background rounded-lg border px-2 py-1.5 text-sm font-normal'

export function ChatAppPersonasModal(props: {
  open: () => boolean
  personas: () => Persona[]
  onPick: (persona: Persona) => void
  onCreate: (draft: PersonaDraft) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  return (
    <Show when={props.open()}>
      <PersonasDialog
        personas={props.personas}
        onPick={props.onPick}
        onCreate={props.onCreate}
        onDelete={props.onDelete}
        onClose={props.onClose}
      />
    </Show>
  )
}

function PersonasDialog(props: {
  personas: () => Persona[]
  onPick: (persona: Persona) => void
  onCreate: (draft: PersonaDraft) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  let dialogEl: HTMLDivElement | undefined
  onSettled(() => bindModalFocus(dialogEl))
  const [name, setName] = createSignal('')
  const [emoji, setEmoji] = createSignal('')
  const [instructions, setInstructions] = createSignal('')

  function create() {
    if (!name().trim() || !instructions().trim()) return
    props.onCreate({
      name: name(),
      emoji: emoji(),
      tagline: 'Custom persona',
      instructions: instructions(),
    })
    setName('')
    setEmoji('')
    setInstructions('')
  }

  return (
    <div
      class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/50"
        aria-label="Close personas"
        onClick={props.onClose}
      />
      <div
        ref={(el) => {
          dialogEl = el
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="personas-modal-title"
        tabindex="-1"
        class="border-border bg-card text-card-foreground relative z-10 flex max-h-[min(90dvh,44rem)] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-t-xl border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2
              id="personas-modal-title"
              class="text-foreground text-base font-semibold tracking-tight"
            >
              Personas
            </h2>
            <p class="text-muted-foreground text-xs">
              Pick a character to start a new chat with its instructions.
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
          <For each={props.personas()}>
            {(p) => (
              <li class="border-border hover:bg-muted relative flex min-w-0 rounded-xl border">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
                  aria-label={`Start chat with ${p.name}`}
                  onClick={() => props.onPick(p)}
                >
                  <span class="text-2xl" aria-hidden="true">
                    {p.emoji}
                  </span>
                  <span class="min-w-0">
                    <span class="text-foreground block truncate text-sm font-medium">
                      {p.name}
                    </span>
                    <span class="text-muted-foreground block text-xs">
                      {p.tagline}
                    </span>
                  </span>
                </button>
                <Show when={p.custom}>
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground px-2 text-xs underline"
                    aria-label={`Delete persona ${p.name}`}
                    onClick={() => props.onDelete(p.id)}
                  >
                    Delete
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
        <form
          class="border-border flex flex-col gap-2 rounded-lg border p-3"
          onSubmit={(e) => {
            e.preventDefault()
            create()
          }}
        >
          <h3 class="text-xs font-semibold">Create a persona</h3>
          <div class="flex gap-2">
            <input
              class={`${INPUT_CLASS} w-16 text-center`}
              placeholder="🙂"
              aria-label="Persona emoji"
              maxlength={4}
              value={emoji()}
              onInput={(e) => setEmoji(e.currentTarget.value)}
            />
            <input
              class={`${INPUT_CLASS} min-w-0 flex-1`}
              placeholder="Name"
              aria-label="Persona name"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </div>
          <textarea
            class={`${INPUT_CLASS} min-h-20`}
            placeholder="Instructions (used as the system prompt)"
            aria-label="Persona instructions"
            value={instructions()}
            onInput={(e) => setInstructions(e.currentTarget.value)}
          />
          <div>
            <button
              type="submit"
              class="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              disabled={!name().trim() || !instructions().trim()}
            >
              Save persona
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
