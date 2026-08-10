import {
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
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
import { ChatAppSkillsModal } from './ChatAppSkillsModal'

export default function ChatApp() {
  const actions = useChatActions()
  const currentConversationId = useChatStore((state) => state.currentConversationId)
  const conversations = useChatStore((state) =>
    chatSelectors.conversationList(state),
  )
  const skills = useChatStore((state) => state.skills)
  const attachedSkillIds = useChatStore((state) => {
    const id = state.currentConversationId
    if (!id) return [] as string[]
    return state.conversationsById[id]?.skillIds ?? []
  })
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
  const [skillsLibraryOpen, setSkillsLibraryOpen] = createSignal(false)
  const [openRouterApiKeyModalOpen, setOpenRouterApiKeyModalOpen] =
    createSignal(false)
  /** Below `sm`: one panel for skills + conversation list. */
  const [mobileSidebarPanelOpen, setMobileSidebarPanelOpen] = createSignal(true)

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

  const attachedSkillNames = createMemo(() => {
    const ids = attachedSkillIds()
    if (ids.length === 0) return [] as string[]
    const byId = new Map(skills().map((skill) => [skill.id, skill.name]))
    return ids
      .map((id) => byId.get(id))
      .filter((name): name is string => typeof name === 'string')
  })

  const skillsPreview = createMemo(() => {
    const names = attachedSkillNames()
    if (names.length === 0) return 'Baseline only'
    const joined = names.join(', ')
    return joined.length > 72 ? `${joined.slice(0, 72)}…` : joined
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
    if (!skillsLibraryOpen()) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSkillsLibraryOpen(false)
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
        skillsPreview={skillsPreview}
        attachedSkillNames={attachedSkillNames}
        onOpenSkillsLibrary={() => setSkillsLibraryOpen(true)}
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

        <ChatAppSkillsModal
          open={skillsLibraryOpen}
          currentConversationId={currentConversationId}
          skills={skills}
          attachedSkillIds={attachedSkillIds}
          onToggleSkill={(skillId) => {
            const id = currentConversationId()
            if (!id) return
            actions.toggleConversationSkill(id, skillId)
          }}
          onAddSkill={(name, instructions) => {
            const skillId = actions.addSkill(name, instructions)
            const conversationId = currentConversationId()
            if (skillId && conversationId) {
              actions.toggleConversationSkill(conversationId, skillId)
            }
          }}
          onUpdateSkill={(skillId, patch) =>
            actions.updateSkill(skillId, patch)
          }
          onDeleteSkill={(skillId) => actions.deleteSkill(skillId)}
          onClose={() => setSkillsLibraryOpen(false)}
        />
      </section>
    </div>
  )
}
