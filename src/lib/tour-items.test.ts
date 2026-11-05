import { describe, expect, it } from 'vitest'
import { TOUR_ITEMS } from './tour-items'

describe('TOUR_ITEMS', () => {
  it('has complete entries', () => {
    expect(TOUR_ITEMS.length).toBeGreaterThanOrEqual(14)
    for (const item of TOUR_ITEMS) {
      expect(item.id).toBeTruthy()
      expect(item.title).toBeTruthy()
      expect(item.description).toBeTruthy()
      expect(item.how).toBeTruthy()
    }
  })
  it('has unique ids', () => {
    expect(new Set(TOUR_ITEMS.map((i) => i.id)).size).toBe(TOUR_ITEMS.length)
  })
})
