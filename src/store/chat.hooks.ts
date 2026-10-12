import { createSignal, onCleanup } from 'solid-js'
import type { ChatAppState } from './chat.store'
import { chatStore, chatActions, chatSelectors } from './chat.store'

type ReadableStore<TState> = {
  get(): TState
  subscribe(onStoreChange: (state: TState) => void): { unsubscribe(): void }
}

/**
 * Solid 2 read hook for TanStack Store.
 * `@tanstack/solid-store` still declares a Solid 1 peer range.
 */
function useSelector<TState, TSelected>(
  source: ReadableStore<TState>,
  selector: (state: TState) => TSelected,
  options?: { compare?: (previous: TSelected, next: TSelected) => boolean },
) {
  const compare = options?.compare ?? Object.is
  type Stored = Exclude<TSelected, Function>
  const [selected, setSelected] = createSignal(
    selector(source.get()) as Stored,
    {
      equals: (previous, next) => compare(previous as TSelected, next as TSelected),
    },
  )
  const subscription = source.subscribe((state) => {
    setSelected(() => selector(state) as Stored)
  })
  onCleanup(() => {
    subscription.unsubscribe()
  })
  return selected as () => TSelected
}

export type {
  ChatAppState,
  ChatConversation,
  ChatConversationWithMessages,
  ChatSkill,
  TokenUsageSnapshot,
} from './chat.store'

type EqualityFn<T> = (objA: T, objB: T) => boolean

export function useChatStore<TSelected = ChatAppState>(
  selector: (state: ChatAppState) => TSelected = (state) =>
    state as unknown as TSelected,
  options?: { equal?: EqualityFn<TSelected> },
) {
  return useSelector(chatStore, selector, {
    compare: options?.equal,
  })
}

export function useChatActions() {
  return chatActions
}

export function useChatSelectors() {
  return chatSelectors
}
