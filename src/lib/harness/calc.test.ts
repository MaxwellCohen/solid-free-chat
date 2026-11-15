import { describe, expect, it } from 'vitest'
import { calculate } from './calc'

const val = (e: string) => {
  const r = calculate(e)
  if (!r.ok) throw new Error(r.error)
  return r.value
}
const err = (e: string) => {
  const r = calculate(e)
  if (r.ok) throw new Error(`expected error, got ${r.value}`)
  return r.error
}

describe('calculate', () => {
  it('handles precedence and associativity', () => {
    expect(val('1 + 2 * 3')).toBe(7)
    expect(val('(1 + 2) * 3')).toBe(9)
    expect(val('2 ^ 3 ^ 2')).toBe(512)
    expect(val('10 - 4 - 3')).toBe(3)
    expect(val('100 / 10 / 5')).toBe(2)
    expect(val('10 % 4 + 1')).toBe(3)
  })
  it('handles unary minus/plus', () => {
    expect(val('-2 ^ 2')).toBe(-4)
    expect(val('2 ^ -1')).toBe(0.5)
    expect(val('2 * -3')).toBe(-6)
    expect(val('--3')).toBe(3)
    expect(val('+5')).toBe(5)
    expect(val('-(1 + 2)')).toBe(-3)
  })
  it('supports functions and constants', () => {
    expect(val('sqrt(16)')).toBe(4)
    expect(val('max(1, 5, 3)')).toBe(5)
    expect(val('min(4, 2)')).toBe(2)
    expect(val('abs(-3.5)')).toBe(3.5)
    expect(val('round(2.5) + floor(1.9) + ceil(1.1)')).toBe(6)
    expect(val('log(1000)')).toBe(3)
    expect(val('ln(e)')).toBe(1)
    expect(val('sin(0) + cos(0)')).toBe(1)
    expect(val('tan(0)')).toBe(0)
    expect(val('cos(pi)')).toBe(-1)
    expect(val('max(sqrt(16), min(2, 3)) * 2')).toBe(8)
    expect(val('SQRT(9)')).toBe(3)
  })
  it('parses decimals and exponents, trims float noise', () => {
    expect(val('.5 + 1.')).toBe(1.5)
    expect(val('1e3 + 1')).toBe(1001)
    expect(val('0.1 + 0.2')).toBe(0.3)
  })
  it('rejects bad input', () => {
    expect(err('')).toMatch(/empty/i)
    expect(err('   ')).toMatch(/empty/i)
    expect(err('1 +')).toMatch(/ends unexpectedly/)
    expect(err('* 2')).toMatch(/Unexpected operator/)
    expect(err('(1 + 2')).toMatch(/parentheses/)
    expect(err('1 + 2)')).toMatch(/parentheses/)
    expect(err('()')).toMatch(/Empty/)
    expect(err('(1 +)')).toMatch(/Missing operand/)
    expect(err('2 3')).toMatch(/Missing operator/)
    expect(err('2 (3)')).toMatch(/Missing operator/)
    expect(err('foo + 1')).toMatch(/Unknown name/)
    expect(err('foo(1)')).toMatch(/Unknown function/)
    expect(err('sqrt')).toMatch(/needs parentheses/)
    expect(err('1 $ 2')).toMatch(/Unexpected character/)
    expect(err('1..2')).toBeTruthy()
    expect(err('max(,1)')).toMatch(/Missing argument/)
    expect(err('(1, 2)')).toMatch(/Unexpected ","/)
  })
  it('checks arity', () => {
    expect(err('sqrt()')).toMatch(/takes 1/)
    expect(err('sqrt(1, 2)')).toMatch(/takes 1/)
    expect(err('max()')).toMatch(/at least 1/)
  })
  it('rejects non-finite results', () => {
    expect(err('1 / 0')).toMatch(/Division by zero/)
    expect(err('5 % 0')).toMatch(/Modulo by zero/)
    expect(err('sqrt(-1)')).toMatch(/finite/)
    expect(err('ln(0)')).toMatch(/finite/)
    expect(err('10 ^ 1000')).toMatch(/finite/)
  })
  it('does not execute code', () => {
    expect(err('process.exit()')).toBeTruthy()
    expect(err('constructor')).toMatch(/Unknown name/)
    expect(err('__proto__')).toMatch(/Unknown name/)
    expect(err('toString(1)')).toMatch(/Unknown function/)
    expect(err('1' + '+1'.repeat(300))).toMatch(/too long/)
  })
})
