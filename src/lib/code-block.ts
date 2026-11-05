const EXTENSIONS: Record<string, string> = {
  plaintext: 'txt',
  text: 'txt',
  txt: 'txt',
  html: 'html',
  htm: 'html',
  svg: 'svg',
  xml: 'xml',
  css: 'css',
  js: 'js',
  javascript: 'js',
  mjs: 'mjs',
  jsx: 'jsx',
  ts: 'ts',
  typescript: 'ts',
  tsx: 'tsx',
  json: 'json',
  python: 'py',
  py: 'py',
  shell: 'sh',
  sh: 'sh',
  bash: 'sh',
  zsh: 'sh',
  md: 'md',
  markdown: 'md',
  yaml: 'yaml',
  yml: 'yaml',
  sql: 'sql',
  rust: 'rs',
  rs: 'rs',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  ruby: 'rb',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  mermaid: 'mmd',
}

function normalizeLang(lang: string | null | undefined): string {
  return (lang ?? '').trim().toLowerCase()
}

/** File extension (no dot) for a fence language; `txt` when unknown. */
export function extensionForLanguage(lang: string | null | undefined): string {
  return EXTENSIONS[normalizeLang(lang)] ?? 'txt'
}

export function codeBlockFilename(
  lang: string | null | undefined,
  base = 'snippet',
): string {
  return `${base}.${extensionForLanguage(lang)}`
}

export function isPreviewableLanguage(
  lang: string | null | undefined,
): boolean {
  const l = normalizeLang(lang)
  return l === 'html' || l === 'htm' || l === 'svg'
}

/** Standalone document for the preview iframe's `srcdoc`. */
export function buildPreviewDocument(
  lang: string | null | undefined,
  code: string,
): string {
  if (normalizeLang(lang) === 'svg') {
    return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;display:grid;place-items:center;min-height:100%;background:#fff}svg{max-width:100%;height:auto}</style>${code}`
  }
  return code
}
