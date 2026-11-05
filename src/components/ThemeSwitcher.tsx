import { For } from 'solid-js'
import { Computer, Moon, Sun } from './icons'

import { useTheme } from '~/lib/theme-context'
import { ACCENTS } from '~/lib/theme-preference'
import type { ThemePreference } from '~/lib/theme-preference'

const ACCENT_SWATCH: Record<string, string> = {
  default: 'oklch(0.55 0.01 286)',
  indigo: 'oklch(0.5 0.2 277)',
  emerald: 'oklch(0.6 0.14 160)',
  rose: 'oklch(0.6 0.2 17)',
  amber: 'oklch(0.75 0.16 70)',
  sky: 'oklch(0.65 0.13 235)',
  violet: 'oklch(0.55 0.2 293)',
}

const OPTIONS: Array<{
  value: ThemePreference
  label: string
  Icon: typeof Sun
}> = [
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
  { value: 'system', label: 'Match system', Icon: Computer },
]

export default function ThemeSwitcher() {
  const theme = useTheme()

  return (
    <div class="inline-flex items-center gap-2">
      <div
        class="border-border bg-muted/50 inline-flex rounded-lg border p-0.5"
        role="group"
        aria-label="Theme"
      >
        <For each={OPTIONS}>
          {(opt) => (
            <button
              type="button"
              class={[
                'text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors',
                {
                  'bg-background text-foreground shadow-sm':
                    theme.preference() === opt.value,
                },
              ]}
              aria-label={opt.label}
              aria-pressed={theme.preference() === opt.value ? 'true' : 'false'}
              onClick={() => theme.setPreference(opt.value)}
            >
              <opt.Icon
                class="size-4 shrink-0"
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>
          )}
        </For>
      </div>
      <div
        class="inline-flex items-center gap-1"
        role="group"
        aria-label="Accent color"
      >
        <For each={ACCENTS}>
          {(a) => (
            <button
              type="button"
              class={[
                'size-4 rounded-full border transition-shadow',
                theme.accent() === a
                  ? 'ring-foreground ring-2 ring-offset-1'
                  : 'border-border',
              ]}
              style={{ 'background-color': ACCENT_SWATCH[a] }}
              aria-label={`Accent: ${a}`}
              aria-pressed={theme.accent() === a ? 'true' : 'false'}
              onClick={() => theme.setAccent(a)}
            />
          )}
        </For>
      </div>
    </div>
  )
}
