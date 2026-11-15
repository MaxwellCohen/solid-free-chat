export const DISPLAY_STORAGE_KEY = 'solid-free-chat-display'

export const FONT_SIZES = ['s', 'm', 'l', 'xl'] as const
export const MESSAGE_WIDTHS = ['narrow', 'comfortable', 'wide'] as const

export type FontSize = (typeof FONT_SIZES)[number]
export type MessageWidth = (typeof MESSAGE_WIDTHS)[number]

export interface DisplayPrefs {
  fontSize: FontSize
  messageWidth: MessageWidth
  compact: boolean
  hideUsage: boolean
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  fontSize: 'm',
  messageWidth: 'comfortable',
  compact: false,
  hideUsage: false,
}

/** Tolerant parse of a stored JSON string (or object); unknown values fall back to defaults. */
export function parseDisplayPrefs(raw: unknown): DisplayPrefs {
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return { ...DEFAULT_DISPLAY_PREFS }
    }
  }
  if (!value || typeof value !== 'object') return { ...DEFAULT_DISPLAY_PREFS }
  const v = value as Record<string, unknown>
  return {
    fontSize: (FONT_SIZES as ReadonlyArray<unknown>).includes(v.fontSize)
      ? (v.fontSize as FontSize)
      : DEFAULT_DISPLAY_PREFS.fontSize,
    messageWidth: (MESSAGE_WIDTHS as ReadonlyArray<unknown>).includes(
      v.messageWidth,
    )
      ? (v.messageWidth as MessageWidth)
      : DEFAULT_DISPLAY_PREFS.messageWidth,
    compact: v.compact === true,
    hideUsage: v.hideUsage === true,
  }
}

export function readDisplayPrefs(): DisplayPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_DISPLAY_PREFS }
  try {
    return parseDisplayPrefs(localStorage.getItem(DISPLAY_STORAGE_KEY))
  } catch {
    return { ...DEFAULT_DISPLAY_PREFS }
  }
}

export function writeDisplayPrefs(prefs: DisplayPrefs) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

/** Data attributes for <html>; defaults are omitted. CSS in styles.css reads them. */
export function displayPrefsToAttributes(
  prefs: DisplayPrefs,
): Record<string, string | null> {
  return {
    'data-font': prefs.fontSize === 'm' ? null : prefs.fontSize,
    'data-width':
      prefs.messageWidth === 'comfortable' ? null : prefs.messageWidth,
    'data-compact': prefs.compact ? '1' : null,
    'data-hide-usage': prefs.hideUsage ? '1' : null,
  }
}

export function applyDisplayPrefs(
  prefs: DisplayPrefs,
  el: HTMLElement = document.documentElement,
) {
  for (const [name, value] of Object.entries(displayPrefsToAttributes(prefs))) {
    if (value === null) el.removeAttribute(name)
    else el.setAttribute(name, value)
  }
}

/** Runs before the app bundle (no flash); keep logic in sync with displayPrefsToAttributes. */
export const DISPLAY_INLINE_INIT_SCRIPT = `;(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(DISPLAY_STORAGE_KEY)})||"null");if(!p)return;var h=document.documentElement;if(["s","l","xl"].indexOf(p.fontSize)>-1)h.setAttribute("data-font",p.fontSize);if(p.messageWidth==="narrow"||p.messageWidth==="wide")h.setAttribute("data-width",p.messageWidth);if(p.compact===true)h.setAttribute("data-compact","1");if(p.hideUsage===true)h.setAttribute("data-hide-usage","1");}catch(e){}})();`
