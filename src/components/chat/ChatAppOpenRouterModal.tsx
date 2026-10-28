import { Show, onSettled } from 'solid-js'
import { bindModalFocus } from '../../lib/modal-focus'

export function ChatAppOpenRouterModal(props: {
  open: () => boolean
  draft: () => string
  onDraftInput: (value: string) => void
  remember: () => boolean
  onRememberChange: (value: boolean) => void
  signInBusy: () => boolean
  signInError: () => string | null
  onSignIn: () => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <Show when={props.open()}>
      <OpenRouterModalDialog {...props} />
    </Show>
  )
}

function OpenRouterModalDialog(props: {
  draft: () => string
  onDraftInput: (value: string) => void
  remember: () => boolean
  onRememberChange: (value: boolean) => void
  signInBusy: () => boolean
  signInError: () => string | null
  onSignIn: () => void
  onClose: () => void
  onSave: () => void
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
        class="border-border bg-card text-card-foreground relative z-10 flex w-full max-w-lg flex-col gap-4 rounded-t-xl border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-xl"
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
        <button
          type="button"
          class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60"
          disabled={props.signInBusy()}
          onClick={props.onSignIn}
        >
          {props.signInBusy() ? 'Connecting to OpenRouter…' : 'Sign in with OpenRouter'}
        </button>
        <Show when={props.signInError()}>
          {(message) => (
            <p role="alert" class="text-destructive text-xs">
              {message()}
            </p>
          )}
        </Show>
        <p class="text-muted-foreground text-xs">
          Creates a key in your OpenRouter account just for this app — set a
          spending limit or revoke it any time at{' '}
          <a
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary underline-offset-2 hover:underline"
          >
            openrouter.ai/settings/keys
          </a>
          .
        </p>
        <div class="text-muted-foreground flex items-center gap-2 text-xs">
          <span class="bg-border h-px flex-1" />
          or paste a key
          <span class="bg-border h-px flex-1" />
        </div>
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
        <label class="text-muted-foreground flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            class="mt-0.5"
            checked={props.remember()}
            onChange={(e) => props.onRememberChange(e.currentTarget.checked)}
          />
          <span>
            Remember on this device. Otherwise the key is kept only for this
            tab and forgotten when you close it.
          </span>
        </label>
        <p class="border-border bg-muted/40 text-muted-foreground rounded-lg border p-2 text-xs">
          Your key never touches this app's server: the browser sends it
          straight to <code class="text-[10px]">openrouter.ai</code>. To check,
          open DevTools → Network — requests carrying it go only to
          openrouter.ai.
        </p>
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
