import { describe, expect, it } from 'vitest'
import {
  buildPreviewDocument,
  codeBlockFilename,
  extensionForLanguage,
  isPreviewableLanguage,
} from './code-block'

describe('code-block', () => {
  it('maps languages to extensions', () => {
    expect(extensionForLanguage('python')).toBe('py')
    expect(extensionForLanguage('TypeScript')).toBe('ts')
    expect(extensionForLanguage('bash')).toBe('sh')
    expect(extensionForLanguage('weird')).toBe('txt')
    expect(extensionForLanguage(null)).toBe('txt')
    expect(codeBlockFilename('json')).toBe('snippet.json')
  })

  it('previews only html and svg', () => {
    expect(isPreviewableLanguage('html')).toBe(true)
    expect(isPreviewableLanguage('SVG')).toBe(true)
    expect(isPreviewableLanguage('js')).toBe(false)
  })

  it('wraps svg but passes html through', () => {
    expect(buildPreviewDocument('html', '<b>x</b>')).toBe('<b>x</b>')
    const svg = buildPreviewDocument('svg', '<svg></svg>')
    expect(svg).toContain('<!doctype html>')
    expect(svg).toContain('<svg></svg>')
  })
})
