/** Pure unit conversion for common length / mass / temperature / volume / time / data units. */

export type ConvertResult =
  | { ok: true; value: number; category: string; from: string; to: string }
  | { ok: false; error: string }

interface Unit {
  category: string
  /** Canonical name. */
  name: string
  /** Multiply by this to reach the category base unit (unused for temperature). */
  factor: number
  aliases: string[]
}

const u = (
  category: string,
  name: string,
  factor: number,
  ...aliases: string[]
): Unit => ({
  category,
  name,
  factor,
  aliases,
})

const UNITS: Unit[] = [
  // length (base: meter)
  u('length', 'meter', 1, 'm', 'meters', 'metre', 'metres'),
  u('length', 'kilometer', 1000, 'km', 'kilometers', 'kilometre', 'kilometres'),
  u(
    'length',
    'centimeter',
    0.01,
    'cm',
    'centimeters',
    'centimetre',
    'centimetres',
  ),
  u(
    'length',
    'millimeter',
    0.001,
    'mm',
    'millimeters',
    'millimetre',
    'millimetres',
  ),
  u('length', 'mile', 1609.344, 'mi', 'miles'),
  u('length', 'yard', 0.9144, 'yd', 'yards'),
  u('length', 'foot', 0.3048, 'ft', 'feet'),
  u('length', 'inch', 0.0254, 'in', 'inches'),
  u('length', 'nautical mile', 1852, 'nmi'),
  // mass (base: gram)
  u('mass', 'gram', 1, 'g', 'grams'),
  u('mass', 'kilogram', 1000, 'kg', 'kilograms', 'kilo', 'kilos'),
  u('mass', 'milligram', 0.001, 'mg', 'milligrams'),
  u('mass', 'tonne', 1_000_000, 't', 'tonnes', 'metric ton', 'metric tons'),
  u('mass', 'pound', 453.59237, 'lb', 'lbs', 'pounds'),
  u('mass', 'ounce', 28.349523125, 'oz', 'ounces'),
  u('mass', 'stone', 6350.29318, 'st', 'stones'),
  // volume (base: liter)
  u('volume', 'liter', 1, 'l', 'liters', 'litre', 'litres'),
  u(
    'volume',
    'milliliter',
    0.001,
    'ml',
    'milliliters',
    'millilitre',
    'millilitres',
  ),
  u('volume', 'cubic meter', 1000, 'm3', 'm^3'),
  u('volume', 'teaspoon', 0.00492892159375, 'tsp', 'teaspoons'),
  u('volume', 'tablespoon', 0.01478676478125, 'tbsp', 'tablespoons'),
  u('volume', 'fluid ounce', 0.0295735295625, 'fl oz', 'floz', 'fluid ounces'),
  u('volume', 'cup', 0.2365882365, 'cups'),
  u('volume', 'pint', 0.473176473, 'pt', 'pints'),
  u('volume', 'quart', 0.946352946, 'qt', 'quarts'),
  u('volume', 'gallon', 3.785411784, 'gal', 'gallons'),
  // time (base: second)
  u('time', 'second', 1, 's', 'sec', 'secs', 'seconds'),
  u('time', 'millisecond', 0.001, 'ms', 'milliseconds'),
  u('time', 'minute', 60, 'min', 'mins', 'minutes'),
  u('time', 'hour', 3600, 'h', 'hr', 'hrs', 'hours'),
  u('time', 'day', 86400, 'd', 'days'),
  u('time', 'week', 604800, 'wk', 'weeks'),
  u('time', 'year', 31_557_600, 'yr', 'years'),
  // data (base: byte)
  u('data', 'bit', 0.125, 'bits'),
  u('data', 'byte', 1, 'b', 'bytes'),
  u('data', 'kilobyte', 1e3, 'kb', 'kilobytes'),
  u('data', 'megabyte', 1e6, 'mb', 'megabytes'),
  u('data', 'gigabyte', 1e9, 'gb', 'gigabytes'),
  u('data', 'terabyte', 1e12, 'tb', 'terabytes'),
  u('data', 'kibibyte', 1024, 'kib'),
  u('data', 'mebibyte', 1024 ** 2, 'mib'),
  u('data', 'gibibyte', 1024 ** 3, 'gib'),
  u('data', 'tebibyte', 1024 ** 4, 'tib'),
  // temperature (special-cased)
  u('temperature', 'celsius', 1, 'c', '°c', 'degc', 'degrees celsius'),
  u('temperature', 'fahrenheit', 1, 'f', '°f', 'degf', 'degrees fahrenheit'),
  u('temperature', 'kelvin', 1, 'k'),
]

const LOOKUP = new Map<string, Unit>()
for (const unit of UNITS) {
  LOOKUP.set(unit.name, unit)
  for (const alias of unit.aliases) LOOKUP.set(alias, unit)
}

function find(raw: string): Unit | undefined {
  return LOOKUP.get(raw.trim().toLowerCase().replace(/\s+/g, ' '))
}

function toCelsius(v: number, unit: string): number {
  return unit === 'fahrenheit'
    ? ((v - 32) * 5) / 9
    : unit === 'kelvin'
      ? v - 273.15
      : v
}

function fromCelsius(c: number, unit: string): number {
  return unit === 'fahrenheit'
    ? (c * 9) / 5 + 32
    : unit === 'kelvin'
      ? c + 273.15
      : c
}

export function convertUnits(
  value: number,
  from: string,
  to: string,
): ConvertResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, error: 'value must be a finite number' }
  }
  const a = find(from)
  if (!a) return { ok: false, error: `Unknown unit "${from}"` }
  const b = find(to)
  if (!b) return { ok: false, error: `Unknown unit "${to}"` }
  if (a.category !== b.category) {
    return {
      ok: false,
      error: `Cannot convert ${a.category} (${a.name}) to ${b.category} (${b.name})`,
    }
  }
  let result: number
  if (a.category === 'temperature') {
    const c = toCelsius(value, a.name)
    if (c < -273.15 - 1e-9)
      return { ok: false, error: 'Temperature is below absolute zero' }
    result = fromCelsius(c, b.name)
  } else {
    result = (value * a.factor) / b.factor
  }
  return {
    ok: true,
    value: Number(result.toPrecision(12)),
    category: a.category,
    from: a.name,
    to: b.name,
  }
}

export const SUPPORTED_UNITS: Record<string, string[]> = UNITS.reduce(
  (acc, unit) => {
    ;(acc[unit.category] ??= []).push(unit.name)
    return acc
  },
  {} as Record<string, string[]>,
)
