import { Show, onSettled } from 'solid-js'
import { bindModalFocus } from '../../lib/modal-focus'
import { MAX_TEMPERATURE, MIN_TEMPERATURE } from '../../lib/chat-settings'
import type { ChatSettings } from '../../lib/chat-settings'

export function ChatAppSettingsModal(props: {
  open: () => boolean
  currentConversationId: () => string | null
  settings: () => ChatSettings | undefined
  onChange: (patch: Partial<Record<keyof ChatSettings, unknown>>) => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <Show when={props.open() && props.currentConversationId()}>
      <SettingsModalDialog
        settings={props.settings}
        onChange={props.onChange}
        onReset={props.onReset}
        onClose={props.onClose}
      />
    </Show>
  )
}

function SettingsModalDialog(props: {
  settings: () => ChatSettings | undefined
  onChange: (patch: Partial<Record<keyof ChatSettings, unknown>>) => void
  onReset: () => void
  onClose: () => void
}) {
  let dialogEl: HTMLDivElement | undefined
  onSettled(() => bindModalFocus(dialogEl))

  const temperature = () => props.settings()?.temperature

  return (
    <div
      class="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/50"
        aria-label="Close chat settings"
        onClick={props.onClose}
      />
      <div
        ref={(el) => {
          dialogEl = el
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabindex="-1"
        class="border-border bg-card text-card-foreground relative z-10 flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-xl border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-start justify-between gap-3">
          <h2
            id="settings-modal-title"
            class="text-foreground text-base font-semibold tracking-tight"
          >
            Chat settings
          </h2>
          <button
            type="button"
            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg px-2 py-1 text-sm"
            onClick={props.onClose}
          >
            Close
          </button>
        </div>
        <label class="flex flex-col gap-1 text-xs font-semibold">
          Custom instructions
          <textarea
            class="border-input bg-background min-h-24 rounded-lg border px-2 py-1.5 text-sm font-normal"
            placeholder="Added to the system prompt for this chat only"
            value={props.settings()?.systemPrompt ?? ''}
            onChange={(e) =>
              props.onChange({ systemPrompt: e.currentTarget.value })
            }
          />
        </label>
        <div class="flex flex-col gap-1 text-xs font-semibold">
          <div class="flex items-center justify-between">
            <label for="chat-settings-temperature">Temperature</label>
            <span class="text-muted-foreground font-normal tabular-nums">
              {temperature() === undefined ? 'default' : temperature()}
              <Show when={temperature() !== undefined}>
                {' '}
                <button
                  type="button"
                  class="underline"
                  onClick={() => props.onChange({ temperature: undefined })}
                >
                  reset
                </button>
              </Show>
            </span>
          </div>
          <input
            id="chat-settings-temperature"
            type="range"
            min={MIN_TEMPERATURE}
            max={MAX_TEMPERATURE}
            step="0.05"
            value={temperature() ?? 1}
            onInput={(e) =>
              props.onChange({ temperature: Number(e.currentTarget.value) })
            }
          />
        </div>
        <label class="flex flex-col gap-1 text-xs font-semibold">
          Max tokens
          <input
            type="number"
            min="1"
            step="1"
            placeholder="Default"
            class="border-input bg-background rounded-lg border px-2 py-1.5 text-sm font-normal"
            value={props.settings()?.maxTokens ?? ''}
            onChange={(e) => {
              const v = e.currentTarget.value.trim()
              props.onChange({ maxTokens: v === '' ? undefined : Number(v) })
            }}
          />
        </label>
        <div>
          <button
            type="button"
            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg px-2 py-1 text-sm"
            onClick={props.onReset}
          >
            Reset all to defaults
          </button>
        </div>
      </div>
    </div>
  )
}
