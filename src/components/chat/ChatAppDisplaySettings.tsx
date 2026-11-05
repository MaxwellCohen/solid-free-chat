import { For, createSignal } from 'solid-js'
import {
  FONT_SIZES,
  MESSAGE_WIDTHS,
  applyDisplayPrefs,
  readDisplayPrefs,
  writeDisplayPrefs,
} from '../../lib/display-prefs'
import type { DisplayPrefs } from '../../lib/display-prefs'

const FONT_LABELS = { s: 'S', m: 'M', l: 'L', xl: 'XL' } as const
const SELECT_CLASS =
  'border-input bg-background rounded-lg border px-2 py-1.5 text-sm font-normal'

/** Display preferences: saved in localStorage and applied to <html> immediately. */
export function ChatAppDisplaySettings() {
  const [prefs, setPrefs] = createSignal(readDisplayPrefs())

  function update(patch: Partial<DisplayPrefs>) {
    const next = { ...prefs(), ...patch }
    setPrefs(next)
    writeDisplayPrefs(next)
    applyDisplayPrefs(next)
  }

  return (
    <fieldset class="border-border flex flex-col gap-3 rounded-lg border p-3">
      <legend class="px-1 text-xs font-semibold">Display</legend>
      <label class="flex flex-col gap-1 text-xs font-semibold">
        Font size
        <select
          class={SELECT_CLASS}
          value={prefs().fontSize}
          onChange={(e) =>
            update({
              fontSize: e.currentTarget.value as DisplayPrefs['fontSize'],
            })
          }
        >
          <For each={FONT_SIZES}>
            {(size) => <option value={size}>{FONT_LABELS[size]}</option>}
          </For>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-xs font-semibold">
        Message width
        <select
          class={SELECT_CLASS}
          value={prefs().messageWidth}
          onChange={(e) =>
            update({
              messageWidth: e.currentTarget
                .value as DisplayPrefs['messageWidth'],
            })
          }
        >
          <For each={MESSAGE_WIDTHS}>
            {(width) => <option value={width}>{width}</option>}
          </For>
        </select>
      </label>
      <label class="flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={prefs().compact}
          onChange={(e) => update({ compact: e.currentTarget.checked })}
        />
        Compact message spacing
      </label>
      <label class="flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={prefs().hideUsage}
          onChange={(e) => update({ hideUsage: e.currentTarget.checked })}
        />
        Hide token and cost badges
      </label>
    </fieldset>
  )
}
