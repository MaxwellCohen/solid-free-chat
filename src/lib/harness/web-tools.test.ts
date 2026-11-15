import { describe, expect, it, vi } from 'vitest'
import { getWeather, wikipediaLookup } from './web-tools'
import { contentSecurityPolicy } from '../content-security-policy'

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('wikipediaLookup', () => {
  it('searches then fetches the summary, without credentials or auth headers', async () => {
    const fetchMock = vi.fn((url: string) =>
      url.includes('opensearch')
        ? json(['q', ['Alan Turing'], [''], ['u']])
        : json({
            title: 'Alan Turing',
            description: 'English mathematician',
            extract: 'Alan Turing was a mathematician.',
            content_urls: {
              desktop: { page: 'https://en.wikipedia.org/wiki/Alan_Turing' },
            },
          }),
    )
    const r = await wikipediaLookup('turing', fetchMock)
    expect(r).toMatchObject({
      ok: true,
      title: 'Alan Turing',
      url: 'https://en.wikipedia.org/wiki/Alan_Turing',
    })
    expect(fetchMock.mock.calls[0][0]).toContain(
      'https://en.wikipedia.org/w/api.php',
    )
    expect(fetchMock.mock.calls[1][0]).toContain('/page/summary/Alan_Turing')
    for (const [, init] of fetchMock.mock.calls as unknown as [
      string,
      RequestInit,
    ][]) {
      expect(init.credentials).toBe('omit')
      expect(init.headers).toBeUndefined()
    }
  })
  it('handles no match, empty query, and HTTP errors', async () => {
    expect(
      await wikipediaLookup('zzz', () => json(['zzz', [], [], []])),
    ).toMatchObject({ ok: false })
    expect(await wikipediaLookup('  ', vi.fn())).toMatchObject({ ok: false })
    expect(await wikipediaLookup('x', () => json({}, 500))).toMatchObject({
      ok: false,
      error: expect.stringContaining('HTTP 500'),
    })
    expect(
      await wikipediaLookup('x', () => Promise.reject(new Error('offline'))),
    ).toMatchObject({ ok: false })
  })
})

describe('getWeather', () => {
  const forecast = {
    current: {
      temperature_2m: 18.2,
      apparent_temperature: 17,
      relative_humidity_2m: 60,
      wind_speed_10m: 9,
      weather_code: 2,
    },
    current_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
    daily: {
      time: ['2026-11-04', '2026-11-05', '2026-11-06'],
      weather_code: [2, 61, 0],
      temperature_2m_max: [19, 17, 20],
      temperature_2m_min: [11, 10, 9],
      precipitation_sum: [0, 4.2, 0],
    },
  }
  it('geocodes then forecasts', async () => {
    const fetchMock = vi.fn((url: string) =>
      url.startsWith('https://geocoding-api.open-meteo.com')
        ? json({
            results: [
              {
                name: 'Lisbon',
                country: 'Portugal',
                latitude: 38.7,
                longitude: -9.1,
              },
            ],
          })
        : json(forecast),
    )
    const r = await getWeather('Lisbon', fetchMock)
    expect(r).toMatchObject({ ok: true, location: 'Lisbon, Portugal' })
    if (r.ok) {
      expect(r.current.conditions).toBe('Partly cloudy')
      expect(r.forecast).toHaveLength(3)
      expect(r.forecast[1].conditions).toBe('Light rain')
    }
    expect(fetchMock.mock.calls[1][0]).toContain(
      'https://api.open-meteo.com/v1/forecast?latitude=38.7&longitude=-9.1',
    )
    for (const [, init] of fetchMock.mock.calls as unknown as [
      string,
      RequestInit,
    ][]) {
      expect(init.credentials).toBe('omit')
      expect(init.headers).toBeUndefined()
    }
  })
  it('handles unknown place and failures', async () => {
    expect(await getWeather('Nowhereville', () => json({}))).toMatchObject({
      ok: false,
    })
    expect(await getWeather('', vi.fn())).toMatchObject({ ok: false })
    expect(await getWeather('x', () => json({}, 503))).toMatchObject({
      ok: false,
    })
  })
})

describe('content security policy', () => {
  it('allows the tool hosts in connect-src', () => {
    const connect = contentSecurityPolicy()
      .split('; ')
      .find((d) => d.startsWith('connect-src'))!
    for (const host of [
      'https://en.wikipedia.org',
      'https://geocoding-api.open-meteo.com',
      'https://api.open-meteo.com',
    ])
      expect(connect).toContain(host)
  })
})
