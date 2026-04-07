import { For } from 'solid-js'
import { Computer, Moon, Sun } from 'lucide-solid'

import { useTheme } from '~/lib/theme-context'
import type { ThemePreference } from '~/lib/theme-preference'

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
    <div
      class="border-border bg-muted/50 inline-flex rounded-lg border p-0.5"
      role="group"
      aria-label="Theme"
    >
      <For each={OPTIONS}>
        {(opt) => (
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
            classList={{
              'bg-background text-foreground shadow-sm':
                theme.preference() === opt.value,
            }}
            aria-label={opt.label}
            aria-pressed={theme.preference() === opt.value}
            onClick={() => theme.setPreference(opt.value)}
          >
            <opt.Icon
              class="size-4 shrink-0"
              strokeWidth={2}
              aria-hidden={true}
            />
          </button>
        )}
      </For>
    </div>
  )
}
