import { createHighlighter } from '@tanstack/highlight/core'
import { css } from '@tanstack/highlight/languages/css'
import { html as htmlLang } from '@tanstack/highlight/languages/html'
import { js } from '@tanstack/highlight/languages/js'
import { json } from '@tanstack/highlight/languages/json'
import { jsx } from '@tanstack/highlight/languages/jsx'
import { plaintext } from '@tanstack/highlight/languages/plaintext'
import { python } from '@tanstack/highlight/languages/python'
import { shell } from '@tanstack/highlight/languages/shell'
import { ts } from '@tanstack/highlight/languages/ts'
import { tsx } from '@tanstack/highlight/languages/tsx'
import { createTanStackMarkdownHighlighter } from '@tanstack/highlight/markdown'
import { streamingMarkdownExtension } from '@tanstack/markdown/extensions/streaming'
import { renderHtml } from '@tanstack/markdown/html'
import type { CodeHighlighter } from '@tanstack/markdown'

const highlighter = createHighlighter({
  languages: [plaintext, htmlLang, css, js, jsx, ts, tsx, shell, json, python],
})

const highlightMarkdownCode: CodeHighlighter =
  createTanStackMarkdownHighlighter(highlighter)

const streamingExtensions = [streamingMarkdownExtension()]

const HTTP_URL_RE = /^(https?:)?\/\//i
const TAG_RE =
  /<a href="([^"]*)"|<\/a>|<img src="([^"]*)"(?: alt="([^"]*)")?[^>]*>/gi
const LOCAL_BASE = 'https://local.invalid'

/** True unless the URL stays on this origin or is inline data (parsed the way a browser would). */
export function isRemoteUrl(src: string): boolean {
  try {
    const url = new URL(src, LOCAL_BASE)
    if (url.protocol === 'data:' || url.protocol === 'blob:') return false
    return url.origin !== LOCAL_BASE
  } catch {
    return true
  }
}

export function isHttpUrl(src: string): boolean {
  return HTTP_URL_RE.test(src)
}

/** Remote links open in a new tab; remote images become links (or plain text inside a link). */
function hardenHtml(html: string): string {
  if (!html.includes('<a ') && !html.includes('<img ')) return html
  let inLink = false
  return html.replace(
    TAG_RE,
    (tag: string, href?: string, src?: string, alt?: string) => {
      if (href !== undefined) {
        inLink = true
        return /^https?:\/\//i.test(href)
          ? `${tag} target="_blank" rel="noopener noreferrer"`
          : tag
      }
      if (src === undefined) {
        inLink = false
        return tag
      }
      if (!isRemoteUrl(src)) return tag
      const label = alt || 'image'
      return inLink || !isHttpUrl(src)
        ? label
        : `<a href="${src}" target="_blank" rel="noopener noreferrer">${label}</a>`
    },
  )
}

/** Sync Markdown → HTML for chat (streaming-safe, Highlight fences). */
export function renderMarkdownToHtml(source: string): string {
  return hardenHtml(
    renderHtml(source, {
      highlighter: highlightMarkdownCode,
      extensions: streamingExtensions,
      frontmatter: false,
      headingIds: false,
    }),
  )
}
