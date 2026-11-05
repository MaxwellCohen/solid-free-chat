import { Show, createSignal, onSettled, untrack } from 'solid-js'
import { bindModalFocus } from '../../lib/modal-focus'
import {
  DEFAULT_PROJECT_EMOJI,
  MAX_NOTES_FILE_BYTES,
  MAX_PROJECT_EMOJI,
  MAX_PROJECT_INSTRUCTIONS,
  MAX_PROJECT_NAME,
  MAX_PROJECT_NOTES,
} from '../../lib/chat-projects'
import type { ProjectDraft } from '../../lib/chat-projects'
import type { ChatProject } from '../../store/chat.hooks'

const NOTES_FILE_RE = /\.(txt|md|markdown|json)$/i

export function ChatAppProjectModal(props: {
  open: () => boolean
  /** Project being edited; undefined creates a new one. */
  project: () => ChatProject | undefined
  onSave: (draft: ProjectDraft) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  return (
    <Show when={props.open()}>
      <ProjectDialog
        project={props.project()}
        onSave={props.onSave}
        onDelete={props.onDelete}
        onClose={props.onClose}
      />
    </Show>
  )
}

function ProjectDialog(props: {
  project: ChatProject | undefined
  onSave: (draft: ProjectDraft) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  let dialogEl: HTMLDivElement | undefined
  const initial = untrack(() => props.project)
  const [name, setName] = createSignal(initial?.name ?? '')
  const [emoji, setEmoji] = createSignal(
    initial?.emoji ?? DEFAULT_PROJECT_EMOJI,
  )
  const [instructions, setInstructions] = createSignal(
    initial?.instructions ?? '',
  )
  const [notes, setNotes] = createSignal(initial?.notes ?? '')
  const [error, setError] = createSignal<string | null>(null)
  const [confirmDelete, setConfirmDelete] = createSignal(false)
  onSettled(() => bindModalFocus(dialogEl))

  async function addFromFile(file: File | undefined) {
    if (!file) return
    if (!NOTES_FILE_RE.test(file.name)) {
      setError('Use a .txt, .md or .json file.')
      return
    }
    if (file.size > MAX_NOTES_FILE_BYTES) {
      setError('File is larger than 200 KB.')
      return
    }
    const text = (await file.text()).trim()
    const joined = notes().trim() ? `${notes().trimEnd()}\n\n${text}` : text
    setNotes(joined.slice(0, MAX_PROJECT_NOTES))
    setError(
      joined.length > MAX_PROJECT_NOTES
        ? `Notes were cut to ${MAX_PROJECT_NOTES.toLocaleString()} characters.`
        : null,
    )
  }

  function submit() {
    if (!name().trim()) {
      setError('Give the project a name.')
      return
    }
    props.onSave({
      name: name(),
      emoji: emoji(),
      instructions: instructions(),
      notes: notes(),
    })
  }

  const field =
    'border-input bg-background w-full min-w-0 rounded-lg border px-2 py-1.5 text-sm'

  return (
    <div
      class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/50"
        aria-label="Close project"
        onClick={props.onClose}
      />
      <div
        ref={(el) => {
          dialogEl = el
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        tabindex="-1"
        class="border-border bg-card text-card-foreground relative z-10 flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-xl border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-xl"
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
              id="project-modal-title"
              class="text-foreground text-base font-semibold tracking-tight"
            >
              {props.project ? 'Edit project' : 'New project'}
            </h2>
            <p class="text-muted-foreground text-xs">
              Chats in a project share its instructions and reference notes.
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

        <form
          class="flex min-w-0 flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div class="flex gap-2">
            <label class="flex w-16 shrink-0 flex-col gap-1 text-xs font-medium">
              Emoji
              <input
                class={`${field} text-center`}
                aria-label="Emoji"
                maxlength={MAX_PROJECT_EMOJI}
                value={emoji()}
                onInput={(e) => setEmoji(e.currentTarget.value)}
              />
            </label>
            <label class="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium">
              Name
              <input
                class={field}
                aria-label="Project name"
                maxlength={MAX_PROJECT_NAME}
                placeholder="e.g. Thesis research"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </label>
          </div>
          <label class="flex flex-col gap-1 text-xs font-medium">
            Instructions
            <textarea
              class={field}
              aria-label="Project instructions"
              rows={3}
              maxlength={MAX_PROJECT_INSTRUCTIONS}
              placeholder="How the assistant should behave in this project"
              value={instructions()}
              onInput={(e) => setInstructions(e.currentTarget.value)}
            />
          </label>
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between gap-2 text-xs font-medium">
              <label for="project-notes">Reference notes</label>
              <label class="border-border hover:bg-muted cursor-pointer rounded-md border px-2 py-0.5 font-normal">
                Add from file
                <input
                  type="file"
                  class="sr-only"
                  aria-label="Add notes from file"
                  accept=".txt,.md,.markdown,.json,text/plain,text/markdown,application/json"
                  onChange={(e) => {
                    const input = e.currentTarget
                    void addFromFile(input.files?.[0]).finally(() => {
                      input.value = ''
                    })
                  }}
                />
              </label>
            </div>
            <textarea
              id="project-notes"
              class={`${field} font-mono text-xs`}
              rows={6}
              maxlength={MAX_PROJECT_NOTES}
              placeholder="Paste background material sent with every chat in this project"
              value={notes()}
              onInput={(e) => setNotes(e.currentTarget.value)}
            />
            <span class="text-muted-foreground text-right text-[11px] tabular-nums">
              {notes().length.toLocaleString()} /{' '}
              {MAX_PROJECT_NOTES.toLocaleString()}
            </span>
          </div>
          <Show when={error()} keyed>
            {(msg) => (
              <p class="text-destructive text-xs" role="alert">
                {msg}
              </p>
            )}
          </Show>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <Show when={props.project} keyed>
              {(p) => (
                <Show
                  when={confirmDelete()}
                  fallback={
                    <button
                      type="button"
                      class="text-destructive hover:bg-muted rounded-lg px-2 py-1.5 text-sm"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete project
                    </button>
                  }
                >
                  <button
                    type="button"
                    class="text-destructive hover:bg-muted rounded-lg px-2 py-1.5 text-sm font-medium"
                    title="Chats are kept and moved out of the project"
                    onClick={() => props.onDelete(p.id)}
                  >
                    Confirm delete (keeps chats)
                  </button>
                </Show>
              )}
            </Show>
            <button
              type="submit"
              class="bg-primary text-primary-foreground ml-auto rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              {props.project ? 'Save' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
