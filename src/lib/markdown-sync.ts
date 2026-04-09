import MarkdownIt from 'markdown-it'

export function escapeHtmlFence(md: MarkdownIt, code: string) {
  return `<pre class="bg-muted my-2 overflow-x-auto rounded-lg p-3 text-xs"><code>${md.utils.escapeHtml(code)}</code></pre>`
}

/** Same structure as full Markdown + Tailwind code fences, without Shiki (sync). */
export function renderMarkdownToHtmlSync(source: string): string {
  const md: MarkdownIt = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    highlight(code: string, _lang: string): string {
      return escapeHtmlFence(md, code)
    },
  })
  return md.render(source)
}
