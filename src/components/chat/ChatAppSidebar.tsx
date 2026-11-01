import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import {
  ChevronRight,
  Download,
  KeyRound,
  PanelLeft,
  PanelLeftClose,
  SquarePen,
  Upload,
} from '../icons'
import type { ChatConversation } from '../../store/chat.hooks'
import { NEW_CHAT_TITLE } from '../../store/chat.store'
import { searchSidebarConversations } from '../../lib/conversation-search'
import type { HistoryConversation } from '../../lib/harness/chat-history'

type ChatAppSidebarProps = {
  sidebarOpen: () => boolean
  onToggleSidebar: () => void
  conversations: () => ChatConversation[]
  currentConversationId: () => string | null
  onSelectConversation: (id: string) => void
  onCreateConversation: () => void
  onDeleteConversation: (id: string) => void
  getSearchCorpus: () => HistoryConversation[]
  openRouterApiKeyApplied: () => string
  openRouterApiKeyModalOpen: () => boolean
  onOpenOpenRouterModal: () => void
  skillsPreview: () => string
  attachedSkillNames: () => string[]
  onOpenSkillsLibrary: () => void
  onExportChat: (format: 'md' | 'json') => void
  onExportAll: () => void
  onImportFile: (file: File) => Promise<string>
}

export function ChatAppSidebar(props: ChatAppSidebarProps) {
  return (
    <>
      <Show when={props.sidebarOpen()}>
        {/* Below `sm` the sidebar is an overlay drawer; tap outside to close. */}
        <button
          type="button"
          class="fixed inset-x-0 top-14 bottom-0 z-30 bg-black/40 sm:hidden"
          aria-label="Hide chat list"
          onClick={props.onToggleSidebar}
        />
      </Show>
      <aside
        id="chat-sidebar"
        class={[
          'border-border flex shrink-0 flex-col transition-[width] duration-200 ease-out sm:border-r',
          {
            'bg-background fixed top-14 bottom-0 left-0 z-40 w-[85vw] max-w-xs overflow-hidden border-r pb-[env(safe-area-inset-bottom)] shadow-xl sm:static sm:z-auto sm:h-full sm:w-64 sm:max-w-none sm:pb-0 sm:shadow-none md:w-72':
              props.sidebarOpen(),
            'hidden sm:flex sm:h-full sm:w-12 sm:min-w-12': !props.sidebarOpen(),
          },
        ]}
      >
        <Show
          when={props.sidebarOpen()}
          fallback={<CollapsedSidebarActions props={props} />}
        >
          <ExpandedSidebar props={props} />
        </Show>
      </aside>
    </>
  )
}

function CollapsedSidebarActions(props: { props: ChatAppSidebarProps }) {
  return (
    <div class="flex flex-1 flex-col items-center gap-2 py-2">
      <button
        type="button"
        class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-2"
        onClick={props.props.onToggleSidebar}
        title="Show chat list"
        aria-label="Show chat list"
        aria-expanded="false"
        aria-controls="chat-sidebar"
      >
        <PanelLeft class="size-5 shrink-0" aria-hidden="true" />
      </button>
      <button
        type="button"
        class={[
          'text-muted-foreground hover:bg-muted hover:text-foreground relative rounded-lg p-2',
          {
            'ring-primary/50 ring-2 ring-offset-2 ring-offset-background':
              props.props.openRouterApiKeyApplied().trim().length > 0,
          },
        ]}
        onClick={props.props.onOpenOpenRouterModal}
        title="OpenRouter API key"
        aria-label="OpenRouter API key"
        aria-haspopup="dialog"
        aria-expanded={props.props.openRouterApiKeyModalOpen() ? 'true' : 'false'}
      >
        <KeyRound class="size-5 shrink-0" aria-hidden="true" />
      </button>
    </div>
  )
}

function ExpandedSidebar(props: { props: ChatAppSidebarProps }) {
  return (
    <>
      <SidebarCollapseBar onToggleSidebar={props.props.onToggleSidebar} />
      <SidebarContent props={props.props} />
    </>
  )
}

function SidebarCollapseBar(props: { onToggleSidebar: () => void }) {
  return (
    <div class="border-border order-1 flex shrink-0 items-center border-b px-3 py-2">
      <button
        type="button"
        class="text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded-lg p-1.5"
        onClick={props.onToggleSidebar}
        title="Hide chat list"
        aria-label="Hide chat list"
        aria-expanded="true"
        aria-controls="chat-sidebar"
      >
        <PanelLeftClose class="size-4 shrink-0" aria-hidden="true" />
      </button>
    </div>
  )
}

function SidebarContent(props: { props: ChatAppSidebarProps }) {
  return (
    <div class="order-2 flex min-h-0 flex-1 flex-col">
      <ConversationPane props={props.props} />
      <SidebarSettings props={props.props} />
    </div>
  )
}

function ConversationPane(props: { props: ChatAppSidebarProps }) {
  return (
    <div class="order-1 flex min-h-0 flex-1 flex-col sm:order-2">
      <ConversationHeader
        onCreateConversation={props.props.onCreateConversation}
      />
      <ConversationSearch props={props.props} />
    </div>
  )
}

