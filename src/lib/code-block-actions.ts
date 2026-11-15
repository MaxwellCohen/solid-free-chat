import {
  buildPreviewDocument,
  codeBlockFilename,
  isPreviewableLanguage,
} from './code-block'

const BTN =
  'border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded border px-2 py-0.5 text-xs'

function button(label: string, action: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = BTN
  b.textContent = label
  b.dataset.codeAction = action
  return b
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function wirePreview(
  btn: HTMLButtonElement,
  panel: HTMLElement,
  lang: string,
  code: () => string,
) {
  btn.setAttribute('aria-expanded', 'false')
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true'
    panel.replaceChildren()
    panel.hidden = open
    btn.setAttribute('aria-expanded', String(!open))
    btn.textContent = open ? 'Preview' : 'Hide preview'
    if (open) return
    // Opaque origin (no allow-same-origin): cannot reach app storage or keys.
    // srcdoc inherits the app CSP, so network access stays locked down too.
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.setAttribute('title', 'Code preview')
    frame.className = 'bg-white h-72 w-full rounded border border-border'
    frame.srcdoc = buildPreviewDocument(lang, code())
    panel.append(frame)
  })
}

/**
 * Add Copy / Download (and Preview for html/svg) toolbars to rendered
 * markdown code blocks. Idempotent; mermaid fences are left to the diagram renderer.
 */
export function enhanceCodeBlocks(container: HTMLElement) {
  for (const pre of container.querySelectorAll<HTMLElement>('pre.tm-code')) {
    if (pre.closest('.code-block')) continue
    const lang = pre.dataset.lang ?? ''
    if (lang === 'mermaid') continue
    const code = () => pre.textContent

    const wrapper = document.createElement('div')
    wrapper.className = 'code-block'
    const bar = document.createElement('div')
    bar.className = 'flex items-center justify-end gap-1.5 py-1'
    const panel = document.createElement('div')
    panel.hidden = true
    panel.className = 'mt-1'

    const copy = button('Copy', 'copy')
    copy.addEventListener('click', () => {
      void navigator.clipboard.writeText(code()).then(
        () => {
          copy.textContent = 'Copied'
          setTimeout(() => (copy.textContent = 'Copy'), 1500)
        },
        () => {},
      )
    })
    const download = button('Download', 'download')
    download.addEventListener('click', () =>
      downloadText(codeBlockFilename(lang), code()),
    )
    bar.append(copy, download)

    if (isPreviewableLanguage(lang)) {
      const preview = button('Preview', 'preview')
      wirePreview(preview, panel, lang, code)
      bar.prepend(preview)
    }

    pre.replaceWith(wrapper)
    wrapper.append(bar, pre, panel)
  }
}
