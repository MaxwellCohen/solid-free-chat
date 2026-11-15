import { Show, createSignal, onSettled } from 'solid-js'

export default function OfflineBanner() {
  const [offline, setOffline] = createSignal(false)

  onSettled(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  })

  return (
    <Show when={offline()}>
      <div
        role="status"
        data-testid="offline-banner"
        class="border-border bg-muted text-muted-foreground border-b px-3 py-1 text-center text-xs"
      >
        You’re offline. Saved chats are available; sending messages needs a
        connection.
      </div>
    </Show>
  )
}