function ConversationHeader(props: {
  onCreateConversation: () => void
}) {
  return (
    <div class="flex shrink-0 items-center justify-between gap-2 p-3">
      <h2 class="text-muted-foreground min-w-0 flex-1 truncate text-xs font-semibold tracking-wide uppercase">
        Chats
      </h2>
      <button
        type="button"
        class="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium"
        onClick={props.onCreateConversation}
      >
        New
      </button>
    </div>
  )
}

const SEARCH_DEBOUNCE_MS = 200

function ConversationSearch(props: { props: ChatAppSidebarProps }) {
  const [input, setInput] = createSignal('')
  const [query, setQuery] = createSignal('')
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(timer))

  function onInput(value: string) {
    setInput(value)
    clearTimeout(timer)
    timer = setTimeout(() => setQuery(value), SEARCH_DEBOUNCE_MS)
  }

  function clear() {
    clearTimeout(timer)
    setInput('')
    setQuery('')
  }

  const results = createMemo(() => {
    const q = query().trim()
    return q ? searchSidebarConversations(props.props.getSearchCorpus(), q) : null
  })

  return (
    <>
      <div class="shrink-0 px-3 pb-2">
        <input
          id="sidebar-search-input"
          type="search"
          class="border-border bg-background placeholder:text-muted-foreground w-full rounded-lg border px-2.5 py-1.5 text-sm"
          placeholder="Search chats"
          aria-label="Search chats"
          value={input()}
          onInput={(e) => onInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && input()) {
              e.stopPropagation()
              clear()
            }
          }}
        />
      </div>
      <Show when={results()} fallback={<ConversationNav props={props.props} />}>
        {(hits) => (
          <nav
            class="min-h-0 flex-1 overflow-y-auto"
            aria-label="Search results"
          >
            <Show
              when={hits().length > 0}
              fallback={
                <p class="text-muted-foreground px-4 py-2 text-sm">
                  No matching chats.
                </p>
              }
            >
              <ul class="space-y-0.5 px-2 pb-3">
                <For each={hits()}>
                  {(hit) => (
                    <li>
                      <button
                        type="button"
                        class={[
                          'hover:bg-muted w-full rounded-lg px-2 py-2 text-left text-sm',
                          {
                            'bg-muted':
                              props.props.currentConversationId() === hit.id,
                          },
                        ]}
                        onClick={() => props.props.onSelectConversation(hit.id)}
                      >
                        <span class="block truncate font-medium">
                          {hit.title || NEW_CHAT_TITLE}
                        </span>
                        <Show when={hit.snippet}>
                          {(snippet) => (
                            <span class="text-muted-foreground block text-xs break-words">
                              {snippet().before}
                              <mark class="bg-primary/20 text-foreground rounded-sm">
                                {snippet().match}
                              </mark>
                              {snippet().after}
                            </span>
                          )}
                        </Show>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </nav>
        )}
      </Show>
    </>
  )
}

function ConversationNav(props: { props: ChatAppSidebarProps }) {
  return (
    <nav
      id="sidebar-conversations-nav"
      class="min-h-0 flex-1 overflow-y-auto"
      aria-label="Conversations"
    >
      <ul class="space-y-0.5 px-2 pb-3">
        <For each={props.props.conversations()}>
          {(conversation) => (
            <ConversationListItem
              conversation={conversation}
              currentConversationId={props.props.currentConversationId}
              onSelectConversation={props.props.onSelectConversation}
              onDeleteConversation={props.props.onDeleteConversation}
            />
          )}
        </For>
      </ul>
    </nav>
  )
}

function ConversationListItem(props: {
  conversation: ChatConversation
  currentConversationId: () => string | null
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
}) {
  const [confirmingDelete, setConfirmingDelete] = createSignal(false)

  return (
    <li class="flex items-stretch gap-0.5">
      <button
        type="button"
        class={[
          'hover:bg-muted min-w-0 flex-1 rounded-lg px-2 py-2.5 text-left text-sm sm:py-2',
          {
            'bg-muted font-medium':
              props.currentConversationId() === props.conversation.id,
          },
        ]}
        onClick={() => {
          setConfirmingDelete(false)
          props.onSelectConversation(props.conversation.id)
        }}
      >
        <span class="block truncate">
          {props.conversation.title || NEW_CHAT_TITLE}
        </span>
      </button>
      <Show
        when={confirmingDelete()}
        fallback={
          <button
            type="button"
            title="Delete chat"
            aria-label={`Delete chat: ${props.conversation.title || NEW_CHAT_TITLE}`}
            class="text-muted-foreground hover:text-destructive hover:bg-muted shrink-0 rounded-lg px-3 text-base sm:px-2 sm:text-sm"
            onClick={() => setConfirmingDelete(true)}
          >
            ×
          </button>
        }
      >
        <button
          type="button"
          title="Confirm delete"
          aria-label={`Confirm delete: ${props.conversation.title || NEW_CHAT_TITLE}`}
          class="text-destructive hover:bg-muted shrink-0 rounded-lg px-2 text-xs font-medium"
          onClick={() => {
            setConfirmingDelete(false)
            props.onDeleteConversation(props.conversation.id)
          }}
          onBlur={() => setConfirmingDelete(false)}
        >
          Delete?
        </button>
      </Show>
    </li>
  )
}

