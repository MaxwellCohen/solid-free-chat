import { describe, expect, it } from 'vitest'
import { buildFreeModelsCatalog } from './free-models-catalog'

const m = (
  id: string,
  input: string[],
  output: string[],
  tool_call = false,
) => ({
  id,
  name: id.toUpperCase(),
  tool_call,
  modalities: { input, output },
  limit: { context: 1000 },
})

describe('buildFreeModelsCatalog', () => {
  it('keeps only text-in/text-out models and carries metadata', () => {
    const catalog = buildFreeModelsCatalog({
      groq: {
        models: {
          b: m('b', ['text', 'image'], ['text'], true),
          a: m('a', ['text'], ['text']),
          tts: m('tts', ['text'], ['audio']),
          whisper: m('whisper', ['audio'], ['text']),
        },
      },
      other: { models: { x: m('x', ['text'], ['text']) } },
    })
    expect(Object.keys(catalog)).toEqual(['groq'])
    expect(catalog.groq?.map((x) => x.id)).toEqual(['a', 'b'])
    expect(catalog.groq?.[1]).toMatchObject({
      inputModalities: ['text', 'image'],
      supportsTools: true,
      contextWindow: 1000,
    })
  })

  it('tolerates junk input', () => {
    expect(buildFreeModelsCatalog(null)).toEqual({})
    expect(buildFreeModelsCatalog({ groq: { models: 5 } })).toEqual({})
  })
})
