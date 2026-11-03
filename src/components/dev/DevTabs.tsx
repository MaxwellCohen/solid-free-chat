import { For } from 'solid-js'

export function DevTabs(props: {
  tabs: string[]
  selected: string
  modified: Set<string>
  onSelect: (p: string) => void
  onClose: (p: string) => void
}) {
  return (
    <div class="border-border bg-muted/40 flex overflow-x-auto border-b text-xs">
      <For each={props.tabs}>
        {(path) => (
          <div
            class={[
              'border-border flex shrink-0 items-center border-r',
              props.selected === path
                ? 'bg-card text-foreground'
                : 'text-muted-foreground',
            ]}
          >
            <button
              type="button"
              class="px-2 py-1"
              onClick={() => props.onSelect(path)}
            >
              {path}
              {props.modified.has(path) ? ' •' : ''}
            </button>
            <button
              type="button"
              class="hover:text-foreground pr-2"
              aria-label={`Close ${path}`}
              onClick={() => props.onClose(path)}
            >
              ×
            </button>
          </div>
        )}
      </For>
    </div>
  )
}
