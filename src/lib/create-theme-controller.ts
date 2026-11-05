import { createEffect, createMemo, createSignal, onSettled } from 'solid-js'
import type { Accessor } from 'solid-js'

import type { ThemeContextValue } from './theme-context'
import {
  ACCENT_STORAGE_KEY,
  readStoredAccent,
  readStoredPreference,
  resolveEffectiveTheme,
  THEME_STORAGE_KEY,
  writeStoredAccent,
  writeStoredPreference,
} from './theme-preference'
import type { AccentPreference, ThemePreference } from './theme-preference'

export function createThemeController(): ThemeContextValue & {
  htmlClass: Accessor<string>
} {
  const [preference, setPreferenceState] = createSignal<ThemePreference>(
    typeof window === 'undefined' ? 'system' : readStoredPreference(),
  )

  const [accent, setAccentState] = createSignal<AccentPreference>(
    typeof window === 'undefined' ? 'default' : readStoredAccent(),
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

  const setAccent = (a: AccentPreference) => {
    setAccentState(a)
    writeStoredAccent(a)
  }

  onSettled(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)

    const fromStorage = readStoredPreference()
    if (fromStorage !== preference()) {
      setPreferenceState(fromStorage)
    }

    const onStorage = (e: StorageEvent) => {
      if (
        e.key !== null &&
        e.key !== THEME_STORAGE_KEY &&
        e.key !== ACCENT_STORAGE_KEY
      )
        return
      setPreferenceState(readStoredPreference())
      setAccentState(readStoredAccent())
    }
    window.addEventListener('storage', onStorage)

    return () => {
      mq.removeEventListener('change', onChange)
      window.removeEventListener('storage', onStorage)
    }
  })

  createEffect(
    () => effective() === 'dark',
    (dark) => {
      if (typeof document === 'undefined') return
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    },
  )

  createEffect(accent, (a) => {
    if (typeof document === 'undefined') return
    if (a === 'default') document.documentElement.removeAttribute('data-accent')
    else document.documentElement.setAttribute('data-accent', a)
  })

  return {
    accent,
    setAccent,
    preference,
    setPreference,
    effective,
    htmlClass,
  }
}
