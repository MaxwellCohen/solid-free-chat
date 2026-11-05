import { describe, expect, it } from 'vitest'
import { convertUnits } from './units'

const conv = (v: number, f: string, t: string) => {
  const r = convertUnits(v, f, t)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('convertUnits', () => {
  it('length', () => {
    expect(conv(1, 'km', 'm')).toBe(1000)
    expect(conv(1, 'mi', 'km')).toBe(1.609344)
    expect(conv(12, 'inches', 'ft')).toBe(1)
  })
  it('mass', () => {
    expect(conv(1, 'kg', 'lb')).toBeCloseTo(2.20462262185, 9)
    expect(conv(16, 'oz', 'lb')).toBe(1)
  })
  it('temperature', () => {
    expect(conv(100, 'C', 'F')).toBe(212)
    expect(conv(32, 'F', 'C')).toBe(0)
    expect(conv(0, 'C', 'K')).toBe(273.15)
    expect(conv(-40, 'F', 'C')).toBe(-40)
  })
  it('volume and time', () => {
    expect(conv(1, 'gal', 'l')).toBe(3.785411784)
    expect(conv(2, 'cups', 'tbsp')).toBeCloseTo(32, 6)
    expect(conv(1.5, 'hours', 'min')).toBe(90)
    expect(conv(1, 'week', 'days')).toBe(7)
  })
  it('data (decimal vs binary)', () => {
    expect(conv(1, 'GB', 'MB')).toBe(1000)
    expect(conv(1, 'GiB', 'MiB')).toBe(1024)
    expect(conv(1, 'byte', 'bits')).toBe(8)
  })
  it('is case/space insensitive and reports canonical names', () => {
    const r = convertUnits(1, ' Fl Oz ', 'ML')
    expect(r).toMatchObject({
      ok: true,
      category: 'volume',
      from: 'fluid ounce',
      to: 'milliliter',
    })
  })
  it('errors', () => {
    expect(convertUnits(1, 'km', 'kg')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Cannot convert/),
    })
    expect(convertUnits(1, 'parsec', 'm')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Unknown unit "parsec"/),
    })
    expect(convertUnits(1, 'm', 'zz')).toMatchObject({ ok: false })
    expect(convertUnits(NaN, 'm', 'km')).toMatchObject({ ok: false })
    expect(convertUnits(-300, 'C', 'K')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/absolute zero/),
    })
    expect(convertUnits(1, '__proto__', 'm')).toMatchObject({ ok: false })
  })
})
