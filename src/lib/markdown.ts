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

const REMOTE_LINK_RE = /<a href="(https?:\/\/[^"]*)"/gi
const REMOTE_IMG_RE =
  /<img src="((?:https?:)?\/\/[^"]*)"(?: alt="([^"]*)")?[^>]*>/gi

function hardenHtml(html: string): string {
  if (!html.includes('<a ') && !html.includes('<img ')) return html
  return html
    .replace(
      REMOTE_LINK_RE,
      (_m, href: string) =>
        `<a href="${href}" target="_blank" rel="noopener noreferrer"`,
    )
    .replace(
      REMOTE_IMG_RE,
      (_m, src: string, alt?: string) =>
        `<a href="${src}" target="_blank" rel="noopener noreferrer">${alt || 'image'}</a>`,
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
