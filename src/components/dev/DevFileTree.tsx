import { For } from 'solid-js'

export function DevFileTree(props: {
  paths: string[]
  selected: string
  modified: Set<string>
  onSelect: (p: string) => void
  onAdd: () => void
  onRename: (p: string) => void
  onDelete: (p: string) => void
}) {
  return (
    <div class="border-border bg-muted/40 flex flex-col overflow-auto border-r p-1 text-xs">
      <button
        type="button"
        class="border-border text-foreground mb-1 rounded border px-2 py-1"
        aria-label="Add file"
        onClick={props.onAdd}
      >
        + New file
      </button>
      <ul>
        <For each={props.paths}>
          {(path) => (
            <li class="group flex items-center">
              <button
                type="button"
                class={[
                  'flex min-w-0 flex-1 items-center gap-1 rounded px-2 py-1 text-left',
                  props.selected === path
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground',
                ]}
                onClick={() => props.onSelect(path)}
              >
                <span class="truncate">{path}</span>
                {props.modified.has(path) && (
                  <span
                    class="bg-primary size-1.5 shrink-0 rounded-full"
                    title="Modified since last build"
                  />
                )}
              </button>
              <span
                class={[
                  'shrink-0 gap-0.5 group-hover:flex',
                  props.selected === path ? 'flex' : 'hidden',
                ]}
              >
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground px-1"
                  aria-label={`Rename ${path}`}
                  onClick={() => props.onRename(path)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-destructive px-1"
                  aria-label={`Delete ${path}`}
                  onClick={() => props.onDelete(path)}
                >
                  ×
                </button>
              </span>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}
