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
  return <ThemeContext value={props.value}>{props.children}</ThemeContext>
}

export function useTheme() {
  return useContext(ThemeContext)
}
