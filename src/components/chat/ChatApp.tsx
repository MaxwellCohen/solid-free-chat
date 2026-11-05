import {
  Errored,
  Loading,
  Show,
  createEffect,
  createMemo,
  createSignal,
  lazy,
  onSettled,
} from 'solid-js'
import { isServer } from '@solidjs/web'
import { useNavigate } from '@tanstack/solid-router'
import {
  loadChatStateAsync,
  onPersistenceStatus,
  startChatPersistence,
} from '../../lib/chat-persistence'
import type { PersistenceStatus } from '../../lib/chat-persistence'
import {
  downloadTextFile,
  exportAllChats,
  importChatsFromFile,
} from './chat-app-files'
import { ChatErrorFallback } from './ChatErrorFallback'
import { buildShareLink } from '../../lib/chat-share'
import type { ChatModelOption } from '../../lib/chat-models'
import { DEFAULT_CHAT_MODEL, modelSupportsTools } from '../../lib/chat-models'
import {
  CHAT_SHORTCUTS,
  findMatchingShortcut,
  formatShortcutChord,
} from '../../lib/keyboard-shortcuts'
import { HARNESS_TOOLS } from '../../lib/harness/tools'
import {
  loadActiveProviderId,
  loadSelectedModelProviderId,
  storeSelectedModelProviderId,
  loadStoredApiKey,
  storeActiveProviderId,
  storeApiKey,
} from '../../lib/openrouter-key-storage'
import { loadAllModelOptions } from '../../lib/model-options'
import { getProvider } from '../../lib/providers'
import {
  completeOpenRouterLogin,
  startOpenRouterLogin,
  takeOpenRouterCallbackCode,
} from '../../lib/openrouter-oauth'
import { useChatActions, useChatStore } from '../../store/chat.hooks'
import { chatSelectors, chatStore } from '../../store/chat.store'
import { lookup, maybe } from '../../lib/nullable'
import ChatThread from './ChatThread'
import {
  OUTLINE_OPEN_LS_KEY,
  SIDEBAR_OPEN_LS_KEY,
  ZEN_SESSION_KEY,
} from './chat-app-constants'
import { ChatAppOutline } from './ChatAppOutline'
import { buildOutline } from '../../lib/outline'
import { loadSnippets, saveSnippets } from '../../lib/snippets'
import type { Snippet } from '../../lib/snippets'
import { ChatAppModelToolbar } from './ChatAppModelToolbar'
import { ChatAppOpenRouterModal } from './ChatAppOpenRouterModal'
import { TOUR_SEEN_KEY } from '../../lib/tour-items'
import type { TourItem } from '../../lib/tour-items'
import {
  chatToMarkdown,
  exportFileName,
  serializeChat,
} from '../../lib/chat-export'
import { printChat } from '../../lib/print-chat'
import { findProject } from '../../lib/chat-projects'
import type { ProjectDraft } from '../../lib/chat-projects'
import { ChatAppSidebar, requestTagEditor } from './ChatAppSidebar'
import {
  BUILT_IN_PERSONAS,
  createCustomPersona,
  deleteCustomPersona,
  loadCustomPersonas,
  personaChatSetup,
  saveCustomPersonas,
} from '../../lib/personas'
import type { Persona } from '../../lib/personas'
import { ChatAppCommandPalette } from './ChatAppCommandPalette'
import type { PaletteCommand } from './ChatAppCommandPalette'
import { useTheme } from '../../lib/theme-context'
import { findByName } from '../../lib/slash-commands'
import type { SlashAction } from './ChatThread'

const ChatAppSettingsModal = lazy(() =>
  import('./ChatAppSettingsModal').then((m) => ({
    default: m.ChatAppSettingsModal,
  })),
)
const ChatAppPersonasModal = lazy(() =>
  import('./ChatAppPersonasModal').then((m) => ({
    default: m.ChatAppPersonasModal,
  })),
)
const ChatAppSkillsModal = lazy(() =>
  import('./ChatAppSkillsModal').then((m) => ({
    default: m.ChatAppSkillsModal,
  })),
)
const ChatAppSnippetsModal = lazy(() =>
  import('./ChatAppSnippetsModal').then((m) => ({
    default: m.ChatAppSnippetsModal,
  })),
)
const ChatAppProjectModal = lazy(() =>
  import('./ChatAppProjectModal').then((m) => ({
    default: m.ChatAppProjectModal,
  })),
)
const ChatAppTourModal = lazy(() =>
  import('./ChatAppTourModal').then((m) => ({ default: m.ChatAppTourModal })),
)
const ChatAppShortcutsModal = lazy(() =>
  import('./ChatAppShortcutsModal').then((m) => ({
    default: m.ChatAppShortcutsModal,
  })),
)

