import { For, Show, createSignal } from 'solid-js'
import {
  ChevronRight,
  KeyRound,
  PanelLeft,
  PanelLeftClose,
  SquarePen,
} from 'lucide-solid'
import type { ChatConversation } from '../../store/chat.hooks'
import { NEW_CHAT_TITLE } from '../../store/chat.store'

type ChatAppSidebarProps = {
  sidebarOpen: () => boolean
  onToggleSidebar: () => void
  conversations: () => ChatConversation[]
  currentConversationId: () => string | null
  onSelectConversation: (id: string) => void
  onCreateConversation: () => void
  onDeleteConversation: (id: string) => void
  openRouterApiKeyApplied: () => string
  openRouterApiKeyModalOpen: () => boolean
  onOpenOpenRouterModal: () => void
  mobileSidebarPanelOpen: () => boolean
  onToggleMobileSidebarPanel: () => void
  skillsPreview: () => string
  attachedSkillNames: () => string[]
  onOpenSkillsLibrary: () => void
}

export function ChatAppSidebar(props: ChatAppSidebarProps) {
  return (
    <aside
      id="chat-sidebar"
      class="border-border flex shrink-0 flex-col border-b transition-[width] duration-200 ease-out sm:border-r sm:border-b-0"
      classList={{
        'flex w-full min-h-0 max-h-[min(55dvh,24rem)] flex-col overflow-x-hidden overflow-y-auto sm:max-h-none sm:overflow-hidden sm:w-64 md:w-72':
          props.sidebarOpen(),
        'hidden sm:flex sm:h-full sm:w-12 sm:min-w-12 sm:max-h-none sm:flex-col':
          !props.sidebarOpen(),
      }}
    >
      <Show
        when={props.sidebarOpen()}
        fallback={<CollapsedSidebarActions props={props} />}
      >
        <ExpandedSidebar props={props} />
      </Show>
    </aside>
  )
}

function CollapsedSidebarActions(props: { props: ChatAppSidebarProps }) {
  return (
    <div class="flex flex-col items-center gap-2 py-3 sm:flex-1 sm:py-2">
      <button
        type="button"
        class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-2"
        onClick={props.props.onToggleSidebar}
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
            props.props.openRouterApiKeyApplied().trim().length > 0,
        }}
        onClick={props.props.onOpenOpenRouterModal}
        title="OpenRouter API key"
        aria-label="OpenRouter API key"
        aria-haspopup="dialog"
        aria-expanded={props.props.openRouterApiKeyModalOpen()}
      >
        <KeyRound class="size-5 shrink-0" aria-hidden={true} />
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
        aria-expanded={true}
        aria-controls="chat-sidebar"
      >
        <PanelLeftClose class="size-4 shrink-0" aria-hidden={true} />
      </button>
    </div>
  )
}

function SidebarContent(props: { props: ChatAppSidebarProps }) {
  return (
    <div class="order-2 flex min-h-0 flex-1 flex-col sm:order-3">
      <MobileSidebarHeader props={props.props} />
      <SidebarPanelContent props={props.props} />
    </div>
  )
}

function MobileSidebarHeader(props: { props: ChatAppSidebarProps }) {
  return (
    <div class="border-border flex shrink-0 items-center justify-between gap-2 border-b p-3 sm:hidden">
      <button
        type="button"
        class="hover:bg-muted/50 -mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left"
        onClick={props.props.onToggleMobileSidebarPanel}
        aria-expanded={props.props.mobileSidebarPanelOpen()}
        aria-controls="sidebar-panel-content"
        id="sidebar-panel-disclosure"
      >
        <ChevronRight
          class="text-muted-foreground size-4 shrink-0 transition-transform"
          classList={{
            'rotate-90': props.props.mobileSidebarPanelOpen(),
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
        onClick={props.props.onCreateConversation}
      >
        New
      </button>
    </div>
  )
}

function SidebarPanelContent(props: { props: ChatAppSidebarProps }) {
  return (
    <div
      id="sidebar-panel-content"
      class="flex min-h-0 flex-1 flex-col"
      classList={{
        'max-sm:hidden': !props.props.mobileSidebarPanelOpen(),
      }}
    >
      <div class="flex min-h-0 flex-1 flex-col">
        <ConversationPane props={props.props} />
        <SidebarSettings props={props.props} />
      </div>
    </div>
  )
}

function ConversationPane(props: { props: ChatAppSidebarProps }) {
  return (
    <div class="order-1 flex min-h-0 flex-1 flex-col sm:order-2">
      <DesktopConversationHeader
        onCreateConversation={props.props.onCreateConversation}
      />
      <ConversationNav props={props.props} />
    </div>
  )
}

function DesktopConversationHeader(props: {
  onCreateConversation: () => void
}) {
  return (
    <div class="hidden shrink-0 items-center justify-between gap-2 p-3 sm:flex">
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
        class="hover:bg-muted min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-sm"
        classList={{
          'bg-muted font-medium':
            props.currentConversationId() === props.conversation.id,
        }}
        onClick={() => {
          setConfirmingDelete(false)
          props.onSelectConversation(props.conversation.id)
        }}
      >
        <span class="truncate">
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
            class="text-muted-foreground hover:text-destructive hover:bg-muted shrink-0 rounded-lg px-2 text-sm"
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
      aria-expanded={props.props.openRouterApiKeyModalOpen()}
    >
      <KeyRound class="size-3.5 shrink-0" aria-hidden={true} />
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
        <SquarePen class="size-3.5 shrink-0" aria-hidden={true} />
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
          aria-hidden={true}
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
