import { describe, expect, it } from 'vitest'

import {
  ACCENTS,
  THEME_INLINE_INIT_SCRIPT,
  parseAccent,
  parseThemePreference,
  resolveEffectiveTheme,
} from './theme-preference'

describe('theme preference parsing', () => {
  it('accepts known accents and falls back to default', () => {
    for (const a of ACCENTS) expect(parseAccent(a)).toBe(a)
    expect(parseAccent('hotpink')).toBe('default')
    expect(parseAccent(null)).toBe('default')
    expect(parseAccent(5)).toBe('default')
  })
  it('parses theme preference', () => {
    expect(parseThemePreference('dark')).toBe('dark')
    expect(parseThemePreference('x')).toBe('system')
  })
  it('resolves effective theme', () => {
    expect(resolveEffectiveTheme('system', true)).toBe('dark')
    expect(resolveEffectiveTheme('light', true)).toBe('light')
  })
  it('init script applies accent', () => {
    expect(THEME_INLINE_INIT_SCRIPT).toContain('data-accent')
  })
})
