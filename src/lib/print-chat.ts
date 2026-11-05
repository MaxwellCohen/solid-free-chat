import { renderMarkdownToHtml } from './markdown'

export const PRINT_ROOT_ID = 'print-root'

type PrintMessage = {
  role: string
  parts: ReadonlyArray<{ type: string; content?: unknown }>
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const ROLE_LABEL: Record<string, string> = {
  user: 'You',
  assistant: 'Assistant',
  system: 'System',
}

/** Full, non-virtualized transcript HTML (every message) for the print view. */
export function buildPrintHtml(
  title: string,
  messages: readonly PrintMessage[],
): string {
  const body = messages
    .map((m) => {
      const text = m.parts
        .flatMap((p) =>
          p.type === 'text' && typeof p.content === 'string' ? [p.content] : [],
        )
        .join('\n\n')
        .trim()
      if (!text) return ''
      const label = ROLE_LABEL[m.role] ?? m.role
      return `<section class="print-msg" data-role="${escapeHtml(m.role)}"><h2>${escapeHtml(label)}</h2><div class="print-body">${renderMarkdownToHtml(text)}</div></section>`
    })
    .join('')
  return `<h1>${escapeHtml(title)}</h1>${body}`
}

/** Mounts the transcript, opens the browser print dialog, then cleans up. */
export function printChat(
  title: string,
  messages: readonly PrintMessage[],
): void {
  document.getElementById(PRINT_ROOT_ID)?.remove()
  const root = document.createElement('div')
  root.id = PRINT_ROOT_ID
  root.innerHTML = buildPrintHtml(title, messages)
  document.body.appendChild(root)
  const cleanup = () => {
    root.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}
