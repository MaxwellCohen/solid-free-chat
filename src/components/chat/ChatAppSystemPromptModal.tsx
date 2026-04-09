import { For, Show } from 'solid-js'
import type { SavedSystemPrompt } from '../../store/chat.hooks'

export function ChatAppSystemPromptModal(props: {
  open: () => boolean
  currentConversationId: () => string | null
  systemDraft: () => string
  onSystemMessageInput: (
    e: Event & { currentTarget: HTMLTextAreaElement },
  ) => void
  onSystemMessageBlur: () => void
  loadPromptSelectKey: () => number
  onChooseSavedPromptId: (id: string) => void
  savedSystemPrompts: () => SavedSystemPrompt[]
  savePromptName: () => string
  onSavePromptNameInput: (value: string) => void
  onSaveCurrentToLibrary: () => void
  onDeleteSavedSystemPrompt: (id: string) => void
  onClose: () => void
}) {
  return (
    <Show when={props.open() && props.currentConversationId()}>
      <div
        class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
        role="presentation"
      >
        <button
          type="button"
          class="absolute inset-0 bg-black/50"
          aria-label="Close system prompt editor"
          onClick={props.onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="system-prompt-modal-title"
          class="border-border bg-card text-card-foreground relative z-10 flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col gap-4 rounded-t-xl border p-4 shadow-lg sm:rounded-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="flex items-start justify-between gap-3">
            <h2
              id="system-prompt-modal-title"
              class="text-foreground text-base font-semibold tracking-tight"
            >
              System prompt
            </h2>
            <button
              type="button"
              class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg px-2 py-1 text-sm"
              onClick={props.onClose}
            >
              Close
            </button>
          </div>
          <p class="text-muted-foreground text-xs">
            Edits apply to this chat only and are sent with every reply.
            Load or save templates below.
          </p>
          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <label class="text-muted-foreground flex flex-col gap-1.5 text-xs">
              <span class="font-medium">System message</span>
              <textarea
                class="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring max-h-40 min-h-24 w-full resize-y rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                rows={4}
                placeholder="Optional instructions, tone, or constraints…"
                value={props.systemDraft()}
                onInput={props.onSystemMessageInput}
                onBlur={props.onSystemMessageBlur}
              />
            </label>
            <div class="border-border space-y-3 border-t pt-3">
              <p class="text-foreground text-xs font-semibold">
                Saved prompts
              </p>
              <label class="text-muted-foreground flex flex-col gap-1.5 text-xs">
                <span class="font-medium">Load saved prompt</span>
                <Show when={String(props.loadPromptSelectKey())} keyed>
                  <select
                    class="border-input bg-background rounded-lg border px-2 py-1.5 text-sm"
                    value=""
                    onChange={(e) => {
                      const pid = e.currentTarget.value
                      if (!pid) return
                      props.onChooseSavedPromptId(pid)
                    }}
                  >
                    <option value="">Choose…</option>
                    <For each={props.savedSystemPrompts()}>
                      {(p) => <option value={p.id}>{p.name}</option>}
                    </For>
                  </select>
                </Show>
              </label>
              <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <label class="text-muted-foreground flex min-w-44 flex-1 flex-col gap-1.5 text-xs">
                  <span class="font-medium">Save current as</span>
                  <input
                    type="text"
                    class="border-input bg-background placeholder:text-muted-foreground rounded-lg border px-2 py-1.5 text-sm"
                    placeholder="Name"
                    value={props.savePromptName()}
                    maxLength={120}
                    onInput={(e) =>
                      props.onSavePromptNameInput(e.currentTarget.value)
                    }
                  />
                </label>
                <button
                  type="button"
                  class="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
                  disabled={
                    !props.savePromptName().trim() || !props.systemDraft().trim()
                  }
                  onClick={props.onSaveCurrentToLibrary}
                >
                  Save to library
                </button>
              </div>
              <Show when={props.savedSystemPrompts().length > 0}>
                <div class="text-muted-foreground border-border border-t pt-3 text-xs">
                  <p class="text-foreground mb-2 font-medium">
                    Manage saved ({props.savedSystemPrompts().length})
                  </p>
                  <ul class="space-y-1">
                    <For each={props.savedSystemPrompts()}>
                      {(p) => (
                        <li class="flex items-center justify-between gap-2">
                          <span class="min-w-0 truncate" title={p.name}>
                            {p.name}
                          </span>
                          <button
                            type="button"
                            class="text-destructive hover:bg-destructive/10 shrink-0 rounded px-2 py-0.5"
                            onClick={() =>
                              props.onDeleteSavedSystemPrompt(p.id)
                            }
                          >
                            Remove
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}
