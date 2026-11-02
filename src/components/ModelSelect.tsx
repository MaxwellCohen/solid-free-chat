import { For, createSignal, onSettled } from 'solid-js'
import {
  loadAllModelOptions,
  storeToolModelSelection,
} from '../lib/model-options'
import type { ModelSelection } from '../lib/model-options'
import type { ChatModelOption } from '../lib/chat-models'
import { getProvider } from '../lib/providers'

/** Model picker spanning all keyed providers; used outside the chat page. */
export function ModelSelect(props: {
  value: () => ModelSelection
  onChange: (v: ModelSelection) => void
}) {
  const [options, setOptions] = createSignal<ChatModelOption[]>([])
  onSettled(() => {
    void loadAllModelOptions().then((r) => setOptions(r.options))
  })
  const encode = (p: string, m: string) => `${p}\n${m}`
  const list = () => {
    const v = props.value()
    const all = options()
    return all.some((o) => o.id === v.modelId && o.providerId === v.providerId)
      ? all
      : [...all, { id: v.modelId, name: v.modelId, providerId: v.providerId }]
  }
  const multi = () => new Set(options().map((o) => o.providerId)).size > 1
  return (
    <select
      aria-label="Model"
      class="border-input bg-background max-w-64 min-w-0 rounded-lg border px-2 py-1.5 text-sm"
      value={encode(props.value().providerId, props.value().modelId)}
      onChange={(e) => {
        const raw = e.currentTarget.value
        const i = raw.indexOf('\n')
        const next = { providerId: raw.slice(0, i), modelId: raw.slice(i + 1) }
        storeToolModelSelection(next)
        props.onChange(next)
      }}
    >
      <For each={list()}>
        {(m) => (
          <option value={encode(m.providerId ?? 'openrouter', m.id)}>
            {multi() ? `${getProvider(m.providerId).name}: ` : ''}
            {m.name}
          </option>
        )}
      </For>
    </select>
  )
}