function SidebarSettings(props: { props: ChatAppSidebarProps }) {
  return (
    <div class="border-border order-2 shrink-0 space-y-2 border-b px-2 py-2 sm:order-1">
      <ApiKeyButton props={props.props} />
      <ExportImportMenu props={props.props} />
      <Show when={props.props.currentConversationId()}>
        <CurrentConversationSettings props={props.props} />
      </Show>
    </div>
  )
}

function ApiKeyButton(props: { props: ChatAppSidebarProps }) {
  return (
    <button
      type="button"
      class="border-border text-muted-foreground hover:bg-muted hover:text-foreground inline-flex w-full items-center justify-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-medium"
      onClick={props.props.onOpenOpenRouterModal}
      aria-haspopup="dialog"
      aria-expanded={props.props.openRouterApiKeyModalOpen() ? 'true' : 'false'}
    >
      <KeyRound class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="whitespace-nowrap">API key</span>
      <Show when={props.props.openRouterApiKeyApplied().trim().length > 0}>
        <span
          class="bg-primary/15 text-primary rounded px-1.5 py-px text-[10px] font-medium"
          title="A browser-stored key is in use"
        >
          Set
        </span>
      </Show>
    </button>
  )
}

function ExportImportMenu(props: { props: ChatAppSidebarProps }) {
  const [status, setStatus] = createSignal('')
  let fileInput: HTMLInputElement | undefined
  const item =
    'text-foreground hover:bg-muted block w-full rounded px-2 py-1 text-left text-xs'
  return (
    <details class="group/exp border-border bg-card/30 rounded-lg border">
      <summary class="text-muted-foreground hover:bg-muted/40 flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-xs font-medium [&::-webkit-details-marker]:hidden">
        <Download class="size-3.5 shrink-0" aria-hidden="true" />
        Export / import
      </summary>
      <div class="border-border space-y-0.5 border-t p-1">
        <Show when={props.props.currentConversationId()}>
          <button type="button" class={item} onClick={() => props.props.onExportChat('md')}>
            Export chat (Markdown)
          </button>
          <button type="button" class={item} onClick={() => props.props.onExportChat('json')}>
            Export chat (JSON)
          </button>
        </Show>
        <button type="button" class={item} onClick={props.props.onExportAll}>
          Export all chats (JSON)
        </button>
        <button type="button" class={item} onClick={() => fileInput?.click()}>
          <Upload class="mr-1 inline size-3" aria-hidden="true" />
          Import JSON…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          class="hidden"
          onChange={async (e) => {
            const input = e.currentTarget
            const file = input.files?.[0]
            input.value = ''
            if (!file) return
            setStatus(await props.props.onImportFile(file))
          }}
        />
        <Show when={status()}>
          <p class="text-muted-foreground m-0 px-2 py-1 text-[11px]" role="status">
            {status()}
          </p>
        </Show>
      </div>
    </details>
  )
}

function CurrentConversationSettings(props: { props: ChatAppSidebarProps }) {
  return (
    <>
      <SkillsPreview props={props.props} />
      <button
        type="button"
        class="bg-secondary text-secondary-foreground hover:bg-secondary/90 inline-flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium"
        onClick={props.props.onOpenSkillsLibrary}
        aria-haspopup="dialog"
      >
        <SquarePen class="size-3.5 shrink-0" aria-hidden="true" />
        Manage skills
      </button>
    </>
  )
}

function SkillsPreview(props: { props: ChatAppSidebarProps }) {
  return (
    <details class="group/sys border-border bg-card/30 rounded-lg border">
      <summary class="text-muted-foreground hover:bg-muted/40 flex cursor-pointer list-none items-start gap-2 px-2 py-1.5 text-[11px] leading-snug [&::-webkit-details-marker]:hidden">
        <ChevronRight
          class="text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform group-open/sys:rotate-90"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1">
          <span class="text-foreground font-semibold">Skills</span>
          <span class="text-muted-foreground/80 hidden md:block font-normal">
            (attached to this chat)
          </span>
          <span class="text-muted-foreground mt-0.5 block truncate font-normal">
            {props.props.skillsPreview()}
          </span>
        </span>
      </summary>
      <div
        class="border-border border-t px-2 py-1.5"
        role="region"
        aria-label="Attached skills"
      >
        <Show
          when={props.props.attachedSkillNames().length > 0}
          fallback={
            <p class="text-muted-foreground m-0 text-xs italic">
              Baseline only — no skills attached.
            </p>
          }
        >
          <ul class="m-0 list-disc space-y-0.5 pl-4 text-xs">
            <For each={props.props.attachedSkillNames()}>
              {(name) => (
                <li class="text-foreground">{name}</li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </details>
  )
}
