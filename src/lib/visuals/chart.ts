/**
 * Chart spec the model sends to `render_chart`: plain JSON, no callbacks,
 * colors chosen by the app. Validation lives here (no chart library import);
 * drawing is in `chart-render.ts`, loaded on first use.
 */
export const CHART_TYPES = [
  'bar',
  'horizontal_bar',
  'line',
  'area',
  'pie',
  'doughnut',
  'scatter',
  'radar',
] as const

export type ChartType = (typeof CHART_TYPES)[number]

export interface ChartPoint {
  x: number
  y: number
}

export interface ChartDataset {
  label: string
  data: number[] | ChartPoint[]
}

export interface ChartSpec {
  type: ChartType
  title?: string
  labels?: string[]
  datasets: ChartDataset[]
  x_label?: string
  y_label?: string
  stacked?: boolean
}

const MAX_DATASETS = 12
const MAX_POINTS = 2_000

export type ChartSpecResult =
  { ok: true; spec: ChartSpec } | { ok: false; error: string }

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPoint(value: unknown): value is ChartPoint {
  if (!value || typeof value !== 'object') return false
  const point = value as Record<string, unknown>
  return isFiniteNumber(point.x) && isFiniteNumber(point.y)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Check model input and return a normalized spec, or an error the model can act on. */
export function validateChartSpec(input: unknown): ChartSpecResult {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Chart spec must be an object.' }
  }
  const raw = input as Record<string, unknown>
  const type = raw.type
  if (typeof type !== 'string' || !CHART_TYPES.includes(type as ChartType)) {
    return {
      ok: false,
      error: `type must be one of: ${CHART_TYPES.join(', ')}.`,
    }
  }
  if (!Array.isArray(raw.datasets) || raw.datasets.length === 0) {
    return { ok: false, error: 'datasets must be a non-empty array.' }
  }
  if (raw.datasets.length > MAX_DATASETS) {
    return { ok: false, error: `At most ${MAX_DATASETS} datasets.` }
  }

  const isScatter = type === 'scatter'
  const labels = Array.isArray(raw.labels) ? raw.labels.map(String) : undefined
  if (!isScatter && !labels?.length) {
    return { ok: false, error: `labels is required for ${type} charts.` }
  }
  if (labels && new Set(labels).size !== labels.length) {
    return { ok: false, error: 'labels must be unique.' }
  }

  const datasets: ChartDataset[] = []
  for (const [index, value] of raw.datasets.entries()) {
    const dataset = (value ?? {}) as Record<string, unknown>
    const data = dataset.data
    const label = optionalString(dataset.label) ?? `Series ${index + 1}`
    if (datasets.some((existing) => existing.label === label)) {
      return { ok: false, error: `Dataset labels must be unique ("${label}" repeats).` }
    }
    if (!Array.isArray(data) || data.length === 0) {
      return {
        ok: false,
        error: `datasets[${index}].data must be a non-empty array.`,
      }
    }
    if (data.length > MAX_POINTS) {
      return {
        ok: false,
        error: `datasets[${index}] has more than ${MAX_POINTS} points.`,
      }
    }
    if (isScatter) {
      if (!data.every(isPoint)) {
        return {
          ok: false,
          error: `datasets[${index}].data must be {"x": number, "y": number} points for scatter charts.`,
        }
      }
      datasets.push({ label, data })
      continue
    }
    if (!data.every(isFiniteNumber)) {
      return {
        ok: false,
        error: `datasets[${index}].data must contain only numbers.`,
      }
    }
    if (labels && data.length !== labels.length) {
      return {
        ok: false,
        error: `datasets[${index}] has ${data.length} values but there are ${labels.length} labels.`,
      }
    }
    datasets.push({ label, data })
  }

  return {
    ok: true,
    spec: {
      type: type as ChartType,
      title: optionalString(raw.title),
      labels,
      datasets,
      x_label: optionalString(raw.x_label),
      y_label: optionalString(raw.y_label),
      stacked: raw.stacked === true,
    },
  }
}
