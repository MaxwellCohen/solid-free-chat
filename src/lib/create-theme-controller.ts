import { createEffect, createMemo, createSignal, onMount } from 'solid-js'
import type { Accessor } from 'solid-js'

import type { ThemeContextValue } from './theme-context'
import {
  readStoredPreference,
  resolveEffectiveTheme,
  THEME_STORAGE_KEY,
  writeStoredPreference,
} from './theme-preference'
import type { ThemePreference } from './theme-preference'

export function createThemeController(): ThemeContextValue & {
  htmlClass: Accessor<string>
} {
  const [preference, setPreferenceState] = createSignal<ThemePreference>(
    typeof window === 'undefined' ? 'system' : readStoredPreference(),
  )

  const [systemDark, setSystemDark] = createSignal(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  const effective = createMemo(() =>
    resolveEffectiveTheme(preference(), systemDark()),
  )

  const htmlClass = createMemo(() => (effective() === 'dark' ? 'dark' : ''))

  const setPreference = (pref: ThemePreference) => {
    setPreferenceState(pref)
    writeStoredPreference(pref)
  }

  onMount(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)

    const fromStorage = readStoredPreference()
    if (fromStorage !== preference()) {
      setPreferenceState(fromStorage)
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== THEME_STORAGE_KEY) return
      setPreferenceState(readStoredPreference())
    }
    window.addEventListener('storage', onStorage)

    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('storage', onStorage)
    }
  })

  createEffect(() => {
    const dark = effective() === 'dark'
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  })

  return {
    preference,
    setPreference,
    effective,
    htmlClass,
  }
}
