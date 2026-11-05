import { For, Show } from 'solid-js'
import { maybe } from '../../lib/nullable'
import {
  Keyboard,
  ListTree,
  LoaderCircle,
  PanelLeft,
  Share2,
  SlidersHorizontal,
  SquarePen,
  Wrench,
} from '../icons'
import { getProvider } from '../../lib/providers'
import type { ChatModelOption } from '../../lib/chat-models'
import type { HarnessToolDescriptor } from '../../lib/harness/tools'

type ChatAppModelToolbarProps = {
  sidebarOpen: () => boolean
  onToggleSidebar: () => void
  onNewChat: () => void
  selectedModel: () => string
  selectDisabled: () => boolean
  selectOptions: () => ChatModelOption[]
  modelListLoading: () => boolean
  modelListError: () => unknown
  modelListEmpty: () => boolean
  isStreaming: () => boolean
  onModelChange: (value: string) => void
  showProvider: () => boolean
  shareDisabled: () => boolean
  shareBusy: () => boolean
  shareFeedback: () => string | null
  onShare: () => void
  outlineOpen: () => boolean
  onToggleOutline: () => void
  onOpenShortcuts: () => void
  onOpenTour: () => void
  onOpenSettings: () => void
  settingsActive: () => boolean
  tools: readonly HarnessToolDescriptor[]
  enabledToolIds: () => string[]
  toolsSupported: () => boolean
  onToggleTool: (toolId: string) => void
}

export function ChatAppModelToolbar(props: ChatAppModelToolbarProps) {
  return (
    <header
      data-testid="chat-toolbar"
      class="border-border flex shrink-0 flex-col gap-2 border-b px-3 py-2 sm:gap-3 sm:px-6 sm:py-3"
    >
      <ToolbarRow props={props} />
      <Show when={props.shareFeedback()} keyed>
        {(message) => (
          <p
            class="text-muted-foreground text-xs"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>
        )}
      </Show>
    </header>
  )
}

function ToolbarRow(props: { props: ChatAppModelToolbarProps }) {
  return (
    <div class="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
      <SidebarToggleButton props={props.props} />
      <NewChatButton onNewChat={props.props.onNewChat} />
      <ModelPicker props={props.props} />
      <ToolsMenu props={props.props} />
      <SettingsButton props={props.props} />
      <ShareButton props={props.props} />
      <OutlineButton
        open={props.props.outlineOpen}
        onToggle={props.props.onToggleOutline}
      />
      <ShortcutsButton onOpen={props.props.onOpenShortcuts} />
      <TourButton onOpen={props.props.onOpenTour} />
      <StreamingIndicator isStreaming={props.props.isStreaming} />
      <ModelStatusMessage props={props.props} />
    </div>
  )
}

function ToolsMenu(props: { props: ChatAppModelToolbarProps }) {
  let details: HTMLDetailsElement | undefined
  // Tolerate a missing accessor (e.g. a stale parent after a hot reload) so the
  // toolbar degrades to "no tools enabled" instead of crashing the page.
  const enabledToolIds = () => maybe(props.props.enabledToolIds)?.() ?? []
  const enabledCount = () => enabledToolIds().length
  const isEnabled = (id: string) => enabledToolIds().includes(id)

  return (
    <details
      ref={details}
      class="relative shrink-0"
      onFocusOut={(e) => {
        const next = e.relatedTarget as Node | null
        if (details && (!next || !details.contains(next))) details.open = false
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && details?.open) {
          e.stopPropagation()
          details.open = false
          details.querySelector('summary')?.focus()
        }
      }}
    >
      <summary
        class="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium select-none [&::-webkit-details-marker]:hidden"
        title="Browser tools available to the model"
        aria-label={`Tools (${enabledCount()} enabled)`}
      >
        <Wrench class="size-4 shrink-0" aria-hidden="true" />
        <span class="hidden sm:inline">Tools</span>
        <Show when={enabledCount() > 0}>
          <span class="bg-muted text-foreground rounded px-1.5 text-xs tabular-nums">
            {enabledCount()}
          </span>
        </Show>
      </summary>
      <div class="border-border bg-background absolute right-0 z-20 mt-2 w-72 rounded-xl border p-2 shadow-lg">
        <p class="text-muted-foreground px-2 pt-1 pb-2 text-xs">
          Tools run locally in your browser.
        </p>
        <Show when={!props.props.toolsSupported()}>
          <p class="text-destructive px-2 pb-2 text-xs">
            The selected model does not support tool calling, so tools are
            disabled for it.
          </p>
        </Show>
        <For each={props.props.tools}>
          {(tool) => (
            <label class="hover:bg-muted/60 flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2">
              <input
                type="checkbox"
                class="mt-0.5"
                checked={isEnabled(tool.id)}
                onChange={() => props.props.onToggleTool(tool.id)}
              />
              <span class="min-w-0">
                <span class="block text-sm font-medium">{tool.label}</span>
                <span class="text-muted-foreground block text-xs">
                  {tool.summary}
                </span>
                <Show when={tool.network}>
                  <span class="text-muted-foreground block text-xs italic">
                    {tool.network}
                  </span>
                </Show>
              </span>
            </label>
          )}
        </For>
      </div>
    </details>
  )
}

function SettingsButton(props: { props: ChatAppModelToolbarProps }) {
  return (
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium"
      onClick={() => props.props.onOpenSettings()}
      title="Chat settings"
      aria-label={
        props.props.settingsActive()
          ? 'Chat settings (customized)'
          : 'Chat settings'
      }
    >
      <SlidersHorizontal class="size-4 shrink-0" aria-hidden="true" />
      <span class="hidden sm:inline">Settings</span>
      <Show when={props.props.settingsActive()}>
        <span
          class="bg-primary absolute top-1 right-1 size-2 rounded-full"
          aria-hidden="true"
        />
      </Show>
    </button>
  )
}

