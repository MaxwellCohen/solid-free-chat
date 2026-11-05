/**
 * Keyless, CORS-enabled public lookups. Requests are plain GETs with no custom headers,
 * no credentials, and no referrer, so the OpenRouter key is never attached.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

const SAFE_INIT: RequestInit = {
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
}

async function getJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const res = await fetchImpl(url, SAFE_INIT)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function wikipediaLookup(
  query: string,
  fetchImpl: FetchLike = fetch,
) {
  const q = query.trim()
  if (!q) return { ok: false as const, error: 'query must be non-empty' }
  try {
    const search = (await getJson(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&namespace=0&format=json&origin=*`,
      fetchImpl,
    )) as [string, string[]?, string[]?, string[]?]
    const title = search[1]?.[0]
    if (!title)
      return {
        ok: false as const,
        error: `No Wikipedia article found for "${q}"`,
      }
    const s = (await getJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?origin=*`,
      fetchImpl,
    )) as {
      title?: string
      extract?: string
      description?: string
      content_urls?: { desktop?: { page?: string } }
    }
    const url =
      s.content_urls?.desktop?.page ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
    const extract = s.extract ?? ''
    return {
      ok: true as const,
      title: s.title ?? title,
      description: s.description,
      extract,
      url,
      result: `${s.title ?? title}${s.description ? ` (${s.description})` : ''}\n${extract}\n${url}`,
    }
  } catch (err) {
    return {
      ok: false as const,
      error: `Wikipedia lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  56: 'Freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Violent showers',
  85: 'Light snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm with hail',
}
const describe = (code: number) => WEATHER_CODES[code] ?? `Code ${code}`

export async function getWeather(
  location: string,
  fetchImpl: FetchLike = fetch,
) {
  const name = location.trim()
  if (!name) return { ok: false as const, error: 'location must be non-empty' }
  try {
    const geo = (await getJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`,
      fetchImpl,
    )) as {
      results?: {
        name: string
        country?: string
        admin1?: string
        latitude: number
        longitude: number
      }[]
    }
    const place = geo.results?.[0]
    if (!place)
      return {
        ok: false as const,
        error: `Could not find a place called "${name}"`,
      }
    const w = (await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=3&timezone=auto`,
      fetchImpl,
    )) as {
      current: {
        temperature_2m: number
        apparent_temperature: number
        relative_humidity_2m: number
        wind_speed_10m: number
        weather_code: number
      }
      daily: {
        time: string[]
        weather_code: number[]
        temperature_2m_max: number[]
        temperature_2m_min: number[]
        precipitation_sum: number[]
      }
      current_units?: { temperature_2m?: string; wind_speed_10m?: string }
    }
    const tUnit = w.current_units?.temperature_2m ?? '°C'
    const wUnit = w.current_units?.wind_speed_10m ?? 'km/h'
    const label = [place.name, place.admin1, place.country]
      .filter(Boolean)
      .join(', ')
    const current = {
      temperature: w.current.temperature_2m,
      feels_like: w.current.apparent_temperature,
      humidity_percent: w.current.relative_humidity_2m,
      wind_speed: w.current.wind_speed_10m,
      conditions: describe(w.current.weather_code),
    }
    const forecast = w.daily.time.map((date, i) => ({
      date,
      conditions: describe(w.daily.weather_code[i]),
      high: w.daily.temperature_2m_max[i],
      low: w.daily.temperature_2m_min[i],
      precipitation_mm: w.daily.precipitation_sum[i],
    }))
    return {
      ok: true as const,
      location: label,
      current,
      forecast,
      result:
        `${label}: ${current.conditions}, ${current.temperature}${tUnit} (feels ${current.feels_like}${tUnit}), ` +
        `humidity ${current.humidity_percent}%, wind ${current.wind_speed} ${wUnit}\n` +
        forecast
          .map(
            (d) =>
              `${d.date}: ${d.conditions}, ${d.low}-${d.high}${tUnit}, ${d.precipitation_mm} mm`,
          )
          .join('\n'),
    }
  } catch (err) {
    return {
      ok: false as const,
      error: `Weather lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
