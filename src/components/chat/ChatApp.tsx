import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
} from 'solid-js'
import { isServer } from '@solidjs/web'
import { loadChatState, startChatPersistence } from '../../lib/chat-persistence'
import { buildShareLink } from '../../lib/chat-share'
import type { ChatModelOption } from '../../lib/chat-models'
import { DEFAULT_CHAT_MODEL, modelSupportsTools } from '../../lib/chat-models'
import { findMatchingShortcut } from '../../lib/keyboard-shortcuts'
import { HARNESS_TOOLS } from '../../lib/harness/tools'
import { getFreeTextChatModelOptionsCached } from '../../lib/openrouter-models'
import { loadStoredApiKey, storeApiKey } from '../../lib/openrouter-key-storage'
import {
  completeOpenRouterLogin,
  startOpenRouterLogin,
  takeOpenRouterCallbackCode,
} from '../../lib/openrouter-oauth'
import { useChatActions, useChatStore } from '../../store/chat.hooks'
import { chatSelectors, chatStore } from '../../store/chat.store'
import ChatThread from './ChatThread'
import { SIDEBAR_OPEN_LS_KEY } from './chat-app-constants'
import { ChatAppModelToolbar } from './ChatAppModelToolbar'
import { ChatAppOpenRouterModal } from './ChatAppOpenRouterModal'
import { ChatAppShortcutsModal } from './ChatAppShortcutsModal'
import { ChatAppSidebar } from './ChatAppSidebar'
import { ChatAppSkillsModal } from './ChatAppSkillsModal'

