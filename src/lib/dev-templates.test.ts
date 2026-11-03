import { describe, expect, it } from 'vitest'
import { DEV_TEMPLATES, getTemplateFiles } from './dev-templates'

describe('dev-templates', () => {
  it('every template has index.html and an entry', () => {
    for (const t of DEV_TEMPLATES) {
      expect(t.files['index.html']).toBeTypeOf('string')
      expect(
        Object.keys(t.files).some((p) => /^main\.(js|ts|jsx|tsx)$/.test(p)),
      ).toBe(true)
    }
  })
  it('has unique ids and returns copies', () => {
    expect(new Set(DEV_TEMPLATES.map((t) => t.id)).size).toBe(
      DEV_TEMPLATES.length,
    )
    const a = getTemplateFiles('counter')!
    a['main.js'] = 'x'
    expect(getTemplateFiles('counter')!['main.js']).not.toBe('x')
    expect(getTemplateFiles('nope')).toBeUndefined()
  })
})
