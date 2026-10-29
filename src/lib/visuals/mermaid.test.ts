import { describe, expect, it } from 'vitest'
import { renderMermaidSvg, validateMermaid } from './mermaid'

describe('mermaid (Pele)', () => {
  it('validates and renders diagrams', async () => {
    const flowchart = 'flowchart TD\n  A[Start] --> B{Ok?}\n  B -->|yes| C[Done]'
    expect(await validateMermaid(flowchart)).toEqual({ ok: true })
    expect(await renderMermaidSvg(flowchart)).toMatch(/^<svg[\s\S]*Start/)
    expect(await validateMermaid('sequenceDiagram\n  Alice->>Bob: Hi')).toEqual({ ok: true })
  })

  it('reports syntax errors for the model to fix', async () => {
    const result = await validateMermaid('flowchart TD\n  A --> ')
    expect(result.ok).toBe(false)
    expect(await validateMermaid('not a diagram')).toMatchObject({ ok: false })
  })
})
