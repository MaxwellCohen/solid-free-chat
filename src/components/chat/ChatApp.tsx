import {
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
import { loadChatState, startChatPersistence } from '../../lib/chat-persistence'
import type { ChatModelOption } from '../../lib/chat-models'
import { DEFAULT_CHAT_MODEL } from '../../lib/chat-models'
import { getFreeChatModels } from '../../server/openrouter-fns'
import { useChatActions, useChatStore } from '../../store/chat.hooks'
import { chatSelectors, chatStore } from '../../store/chat.store'
import ChatThread from './ChatThread'
import {
  OPENROUTER_API_KEY_LS_KEY,
  SIDEBAR_OPEN_LS_KEY,
  SKIP_MODEL_LIST_SSR,
} from './chat-app-constants'
import { ChatAppModelToolbar } from './ChatAppModelToolbar'
import { ChatAppOpenRouterModal } from './ChatAppOpenRouterModal'
import { ChatAppSidebar } from './ChatAppSidebar'
import { ChatAppSystemPromptModal } from './ChatAppSystemPromptModal'

export default function ChatApp() {
  const actions = useChatActions()
  const currentConversationId = useChatStore((state) => state.currentConversationId)
  const currentConversationSystemMessage = useChatStore((state) => {
    const id = state.currentConversationId
    return id ? state.conversationsById[id].customSystemMessage : ''
  })
  const conversations = useChatStore((state) =>
    chatSelectors.conversationList(state),
  )
  const savedSystemPrompts = useChatStore((state) => state.savedSystemPrompts)
  const selectedModel = useChatStore((state) => state.selectedModel)
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
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [currentConversationLoading, setCurrentConversationLoading] =
    createSignal(false)
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
      if (localStorage.getItem(SIDEBAR_OPEN_LS_KEY) === '1') {
        setSidebarOpen(true)
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
    setCurrentConversationLoading(false)
    actions.setCurrentConversationId(id)
    collapseSidebarIfNarrow()
  }

  function createConversationFromSidebar() {
    setCurrentConversationLoading(false)
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

  const modelListEmpty = createMemo(() => {
    if (modelList.loading) return false
    if (modelList.error) return false
    const list = modelList()
    return list !== undefined && list.length === 0
  })

  return (
    <div class="flex h-full min-h-0 w-full max-w-[100vw] flex-col overflow-hidden sm:flex-row">
      <ChatAppSidebar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={selectConversation}
        onCreateConversation={createConversationFromSidebar}
        onDeleteConversation={(id) => actions.deleteConversation(id)}
        openRouterApiKeyApplied={openRouterApiKeyApplied}
        openRouterApiKeyModalOpen={openRouterApiKeyModalOpen}
        onOpenOpenRouterModal={openOpenRouterApiKeyModal}
        mobileSidebarPanelOpen={mobileSidebarPanelOpen}
        onToggleMobileSidebarPanel={() =>
          setMobileSidebarPanelOpen((open) => !open)
        }
        systemMessagePreview={systemMessagePreview}
        systemDraft={systemDraft}
        onOpenSystemPromptLibrary={() => setSystemPromptLibraryOpen(true)}
      />

      <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ChatAppModelToolbar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          selectedModel={selectedModel}
          selectDisabled={selectDisabled}
          selectOptions={selectOptions}
          modelListLoading={() => modelList.loading}
          modelListError={() => modelList.error}
          modelListEmpty={modelListEmpty}
          isStreaming={currentConversationLoading}
          onModelChange={(id) => actions.setSelectedModel(id)}
        />

        <Show when={currentConversationId()} keyed>
          {(id) => {
            // Read messages for this id atomically at mount (avoids stale untrack).
            const initialMessages =
              chatStore.state.messagesByConversationId[id] ?? []
            return (
              <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <ChatThread
                  conversationId={id}
                  initialMessages={initialMessages}
                  inputModalities={selectedModelMeta()?.inputModalities}
                  openRouterApiKey={openRouterApiKeyApplied()}
                  onLoadingChange={setCurrentConversationLoading}
                />
              </div>
            )
          }}
        </Show>

        <ChatAppOpenRouterModal
          open={openRouterApiKeyModalOpen}
          draft={openRouterApiKeyDraft}
          onDraftInput={setOpenRouterApiKeyDraft}
          onClose={closeOpenRouterApiKeyModal}
          onSave={saveOpenRouterApiKeyFromModal}
        />

        <ChatAppSystemPromptModal
          open={systemPromptLibraryOpen}
          currentConversationId={currentConversationId}
          systemDraft={systemDraft}
          onSystemMessageInput={onSystemMessageInput}
          onSystemMessageBlur={onSystemMessageBlur}
          loadPromptSelectKey={loadPromptSelectKey}
          onChooseSavedPromptId={(pid) => {
            const p = savedSystemPrompts().find((x) => x.id === pid)
            if (p) {
              setSystemDraft(p.text)
              persistSystemDraft(p.text)
            }
            setLoadPromptSelectKey((k) => k + 1)
          }}
          savedSystemPrompts={savedSystemPrompts}
          savePromptName={savePromptName}
          onSavePromptNameInput={setSavePromptName}
          onSaveCurrentToLibrary={() => {
            actions.addSavedSystemPrompt(savePromptName(), systemDraft())
            setSavePromptName('')
          }}
          onDeleteSavedSystemPrompt={(id) =>
            actions.deleteSavedSystemPrompt(id)
          }
          onClose={() => setSystemPromptLibraryOpen(false)}
        />
      </section>
    </div>
  )
}
