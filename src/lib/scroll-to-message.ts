const EVENT = 'sfc:scroll-to-message'
let pending: string | null = null

/** Ask the mounted (or about-to-mount) message list to scroll to a message. */
export function requestScrollToMessage(messageId: string) {
  pending = messageId
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: messageId }))
  }
}

export function peekPendingScroll(): boolean {
  return pending !== null
}

export function takePendingScroll(): string | null {
  const id = pending
  pending = null
  return id
}

/** Subscribes to scroll requests; consumes any pending one immediately. */
export function onScrollToMessage(fn: (messageId: string) => void): () => void {
  const handler = (e: Event) => {
    pending = null
    fn((e as CustomEvent<string>).detail)
  }
  window.addEventListener(EVENT, handler)
  const queued = takePendingScroll()
  if (queued) fn(queued)
  return () => window.removeEventListener(EVENT, handler)
}
