import { describe, expect, it } from 'vitest'
import type { UIMessage } from '@tanstack/ai-client'
import {
  FINAL_ANSWER_NUDGE,
  formatSpeedLine,
  messageToPlainText,
  needsFinalAnswerNudge,
  wasNudged,
  messagesBefore,
  partitionAttachableFiles,
  withEditedText,
} from './chat-thread-utils'

describe('messagesBefore', () => {
  const msgs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  it('truncates exclusive and inclusive', () => {
    expect(messagesBefore(msgs, 'b')).toEqual([{ id: 'a' }])
    expect(messagesBefore(msgs, 'b', true)).toEqual([{ id: 'a' }, { id: 'b' }])
  })
  it('returns null for unknown id', () => {
    expect(messagesBefore(msgs, 'x')).toBeNull()
  })
})

describe('messageToPlainText', () => {
  it('joins text parts only', () => {
    const m = {
      id: '1',
      role: 'assistant',
      parts: [
        { type: 'text', content: 'one' },
        { type: 'thinking', content: 'hmm' },
        { type: 'text', content: 'two' },
      ],
    } as unknown as UIMessage
    expect(messageToPlainText(m)).toBe('one\n\ntwo')
  })
})

describe('withEditedText', () => {
  it('replaces text and keeps attachments', () => {
    const img = {
      type: 'image',
      source: { type: 'data', value: 'x', mimeType: 'image/png' },
    } as const
    expect(
      withEditedText([{ type: 'text', content: 'old' }, img], 'new'),
    ).toEqual([{ type: 'text', content: 'new' }, img])
    expect(withEditedText([{ type: 'text', content: 'old' }, img], '')).toEqual(
      [img],
    )
  })
})

describe('partitionAttachableFiles', () => {
  const png = new File(['x'], 'a.png', { type: 'image/png' })
  const pdf = new File(['x'], 'b.pdf', { type: 'application/pdf' })
  const txt = new File(['x'], 'c.txt', { type: 'text/plain' })
  it('splits by kind', () => {
    const r = partitionAttachableFiles([png, pdf], {
      image: true,
      document: true,
    })
    expect(r).toEqual({ images: [png], pdfs: [pdf], error: null })
  })
  it('gates on capabilities', () => {
    const r = partitionAttachableFiles([png, pdf], {
      image: false,
      document: true,
    })
    expect(r.images).toEqual([])
    expect(r.pdfs).toEqual([pdf])
    expect(r.error).toBeTruthy()
  })
  it('flags unsupported types', () => {
    const r = partitionAttachableFiles([txt], { image: true, document: true })
    expect(r.error).toMatch(/images and PDFs/)
  })
})

describe('needsFinalAnswerNudge', () => {
  const msg = (role: string, parts: object[]) =>
    ({ id: 'x', role, parts }) as unknown as UIMessage
  const tool = { type: 'tool-call', id: 'c', name: 'calculate' }
  it('is true when the run ends on tool parts', () => {
    expect(
      needsFinalAnswerNudge([
        msg('assistant', [tool, { type: 'tool-result' }]),
      ]),
    ).toBe(true)
    expect(
      needsFinalAnswerNudge([
        msg('assistant', [tool, { type: 'text', content: '  ' }]),
      ]),
    ).toBe(true)
  })
  it('is false with answer text, no tools, or a user tail', () => {
    expect(
      needsFinalAnswerNudge([
        msg('assistant', [tool, { type: 'text', content: '56' }]),
      ]),
    ).toBe(false)
    expect(
      needsFinalAnswerNudge([
        msg('assistant', [{ type: 'text', content: 'hi' }]),
      ]),
    ).toBe(false)
    expect(needsFinalAnswerNudge([msg('user', [])])).toBe(false)
  })
  it('wasNudged detects the nudge as latest user message', () => {
    const nudge = msg('user', [{ type: 'text', content: FINAL_ANSWER_NUDGE }])
    expect(wasNudged([nudge, msg('assistant', [tool])])).toBe(true)
    expect(
      wasNudged([nudge, msg('user', [{ type: 'text', content: 'ok' }])]),
    ).toBe(false)
  })
})

describe('formatSpeedLine', () => {
  it('shows seconds and tokens per second', () => {
    expect(formatSpeedLine(4200, 168)).toBe('4.2s · 40.0 tok/s')
    expect(formatSpeedLine(2000, 400)).toBe('2.0s · 200 tok/s')
  })
  it('omits tok/s without completion tokens', () => {
    expect(formatSpeedLine(1500)).toBe('1.5s')
    expect(formatSpeedLine(1500, 0)).toBe('1.5s')
  })
  it('rounds long runs and rejects bad input', () => {
    expect(formatSpeedLine(125_400, 10)).toBe('125s · 0.1 tok/s')
    expect(formatSpeedLine(0, 5)).toBe('')
    expect(formatSpeedLine(Number.NaN)).toBe('')
  })
})
