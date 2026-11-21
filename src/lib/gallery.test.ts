import { describe, expect, it } from 'vitest'
import { seededRng } from './harness/random'
import {
  GALLERY_CONCURRENCY,
  buildGalleryRequest,
  createGallerySession,
  deleteGallerySession,
  extractSvg,
  gallerySessionTitle,
  parseGalleryLibrary,
  parseSavedGallery,
  previewSvg,
  runGallery,
  upsertGallerySession,
  type GalleryRunner,
} from './gallery'

const svg = (title: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>${title}</title><rect width="512" height="512" fill="#123"/></svg>`

describe('gallery svg helpers', () => {
  it('extracts a complete svg and ensures xmlns', () => {
    const raw = '<svg viewBox="0 0 10 10"><title>t</title></svg>'
    expect(extractSvg(raw)).toContain('xmlns=')
    expect(extractSvg('nope')).toBeNull()
  })

  it('previews incomplete svg by closing the tag', () => {
    const partial = '<svg viewBox="0 0 10 10"><circle cx="1" cy="1" r="1"'
    const preview = previewSvg(partial)
    expect(preview).toContain('xmlns=')
    expect(preview?.endsWith('</svg>')).toBe(true)
    expect(extractSvg(partial)).toBeNull()
  })
})

describe('gallery requests', () => {
  it('builds a fresh-thread prompt with seeded randomization', () => {
    const a = buildGalleryRequest({
      prompt: 'cats',
      n: 1,
      previousTitles: ['Old'],
      rng: seededRng(42),
    })
    const b = buildGalleryRequest({
      prompt: 'cats',
      n: 1,
      previousTitles: ['Old'],
      rng: seededRng(42),
    })
    const c = buildGalleryRequest({
      prompt: 'cats',
      n: 1,
      previousTitles: ['Old'],
      rng: seededRng(99),
    })
    expect(a.prompt).toEqual(b.prompt)
    expect(a.prompt).not.toEqual(c.prompt)
    expect(a.system).toContain('brand-new request')
    expect(a.prompt).toMatch(/Variation seed: \d+/)
    expect(a.prompt).toContain('Mood:')
    expect(a.prompt).toContain('Already in the gallery')
  })

  it('titles sessions from the prompt', () => {
    expect(gallerySessionTitle('  hello  world  ')).toBe('hello world')
    expect(gallerySessionTitle('x'.repeat(60)).endsWith('…')).toBe(true)
  })
})

describe('gallery library', () => {
  it('parses legacy flat arrays', () => {
    const items = parseSavedGallery(
      JSON.stringify([
        { id: '1', n: 1, svg: svg('A'), title: 'A', prompt: 'p' },
        { id: 'bad' },
      ]),
    )
    expect(items).toHaveLength(1)
    expect(items[0]?.title).toBe('A')
  })

  it('parses a library and upserts / deletes sessions', () => {
    const s1 = createGallerySession('lighthouses', () => 's1')
    s1.items = [
      {
        id: 'i1',
        n: 1,
        prompt: 'lighthouses',
        title: 'A',
        svg: svg('A'),
        status: 'done',
      },
    ]
    let lib = upsertGallerySession({ sessions: [], currentId: null }, s1)
    expect(lib.currentId).toBe('s1')
    const s2 = createGallerySession('cats', () => 's2')
    lib = upsertGallerySession(lib, s2)
    expect(lib.sessions.map((s) => s.id)).toEqual(['s2', 's1'])
    lib = deleteGallerySession(lib, 's2')
    expect(lib.currentId).toBe('s1')
    expect(parseGalleryLibrary(JSON.stringify(lib)).sessions).toHaveLength(1)
  })
})

describe('runGallery', () => {
  it('draws several pieces in parallel with live previews', async () => {
    let active = 0
    let maxActive = 0
    const runner: GalleryRunner = async function* (_req, signal) {
      active++
      maxActive = Math.max(maxActive, active)
      yield '<svg viewBox="0 0 512 512"><title>P'
      await Promise.resolve()
      if (signal.aborted) return
      yield 'iece</title><rect width="512" height="512" fill="#abc"/></svg>'
      active--
    }
    const updates: string[][] = []
    const ac = new AbortController()
    const res = await runGallery({
      prompt: 'theme',
      items: [],
      runner,
      signal: ac.signal,
      concurrency: GALLERY_CONCURRENCY,
      pauseMs: 0,
      now: (() => {
        let t = 0
        return () => (t += 200)
      })(),
      newId: (() => {
        let i = 0
        return () => `id-${++i}`
      })(),
      sleep: async () => {},
      onUpdate: (items) => {
        updates.push(items.map((i) => `${i.status}:${i.svg ? 'svg' : ''}`))
        if (items.filter((i) => i.status === 'done').length >= 3) ac.abort()
      },
    })
    expect(maxActive).toBeGreaterThan(1)
    expect(res.items.filter((i) => i.status === 'done').length).toBeGreaterThanOrEqual(
      1,
    )
    expect(updates.some((u) => u.some((x) => x.startsWith('drawing:svg')))).toBe(
      true,
    )
  })

  it('stops after too many consecutive failures', async () => {
    const runner: GalleryRunner = async function* () {
      throw new Error('boom')
    }
    const res = await runGallery({
      prompt: 'theme',
      items: [],
      runner,
      signal: new AbortController().signal,
      concurrency: 1,
      pauseMs: 0,
      sleep: async () => {},
      onUpdate: () => {},
      newId: (() => {
        let i = 0
        return () => `f-${++i}`
      })(),
    })
    expect(res.error).toBeTruthy()
    expect(res.items).toEqual([])
  })
})
