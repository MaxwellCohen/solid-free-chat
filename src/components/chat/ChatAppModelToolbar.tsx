import { For, Show } from 'solid-js'
import { LoaderCircle, PanelLeft } from 'lucide-solid'
import type { ChatModelOption } from '../../lib/chat-models'

type ChatAppModelToolbarProps = {
  sidebarOpen: () => boolean
  onToggleSidebar: () => void
  selectedModel: () => string
  selectDisabled: () => boolean
  selectOptions: () => ChatModelOption[]
  modelListLoading: () => boolean
  modelListError: () => unknown
  modelListEmpty: () => boolean
  isStreaming: () => boolean
  onModelChange: (modelId: string) => void
}

export function ChatAppModelToolbar(props: ChatAppModelToolbarProps) {
  return (
    <header class="border-border flex shrink-0 flex-col gap-3 border-b px-3 py-3 sm:px-6">
      <ToolbarRow props={props} />
    </header>
  )
}

function ToolbarRow(props: { props: ChatAppModelToolbarProps }) {
  return (
    <div class="flex min-w-0 flex-nowrap items-center gap-2 sm:gap-3">
      <SidebarToggleButton props={props.props} />
      <ModelPicker props={props.props} />
      <StreamingIndicator isStreaming={props.props.isStreaming} />
      <ModelStatusMessage props={props.props} />
    </div>
  )
}

function SidebarToggleButton(props: { props: ChatAppModelToolbarProps }) {
  return (
    <Show when={!props.props.sidebarOpen()}>
      <button
        type="button"
        class="text-muted-foreground bg-muted/60 hover:bg-muted inline-flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium sm:hidden"
        onClick={props.props.onToggleSidebar}
        aria-expanded={false}
        aria-controls="chat-sidebar"
      >
        <PanelLeft class="size-4 shrink-0" aria-hidden={true} />
        Chats
      </button>
    </Show>
  )
}

function ModelPicker(props: { props: ChatAppModelToolbarProps }) {
  return (
    <label class="text-muted-foreground flex min-w-0 flex-1 items-center gap-2 text-sm">
      <span class="shrink-0 whitespace-nowrap">Model</span>
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
      <Show when={!props.props.modelListLoading() && props.props.modelListError()}>
        <For each={props.props.selectOptions()}>
          {(model) => (
            <option value={model.id}>
              {model.name} ({model.id})
            </option>
          )}
        </For>
      </Show>
      <Show when={!props.props.modelListLoading() && !props.props.modelListError()}>
        <For each={props.props.selectOptions()}>
          {(model) => (
            <option value={model.id}>
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
        class="size-4 transition-colors"
        classList={{
          'animate-spin text-primary': props.isStreaming(),
          'text-muted-foreground/60': !props.isStreaming(),
        }}
        aria-hidden={true}
      />
    </span>
  )
}

function ModelStatusMessage(props: { props: ChatAppModelToolbarProps }) {
  return (
    <>
      <Show when={props.props.modelListError()} keyed>
        {(err) => (
          <span class="text-destructive min-w-0 truncate text-xs">
            {err instanceof Error ? err.message : String(err)}
          </span>
        )}
      </Show>
      <Show when={props.props.modelListEmpty()}>
        <span class="text-muted-foreground min-w-0 truncate text-xs">
          No free text models returned for your API key.
        </span>
      </Show>
    </>
  )
}
