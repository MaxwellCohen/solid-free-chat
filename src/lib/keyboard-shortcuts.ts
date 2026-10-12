export type ShortcutChord = {
  key: string
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

export type ShortcutId =
  | 'newChat'
  | 'toggleSidebar'
  | 'focusComposer'
  | 'shareChat'
  | 'openSkills'
  | 'stopGeneration'
  | 'showHelp'

export type ShortcutDefinition = {
  id: ShortcutId
  label: string
  keys: ShortcutChord
}

/** Shared registry for matching and the help modal. */
export const CHAT_SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    id: 'newChat',
    label: 'New chat',
    keys: { key: 'o', mod: true, shift: true },
  },
  {
    id: 'toggleSidebar',
    label: 'Toggle sidebar',
    keys: { key: 'b', mod: true },
  },
  {
    id: 'focusComposer',
    label: 'Focus message input',
    keys: { key: 'l', mod: true, shift: true },
  },
  {
    id: 'shareChat',
    label: 'Share current chat',
    keys: { key: 's', mod: true, shift: true },
  },
  {
    id: 'openSkills',
    label: 'Open skills library',
    keys: { key: 'k', mod: true, shift: true },
  },
  {
    id: 'stopGeneration',
    label: 'Stop generation',
    keys: { key: 'Escape' },
  },
  {
    id: 'showHelp',
    label: 'Keyboard shortcuts',
    keys: { key: '/', mod: true },
  },
] as const

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const uaData = (
    navigator as Navigator & {
      userAgentData?: { platform?: string }
    }
  ).userAgentData
  if (uaData?.platform) {
    return /mac/i.test(uaData.platform)
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
}

/** Mod = ⌘ on Apple platforms, Ctrl elsewhere. */
export function modKey(event: KeyboardEvent): boolean {
  return isMacPlatform() ? event.metaKey : event.ctrlKey
}

export function matchesShortcut(
  event: KeyboardEvent,
  chord: ShortcutChord,
): boolean {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const expected =
    chord.key.length === 1 ? chord.key.toLowerCase() : chord.key
  if (key !== expected) return false
  if (Boolean(chord.mod) !== modKey(event)) return false
  if (Boolean(chord.shift) !== event.shiftKey) return false
  if (Boolean(chord.alt) !== event.altKey) return false
  // When Mod is required, ignore the unused meta/ctrl so Mac Ctrl+… does not match.
  if (chord.mod) {
    if (isMacPlatform() && event.ctrlKey) return false
    if (!isMacPlatform() && event.metaKey) return false
  }
  return true
}

export function findMatchingShortcut(
  event: KeyboardEvent,
): ShortcutDefinition | undefined {
  return CHAT_SHORTCUTS.find((def) => matchesShortcut(event, def.keys))
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function formatShortcutChord(chord: ShortcutChord): string {
  const parts: string[] = []
  const mac = isMacPlatform()
  if (chord.mod) parts.push(mac ? '⌘' : 'Ctrl')
  if (chord.shift) parts.push(mac ? '⇧' : 'Shift')
  if (chord.alt) parts.push(mac ? '⌥' : 'Alt')
  const keyLabel =
    chord.key === 'Escape'
      ? 'Esc'
      : chord.key === '/'
        ? '/'
        : chord.key.length === 1
          ? chord.key.toUpperCase()
          : chord.key
  parts.push(keyLabel)
  return parts.join(mac ? '' : '+')
}
