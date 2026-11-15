import { describe, expect, it } from 'vitest'
import {
  deckToJson,
  deckToTsv,
  dueCount,
  gradeCard,
  loadDecks,
  newCard,
  newDeck,
  parseFlashcards,
  saveDecks,
} from './flashcards'

const DAY = 86_400_000

describe('parseFlashcards', () => {
  it('parses fenced JSON with alias keys and dedupes', () => {
    const raw =
      'Sure!\n```json\n[{"q":"A?","a":"1"},{"question":"B?","answer":"2"},{"q":"a?","a":"dup"},{"q":"","a":"x"},5]\n```'
    expect(parseFlashcards(raw)).toEqual([
      { q: 'A?', a: '1' },
      { q: 'B?', a: '2' },
    ])
  })
  it('falls back to Q:/A: lines', () => {
    expect(
      parseFlashcards('Q: Why?\nA: Because.\n2. Question: Who?\nAnswer: Me'),
    ).toEqual([
      { q: 'Why?', a: 'Because.' },
      { q: 'Who?', a: 'Me' },
    ])
  })
  it('caps at 12 and returns [] for junk', () => {
    const many = JSON.stringify(
      Array.from({ length: 30 }, (_, i) => ({ q: `q${i}`, a: `a${i}` })),
    )
    expect(parseFlashcards(many)).toHaveLength(12)
    expect(parseFlashcards('nothing useful')).toEqual([])
    expect(parseFlashcards('[broken')).toEqual([])
  })
})

describe('gradeCard', () => {
  const t = 1_000_000
  it('good progresses 1 -> 3 -> ease-scaled days', () => {
    let c = newCard('q', 'a', t)
    c = gradeCard(c, 'good', t)
    expect([c.interval, c.due]).toEqual([1, t + DAY])
    c = gradeCard(c, 'good', t)
    expect(c.interval).toBe(3)
    c = gradeCard(c, 'good', t)
    expect(c.interval).toBe(8) // round(3 * 2.5)
    expect(c.reps).toBe(3)
  })
  it('easy is faster and raises ease; again resets and lowers ease', () => {
    let c = gradeCard(newCard('q', 'a', t), 'easy', t)
    expect([c.interval, c.ease]).toEqual([4, 2.65])
    c = gradeCard(c, 'again', t)
    expect([c.interval, c.reps, c.ease]).toEqual([0, 0, 2.45])
    expect(c.due).toBe(t + 600_000)
  })
  it('ease never drops below 1.3', () => {
    let c = newCard('q', 'a', t)
    for (let i = 0; i < 20; i++) c = gradeCard(c, 'again', t)
    expect(c.ease).toBe(1.3)
  })
})

describe('decks', () => {
  const deck = newDeck(
    '  Bio  ',
    [
      { q: 'a\tb', a: 'c\nd' },
      { q: 'x', a: 'y' },
    ],
    100,
  )
  it('counts due cards', () => {
    expect(dueCount(deck, 100)).toBe(2)
    deck.cards[0] = gradeCard(deck.cards[0], 'good', 100)
    expect(dueCount(deck, 100)).toBe(1)
    expect(dueCount(deck, 100 + 2 * DAY)).toBe(2)
  })
  it('exports json and anki tsv', () => {
    expect(deckToTsv(deck)).toBe('a b\tc d\nx\ty\n')
    expect(JSON.parse(deckToJson(deck))).toEqual({
      name: 'Bio',
      cards: [
        { q: 'a\tb', a: 'c\nd' },
        { q: 'x', a: 'y' },
      ],
    })
  })
  it('round-trips through storage and ignores corrupt data', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    }
    expect(loadDecks(storage)).toEqual([])
    saveDecks([deck], storage)
    expect(loadDecks(storage)).toEqual([deck])
    store.set([...store.keys()][0], '{"x":1}')
    expect(loadDecks(storage)).toEqual([])
  })
})
