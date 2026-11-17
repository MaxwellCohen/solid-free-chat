/**
 * Swap complete ```svg (or ```xml holding an <svg>) fences in rendered
 * markdown for inline images. Rendered via <img> + data URL, so scripts and
 * external loads inside the SVG never run. Incomplete (streaming) SVGs stay as code.
 */
export function enhanceSvgBlocks(root: HTMLElement): void {
  for (const pre of root.querySelectorAll<HTMLElement>(
    'pre[data-lang="svg"], pre[data-lang="xml"]',
  )) {
    const source = pre.textContent.trim()
    if (
      !/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(source) ||
      !/<\/svg>$/i.test(source)
    )
      continue
    const figure = document.createElement('div')
    figure.className = 'chat-diagram'
    const img = document.createElement('img')
    img.alt = 'SVG image'
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
    figure.append(img)
    pre.replaceWith(figure)
  }
}
