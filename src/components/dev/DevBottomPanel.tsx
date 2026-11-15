import { For, Show } from 'solid-js'

import type { Snapshot } from '../../lib/dev-history'

export interface ConsoleEntry {
  level: string
  text: string
}

export type PanelTab = 'console' | 'errors' | 'history'

const levelClass = (level: string) =>
  level === 'error'
    ? 'text-destructive'
    : level === 'warn'
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-foreground'

export function DevBottomPanel(props: {
  tab: PanelTab
  onTab: (t: PanelTab) => void
  consoleEntries: ConsoleEntry[]
  buildErrors: string[]
  history: Snapshot[]
  onRestore: (s: Snapshot) => void
}) {
  const tabClass = (t: PanelTab) => [
    'rounded px-2 py-1 text-xs font-medium',
    props.tab === t ? 'bg-muted text-foreground' : 'text-muted-foreground',
  ]
  return (
    <div class="border-border bg-card overflow-hidden rounded-xl border">
      <div class="border-border flex gap-1 border-b p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={props.tab === 'console' ? 'true' : 'false'}
          class={tabClass('console')}
          onClick={() => props.onTab('console')}
        >
          Console
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.tab === 'errors' ? 'true' : 'false'}
          class={tabClass('errors')}
          onClick={() => props.onTab('errors')}
        >
          Build errors
          <Show when={props.buildErrors.length > 0}>
            <span class="bg-destructive text-primary-foreground ml-1 rounded-full px-1.5 text-[10px]">
              {props.buildErrors.length}
            </span>
          </Show>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.tab === 'history' ? 'true' : 'false'}
          class={tabClass('history')}
          onClick={() => props.onTab('history')}
        >
          History
        </button>
      </div>
      <div class="h-32 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">
        <Show when={props.tab === 'console'}>
          <Show
            when={props.consoleEntries.length > 0}
            fallback={
              <span class="text-muted-foreground">
                Preview console output appears here.
              </span>
            }
          >
            <For each={props.consoleEntries}>
              {(entry) => (
                <div class={levelClass(entry.level)}>
                  [{entry.level}] {entry.text}
                </div>
              )}
            </For>
          </Show>
        </Show>
        <Show when={props.tab === 'errors'}>
          <Show
            when={props.buildErrors.length > 0}
            fallback={
              <span class="text-muted-foreground">No build errors.</span>
            }
          >
            <div class="text-destructive">{props.buildErrors.join('\n')}</div>
          </Show>
        </Show>
        <Show when={props.tab === 'history'}>
          <Show
            when={props.history.length > 0}
            fallback={
              <span class="text-muted-foreground">
                AI changes are recorded here.
              </span>
            }
          >
            <ul class="space-y-1">
              <For each={[...props.history].reverse()}>
                {(s) => (
                  <li class="flex items-center justify-between gap-2">
                    <span class="text-foreground truncate">
                      {new Date(s.at).toLocaleTimeString()} - {s.label}
                    </span>
                    <button
                      type="button"
                      class="border-border text-foreground shrink-0 rounded border px-2 py-0.5"
                      onClick={() => props.onRestore(s)}
                    >
                      Restore
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </div>
    </div>
  )
}
