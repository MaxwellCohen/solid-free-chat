import { renderAsync } from 'pele/lazy'

/**
 * Mermaid-syntax diagrams via Pele (a small, dependency-free Mermaid renderer)
 * for the `render_diagram` tool and ```mermaid fences in assistant markdown.
 * Each diagram type's code loads on first use. Pele colors come from
 * `--pele-*` CSS variables (see styles.css), so theme changes need no redraw.
 */

const RENDER_OPTIONS = { links: false, images: false } as const

/** Rendered SVG by source, so re-rendered markdown can swap diagrams in synchronously. */
const svgCache = new Map<string, string>()
const MAX_CACHED_SVGS = 50

function cacheSvg(code: string, svg: string) {
  svgCache.delete(code)
  svgCache.set(code, svg)
  if (svgCache.size > MAX_CACHED_SVGS) {
    svgCache.delete(svgCache.keys().next().value!)
  }
}

/** Render to an SVG string. Pele escapes diagram text; links and images are off. Throws on invalid syntax. */
export async function renderMermaidSvg(code: string): Promise<string> {
  const cached = svgCache.get(code)
  if (cached) return cached
  const { svg } = await renderAsync(code, RENDER_OPTIONS)
  cacheSvg(code, svg)
  return svg
}

/** Syntax-check diagram source; returns a message the model can use to fix it. */
export async function validateMermaid(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await renderAsync(code, RENDER_OPTIONS)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function replaceWithSvg(pre: Element, svg: string) {
  const figure = document.createElement('div')
  figure.className = 'chat-diagram'
  figure.innerHTML = svg
  pre.replaceWith(figure)
}

/**
 * Swap ```mermaid code blocks in rendered markdown for diagrams. Cached
 * diagrams are swapped immediately; the rest after `delayMs` (debounces
 * streaming). Blocks that fail to parse — e.g. still streaming — stay as code.
 * Returns a cancel function.
 */
export function enhanceMermaidBlocks(root: HTMLElement, delayMs = 300): () => void {
  const pending: HTMLElement[] = []
  for (const pre of root.querySelectorAll<HTMLElement>('pre[data-lang="mermaid"]')) {
    const svg = svgCache.get(pre.textContent)
    if (svg) replaceWithSvg(pre, svg)
    else pending.push(pre)
  }
  if (pending.length === 0) return () => {}

  let cancelled = false
  const timer = setTimeout(() => {
    void (async () => {
      for (const pre of pending) {
        if (cancelled) return
        try {
          const svg = await renderMermaidSvg(pre.textContent)
          if (!cancelled && pre.isConnected) replaceWithSvg(pre, svg)
        } catch {
          // Invalid or incomplete diagram: leave the source visible.
        }
      }
    })()
  }, delayMs)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}
