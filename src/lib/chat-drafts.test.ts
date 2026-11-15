import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_DRAFT_TEXT,
  MAX_STORED_DRAFTS,
  clearDraft,
  loadDraft,
  resetDraftMemory,
  saveDraft,
} from './chat-drafts'

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}

describe('chat drafts', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', memoryStorage())
    resetDraftMemory()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns an empty draft by default', () => {
    expect(loadDraft('a')).toEqual({ text: '', images: [], files: [] })
  })

  it('saves and loads text and attachments', () => {
    saveDraft('a', { text: 'hi', images: [{ id: 'i' }], files: [{ id: 'f' }] })
    expect(loadDraft('a')).toEqual({
      text: 'hi',
      images: [{ id: 'i' }],
      files: [{ id: 'f' }],
    })
    expect(loadDraft('b').text).toBe('')
  })

  it('deletes an empty draft', () => {
    saveDraft('a', { text: 'hi', images: [], files: [] })
    saveDraft('a', { text: '', images: [], files: [] })
    expect(loadDraft('a').text).toBe('')
    expect(sessionStorage.getItem('solid-free-chat:drafts')).toBeNull()
  })

  it('clears a draft', () => {
    saveDraft('a', { text: 'hi', images: [1], files: [] })
    clearDraft('a')
    expect(loadDraft('a')).toEqual({ text: '', images: [], files: [] })
  })

  it('restores text from sessionStorage when memory is gone', () => {
    saveDraft('a', { text: 'hi', images: [1], files: [] })
    resetDraftMemory()
    expect(loadDraft('a')).toEqual({ text: 'hi', images: [], files: [] })
  })

  it('caps persisted text length', () => {
    saveDraft('a', {
      text: 'x'.repeat(MAX_DRAFT_TEXT + 100),
      images: [],
      files: [],
    })
    resetDraftMemory()
    expect(loadDraft('a').text).toHaveLength(MAX_DRAFT_TEXT)
  })

  it('caps stored draft count, dropping oldest', () => {
    for (let i = 0; i < MAX_STORED_DRAFTS + 5; i++) {
      saveDraft(`c${i}`, { text: `t${i}`, images: [], files: [] })
    }
    resetDraftMemory()
    expect(loadDraft('c0').text).toBe('')
    expect(loadDraft(`c${MAX_STORED_DRAFTS + 4}`).text).toBe(
      `t${MAX_STORED_DRAFTS + 4}`,
    )
  })

  it('survives missing or throwing sessionStorage', () => {
    vi.stubGlobal('sessionStorage', undefined)
    expect(() =>
      saveDraft('a', { text: 'x', images: [], files: [] }),
    ).not.toThrow()
    expect(loadDraft('a').text).toBe('x')
  })
})
