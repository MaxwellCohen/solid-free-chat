import { For } from 'solid-js'

export type PreviewWidth = 'full' | 375 | 768

const WIDTHS: { label: string; value: PreviewWidth }[] = [
  { label: 'Mobile', value: 375 },
  { label: 'Tablet', value: 768 },
  { label: 'Full', value: 'full' },
]

const btn =
  'border-border text-foreground rounded-lg border px-2.5 py-1 text-xs font-medium'

export function DevPreviewToolbar(props: {
  width: PreviewWidth
  fullscreen: boolean
  onReload: () => void
  onWidth: (w: PreviewWidth) => void
  onOpenTab: () => void
  onToggleFullscreen: () => void
}) {
  return (
    <div class="border-border bg-background/90 flex flex-wrap items-center gap-1.5 border-b p-2">
      <button type="button" class={btn} onClick={props.onReload}>
        Reload
      </button>
      <div class="flex gap-1" role="group" aria-label="Preview width">
        <For each={WIDTHS}>
          {(w) => (
            <button
              type="button"
              class={[btn, props.width === w.value && 'bg-muted']}
              aria-pressed={props.width === w.value ? 'true' : 'false'}
              onClick={() => props.onWidth(w.value)}
            >
              {w.label}
            </button>
          )}
        </For>
      </div>
      <button type="button" class={btn} onClick={props.onOpenTab}>
        Open in new tab
      </button>
      <button
        type="button"
        class={[btn, 'ml-auto']}
        onClick={props.onToggleFullscreen}
      >
        {props.fullscreen ? 'Exit full screen' : 'Full screen'}
      </button>
    </div>
  )
}
