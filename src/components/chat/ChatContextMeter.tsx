import { Show } from 'solid-js'
import type { ContextUsage } from '../../lib/context-meter'
import { formatTokenCount } from './chat-thread-utils'

const BAR_COLOR = {
  ok: 'bg-primary',
  warn: 'bg-amber-500',
  critical: 'bg-red-500',
} as const

export function ChatContextMeter(props: {
  usage: () => ContextUsage | null
  compacting: () => boolean
  canUndo: () => boolean
  error: () => string | null
  disabled: () => boolean
  onCompact: () => void
  onUndo: () => void
}) {
  return (
    <Show when={props.usage()}>
      {(usage) => (
        <div
          class="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 pt-1 text-xs"
          data-testid="context-meter"
        >
          <div
            class="bg-muted h-1.5 w-24 shrink-0 overflow-hidden rounded-full"
            role="progressbar"
            aria-label="Context used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(usage().ratio * 100))}
          >
            <div
              class={`h-full ${BAR_COLOR[usage().level]}`}
              style={{ width: `${Math.min(100, usage().ratio * 100)}%` }}
            />
          </div>
          <span class="text-muted-foreground tabular-nums">
            ~{formatTokenCount(usage().used)} /{' '}
            {formatTokenCount(usage().limit)} context
          </span>
          <Show when={usage().canCompact || props.compacting()}>
            <button
              type="button"
              class="border-border hover:bg-muted rounded border px-2 py-0.5 disabled:opacity-50"
              disabled={props.disabled() || props.compacting()}
              onClick={props.onCompact}
            >
              {props.compacting() ? 'Compacting…' : 'Compact chat'}
            </button>
          </Show>
          <Show when={props.canUndo()}>
            <button
              type="button"
              class="text-muted-foreground hover:bg-muted rounded px-2 py-0.5"
              onClick={props.onUndo}
            >
              Undo compact
            </button>
          </Show>
          <Show when={props.error()}>
            <span class="text-red-500" role="alert">
              {props.error()}
            </span>
          </Show>
        </div>
      )}
    </Show>
  )
}
