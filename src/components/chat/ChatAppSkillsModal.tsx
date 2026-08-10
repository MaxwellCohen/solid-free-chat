import { For, Show, createEffect, createSignal } from 'solid-js'
import type { ChatSkill } from '../../store/chat.hooks'
import { bindModalFocus } from '../../lib/modal-focus'

export function ChatAppSkillsModal(props: {
  open: () => boolean
  currentConversationId: () => string | null
  skills: () => ChatSkill[]
  attachedSkillIds: () => string[]
  onToggleSkill: (skillId: string) => void
  onAddSkill: (name: string, instructions: string) => void
  onUpdateSkill: (
    skillId: string,
    patch: { name?: string; instructions?: string },
  ) => void
  onDeleteSkill: (skillId: string) => void
  onClose: () => void
}) {
  return (
    <Show when={props.open() && props.currentConversationId()}>
      <SkillsModalDialog
        skills={props.skills}
        attachedSkillIds={props.attachedSkillIds}
        onToggleSkill={props.onToggleSkill}
        onAddSkill={props.onAddSkill}
        onUpdateSkill={props.onUpdateSkill}
        onDeleteSkill={props.onDeleteSkill}
        onClose={props.onClose}
      />
    </Show>
  )
}

function SkillsModalDialog(props: {
  skills: () => ChatSkill[]
  attachedSkillIds: () => string[]
  onToggleSkill: (skillId: string) => void
  onAddSkill: (name: string, instructions: string) => void
  onUpdateSkill: (
    skillId: string,
    patch: { name?: string; instructions?: string },
  ) => void
  onDeleteSkill: (skillId: string) => void
  onClose: () => void
}) {
  let dialogEl: HTMLDivElement | undefined
  const [newName, setNewName] = createSignal('')
  const [newInstructions, setNewInstructions] = createSignal('')
  const [editingId, setEditingId] = createSignal<string | null>(null)
  const [editName, setEditName] = createSignal('')
  const [editInstructions, setEditInstructions] = createSignal('')

  createEffect(() => {
    bindModalFocus(dialogEl)
  })

  function startEdit(skill: ChatSkill) {
    setEditingId(skill.id)
    setEditName(skill.name)
    setEditInstructions(skill.instructions)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditInstructions('')
  }

  function saveEdit() {
    const id = editingId()
    if (!id) return
    props.onUpdateSkill(id, {
      name: editName(),
      instructions: editInstructions(),
    })
    cancelEdit()
  }

  function createSkill() {
    props.onAddSkill(newName(), newInstructions())
    setNewName('')
    setNewInstructions('')
  }

  const attachedSet = () => new Set(props.attachedSkillIds())

  return (
    <div
      class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/50"
        aria-label="Close skills editor"
        onClick={props.onClose}
      />
      <div
        ref={(el) => {
          dialogEl = el
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skills-modal-title"
        tabindex="-1"
        class="border-border bg-card text-card-foreground relative z-10 flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col gap-4 rounded-t-xl border p-4 shadow-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-start justify-between gap-3">
          <h2
            id="skills-modal-title"
            class="text-foreground text-base font-semibold tracking-tight"
          >
            Skills
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
          Attach skills to this chat. Their instructions are composed with a
          baseline system message on every reply.
        </p>
        <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <section class="space-y-2">
            <h3 class="text-foreground text-xs font-semibold">This chat</h3>
            <Show
              when={props.skills().length > 0}
              fallback={
                <p class="text-muted-foreground text-xs italic">
                  No skills yet. Create one below.
                </p>
              }
            >
              <ul class="space-y-2">
                <For each={props.skills()}>
                  {(skill) => (
                    <li class="border-border rounded-lg border px-3 py-2">
                      <Show
                        when={editingId() === skill.id}
                        fallback={
                          <div class="flex flex-col gap-2">
                            <label class="flex items-start gap-2 text-sm">
                              <input
                                type="checkbox"
                                class="border-input mt-0.5 size-4 shrink-0 rounded"
                                checked={attachedSet().has(skill.id)}
                                onChange={() => props.onToggleSkill(skill.id)}
                              />
                              <span class="min-w-0 flex-1">
                                <span class="text-foreground font-medium">
                                  {skill.name}
                                </span>
                                <span class="text-muted-foreground mt-0.5 block line-clamp-2 text-xs whitespace-pre-wrap">
                                  {skill.instructions}
                                </span>
                              </span>
                            </label>
                            <div class="flex justify-end gap-2">
                              <button
                                type="button"
                                class="text-muted-foreground hover:bg-muted hover:text-foreground rounded px-2 py-0.5 text-xs"
                                onClick={() => startEdit(skill)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                class="text-destructive hover:bg-destructive/10 rounded px-2 py-0.5 text-xs"
                                onClick={() => props.onDeleteSkill(skill.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        }
                      >
                        <div class="flex flex-col gap-2">
                          <label class="text-muted-foreground flex flex-col gap-1 text-xs">
                            <span class="font-medium">Name</span>
                            <input
                              type="text"
                              class="border-input bg-background rounded-lg border px-2 py-1.5 text-sm"
                              value={editName()}
                              maxLength={120}
                              onInput={(e) => setEditName(e.currentTarget.value)}
                            />
                          </label>
                          <label class="text-muted-foreground flex flex-col gap-1 text-xs">
                            <span class="font-medium">Instructions</span>
                            <textarea
                              class="border-input bg-background max-h-32 min-h-20 w-full resize-y rounded-lg border px-2 py-1.5 text-sm"
                              rows={3}
                              value={editInstructions()}
                              onInput={(e) =>
                                setEditInstructions(e.currentTarget.value)
                              }
                            />
                          </label>
                          <div class="flex justify-end gap-2">
                            <button
                              type="button"
                              class="text-muted-foreground hover:bg-muted rounded px-2 py-0.5 text-xs"
                              onClick={cancelEdit}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              class="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-2 py-0.5 text-xs font-medium disabled:opacity-50"
                              disabled={
                                !editName().trim() || !editInstructions().trim()
                              }
                              onClick={saveEdit}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>

          <section class="border-border space-y-2 border-t pt-3">
            <h3 class="text-foreground text-xs font-semibold">New skill</h3>
            <label class="text-muted-foreground flex flex-col gap-1.5 text-xs">
              <span class="font-medium">Name</span>
              <input
                type="text"
                class="border-input bg-background placeholder:text-muted-foreground rounded-lg border px-2 py-1.5 text-sm"
                placeholder="e.g. Concise replies"
                value={newName()}
                maxLength={120}
                onInput={(e) => setNewName(e.currentTarget.value)}
              />
            </label>
            <label class="text-muted-foreground flex flex-col gap-1.5 text-xs">
              <span class="font-medium">Instructions</span>
              <textarea
                class="border-input bg-background placeholder:text-muted-foreground max-h-32 min-h-20 w-full resize-y rounded-lg border px-2 py-1.5 text-sm"
                rows={3}
                placeholder="Behavior for the model when this skill is attached…"
                value={newInstructions()}
                onInput={(e) => setNewInstructions(e.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3 py-1.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
              disabled={!newName().trim() || !newInstructions().trim()}
              onClick={createSkill}
            >
              Add skill
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
