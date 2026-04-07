import { createContext, useContext } from 'solid-js'
import type { Accessor, ParentProps } from 'solid-js'

import type { ThemePreference } from './theme-preference'

export type ThemeContextValue = {
  preference: Accessor<ThemePreference>
  setPreference: (pref: ThemePreference) => void
  effective: Accessor<'light' | 'dark'>
}

export const ThemeContext = createContext<ThemeContextValue>()

export function ThemeProvider(
  props: ParentProps<{ value: ThemeContextValue }>,
) {
  return (
    <ThemeContext.Provider value={props.value}>
      {props.children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
