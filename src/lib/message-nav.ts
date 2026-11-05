/** Next focused index for j (1) / k (-1); clamps at the ends. null when there are no messages. */
export function stepMessageIndex(
  current: number | null,
  count: number,
  direction: 1 | -1,
): number | null {
  if (count <= 0) return null
  if (current === null || current < 0 || current >= count) {
    return direction === 1 ? 0 : count - 1
  }
  return Math.min(count - 1, Math.max(0, current + direction))
}

export type ThreadKeyAction = 'next' | 'prev' | 'copy' | 'bookmark' | 'clear'

type KeyEventLike = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing'
>

/**
 * Maps a bare key press to a thread action. Returns null for modified keys,
 * IME composition, and while typing (`typing`), so these never fire in inputs.
 */
export function threadKeyAction(
  event: KeyEventLike,
  typing: boolean,
): ThreadKeyAction | null {
  if (typing || event.isComposing) return null
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
    return null
  switch (event.key) {
    case 'j':
      return 'next'
    case 'k':
      return 'prev'
    case 'c':
      return 'copy'
    case 'b':
      return 'bookmark'
    case 'Escape':
      return 'clear'
    default:
      return null
  }
}
