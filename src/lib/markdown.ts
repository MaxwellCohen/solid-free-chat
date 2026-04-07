import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true })
          .value
      } catch {
        /* fall through */
      }
    }
    return md.utils.escapeHtml(code)
  },
})

export function renderMarkdownToHtml(source: string): string {
  return md.render(source)
}
