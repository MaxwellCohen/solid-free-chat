import { For, Show } from 'solid-js'

import { DEV_TEMPLATES } from '../../lib/dev-templates'

const btn =
  'border-border text-foreground rounded-lg border px-3 py-1.5 text-sm font-medium'

export function DevTemplateMenu(props: {
  saved: string[]
  onTemplate: (id: string) => void
  onSave: () => void
  onLoad: (name: string) => void
  onDeleteSaved: (name: string) => void
}) {
  return (
    <>
      <select
        class={`${btn} bg-card`}
        aria-label="Template"
        value=""
        onChange={(e) => {
          const id = e.currentTarget.value
          e.currentTarget.value = ''
          if (id) props.onTemplate(id)
        }}
      >
        <option value="">Template…</option>
        <For each={DEV_TEMPLATES}>
          {(t) => <option value={t.id}>{t.name}</option>}
        </For>
      </select>
      <button type="button" class={btn} onClick={props.onSave}>
        Save
      </button>
      <Show when={props.saved.length > 0}>
        <select
          class={`${btn} bg-card`}
          aria-label="Load workspace"
          value=""
          onChange={(e) => {
            const name = e.currentTarget.value
            e.currentTarget.value = ''
            if (name) props.onLoad(name)
          }}
        >
          <option value="">Load…</option>
          <For each={props.saved}>
            {(name) => <option value={name}>{name}</option>}
          </For>
        </select>
        <select
          class={`${btn} bg-card`}
          aria-label="Delete saved workspace"
          value=""
          onChange={(e) => {
            const name = e.currentTarget.value
            e.currentTarget.value = ''
            if (name) props.onDeleteSaved(name)
          }}
        >
          <option value="">Delete…</option>
          <For each={props.saved}>
            {(name) => <option value={name}>{name}</option>}
          </For>
        </select>
      </Show>
    </>
  )
}
