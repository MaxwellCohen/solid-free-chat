import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from 'solid-js'
import { isServer } from 'solid-js/web'
import {
  ChevronRight,
  KeyRound,
  PanelLeft,
  PanelLeftClose,
  SquarePen,
} from 'lucide-solid'
import { loadChatState, startChatPersistence } from '../../lib/chat-persistence'
import type { ChatModelOption } from '../../lib/chat-models'
import { DEFAULT_CHAT_MODEL } from '../../lib/chat-models'
import { getFreeChatModels } from '../../server/openrouter-fns'
import { useChatActions, useChatStore } from '../../store/chat.hooks'
import { NEW_CHAT_TITLE } from '../../store/chat.store'
import ChatThread from './ChatThread'

const SIDEBAR_OPEN_LS_KEY = 'solid-free-chat-sidebar-open'
const OPENROUTER_API_KEY_LS_KEY = 'solid-free-chat-openrouter-api-key'

/** Avoid calling OpenRouter during SSR (no localStorage yet; Worker may lack env). Client fetches after hydration. */
const SKIP_MODEL_LIST_SSR = '__skip_model_list_ssr__'

export default function ChatApp() {
  const actions = useChatActions()
  const currentConversationId = useChatStore((state) => state.currentConversationId)
  const currentConversationMessages = useChatStore((state) => {
    const id = state.currentConversationId
    return id ? (state.messagesByConversationId[id] ?? []) : []
  })
  const currentConversationSystemMessage = useChatStore((state) => {
    const id = state.currentConversationId
    return id ? (state.conversationsById[id]?.customSystemMessage ?? '') : ''
  })
  const conversations = useChatStore((state) =>
    state.conversationOrder
      .map((id) => state.conversationsById[id])
      .filter((conversation) => conversation != null),
  )
  const savedSystemPrompts = useChatStore((state) => state.savedSystemPrompts)
  const selectedModel = useChatStore((state) => state.selectedModel)
  const initialMessagesForActiveConversation = createMemo(() => {
    currentConversationId()
    return untrack(currentConversationMessages)
  })
  /** Input value while typing (does not trigger model refetch). */
  const [openRouterApiKeyDraft, setOpenRouterApiKeyDraft] = createSignal('')
  /** Last committed value (blur): sent to server fns for OpenRouter; optional `.env` fallback for local dev only. */
  const [openRouterApiKeyApplied, setOpenRouterApiKeyApplied] = createSignal('')
  const [modelList] = createResource(
    () => (isServer ? SKIP_MODEL_LIST_SSR : openRouterApiKeyApplied()),
    async (applied) => {
      if (applied === SKIP_MODEL_LIST_SSR) {
        return []
      }
      const t = applied.trim()
      return getFreeChatModels({
        data: { apiKey: t || undefined },
        ...(t
          ? { headers: { Authorization: `Bearer ${t}` } }
          : {}),
      })
    },
  )
  const [sidebarOpen, setSidebarOpen] = createSignal(true)
  const [systemDraft, setSystemDraft] = createSignal('')
  const [loadPromptSelectKey, setLoadPromptSelectKey] = createSignal(0)
  const [savePromptName, setSavePromptName] = createSignal('')
  const [systemPromptLibraryOpen, setSystemPromptLibraryOpen] =
    createSignal(false)
  const [openRouterApiKeyModalOpen, setOpenRouterApiKeyModalOpen] =
    createSignal(false)
  /** Below `sm`: one panel for system message + conversation list. */
  const [mobileSidebarPanelOpen, setMobileSidebarPanelOpen] = createSignal(true)

  let saveSystemTimer: ReturnType<typeof setTimeout> | null = null

  createEffect(() => {
    currentConversationId()
    setSystemDraft(untrack(currentConversationSystemMessage))
  })

  onCleanup(() => {
    if (saveSystemTimer !== null) {
      clearTimeout(saveSystemTimer)
      saveSystemTimer = null
    }
  })

  function persistSystemDraft(value: string) {
    const id = currentConversationId() as string
    actions.setConversationCustomSystemMessage(id, value)
  }

  function onSystemMessageInput(
    e: Event & { currentTarget: HTMLTextAreaElement },
  ) {
    const v = e.currentTarget.value
    setSystemDraft(v)
    if (saveSystemTimer !== null) clearTimeout(saveSystemTimer)
    saveSystemTimer = setTimeout(() => {
      persistSystemDraft(v)
      saveSystemTimer = null
    }, 300)
  }

  function onSystemMessageBlur() {
    if (saveSystemTimer !== null) {
      clearTimeout(saveSystemTimer)
      saveSystemTimer = null
    }
    persistSystemDraft(systemDraft())
  }

  createEffect(() => {
    const list = modelList()
    if (!list?.length) return
    const ids = new Set(list.map((m) => m.id))
    if (!ids.has(selectedModel())) {
      actions.setSelectedModel(list[0].id)
    }
  })

  onMount(() => {
    try {
      if (localStorage.getItem(SIDEBAR_OPEN_LS_KEY) === '0') {
        setSidebarOpen(false)
      }
    } catch {
      /* ignore */
    }
    try {
      const stored = localStorage.getItem(OPENROUTER_API_KEY_LS_KEY)
      if (stored) {
        setOpenRouterApiKeyDraft(stored)
        setOpenRouterApiKeyApplied(stored)
      }
    } catch {
      /* ignore */
    }
    const saved = loadChatState()
    if (saved) {
      actions.hydrate(saved)
    }
    actions.ensureDefaultConversation()
    const stopPersist = startChatPersistence()
    onCleanup(stopPersist)
  })

  /** Minimal list when the server could not load models — user can still pick the free router. */
  const modelListErrorFallback = (): ChatModelOption[] => [
    {
      id: DEFAULT_CHAT_MODEL,
      name: 'Free Models Router (offline list)',
      inputModalities: ['text'],
    },
  ]

  /** Options from API, plus the current selection if missing (so `<select>` always has a matching `<option>`). */
  const selectOptions = createMemo(() => {
    if (modelList.loading) return []
    if (modelList.error) {
      const id = selectedModel()
      const fb = modelListErrorFallback()
      if (!fb.some((o) => o.id === id)) {
        return [
          ...fb,
          {
            id,
            name:
              id === DEFAULT_CHAT_MODEL
                ? `${id} (fallback)`
                : `${id} (saved)`,
            inputModalities: id === DEFAULT_CHAT_MODEL ? ['text'] : undefined,
          },
        ]
      }
      return fb
    }
    const fromApi = modelList() ?? []
    const id = selectedModel()
    if (fromApi.some((o) => o.id === id)) return fromApi
    return [
      ...fromApi,
      {
        id,
        name:
          id === DEFAULT_CHAT_MODEL
            ? `${id} (fallback)`
            : `${id} (saved; not in free list)`,
        inputModalities: id === DEFAULT_CHAT_MODEL ? ['text'] : undefined,
      },
    ]
  })

  const selectDisabled = () => {
    if (modelList.loading) return true
    return selectOptions().length === 0
  }

  function persistOpenRouterApiKey(raw: string) {
    const v = raw.trim()
    setOpenRouterApiKeyDraft(v)
    setOpenRouterApiKeyApplied(v)
    try {
      if (v) localStorage.setItem(OPENROUTER_API_KEY_LS_KEY, v)
      else localStorage.removeItem(OPENROUTER_API_KEY_LS_KEY)
    } catch {
      /* ignore quota / private mode */
    }
  }

  function openOpenRouterApiKeyModal() {
    setOpenRouterApiKeyDraft(openRouterApiKeyApplied())
    setOpenRouterApiKeyModalOpen(true)
  }

  function closeOpenRouterApiKeyModal() {
    setOpenRouterApiKeyDraft(openRouterApiKeyApplied())
    setOpenRouterApiKeyModalOpen(false)
  }

  function saveOpenRouterApiKeyFromModal() {
    persistOpenRouterApiKey(openRouterApiKeyDraft())
    setOpenRouterApiKeyModalOpen(false)
  }

  const selectedModelMeta = createMemo((): ChatModelOption | undefined => {
    const id = selectedModel()
    return selectOptions().find((m) => m.id === id)
  })

  const systemMessagePreview = createMemo(() => {
    const t = systemDraft().trim()
    if (!t) return 'Not set'
    const oneLine = t.replace(/\s+/g, ' ')
    return oneLine.length > 72 ? `${oneLine.slice(0, 72)}…` : oneLine
  })

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open
      try {
        localStorage.setItem(SIDEBAR_OPEN_LS_KEY, next ? '1' : '0')
      } catch {
        /* ignore quota / private mode */
      }
      return next
    })
  }

  function collapseSidebarIfNarrow() {
    if (typeof window === 'undefined') return
    if (!window.matchMedia('(max-width: 639.98px)').matches) return
    setSidebarOpen(false)
    try {
      localStorage.setItem(SIDEBAR_OPEN_LS_KEY, '0')
    } catch {
      /* ignore */
    }
  }

  function selectConversation(id: string) {
    actions.setCurrentConversationId(id)
    collapseSidebarIfNarrow()
  }

  function createConversationFromSidebar() {
    actions.createConversation()
    collapseSidebarIfNarrow()
  }

  createEffect(() => {
    if (!systemPromptLibraryOpen()) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSystemPromptLibraryOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    onCleanup(() => window.removeEventListener('keydown', onKeyDown))
  })

  createEffect(() => {
    if (!openRouterApiKeyModalOpen()) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOpenRouterApiKeyModal()
    }
    window.addEventListener('keydown', onKeyDown)
    onCleanup(() => window.removeEventListener('keydown', onKeyDown))
  })

  return (
    <div class="flex h-[calc(100dvh-3.75rem)] min-h-[calc(100dvh-3.75rem)] w-full max-w-[100vw] flex-col sm:flex-row">
      <aside
        id="chat-sidebar"
        class="border-border flex shrink-0 flex-col border-b transition-[width] duration-200 ease-out sm:border-r sm:border-b-0"
        classList={{
          'flex w-full min-h-0 max-h-[min(55dvh,24rem)] flex-col overflow-x-hidden overflow-y-auto sm:max-h-none sm:overflow-hidden sm:w-64 md:w-72':
            sidebarOpen(),
          'hidden sm:flex sm:h-full sm:w-12 sm:min-w-12 sm:max-h-none sm:flex-col':
            !sidebarOpen(),
        }}
      >
        <Show
          when={sidebarOpen()}
          fallback={
            <div class="flex flex-col items-center gap-2 py-3 sm:flex-1 sm:py-2">
              <button
                type="button"
                class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-2"
                onClick={toggleSidebar}
                title="Show chat list"
                aria-label="Show chat list"
                aria-expanded={false}
                aria-controls="chat-sidebar"
              >
                <PanelLeft class="size-5 shrink-0" aria-hidden={true} />
              </button>
              <button
                type="button"
                class="text-muted-foreground hover:bg-muted hover:text-foreground relative rounded-lg p-2"
                classList={{
                  'ring-primary/50 ring-2 ring-offset-2 ring-offset-background':
                    openRouterApiKeyApplied().trim().length > 0,
                }}
                onClick={openOpenRouterApiKeyModal}
                title="OpenRouter API key"
                aria-label="OpenRouter API key"
                aria-haspopup="dialog"
                aria-expanded={openRouterApiKeyModalOpen()}
              >
                <KeyRound class="size-5 shrink-0" aria-hidden={true} />
              </button>
            </div>
          }
        >
          <div class="border-border order-1 flex shrink-0 items-center border-b px-3 py-2">
            <button
              type="button"
              class="text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded-lg p-1.5"
              onClick={toggleSidebar}
              title="Hide chat list"
              aria-label="Hide chat list"
              aria-expanded={true}
              aria-controls="chat-sidebar"
            >
              <PanelLeftClose class="size-4 shrink-0" aria-hidden={true} />
            </button>
          </div>
          <div class="order-2 flex min-h-0 flex-1 flex-col sm:order-3">
            <div class="border-border flex shrink-0 items-center justify-between gap-2 border-b p-3 sm:hidden">
              <button
                type="button"
                class="hover:bg-muted/50 -mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left"
                onClick={() =>
                  setMobileSidebarPanelOpen((open) => !open)
                }
                aria-expanded={mobileSidebarPanelOpen()}
                aria-controls="sidebar-panel-content"
                id="sidebar-panel-disclosure"
              >
                <ChevronRight
                  class="text-muted-foreground size-4 shrink-0 transition-transform"
                  classList={{
                    'rotate-90': mobileSidebarPanelOpen(),
                  }}
                  aria-hidden={true}
                />
                <span class="text-muted-foreground truncate text-xs font-semibold tracking-wide uppercase">
                  Chats & settings
                </span>
              </button>
              <button
                type="button"
                class="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                onClick={createConversationFromSidebar}
              >
                New
              </button>
            </div>
            <div
              id="sidebar-panel-content"
              class="flex min-h-0 flex-1 flex-col"
              classList={{
                'max-sm:hidden': !mobileSidebarPanelOpen(),
              }}
            >
              <div class="flex min-h-0 flex-1 flex-col">
                <div class="order-1 flex min-h-0 flex-1 flex-col sm:order-2">
                  <div class="hidden shrink-0 items-center justify-between gap-2 p-3 sm:flex">
                    <h2 class="text-muted-foreground min-w-0 flex-1 truncate text-xs font-semibold tracking-wide uppercase">
                      Chats
                    </h2>
                    <button
                      type="button"
                      class="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                      onClick={createConversationFromSidebar}
                    >
                      New
                    </button>
                  </div>
                  <nav
                    id="sidebar-conversations-nav"
                    class="min-h-0 flex-1 overflow-y-auto"
                    aria-label="Conversations"
                  >
                    <ul class="space-y-0.5 px-2 pb-3">
                      <For each={conversations()}>
                        {(c) => (
                          <li class="flex items-stretch gap-0.5">
                            <button
                              type="button"
                              class="hover:bg-muted min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm"
                              classList={{
                                'bg-muted font-medium':
                                  currentConversationId() === c.id,
                              }}
                              onClick={() => selectConversation(c.id)}
                            >
                              <span class="truncate">
                                {c.title || NEW_CHAT_TITLE}
                              </span>
                            </button>
                            <button
                              type="button"
                              title="Delete chat"
                              class="text-muted-foreground hover:text-destructive hover:bg-muted shrink-0 rounded-lg px-2 text-sm"
                              onClick={() => actions.deleteConversation(c.id)}
                            >
                              ×
                            </button>
                          </li>
                        )}
                      </For>
                    </ul>
                  </nav>
                </div>
                <div class="border-border order-2 shrink-0 space-y-2 border-b px-2 py-2 sm:order-1">
                  <button
                    type="button"
                    class="border-border text-muted-foreground hover:bg-muted hover:text-foreground inline-flex w-full items-center justify-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-medium"
                    onClick={openOpenRouterApiKeyModal}
                    aria-haspopup="dialog"
                    aria-expanded={openRouterApiKeyModalOpen()}
                  >
                    <KeyRound class="size-3.5 shrink-0" aria-hidden={true} />
                    <span class="whitespace-nowrap">API key</span>
                    <Show when={openRouterApiKeyApplied().trim().length > 0}>
                      <span
                        class="bg-primary/15 text-primary rounded px-1.5 py-px text-[10px] font-medium"
                        title="A browser-stored key is in use"
                      >
                        Set
                      </span>
                    </Show>
                  </button>
                  <Show when={currentConversationId()}>
                    <details class="group/sys border-border bg-card/30 rounded-lg border">
                      <summary class="text-muted-foreground hover:bg-muted/40 flex cursor-pointer list-none items-start gap-2 px-2 py-1.5 text-[11px] leading-snug [&::-webkit-details-marker]:hidden">
                        <ChevronRight
                          class="text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform group-open/sys:rotate-90"
                          aria-hidden={true}
                        />
                        <span class="min-w-0 flex-1">
                          <span class="text-foreground font-semibold">
                            System message
                          </span>
                          <span class="text-muted-foreground/80 hidden md:block font-normal">
                            (this chat only; sent with every reply)
                          </span>
                          <span class="text-muted-foreground mt-0.5 block truncate font-normal">
                            {systemMessagePreview()}
                          </span>
                        </span>
                      </summary>
                      <div
                        class="border-border border-t px-2 py-1.5"
                        role="region"
                        aria-label="System message (read-only)"
                      >
                        <Show
                          when={systemDraft().trim()}
                          fallback={
                            <p class="text-muted-foreground m-0 text-xs italic">
                              No system message for this chat.
                            </p>
                          }
                        >
                          <pre class="text-foreground m-0 max-h-32 overflow-y-auto font-sans text-xs whitespace-pre-wrap wrap-break-word">
                            {systemDraft()}
                          </pre>
                        </Show>
                      </div>
                    </details>
                    <button
                      type="button"
                      class="bg-secondary text-secondary-foreground hover:bg-secondary/90 inline-flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium"
                      onClick={() => setSystemPromptLibraryOpen(true)}
                      aria-haspopup="dialog"
                    >
                      <SquarePen class="size-3.5 shrink-0" aria-hidden={true} />
                      Edit system prompt
                    </button>
                  </Show>
                </div>
              </div>
            </div>
          </div>
        </Show>
      </aside>

      <section class="flex min-h-0 min-w-0 flex-1 flex-col">
        <header class="border-border flex shrink-0 flex-col gap-3 border-b px-3 py-3 sm:px-6">
          <div class="flex flex-wrap items-center gap-3">
            <Show when={!sidebarOpen()}>
              <button
                type="button"
                class="text-muted-foreground bg-muted/60 hover:bg-muted inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium sm:hidden"
                onClick={toggleSidebar}
                aria-expanded={false}
                aria-controls="chat-sidebar"
              >
                <PanelLeft class="size-4 shrink-0" aria-hidden={true} />
                Chats
              </button>
            </Show>
            <label class="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              <span class="whitespace-nowrap">Model</span>
              <select
                class="border-input bg-background min-w-48 max-w-[min(100%,24rem)] rounded-lg border px-2 py-1.5 text-sm"
                value={selectedModel()}
                disabled={selectDisabled()}
                onChange={(e) =>
                  actions.setSelectedModel(e.currentTarget.value)
                }
              >
                <Show when={modelList.loading}>
                  <option value={selectedModel()}>Loading models…</option>
                </Show>
                <Show when={!modelList.loading && modelList.error}>
                  <For each={selectOptions()}>
                    {(m) => (
                      <option value={m.id}>
                        {m.name} ({m.id})
                      </option>
                    )}
                  </For>
                </Show>
                <Show when={!modelList.loading && !modelList.error}>
                  <For each={selectOptions()}>
                    {(m) => (
                      <option value={m.id}>
                        {m.name} ({m.id})
                      </option>
                    )}
                  </For>
                </Show>
              </select>
              <Show when={modelList.error}>
                <span class="text-destructive max-w-xs text-xs">
                  {modelList.error.message}
                </span>
              </Show>
              <Show
                when={
                  !modelList.loading &&
                  !modelList.error &&
                  modelList() !== undefined &&
                  modelList()!.length === 0
                }
              >
                <span class="text-muted-foreground text-xs">
                  No free text models returned for your API key.
                </span>
              </Show>
            </label>
          </div>
        </header>

        <Show when={currentConversationId()} keyed>
          {(id) => (
            <div class="flex min-h-0 min-w-0 flex-1 flex-col">
              <ChatThread
                conversationId={id}
                initialMessages={initialMessagesForActiveConversation()}
                inputModalities={selectedModelMeta()?.inputModalities}
                openRouterApiKey={openRouterApiKeyApplied()}
              />
            </div>
          )}
        </Show>

        <Show when={openRouterApiKeyModalOpen()}>
          <div
            class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
            role="presentation"
          >
            <button
              type="button"
              class="absolute inset-0 bg-black/50"
              aria-label="Close API key dialog"
              onClick={closeOpenRouterApiKeyModal}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="openrouter-api-key-modal-title"
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
                  onClick={closeOpenRouterApiKeyModal}
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
                is set in <code class="bg-muted rounded px-1 py-px text-[10px]">.env.local</code>.
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
                  value={openRouterApiKeyDraft()}
                  onInput={(e) =>
                    setOpenRouterApiKeyDraft(e.currentTarget.value)
                  }
                />
              </label>
              <div class="flex flex-wrap justify-end gap-2 border-t border-border pt-2">
                <button
                  type="button"
                  class="border-border text-muted-foreground hover:bg-muted rounded-lg border px-3 py-1.5 text-sm font-medium"
                  onClick={closeOpenRouterApiKeyModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3 py-1.5 text-sm font-medium"
                  onClick={saveOpenRouterApiKeyFromModal}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </Show>

        <Show when={systemPromptLibraryOpen() && currentConversationId()}>
          <div
            class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
            role="presentation"
          >
            <button
              type="button"
              class="absolute inset-0 bg-black/50"
              aria-label="Close system prompt editor"
              onClick={() => setSystemPromptLibraryOpen(false)}
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
                  onClick={() => setSystemPromptLibraryOpen(false)}
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
                    value={systemDraft()}
                    onInput={onSystemMessageInput}
                    onBlur={onSystemMessageBlur}
                  />
                </label>
                <div class="border-border space-y-3 border-t pt-3">
                  <p class="text-foreground text-xs font-semibold">
                    Saved prompts
                  </p>
                  <label class="text-muted-foreground flex flex-col gap-1.5 text-xs">
                    <span class="font-medium">Load saved prompt</span>
                    <Show when={String(loadPromptSelectKey())} keyed>
                      <select
                        class="border-input bg-background rounded-lg border px-2 py-1.5 text-sm"
                        value=""
                        onChange={(e) => {
                          const pid = e.currentTarget.value
                          if (!pid) return
                          const p = savedSystemPrompts().find(
                            (x) => x.id === pid,
                          )
                          if (p) {
                            setSystemDraft(p.text)
                            persistSystemDraft(p.text)
                          }
                          setLoadPromptSelectKey((k) => k + 1)
                        }}
                      >
                        <option value="">Choose…</option>
                        <For each={savedSystemPrompts()}>
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
                        value={savePromptName()}
                        maxLength={120}
                        onInput={(e) =>
                          setSavePromptName(e.currentTarget.value)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      class="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-50"
                      disabled={
                        !savePromptName().trim() || !systemDraft().trim()
                      }
                      onClick={() => {
                        actions.addSavedSystemPrompt(
                          savePromptName(),
                          systemDraft(),
                        )
                        setSavePromptName('')
                      }}
                    >
                      Save to library
                    </button>
                  </div>
                  <Show when={savedSystemPrompts().length > 0}>
                    <div class="text-muted-foreground border-border border-t pt-3 text-xs">
                      <p class="text-foreground mb-2 font-medium">
                        Manage saved ({savedSystemPrompts().length})
                      </p>
                      <ul class="space-y-1">
                        <For each={savedSystemPrompts()}>
                          {(p) => (
                            <li class="flex items-center justify-between gap-2">
                              <span class="min-w-0 truncate" title={p.name}>
                                {p.name}
                              </span>
                              <button
                                type="button"
                                class="text-destructive hover:bg-destructive/10 shrink-0 rounded px-2 py-0.5"
                                onClick={() =>
                                  actions.deleteSavedSystemPrompt(p.id)
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
      </section>
    </div>
  )
}
