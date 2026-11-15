import { chatStore } from '../../store/chat.store'
import { createBackup } from '../../lib/chat-backup'

/** Fallback for `<Errored>`: lets users retry or save their data before reloading. */
export function ChatErrorFallback(props: {
  error: unknown
  reset: () => void
  label?: string
}) {
  async function exportChats() {
    const text = await createBackup(chatStore.state)
    const url = URL.createObjectURL(
      new Blob([text], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'solid-free-chat-backup.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      role="alert"
      class="border-border bg-card text-card-foreground m-4 rounded-xl border p-4 text-sm"
    >
      <p class="mb-1 font-medium">{props.label ?? 'Something went wrong.'}</p>
      <p class="text-muted-foreground mb-3 break-words">
        {props.error instanceof Error
          ? props.error.message
          : String(props.error)}
      </p>
      <div class="flex gap-2">
        <button
          type="button"
          class="bg-primary text-primary-foreground rounded-md px-3 py-1.5"
          onClick={() => props.reset()}
        >
          Retry
        </button>
        <button
          type="button"
          class="border-border rounded-md border px-3 py-1.5"
          onClick={() => void exportChats()}
        >
          Export chats
        </button>
      </div>
    </div>
  )
}
