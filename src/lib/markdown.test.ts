import { describe, expect, it } from 'vitest'
import { renderMarkdownToHtml } from './markdown'

describe('renderMarkdownToHtml hardening', () => {
  it('opens http(s) links in a new tab safely', () => {
    const html = renderMarkdownToHtml('[a](https://x.com)')
    expect(html).toContain(
      '<a href="https://x.com" target="_blank" rel="noopener noreferrer"',
    )
  })

  it('replaces remote images with links', () => {
    const html = renderMarkdownToHtml(
      '![pic](https://e.com/a.png) ![p2](//e.com/b.png)',
    )
    expect(html).not.toContain('<img')
    expect(html).toContain(
      '<a href="https://e.com/a.png" target="_blank" rel="noopener noreferrer">pic</a>',
    )
    expect(html).toContain('href="//e.com/b.png"')
  })

  it('falls back to "image" when alt is empty', () => {
    expect(renderMarkdownToHtml('![](https://e.com/a.png)')).toContain(
      'rel="noopener noreferrer">image</a>',
    )
  })

  it('keeps relative images and never emits remote data: sources', () => {
    expect(renderMarkdownToHtml('![r](/x.png)')).toContain('<img src="/x.png"')
    expect(renderMarkdownToHtml('![d](data:image/png;base64,AAA)')).not.toMatch(
      /https?:/,
    )
  })

  it('leaves code content escaped and untouched', () => {
    const html = renderMarkdownToHtml(
      '```html\n<img src="https://e.com/x">\n```\n\n`<a href="https://z">`',
    )
    expect(html).not.toContain('<img')
    expect(html).not.toContain('target=')
  })

  it('keeps special characters in alt text escaped', () => {
    const html = renderMarkdownToHtml('![a"<b>&](https://e.com/a.png)')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;')
    expect(html).toContain('&quot;')
  })

  it('keeps one link when an image is inside a link', () => {
    const html = renderMarkdownToHtml(
      '[![Build](https://img.shields.io/x.svg)](https://github.com/o/r)',
    )
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(html).toContain('>Build</a>')
  })

  it('drops images whose URL only looks local', () => {
    for (const src of [
      '\\\\evil.example/p',
      '/\\evil.example/p',
      'http:evil.example/p',
    ]) {
      const html = renderMarkdownToHtml(`![x](${src})`)
      expect(html).not.toContain('<img')
      expect(html).not.toContain('<a ')
    }
  })
})
