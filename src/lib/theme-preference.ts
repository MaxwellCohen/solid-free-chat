export const THEME_STORAGE_KEY = 'solid-free-chat-theme'

export type ThemePreference = 'light' | 'dark' | 'system'

export function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return parseThemePreference(raw)
  } catch {
    /* ignore */
  }
  return 'system'
}

export const ACCENT_STORAGE_KEY = 'solid-free-chat-accent'

export const ACCENTS = [
  'default',
  'indigo',
  'emerald',
  'rose',
  'amber',
  'sky',
  'violet',
] as const

export type AccentPreference = (typeof ACCENTS)[number]

export function parseAccent(raw: unknown): AccentPreference {
  return typeof raw === 'string' &&
    (ACCENTS as ReadonlyArray<string>).includes(raw)
    ? (raw as AccentPreference)
    : 'default'
}

export function readStoredAccent(): AccentPreference {
  if (typeof window === 'undefined') return 'default'
  try {
    return parseAccent(localStorage.getItem(ACCENT_STORAGE_KEY))
  } catch {
    return 'default'
  }
}

export function writeStoredAccent(accent: AccentPreference) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, accent)
  } catch {
    /* ignore */
  }
}

export function parseThemePreference(raw: unknown): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

export function writeStoredPreference(pref: ThemePreference) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    /* ignore */
  }
}

export function resolveEffectiveTheme(
  pref: ThemePreference,
  systemPrefersDark: boolean,
): 'light' | 'dark' {
  if (pref === 'dark') return 'dark'
  if (pref === 'light') return 'light'
  return systemPrefersDark ? 'dark' : 'light'
}

/** Runs before the app bundle; keep logic in sync with resolveEffectiveTheme. */
export const THEME_INLINE_INIT_SCRIPT = `;(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);var a=localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});if(a&&a!=="default")document.documentElement.setAttribute("data-accent",a);}catch(e){}})();`