/** Warms the modal chunks right after first render so keyboard shortcuts feel instant. */
function preloadModals() {
  void import('./ChatAppTourModal')
  void import('./ChatAppShortcutsModal')
  void import('./ChatAppSettingsModal')
  void import('./ChatAppPersonasModal')
  void import('./ChatAppSkillsModal')
  void import('./ChatAppSnippetsModal')
  void import('./ChatAppProjectModal')
}

/** Latches true once `open` has been true, so lazy modals load on first use. */
function useEverOpened(open: () => boolean) {
  const [seen, setSeen] = createSignal(false)
  createEffect(open, (o) => {
    if (o) setSeen(true)
  })
  return seen
}

/** Matches Tailwind's `max-sm` breakpoint, where the sidebar is an overlay drawer. */
function isNarrowViewport() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 639.98px)').matches
}

export default function ChatApp() {
  const actions = useChatActions()
  const theme = useTheme()
  const currentConversationId = useChatStore(
    (state) => state.currentConversationId,
  )
  const conversations = useChatStore((state) =>
    chatSelectors.conversationList(state),
  )
  const projects = useChatStore((state) => state.projects)
  const currentProject = useChatStore((state) => {
    const id = state.currentConversationId
    return findProject(
      state.projects,
      id ? lookup(state.conversationsById, id)?.projectId : undefined,
    )
  })
  const [projectModalOpen, setProjectModalOpen] = createSignal(false)
  const [projectEditId, setProjectEditId] = createSignal<string | null>(null)
  function openProjectModal(editId: string | null = null) {
    setProjectEditId(editId)
    setProjectModalOpen(true)
  }
  function createChatInProject(projectId: string) {
    setCurrentConversationLoading(false)
    actions.createConversationInProject(projectId)
    collapseSidebarIfNarrow()
  }
  function saveProject(draft: ProjectDraft) {
    const editId = projectEditId()
    if (editId) actions.updateProject(editId, draft)
    else {
      const id = actions.createProject(draft)
      if (id) createChatInProject(id)
    }
    setProjectModalOpen(false)
  }
  const skills = useChatStore((state) => state.skills)
  const attachedSkillIds = useChatStore((state) => {
    const id = state.currentConversationId
    if (!id) return [] as string[]
    return lookup(state.conversationsById, id)?.skillIds ?? []
  })
  const selectedModel = useChatStore((state) => state.selectedModel)
  const enabledToolIds = useChatStore((state) => state.enabledToolIds)
  /** Input value while typing (does not trigger model refetch). */
  const [persistStatus, setPersistStatus] =
    createSignal<PersistenceStatus>('ok')
  const [openRouterApiKeyDraft, setOpenRouterApiKeyDraft] = createSignal('')
  /** Last saved value; sent only to openrouter.ai, never to this app's server. */
  const [openRouterApiKeyApplied, setOpenRouterApiKeyApplied] = createSignal('')
  /** Persist the key in localStorage (vs. this tab's sessionStorage). */
  /** Provider whose key is applied / being edited in the modal. */
  const [providerId, setProviderId] = createSignal('openrouter')
  /** Provider of the selected model (models from all keyed providers are listed). */
  const [selectedProviderId, setSelectedProviderId] = createSignal('openrouter')
  const [keysVersion, setKeysVersion] = createSignal(0)
  const [providerIdDraft, setProviderIdDraft] = createSignal('openrouter')
  const [rememberApiKey, setRememberApiKey] = createSignal(false)
  const [rememberApiKeyDraft, setRememberApiKeyDraft] = createSignal(false)
  const [openRouterSignInBusy, setOpenRouterSignInBusy] = createSignal(false)
  const [openRouterSignInError, setOpenRouterSignInError] = createSignal<
    string | null
  >(null)
  const [modelList, setModelList] = createSignal<
    ChatModelOption[] | undefined
  >()
  const [modelListLoading, setModelListLoading] = createSignal(true)
  const [modelListError, setModelListError] = createSignal<unknown>()
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [currentConversationLoading, setCurrentConversationLoading] =
    createSignal(false)
  const [skillsLibraryOpen, setSkillsLibraryOpen] = createSignal(false)
  const [chatSettingsOpen, setChatSettingsOpen] = createSignal(false)
  const [personasOpen, setPersonasOpen] = createSignal(false)
  const [outlineOpen, setOutlineOpen] = createSignal(false)
  const [zen, setZen] = createSignal(false)
  const [snippets, setSnippets] = createSignal<Snippet[]>([])
  const [snippetsOpen, setSnippetsOpen] = createSignal(false)
  const outlineMessages = useChatStore((state) => {
    const id = state.currentConversationId
    return id ? (lookup(state.messagesByConversationId, id) ?? []) : []
  })
  const outlineItems = createMemo(() => buildOutline(outlineMessages()))
  function toggleOutline() {
    setOutlineOpen((open) => {
      const next = !open
      try {
        localStorage.setItem(OUTLINE_OPEN_LS_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }
  function setZenMode(next: boolean) {
    setZen(next)
    try {
      sessionStorage.setItem(ZEN_SESSION_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (next) queueMicrotask(focusChatComposer)
  }
  // Mirror zen onto <html> so the site header and page height can react.
  createEffect(
    () => zen(),
    (on) => {
      document.documentElement.toggleAttribute('data-zen', on)
      return () => document.documentElement.removeAttribute('data-zen')
    },
  )
  function updateSnippets(next: Snippet[]) {
    setSnippets(next)
    saveSnippets(next)
  }
  const [customPersonas, setCustomPersonas] = createSignal<Persona[]>([])
  onSettled(() => {
    setCustomPersonas(loadCustomPersonas())
  })
  const allPersonas = () => [...BUILT_IN_PERSONAS, ...customPersonas()]
  function startPersonaChat(persona: Persona) {
    const setup = personaChatSetup(persona)
    setCurrentConversationLoading(false)
    const id = actions.createConversation()
    actions.setConversationSettings(id, setup.settings)
    actions.renameConversation(id, setup.title)
    setPersonasOpen(false)
    collapseSidebarIfNarrow()
  }
  const currentChatSettings = useChatStore((state) => {
    const id = state.currentConversationId
    return id ? lookup(state.conversationsById, id)?.settings : undefined
  })
  const [openRouterApiKeyModalOpen, setOpenRouterApiKeyModalOpen] =
    createSignal(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = createSignal(false)
  const [tourOpen, setTourOpen] = createSignal(false)
  function tourSeen() {
    try {
      return localStorage.getItem(TOUR_SEEN_KEY) !== null
    } catch {
      return true
    }
  }
  function markTourSeen() {
    try {
      localStorage.setItem(TOUR_SEEN_KEY, '1')
    } catch {
      /* ignore */
    }
  }
  function runTourAction(item: TourItem) {
    setTourOpen(false)
    switch (item.action) {
      case 'palette':
        openPalette()
        break
      case 'composer':
        queueMicrotask(focusChatComposer)
        break
      case 'personas':
        setPersonasOpen(true)
        break
      case 'arena':
        void navigate({ to: '/arena' })
        break
      case 'study':
        void navigate({ to: '/study' })
        break
      case 'roundtable':
        void navigate({ to: '/roundtable' })
        break
      case 'insights':
        void navigate({ to: '/insights' })
        break
      case 'saved':
        void navigate({ to: '/saved' })
        break
      case 'shortcuts':
        setShortcutsHelpOpen(true)
        break
      case 'display':
        setChatSettingsOpen(true)
        break
      case 'import':
        pickChatsToImport()
        break
      case 'outline':
        if (!outlineOpen()) toggleOutline()
        break
      case 'zen':
        setZenMode(true)
        break
      case 'snippets':
        setSnippetsOpen(true)
        break
      case 'projects':
        openProjectModal()
        break
    }
  }
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  const [paletteQuery, setPaletteQuery] = createSignal('')
  const [shareBusy, setShareBusy] = createSignal(false)
  const [shareFeedback, setShareFeedback] = createSignal<string | null>(null)
  let stopStreaming: (() => void) | null = null

  const currentMessageCount = useChatStore((state) => {
    const id = state.currentConversationId
    if (!id) return 0
    return lookup(state.messagesByConversationId, id)?.length ?? 0
  })

  createEffect(
    () => (isServer ? null : keysVersion()),
    (version) => {
      if (version == null || isServer) return
      let cancelled = false
      const isCancelled = () => cancelled
      setModelListLoading(true)
      setModelListError(undefined)
      void (async () => {
        const { options, error } = await loadAllModelOptions()
        if (isCancelled()) return
        if (options.length === 0 && error) setModelListError(error)
        else setModelList(options)
        setModelListLoading(false)
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
      const pid = selectedProviderId()
      if (list.some((m) => m.id === selected && m.providerId === pid))
        return null
      return list[0]
    },
    (next) => {
      if (!next) return
      setSelectedProviderId(next.providerId ?? providerId())
      actions.setSelectedModel(next.id)
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
    try {
      setOutlineOpen(localStorage.getItem(OUTLINE_OPEN_LS_KEY) === '1')
      setZen(sessionStorage.getItem(ZEN_SESSION_KEY) === '1')
    } catch {
      /* ignore */
    }
    setSnippets(loadSnippets())
    const activeId = getProvider(loadActiveProviderId()).id
    setProviderId(activeId)
    setProviderIdDraft(activeId)
    setSelectedProviderId(loadSelectedModelProviderId() ?? activeId)
    const stored = loadStoredApiKey(activeId)
    setOpenRouterApiKeyDraft(stored.key)
    setOpenRouterApiKeyApplied(stored.key)
    setRememberApiKey(stored.remember)
    setRememberApiKeyDraft(stored.remember)
    const oauthCode = takeOpenRouterCallbackCode()
    if (oauthCode) void finishOpenRouterSignIn(oauthCode)
    else if (!stored.key.trim()) setOpenRouterApiKeyModalOpen(true)
    else if (!tourSeen()) {
      markTourSeen()
      setTourOpen(true)
    }
    let stopPersist: (() => void) | undefined
    let disposed = false
    const stopStatus = onPersistenceStatus(setPersistStatus)
    void loadChatStateAsync().then((saved) => {
      if (disposed) return
      if (saved) actions.hydrate(saved)
      actions.ensureDefaultConversation()
      stopPersist = startChatPersistence(() =>
        actions.ensureDefaultConversation(),
      )
    })
    return () => {
      disposed = true
      stopStatus()
      stopPersist?.()
    }
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
            providerId: selectedProviderId(),
            name:
              id === DEFAULT_CHAT_MODEL ? `${id} (fallback)` : `${id} (saved)`,
            inputModalities: id === DEFAULT_CHAT_MODEL ? ['text'] : undefined,
          },
        ]
      }
      return fb
    }
    const fromApi = modelList() ?? []
    const id = selectedModel()
    if (
      fromApi.some((o) => o.id === id && o.providerId === selectedProviderId())
    )
      return fromApi
    return [
      ...fromApi,
      {
        id,
        providerId: selectedProviderId(),
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
    storeApiKey({ key: v, remember }, providerIdDraft())
    setProviderId(providerIdDraft())
    storeActiveProviderId(providerIdDraft())
    setKeysVersion((v) => v + 1)
  }

  function selectProviderDraft(id: string) {
    setProviderIdDraft(id)
    const stored = loadStoredApiKey(id)
    setOpenRouterApiKeyDraft(stored.key)
    setRememberApiKeyDraft(stored.remember)
    setOpenRouterSignInError(null)
  }

  function openOpenRouterApiKeyModal() {
    setProviderIdDraft(providerId())
    setOpenRouterApiKeyDraft(openRouterApiKeyApplied())
    setRememberApiKeyDraft(rememberApiKey())
    setOpenRouterSignInError(null)
    setOpenRouterApiKeyModalOpen(true)
  }

  function closeOpenRouterApiKeyModal() {
    setProviderIdDraft(providerId())
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
      setProviderIdDraft('openrouter')
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
    return selectOptions().find(
      (m) => m.id === id && m.providerId === selectedProviderId(),
    )
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

  function exportCurrentChat(format: 'md' | 'json') {
    const id = currentConversationId()
    if (!id) return
    const state = chatStore.state
    const text =
      format === 'md' ? chatToMarkdown(state, id) : serializeChat(state, id)
    if (text == null) return
    downloadTextFile(
      exportFileName(
        lookup(state.conversationsById, id)?.title ?? 'chat',
        format,
      ),
      text,
      format === 'md' ? 'text/markdown' : 'application/json',
    )
  }

  function printCurrentChat() {
    const id = currentConversationId()
    if (!id) return
    const state = chatStore.state
    printChat(
      lookup(state.conversationsById, id)?.title ?? 'Chat',
      state.messagesByConversationId[id] ?? [],
    )
  }

  const importChatsFile = (file: File) =>
    importChatsFromFile(file, collapseSidebarIfNarrow)

  const [importToast, setImportToast] = createSignal('')
  let importToastTimer: ReturnType<typeof setTimeout> | undefined
  function pickChatsToImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setImportToast(await importChatsFile(file))
      clearTimeout(importToastTimer)
      importToastTimer = setTimeout(() => setImportToast(''), 5000)
    }
    input.click()
  }

  function focusChatComposer() {
    const el = document.querySelector<HTMLTextAreaElement>(
      '[data-chat-composer]',
    )
    el?.focus()
  }

  function focusSidebarSearch() {
    setSidebarOpen(true)
    // Wait for the sidebar to render before focusing.
    requestAnimationFrame(() => {
      const el = document.getElementById('sidebar-search-input')
      if (el instanceof HTMLInputElement) {
        el.focus()
        el.select()
      }
    })
  }

  function searchCorpus() {
    const state = chatStore.state
    return state.conversationOrder.flatMap((id) => {
      const conversation = lookup(state.conversationsById, id)
      return conversation
        ? [
            {
              ...conversation,
              messages: state.messagesByConversationId[id] ?? [],
            },
          ]
        : []
    })
  }

  function handleChatShortcut(event: KeyboardEvent) {
    if (event.isComposing) return
    const match = findMatchingShortcut(event)
    if (!match) return

    if (match.id === 'stopGeneration') {
      if (paletteOpen()) {
        event.preventDefault()
        setPaletteOpen(false)
        return
      }
      if (tourOpen()) {
        event.preventDefault()
        setTourOpen(false)
        return
      }
      if (shortcutsHelpOpen()) {
        event.preventDefault()
        setShortcutsHelpOpen(false)
        return
      }
      if (chatSettingsOpen()) {
        event.preventDefault()
        setChatSettingsOpen(false)
        return
      }
      if (personasOpen()) {
        event.preventDefault()
        setPersonasOpen(false)
        return
      }
      if (skillsLibraryOpen()) {
        event.preventDefault()
        setSkillsLibraryOpen(false)
        return
      }
      if (projectModalOpen()) {
        event.preventDefault()
        setProjectModalOpen(false)
        return
      }
      if (snippetsOpen()) {
        event.preventDefault()
        setSnippetsOpen(false)
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
      if (zen()) {
        event.preventDefault()
        setZenMode(false)
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
      case 'searchChats':
        focusSidebarSearch()
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
      case 'toggleOutline':
        toggleOutline()
        break
      case 'zenMode':
        setZenMode(!zen())
        break
      case 'commandPalette':
        openPalette()
        break
    }
  }

  function openPalette(query = '') {
    setPaletteQuery(query)
    setPaletteOpen(true)
  }

  function changeModel(value: string) {
    const i = value.indexOf('\n')
    setSelectedProviderId(value.slice(0, i))
    storeSelectedModelProviderId(value.slice(0, i))
    actions.setSelectedModel(value.slice(i + 1))
  }

  function handleSlashAction(action: SlashAction) {
    switch (action.type) {
      case 'new':
        createConversationFromSidebar()
        break
      case 'export':
        exportCurrentChat(action.format)
        break
      case 'model':
        openPalette('model ')
        break
      case 'help':
        setShortcutsHelpOpen(true)
        break
      case 'skill': {
        const id = currentConversationId()
        const skill = findByName(skills(), action.name)
        if (id && skill) actions.toggleConversationSkill(id, skill.id)
        break
      }
    }
  }

  const paletteItems = createMemo((): PaletteCommand[] => {
    const hint = (id: string) => {
      const def = CHAT_SHORTCUTS.find((d) => d.id === id)
      return def ? formatShortcutChord(def.keys) : undefined
    }
    const currentId = currentConversationId()
    const current = conversations().find((c) => c.id === currentId)
    const items: PaletteCommand[] = [
      {
        id: 'newChat',
        label: 'New chat',
        hint: hint('newChat'),
        run: createConversationFromSidebar,
      },
      {
        id: 'toggleSidebar',
        label: 'Toggle sidebar',
        hint: hint('toggleSidebar'),
        run: toggleSidebar,
      },
      {
        id: 'searchChats',
        label: 'Search chats',
        hint: hint('searchChats'),
        run: focusSidebarSearch,
      },
      {
        id: 'openSkills',
        label: 'Open skills',
        hint: hint('openSkills'),
        run: () => setSkillsLibraryOpen(true),
      },
      {
        id: 'toggleOutline',
        label: 'Toggle outline',
        hint: hint('toggleOutline'),
        keywords: 'table of contents headings navigate panel',
        run: toggleOutline,
      },
      {
        id: 'zenMode',
        label: 'Zen mode',
        hint: hint('zenMode'),
        keywords: 'focus distraction free minimal fullscreen',
        run: () => setZenMode(!zen()),
      },
      {
        id: 'openSnippets',
        label: 'Snippets…',
        keywords: 'text expander shortcuts templates canned replies',
        run: () => setSnippetsOpen(true),
      },
      {
        id: 'newProject',
        label: 'New project…',
        keywords: 'group folder workspace context notes',
        run: () => openProjectModal(),
      },
      {
        id: 'moveToProject',
        label: 'Move chat to project…',
        keywords: 'group folder organize',
        run: () => openPalette('Move to project: '),
      },
      {
        id: 'openPersonas',
        label: 'Personas…',
        keywords: 'character roleplay tutor pirate system prompt',
        run: () => setPersonasOpen(true),
      },
      {
        id: 'importChats',
        label: 'Import chats',
        keywords: 'backup chatgpt json restore upload',
        run: pickChatsToImport,
      },
      {
        id: 'openInsights',
        label: 'Open insights',
        keywords: 'stats usage tokens cost streak dashboard',
        run: () => void navigate({ to: '/insights' }),
      },
      {
        id: 'displaySettings',
        label: 'Display settings',
        keywords: 'font size width spacing compact badges appearance',
        run: () => setChatSettingsOpen(true),
      },
      {
        id: 'openSaved',
        label: 'Saved messages',
        keywords: 'bookmarks starred favorites',
        run: () => void navigate({ to: '/saved' }),
      },
      {
        id: 'openArena',
        label: 'Open arena',
        keywords: 'compare models side by side vote leaderboard',
        run: () => void navigate({ to: '/arena' }),
      },
      {
        id: 'openStudy',
        label: 'Open study mode',
        keywords: 'flashcards spaced repetition quiz learn review anki',
        run: () => void navigate({ to: '/study' }),
      },
      {
        id: 'openRoundtable',
        label: 'Open roundtable',
        keywords: 'personas debate conversation panel discuss',
        run: () => void navigate({ to: '/roundtable' }),
      },
      {
        id: 'openTour',
        label: "What's new / Tour",
        keywords: 'features guide help discover onboarding',
        run: () => setTourOpen(true),
      },
      {
        id: 'showHelp',
        label: 'Keyboard shortcuts',
        hint: hint('showHelp'),
        run: () => setShortcutsHelpOpen(true),
      },
      {
        id: 'theme',
        label: 'Switch theme',
        hint: theme.preference(),
        keywords: 'dark light system appearance',
        run: () => {
          const order = ['light', 'dark', 'system'] as const
          const cur = maybe(theme.preference()) ?? 'system'
          theme.setPreference(order[(order.indexOf(cur) + 1) % order.length])
        },
      },
      {
        id: 'exportMd',
        label: 'Export current chat (Markdown)',
        run: () => exportCurrentChat('md'),
      },
      {
        id: 'print',
        label: 'Print / Save as PDF',
        keywords: 'pdf export paper',
        run: printCurrentChat,
      },
      {
        id: 'exportJson',
        label: 'Export current chat (JSON)',
        run: () => exportCurrentChat('json'),
      },
      {
        id: 'share',
        label: 'Share chat',
        hint: hint('shareChat'),
        run: () => void shareCurrentChat(),
      },
    ]
    if (current) {
      items.push({
        id: 'pin',
        label: current.pinned ? 'Unpin current chat' : 'Pin current chat',
        run: () => actions.togglePinned(current.id),
      })
      items.push({
        id: 'tagChat',
        label: 'Tag current chat…',
        keywords: 'label tags organize filter',
        run: () => {
          setSidebarOpen(true)
          requestAnimationFrame(() => requestTagEditor(current.id))
        },
      })
    }
    const currentProjectValue = currentProject()
    if (currentProjectValue) {
      items.push({
        id: 'editProject',
        label: 'Edit current project…',
        hint: currentProjectValue.name,
        keywords: 'project instructions notes',
        run: () => openProjectModal(currentProjectValue.id),
      })
    }
    if (current) {
      for (const p of projects()) {
        if (p.id === current.projectId) continue
        items.push({
          id: `moveTo:${p.id}`,
          label: `Move to project: ${p.name}`,
          keywords: 'move chat group',
          run: () => actions.setConversationProject(current.id, p.id),
        })
      }
      if (current.projectId) {
        items.push({
          id: 'moveToNone',
          label: 'Move to project: none',
          keywords: 'remove ungroup chat',
          run: () => actions.setConversationProject(current.id, null),
        })
      }
    }
    for (const c of conversations()) {
      items.push({
        id: `chat:${c.id}`,
        label: c.title || 'Untitled chat',
        hint: 'Chat',
        keywords: 'jump conversation open',
        run: () => selectConversation(c.id),
      })
    }
    for (const m of selectOptions()) {
      items.push({
        id: `model:${m.providerId ?? ''}:${m.id}`,
        label: `Model: ${m.name}`,
        keywords: 'switch model',
        run: () =>
          changeModel(`${m.providerId ?? selectedProviderId()}\n${m.id}`),
      })
    }
    return items
  })

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
        lookup(chatStore.state.conversationsById, id)?.title ?? 'Shared chat'
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

  onSettled(preloadModals)
  const chatSettingsOpened = useEverOpened(chatSettingsOpen)
  const personasOpened = useEverOpened(personasOpen)
  const skillsOpened = useEverOpened(skillsLibraryOpen)
  const snippetsOpened = useEverOpened(snippetsOpen)
  const projectModalOpened = useEverOpened(projectModalOpen)
  const tourOpened = useEverOpened(tourOpen)
  const shortcutsOpened = useEverOpened(shortcutsHelpOpen)

  return (
    <div
      class="group/app flex h-full min-h-0 w-full max-w-[100vw] flex-col overflow-hidden sm:flex-row"
      data-zen={zen() ? '' : undefined}
    >
      <Show when={!zen()}>
        <ChatAppSidebar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={toggleSidebar}
          conversations={conversations}
          projects={projects}
          onNewProject={() => openProjectModal()}
          onEditProject={openProjectModal}
          onNewChatInProject={createChatInProject}
          currentConversationId={currentConversationId}
          onSelectConversation={selectConversation}
          onCreateConversation={createConversationFromSidebar}
          onDeleteConversation={(id) => actions.deleteConversation(id)}
          getSearchCorpus={searchCorpus}
          openRouterApiKeyApplied={openRouterApiKeyApplied}
          openRouterApiKeyModalOpen={openRouterApiKeyModalOpen}
          onOpenOpenRouterModal={openOpenRouterApiKeyModal}
          skillsPreview={skillsPreview}
          attachedSkillNames={attachedSkillNames}
          onOpenSkillsLibrary={() => setSkillsLibraryOpen(true)}
          onExportChat={exportCurrentChat}
          onExportAll={() => void exportAllChats()}
          onPrintChat={printCurrentChat}
          onImportFile={importChatsFile}
        />
      </Show>

      <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <h1 class="sr-only">Chat</h1>
        <Show when={!zen()}>
          <ChatAppModelToolbar
            outlineOpen={outlineOpen}
            onToggleOutline={toggleOutline}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
            onNewChat={createConversationFromSidebar}
            selectedModel={() => `${selectedProviderId()}\n${selectedModel()}`}
            selectDisabled={selectDisabled}
            selectOptions={selectOptions}
            modelListLoading={modelListLoading}
            modelListError={modelListError}
            modelListEmpty={modelListEmpty}
            isStreaming={currentConversationLoading}
            showProvider={() =>
              new Set(modelList()?.map((m) => m.providerId)).size > 1
            }
            onModelChange={changeModel}
            shareDisabled={() => currentMessageCount() === 0}
            shareBusy={shareBusy}
            shareFeedback={shareFeedback}
            onShare={() => void shareCurrentChat()}
            onOpenShortcuts={() => setShortcutsHelpOpen(true)}
            onOpenTour={() => setTourOpen(true)}
            onOpenSettings={() => setChatSettingsOpen(true)}
            settingsActive={() => currentChatSettings() !== undefined}
            tools={HARNESS_TOOLS}
            enabledToolIds={enabledToolIds}
            toolsSupported={() => modelSupportsTools(selectedModelMeta())}
            onToggleTool={(toolId) => actions.toggleTool(toolId)}
          />
        </Show>
        <Show when={zen()}>
          <button
            type="button"
            data-testid="exit-zen"
            class="border-border bg-card/80 text-muted-foreground hover:bg-muted hover:text-foreground fixed top-3 right-3 z-40 rounded-full border px-3 py-1 text-xs shadow-sm backdrop-blur"
            onClick={() => setZenMode(false)}
          >
            Exit zen · Esc
          </button>
        </Show>

        <Show when={currentConversationId()} keyed>
          {(id) => {
            // Read messages for this id atomically at mount (avoids stale untrack).
            const initialMessages =
              chatStore.state.messagesByConversationId[id] ?? []
            return (
              <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <Show when={persistStatus() !== 'ok'}>
                  <p
                    class="border-border bg-muted text-foreground border-b px-3 py-1.5 text-xs"
                    role="alert"
                  >
                    {persistStatus() === 'storage-full'
                      ? 'Browser storage is full — recent chats may not be saved. Delete old chats or export a backup.'
                      : 'Could not save chats to this browser.'}
                  </p>
                </Show>
                <Show when={currentProject()}>
                  {(project) => (
                    <button
                      type="button"
                      data-testid="project-chip"
                      class="border-border bg-muted/40 text-foreground hover:bg-muted flex w-full min-w-0 items-center gap-2 border-b px-3 py-1 text-left text-xs"
                      aria-label={`Project: ${project().name}. Edit project`}
                      onClick={() => openProjectModal(project().id)}
                    >
                      <span aria-hidden="true">{project().emoji}</span>
                      <span class="min-w-0 truncate font-medium">
                        {project().name}
                      </span>
                    </button>
                  )}
                </Show>
                <Show when={currentChatSettings()?.persona}>
                  {(persona) => (
                    <div
                      class="border-border bg-muted/40 text-foreground flex min-w-0 items-center gap-2 border-b px-3 py-1 text-xs"
                      aria-label="Active persona"
                    >
                      <span aria-hidden="true">{persona().emoji}</span>
                      <span class="min-w-0 truncate font-medium">
                        {persona().name}
                      </span>
                    </div>
                  )}
                </Show>
                <Errored
                  fallback={(err, reset) => (
                    <ChatErrorFallback
                      error={err()}
                      reset={reset}
                      label="This chat failed to render."
                    />
                  )}
                >
                  <ChatThread
                    conversationId={id}
                    initialMessages={initialMessages}
                    inputModalities={selectedModelMeta()?.inputModalities}
                    supportsTools={modelSupportsTools(selectedModelMeta())}
                    modelPricing={selectedModelMeta()?.pricing}
                    contextLength={selectedModelMeta()?.contextLength}
                    openRouterApiKey={
                      loadStoredApiKey(selectedProviderId()).key
                    }
                    providerId={selectedProviderId()}
                    onLoadingChange={setCurrentConversationLoading}
                    onSlashAction={handleSlashAction}
                    snippets={snippets}
                    onReconnectOpenRouter={openOpenRouterApiKeyModal}
                    onOpenPersonas={() => setPersonasOpen(true)}
                    onRegisterStop={(stop) => {
                      stopStreaming = stop
                    }}
                  />
                </Errored>
              </div>
            )
          }}
        </Show>

        <ChatAppOpenRouterModal
          open={openRouterApiKeyModalOpen}
          providerId={providerIdDraft}
          onProviderChange={selectProviderDraft}
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

        <Show when={chatSettingsOpened()}>
          <Loading>
            <ChatAppSettingsModal
              open={chatSettingsOpen}
              currentConversationId={currentConversationId}
              settings={currentChatSettings}
              onChange={(patch) => {
                const id = currentConversationId()
                if (id) actions.setConversationSettings(id, patch)
              }}
              onReset={() => {
                const id = currentConversationId()
                if (id) actions.setConversationSettings(id, null)
              }}
              onClose={() => setChatSettingsOpen(false)}
            />
          </Loading>
        </Show>

        <Show when={personasOpened()}>
          <Loading>
            <ChatAppPersonasModal
              open={personasOpen}
              personas={allPersonas}
              onPick={startPersonaChat}
              onCreate={(draft) => {
                const next = createCustomPersona(draft, customPersonas())
                setCustomPersonas(next)
                saveCustomPersonas(next)
              }}
              onDelete={(id) => {
                const next = deleteCustomPersona(id, customPersonas())
                setCustomPersonas(next)
                saveCustomPersonas(next)
              }}
              onClose={() => setPersonasOpen(false)}
            />
          </Loading>
        </Show>

        <Show when={skillsOpened()}>
          <Loading>
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
              onImportSkills={(incoming) => actions.importSkills(incoming)}
              onUpdateSkill={(skillId, patch) =>
                actions.updateSkill(skillId, patch)
              }
              onDeleteSkill={(skillId) => actions.deleteSkill(skillId)}
              onClose={() => setSkillsLibraryOpen(false)}
            />
          </Loading>
        </Show>

        <Show when={projectModalOpened()}>
          <Loading>
            <ChatAppProjectModal
              open={projectModalOpen}
              project={() => projects().find((p) => p.id === projectEditId())}
              onSave={saveProject}
              onDelete={(id) => {
                actions.deleteProject(id)
                setProjectModalOpen(false)
              }}
              onClose={() => setProjectModalOpen(false)}
            />
          </Loading>
        </Show>

        <Show when={snippetsOpened()}>
          <Loading>
            <ChatAppSnippetsModal
              open={snippetsOpen}
              snippets={snippets}
              onChange={updateSnippets}
              onClose={() => setSnippetsOpen(false)}
            />
          </Loading>
        </Show>

        <ChatAppCommandPalette
          open={paletteOpen}
          initialQuery={paletteQuery}
          items={paletteItems}
          onClose={() => setPaletteOpen(false)}
        />

        <Show when={importToast()}>
          <div
            role="status"
            class="bg-card text-card-foreground border-border fixed right-4 bottom-4 z-50 rounded-lg border px-3 py-2 text-sm shadow-lg"
          >
            {importToast()}
          </div>
        </Show>

        <Show when={tourOpened()}>
          <Loading>
            <ChatAppTourModal
              open={tourOpen}
              onTry={runTourAction}
              onClose={() => setTourOpen(false)}
            />
          </Loading>
        </Show>

        <Show when={shortcutsOpened()}>
          <Loading>
            <ChatAppShortcutsModal
              open={shortcutsHelpOpen}
              onClose={() => setShortcutsHelpOpen(false)}
            />
          </Loading>
        </Show>
      </section>
      <Show when={outlineOpen() && !zen()}>
        <ChatAppOutline items={outlineItems} onClose={toggleOutline} />
      </Show>
    </div>
  )
}
