import { Show, createEffect } from 'solid-js'
import { bindModalFocus } from '../../lib/modal-focus'

export function ChatAppOpenRouterModal(props: {
  open: () => boolean
  draft: () => string
  onDraftInput: (value: string) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <Show when={props.open()}>
      <OpenRouterModalDialog
        draft={props.draft}
        onDraftInput={props.onDraftInput}
        onClose={props.onClose}
        onSave={props.onSave}
      />
    </Show>
  )
}

function OpenRouterModalDialog(props: {
  draft: () => string
  onDraftInput: (value: string) => void
  onClose: () => void
  onSave: () => void
}) {
  let dialogEl: HTMLDivElement | undefined

  createEffect(() => {
    bindModalFocus(dialogEl)
  })

  return (
    <div
      class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/50"
        aria-label="Close API key dialog"
        onClick={props.onClose}
      />
      <div
        ref={(el) => {
          dialogEl = el
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="openrouter-api-key-modal-title"
        tabindex="-1"
        class="border-border bg-card text-card-foreground relative z-10 flex w-full max-w-lg flex-col gap-4 rounded-t-xl border p-4 shadow-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-start justify-between gap-3">
          <h2
            id="openrouter-api-key-modal-title"
            class="text-foreground text-base font-semibold tracking-tight"
          >
            OpenRouter API key
          </h2>
          <button
            type="button"
            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg px-2 py-1 text-sm"
            onClick={props.onClose}
          >
            Cancel
          </button>
        </div>
        <p class="text-muted-foreground text-xs">
          Get a key at{' '}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary underline-offset-2 hover:underline"
          >
            openrouter.ai/keys
          </a>
          . Stored in this browser only and sent with each request so the
          server can call OpenRouter on your behalf. For local dev you can
          leave it empty if{' '}
          <code class="bg-muted rounded px-1 py-px text-[10px]">
            OPENROUTER_API_KEY
          </code>{' '}
          is set in{' '}
          <code class="bg-muted rounded px-1 py-px text-[10px]">.env.local</code>
          .
        </p>
        <label class="text-muted-foreground flex flex-col gap-1.5 text-xs">
          <span class="font-medium">Secret key</span>
          <input
            type="password"
            name="openrouter-api-key"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-lg border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            placeholder="sk-or-…"
            value={props.draft()}
            onInput={(e) => props.onDraftInput(e.currentTarget.value)}
          />
        </label>
        <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-2">
          <button
            type="button"
            class="border-border text-muted-foreground hover:bg-muted rounded-lg border px-3 py-1.5 text-sm font-medium"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3 py-1.5 text-sm font-medium"
            onClick={props.onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