function OutlineButton(props: { open: () => boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      class={[
        'text-muted-foreground hover:bg-muted hover:text-foreground hidden shrink-0 items-center justify-center rounded-lg p-2 lg:inline-flex',
        { 'bg-muted text-foreground': props.open() },
      ]}
      onClick={() => props.onToggle()}
      title="Toggle outline"
      aria-label="Toggle outline"
      aria-pressed={props.open() ? 'true' : 'false'}
    >
      <ListTree class="size-4 shrink-0" aria-hidden="true" />
    </button>
  )
}

function ShortcutsButton(props: { onOpen: () => void }) {
  return (
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground hidden shrink-0 items-center justify-center rounded-lg p-2 sm:inline-flex"
      onClick={() => props.onOpen()}
      title="Keyboard shortcuts"
      aria-label="Keyboard shortcuts"
    >
      <Keyboard class="size-4 shrink-0" aria-hidden="true" />
    </button>
  )
}

function TourButton(props: { onOpen: () => void }) {
  return (
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground hidden shrink-0 items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-semibold sm:inline-flex"
      onClick={() => props.onOpen()}
      title="What's new / Tour"
      aria-label="What's new / Tour"
    >
      ?
    </button>
  )
}

function ShareButton(props: { props: ChatAppModelToolbarProps }) {
  return (
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium disabled:pointer-events-none disabled:opacity-40"
      disabled={props.props.shareDisabled() || props.props.shareBusy()}
      onClick={() => props.props.onShare()}
      title="Copy read-only share link"
      aria-label="Copy read-only share link"
    >
      <Share2 class="size-4 shrink-0" aria-hidden="true" />
      <span class="hidden sm:inline">Share</span>
    </button>
  )
}

function SidebarToggleButton(props: { props: ChatAppModelToolbarProps }) {
  return (
    <Show when={!props.props.sidebarOpen()}>
      <button
        type="button"
        class="text-muted-foreground bg-muted/60 hover:bg-muted inline-flex shrink-0 items-center gap-2 rounded-lg p-2 text-sm font-medium sm:hidden"
        onClick={props.props.onToggleSidebar}
        title="Show chat list"
        aria-label="Show chat list"
        aria-expanded="false"
        aria-controls="chat-sidebar"
      >
        <PanelLeft class="size-4 shrink-0" aria-hidden="true" />
      </button>
    </Show>
  )
}

function NewChatButton(props: { onNewChat: () => void }) {
  return (
    <button
      type="button"
      class="text-muted-foreground bg-muted/60 hover:bg-muted inline-flex shrink-0 items-center gap-2 rounded-lg p-2 text-sm font-medium sm:hidden"
      onClick={() => props.onNewChat()}
      title="New chat"
      aria-label="New chat"
    >
      <SquarePen class="size-4 shrink-0" aria-hidden="true" />
    </button>
  )
}

function ModelPicker(props: { props: ChatAppModelToolbarProps }) {
  return (
    <label class="text-muted-foreground flex min-w-0 flex-1 items-center gap-2 text-sm">
      <span class="shrink-0 whitespace-nowrap max-sm:sr-only">Model</span>
      <select
        class="border-input bg-background min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm"
        value={props.props.selectedModel()}
        disabled={props.props.selectDisabled()}
        onChange={(e) => props.props.onModelChange(e.currentTarget.value)}
      >
        <ModelOptionList props={props.props} />
      </select>
    </label>
  )
}

function ModelOptionList(props: { props: ChatAppModelToolbarProps }) {
  return (
    <>
      <Show when={props.props.modelListLoading()}>
        <option value={props.props.selectedModel()}>Loading models…</option>
      </Show>
      <Show
        when={!props.props.modelListLoading() && props.props.modelListError()}
      >
        <For each={props.props.selectOptions()}>
          {(model) => (
            <option value={`${model.providerId}\n${model.id}`}>
              {props.props.showProvider()
                ? `${getProvider(model.providerId).name}: `
                : ''}
              {model.name} ({model.id})
            </option>
          )}
        </For>
      </Show>
      <Show
        when={!props.props.modelListLoading() && !props.props.modelListError()}
      >
        <For each={props.props.selectOptions()}>
          {(model) => (
            <option value={`${model.providerId}\n${model.id}`}>
              {props.props.showProvider()
                ? `${getProvider(model.providerId).name}: `
                : ''}
              {model.name} ({model.id})
            </option>
          )}
        </For>
      </Show>
    </>
  )
}

function StreamingIndicator(props: { isStreaming: () => boolean }) {
  return (
    <span
      class="inline-flex shrink-0 items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label={props.isStreaming() ? 'Streaming response' : 'Idle'}
      title={props.isStreaming() ? 'Streaming response' : 'Idle'}
    >
      <LoaderCircle
        class={[
          'size-4 transition-colors',
          {
            'animate-spin text-primary': props.isStreaming(),
            'text-muted-foreground/60': !props.isStreaming(),
          },
        ]}
        aria-hidden="true"
      />
    </span>
  )
}

function ModelStatusMessage(props: { props: ChatAppModelToolbarProps }) {
  return (
    <>
      <Show when={props.props.modelListError()} keyed>
        {(err) => (
          <span class="text-destructive min-w-0 truncate text-xs max-sm:basis-full">
            {err instanceof Error ? err.message : String(err)}
          </span>
        )}
      </Show>
      <Show when={props.props.modelListEmpty()}>
        <span class="text-muted-foreground min-w-0 truncate text-xs max-sm:basis-full">
          No free text models returned for your API key.
        </span>
      </Show>
    </>
  )
}