/** Matches Tailwind's `max-sm` breakpoint, where the sidebar is an overlay drawer. */
function isNarrowViewport() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 639.98px)').matches
}

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
  const enabledToolIds = useChatStore((state) => state.enabledToolIds)
  /** Input value while typing (does not trigger model refetch). */
  const [openRouterApiKeyDraft, setOpenRouterApiKeyDraft] = createSignal('')
  /** Last saved value; sent only to openrouter.ai, never to this app's server. */
  const [openRouterApiKeyApplied, setOpenRouterApiKeyApplied] = createSignal('')
  /** Persist the key in localStorage (vs. this tab's sessionStorage). */
  const [rememberApiKey, setRememberApiKey] = createSignal(false)
  const [rememberApiKeyDraft, setRememberApiKeyDraft] = createSignal(false)
  const [openRouterSignInBusy, setOpenRouterSignInBusy] = createSignal(false)
  const [openRouterSignInError, setOpenRouterSignInError] = createSignal<
    string | null
  >(null)
  const [modelList, setModelList] = createSignal<ChatModelOption[] | undefined>()
  const [modelListLoading, setModelListLoading] = createSignal(true)
  const [modelListError, setModelListError] = createSignal<unknown>()
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [currentConversationLoading, setCurrentConversationLoading] =
    createSignal(false)
  const [skillsLibraryOpen, setSkillsLibraryOpen] = createSignal(false)
  const [openRouterApiKeyModalOpen, setOpenRouterApiKeyModalOpen] =
    createSignal(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = createSignal(false)
  const [shareBusy, setShareBusy] = createSignal(false)
  const [shareFeedback, setShareFeedback] = createSignal<string | null>(null)
  let stopStreaming: (() => void) | null = null

  const currentMessageCount = useChatStore((state) => {
    const id = state.currentConversationId
    if (!id) return 0
    return state.messagesByConversationId[id]?.length ?? 0
  })

  createEffect(
    () => (isServer ? null : openRouterApiKeyApplied()),
    (applied) => {
      if (applied == null || isServer) return
      let cancelled = false
      setModelListLoading(true)
      setModelListError(undefined)
      void (async () => {
        try {
          const list = await getFreeTextChatModelOptionsCached(applied.trim())
          if (cancelled) return
          setModelList(list)
        } catch (error) {
          if (cancelled) return
          setModelListError(error)
        } finally {
          if (!cancelled) setModelListLoading(false)
        }
      })()
      return () => {
        cancelled = true
      }
    },
  )

  createEffect(
    () => {
      const list = modelList()
      const selected = selectedModel()
      if (!list?.length) return null
      if (list.some((model) => model.id === selected)) return null
      return list[0].id
    },
    (nextId) => {
      if (nextId) actions.setSelectedModel(nextId)
    },
  )

  onSettled(() => {
    if (typeof window === 'undefined') return
    try {
      // Narrow screens start with the drawer closed so the chat is visible.
      if (
        localStorage.getItem(SIDEBAR_OPEN_LS_KEY) === '1' &&
        !isNarrowViewport()
      ) {
        setSidebarOpen(true)
      }
    } catch {
      /* ignore */
    }
    const stored = loadStoredApiKey()
    setOpenRouterApiKeyDraft(stored.key)
    setOpenRouterApiKeyApplied(stored.key)
    setRememberApiKey(stored.remember)
    setRememberApiKeyDraft(stored.remember)
    const oauthCode = takeOpenRouterCallbackCode()
    if (oauthCode) void finishOpenRouterSignIn(oauthCode)
    const saved = loadChatState()
    if (saved) {
      actions.hydrate(saved)
    }
    actions.ensureDefaultConversation()
    const stopPersist = startChatPersistence()
    return stopPersist
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
    if (modelListLoading()) return []
    if (modelListError()) {
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
    if (modelListLoading()) return true
    return selectOptions().length === 0
  }

  function persistOpenRouterApiKey(raw: string, remember: boolean) {
    const v = raw.trim()
    setOpenRouterApiKeyDraft(v)
    setOpenRouterApiKeyApplied(v)
    setRememberApiKey(remember)
    setRememberApiKeyDraft(remember)
    storeApiKey({ key: v, remember })
  }

  function openOpenRouterApiKeyModal() {
    setOpenRouterApiKeyDraft(openRouterApiKeyApplied())
    setRememberApiKeyDraft(rememberApiKey())
    setOpenRouterSignInError(null)
    setOpenRouterApiKeyModalOpen(true)
  }

  function closeOpenRouterApiKeyModal() {
    setOpenRouterApiKeyDraft(openRouterApiKeyApplied())
    setRememberApiKeyDraft(rememberApiKey())
    setOpenRouterApiKeyModalOpen(false)
  }

  function saveOpenRouterApiKeyFromModal() {
    persistOpenRouterApiKey(openRouterApiKeyDraft(), rememberApiKeyDraft())
    setOpenRouterApiKeyModalOpen(false)
  }

  function signInWithOpenRouter() {
    setOpenRouterSignInBusy(true)
    setOpenRouterSignInError(null)
    startOpenRouterLogin(rememberApiKeyDraft()).catch((error: unknown) => {
      setOpenRouterSignInBusy(false)
      setOpenRouterSignInError(
        error instanceof Error ? error.message : 'Could not start sign-in.',
      )
    })
  }

  async function finishOpenRouterSignIn(code: string) {
    setOpenRouterSignInBusy(true)
    try {
      const { key, remember } = await completeOpenRouterLogin(code)
      persistOpenRouterApiKey(key, remember)
    } catch (error) {
      setOpenRouterSignInError(
        error instanceof Error ? error.message : 'OpenRouter sign-in failed.',
      )
      setOpenRouterApiKeyModalOpen(true)
    } finally {
      setOpenRouterSignInBusy(false)
    }
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
    if (!isNarrowViewport()) return
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

  function focusChatComposer() {
    const el = document.querySelector<HTMLTextAreaElement>(
      '[data-chat-composer]',
    )
    el?.focus()
  }

  function handleChatShortcut(event: KeyboardEvent) {
    if (event.isComposing) return
    const match = findMatchingShortcut(event)
    if (!match) return

    if (match.id === 'stopGeneration') {
      if (shortcutsHelpOpen()) {
        event.preventDefault()
        setShortcutsHelpOpen(false)
        return
      }
      if (skillsLibraryOpen()) {
        event.preventDefault()
        setSkillsLibraryOpen(false)
        return
      }
      if (openRouterApiKeyModalOpen()) {
        event.preventDefault()
        closeOpenRouterApiKeyModal()
        return
      }
      if (currentConversationLoading()) {
        event.preventDefault()
        stopStreaming?.()
        return
      }
      if (sidebarOpen() && isNarrowViewport()) {
        event.preventDefault()
        collapseSidebarIfNarrow()
      }
      return
    }

    // Mod+ shortcuts always run (standard chat-app pattern).
    event.preventDefault()
    switch (match.id) {
      case 'newChat':
        createConversationFromSidebar()
        break
      case 'toggleSidebar':
        toggleSidebar()
        break
      case 'focusComposer':
        focusChatComposer()
        break
      case 'shareChat':
        void shareCurrentChat()
        break
      case 'openSkills':
        setSkillsLibraryOpen(true)
        break
      case 'showHelp':
        setShortcutsHelpOpen(true)
        break
    }
  }

  onSettled(() => {
    if (typeof window === 'undefined') return
    window.addEventListener('keydown', handleChatShortcut)
    return () => window.removeEventListener('keydown', handleChatShortcut)
  })

  const modelListEmpty = createMemo(() => {
    if (modelListLoading()) return false
    if (modelListError()) return false
    const list = modelList()
    return list !== undefined && list.length === 0
  })

  createEffect(
    () => shareFeedback(),
    (message) => {
      if (!message) return
      const timer = window.setTimeout(() => setShareFeedback(null), 6000)
      return () => window.clearTimeout(timer)
    },
  )

  async function shareCurrentChat() {
    const id = currentConversationId()
    if (!id) {
      setShareFeedback('Select a chat to share.')
      return
    }
    const messages = chatStore.state.messagesByConversationId[id] ?? []
    if (messages.length === 0) {
      setShareFeedback('Nothing to share yet — send a message first.')
      return
    }
    if (shareBusy()) return
    setShareBusy(true)
    try {
      const title =
        chatStore.state.conversationsById[id]?.title ?? 'Shared chat'
      const result = await buildShareLink({
        baseUrl: `${window.location.origin}/share`,
        title,
        model: selectedModel(),
        messages,
      })
      await navigator.clipboard.writeText(result.url)
      if (result.overLimit) {
        const mb = (result.byteLength / (1024 * 1024)).toFixed(1)
        setShareFeedback(
          `Copied. Warning: this link is ${mb} MB (over 1 MB) and may fail in some apps or browsers.`,
        )
      } else {
        setShareFeedback('Read-only link copied to clipboard.')
      }
    } catch {
      setShareFeedback('Could not copy share link.')
    } finally {
      setShareBusy(false)
    }
  }

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
          modelListLoading={modelListLoading}
          modelListError={modelListError}
          modelListEmpty={modelListEmpty}
          isStreaming={currentConversationLoading}
          onModelChange={(id) => actions.setSelectedModel(id)}
          shareDisabled={() => currentMessageCount() === 0}
          shareBusy={shareBusy}
          shareFeedback={shareFeedback}
          onShare={() => void shareCurrentChat()}
          onOpenShortcuts={() => setShortcutsHelpOpen(true)}
          tools={HARNESS_TOOLS}
          enabledToolIds={enabledToolIds}
          toolsSupported={() => modelSupportsTools(selectedModelMeta())}
          onToggleTool={(toolId) => actions.toggleTool(toolId)}
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
                  supportsTools={modelSupportsTools(selectedModelMeta())}
                  openRouterApiKey={openRouterApiKeyApplied()}
                  onLoadingChange={setCurrentConversationLoading}
                  onRegisterStop={(stop) => {
                    stopStreaming = stop
                  }}
                />
              </div>
            )
          }}
        </Show>

        <ChatAppOpenRouterModal
          open={openRouterApiKeyModalOpen}
          draft={openRouterApiKeyDraft}
          onDraftInput={setOpenRouterApiKeyDraft}
          remember={rememberApiKeyDraft}
          onRememberChange={setRememberApiKeyDraft}
          signInBusy={openRouterSignInBusy}
          signInError={openRouterSignInError}
          onSignIn={signInWithOpenRouter}
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

        <ChatAppShortcutsModal
          open={shortcutsHelpOpen}
          onClose={() => setShortcutsHelpOpen(false)}
        />
      </section>
    </div>
  )
}
