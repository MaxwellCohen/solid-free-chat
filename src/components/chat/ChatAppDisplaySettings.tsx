import { For, createSignal } from 'solid-js'
import {
  FONT_SIZES,
  MESSAGE_WIDTHS,
  applyDisplayPrefs,
  readDisplayPrefs,
  writeDisplayPrefs,
} from '../../lib/display-prefs'
import type { DisplayPrefs } from '../../lib/display-prefs'
import { readSmartTitles, writeSmartTitles } from '../../lib/auto-title'
import { useTheme } from '../../lib/theme-context'
import { ACCENTS, ACCENT_SWATCH } from '../../lib/theme-preference'

const FONT_LABELS = { s: 'S', m: 'M', l: 'L', xl: 'XL' } as const
const SELECT_CLASS =
  'border-input bg-background rounded-lg border px-2 py-1.5 text-sm font-normal'

/** Display preferences: saved in localStorage and applied to <html> immediately. */
export function ChatAppDisplaySettings() {
  const theme = useTheme()
  const [smartTitles, setSmartTitles] = createSignal(readSmartTitles())
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
      <div
        class="flex flex-col gap-1 text-xs font-semibold"
        role="group"
        aria-label="Appearance accent"
      >
        Accent color
        <div class="flex flex-wrap items-center gap-2">
          <For each={ACCENTS}>
            {(a) => (
              <button
                type="button"
                class={[
                  'size-7 rounded-full border transition-shadow',
                  theme.accent() === a
                    ? 'ring-foreground ring-2 ring-offset-2'
                    : 'border-border',
                ]}
                style={{ 'background-color': ACCENT_SWATCH[a] }}
                aria-label={`Set accent: ${a}`}
                aria-pressed={theme.accent() === a ? 'true' : 'false'}
                onClick={() => theme.setAccent(a)}
              />
            )}
          </For>
        </div>
      </div>
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
      <label class="flex items-start gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          class="mt-0.5"
          checked={smartTitles()}
          onChange={(e) => {
            setSmartTitles(e.currentTarget.checked)
            writeSmartTitles(e.currentTarget.checked)
          }}
        />
        <span>
          Smart chat titles
          <span class="text-muted-foreground block font-normal">
            One tiny extra request names a new chat after the first reply. Off
            by default; titles always fall back to your first words.
          </span>
        </span>
      </label>
    </fieldset>
  )
}
