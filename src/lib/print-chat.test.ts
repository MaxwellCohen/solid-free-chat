import { describe, expect, it } from 'vitest'
import { buildPrintHtml } from './print-chat'

describe('buildPrintHtml', () => {
  it('escapes the title and labels every message', () => {
    const html = buildPrintHtml('<b>x</b>', [
      { role: 'user', parts: [{ type: 'text', content: 'hi' }] },
      { role: 'assistant', parts: [{ type: 'text', content: '**yo**' }] },
      { role: 'assistant', parts: [{ type: 'tool-call' }] },
    ])
    expect(html).toContain('<h1>&lt;b&gt;x&lt;/b&gt;</h1>')
    expect(html).toContain('<h2>You</h2>')
    expect(html).toContain('<strong>yo</strong>')
    expect(html.match(/print-msg/g)).toHaveLength(2)
  })
})
