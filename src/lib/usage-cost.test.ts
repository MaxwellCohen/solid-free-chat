import { describe, expect, it } from 'vitest'
import {
  computeUsageCost,
  formatCost,
  isOverThreshold,
  parseCostThreshold,
  parseModelPricing,
  totalCost,
} from './usage-cost'

describe('parseModelPricing', () => {
  it('parses string prices', () => {
    expect(parseModelPricing({ prompt: '0.000001', completion: '0.000002' })).toEqual({
      prompt: 0.000001,
      completion: 0.000002,
    })
  })
  it('rejects missing or invalid', () => {
    expect(parseModelPricing({ prompt: '1' })).toBeUndefined()
    expect(parseModelPricing({ prompt: '-1', completion: '1' })).toBeUndefined()
    expect(parseModelPricing(null)).toBeUndefined()
  })
})

describe('computeUsageCost', () => {
  const usage = { promptTokens: 1000, completionTokens: 500 }
  it('prefers reported cost', () => {
    expect(computeUsageCost({ ...usage, cost: 0.5 }, { prompt: 1, completion: 1 })).toBe(0.5)
  })
  it('computes from pricing', () => {
    expect(computeUsageCost(usage, { prompt: 0.001, completion: 0.002 })).toBeCloseTo(2)
  })
  it('is undefined without data', () => {
    expect(computeUsageCost(usage)).toBeUndefined()
  })
})

describe('totalCost', () => {
  it('sums known costs only', () => {
    expect(
      totalCost([{ tokenUsage: { cost: 1 } }, {}, { tokenUsage: {} }, { tokenUsage: { cost: 0.5 } }]),
    ).toBe(1.5)
  })
})

describe('threshold', () => {
  it('parses input', () => {
    expect(parseCostThreshold('$1.5')).toBe(1.5)
    expect(parseCostThreshold('0')).toBeNull()
    expect(parseCostThreshold('abc')).toBeNull()
    expect(parseCostThreshold('')).toBeNull()
  })
  it('compares', () => {
    expect(isOverThreshold(1, 1)).toBe(true)
    expect(isOverThreshold(0.9, 1)).toBe(false)
    expect(isOverThreshold(100, null)).toBe(false)
  })
})

describe('formatCost', () => {
  it('formats ranges', () => {
    expect(formatCost(0)).toBe('$0')
    expect(formatCost(0.00001)).toBe('<$0.0001')
    expect(formatCost(0.0123)).toBe('$0.01')
    expect(formatCost(0.005)).toBe('$0.0050')
    expect(formatCost(2)).toBe('$2.00')
  })
})
