import MarkdownIt from 'markdown-it'
import { escapeHtmlFence } from './markdown-sync'
import { createBundledHighlighter } from '@shikijs/core'
import type { HighlighterGeneric } from '@shikijs/core'
import { createOnigurumaEngine } from '@shikijs/engine-oniguruma'

type BundledLang = 'javascript' | 'jsx' | 'typescript' | 'tsx' | 'bash'
type BundledTheme = 'github-light' | 'github-dark'

const createHighlighter = createBundledHighlighter({
  themes: {
    'github-light': () => import('@shikijs/themes/github-light'),
    'github-dark': () => import('@shikijs/themes/github-dark'),
  },
  langs: {
    javascript: () => import('@shikijs/langs/javascript'),
    jsx: () => import('@shikijs/langs/jsx'),
    typescript: () => import('@shikijs/langs/typescript'),
    tsx: () => import('@shikijs/langs/tsx'),
    bash: () => import('@shikijs/langs/bash'),
  },
  engine: () => createOnigurumaEngine(import('shiki/wasm')),
})

let highlighterPromise: Promise<
  HighlighterGeneric<BundledLang, BundledTheme>
> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [],
    })
  }
  return highlighterPromise
}

function normalizeFenceLang(raw: string | undefined): BundledLang | 'text' {
  if (!raw) return 'text'
  const x = raw.toLowerCase().trim().split(/[\s.]+/)[0] ?? ''
  const map: Record<string, BundledLang> = {
    js: 'javascript',
    javascript: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    typescript: 'typescript',
    tsx: 'tsx',
    bash: 'bash',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    fish: 'bash',
    pwsh: 'bash',
  }
  return map[x] ?? 'text'
}

async function highlightFence(
  md: MarkdownIt,
  highlighter: HighlighterGeneric<BundledLang, BundledTheme>,
  code: string,
  fenceLang: string,
  theme: BundledTheme,
): Promise<string> {
  const lang = normalizeFenceLang(fenceLang || undefined)
  if (lang === 'text') {
    return escapeHtmlFence(md, code)
  }
  if (!highlighter.getLoadedLanguages().includes(lang)) {
    await highlighter.loadLanguage(lang)
  }
  return highlighter.codeToHtml(code, { lang, theme })
}

export async function renderMarkdownToHtml(
  source: string,
  options: { dark?: boolean } = {},
): Promise<string> {
  const blocks: { lang: string; code: string }[] = []
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    highlight(code: string, lang: string) {
      const i = blocks.length
      blocks.push({ lang: lang || '', code })
      return `__MD_SHIKI_BLOCK_${i}__`
    },
  })

  let html = md.render(source)
  const highlighter = await getHighlighter()
  const theme: BundledTheme = options.dark ? 'github-dark' : 'github-light'

  for (let i = 0; i < blocks.length; i++) {
    const shikiHtml = await highlightFence(
      md,
      highlighter,
      blocks[i].code,
      blocks[i].lang,
      theme,
    )
    const token = `__MD_SHIKI_BLOCK_${i}__`
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    html = html.replace(
      new RegExp(`<pre><code[^>]*>\\s*${escapedToken}\\s*</code></pre>`),
      shikiHtml,
    )
  }

  return html
}
