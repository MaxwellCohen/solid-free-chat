import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DISPLAY_PREFS,
  DISPLAY_INLINE_INIT_SCRIPT,
  DISPLAY_STORAGE_KEY,
  displayPrefsToAttributes,
  parseDisplayPrefs,
} from './display-prefs'

describe('display prefs', () => {
  it('falls back to defaults for junk', () => {
    expect(parseDisplayPrefs(null)).toEqual(DEFAULT_DISPLAY_PREFS)
    expect(parseDisplayPrefs('not json')).toEqual(DEFAULT_DISPLAY_PREFS)
    expect(
      parseDisplayPrefs({ fontSize: 'huge', messageWidth: 3, compact: 'y' }),
    ).toEqual(DEFAULT_DISPLAY_PREFS)
  })

  it('round-trips valid values from a JSON string', () => {
    const prefs = {
      fontSize: 'xl',
      messageWidth: 'wide',
      compact: true,
      hideUsage: true,
    } as const
    expect(parseDisplayPrefs(JSON.stringify(prefs))).toEqual(prefs)
  })

  it('omits default attributes', () => {
    expect(displayPrefsToAttributes(DEFAULT_DISPLAY_PREFS)).toEqual({
      'data-font': null,
      'data-width': null,
      'data-compact': null,
      'data-hide-usage': null,
    })
    expect(
      displayPrefsToAttributes({
        fontSize: 'l',
        messageWidth: 'narrow',
        compact: true,
        hideUsage: true,
      }),
    ).toEqual({
      'data-font': 'l',
      'data-width': 'narrow',
      'data-compact': '1',
      'data-hide-usage': '1',
    })
  })

  it('inline script reads the same storage key', () => {
    expect(DISPLAY_INLINE_INIT_SCRIPT).toContain(DISPLAY_STORAGE_KEY)
    expect(() => new Function(DISPLAY_INLINE_INIT_SCRIPT)).not.toThrow()
  })
})
