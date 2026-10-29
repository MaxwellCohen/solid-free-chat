import {
  areaY,
  barX,
  barY,
  colorLegend,
  defineChart,
  dot,
  group,
  lineY,
  ruleY,
  stack,
} from '@tanstack/charts'
import { mountChart } from '@tanstack/charts/dom'
import {
  angleGrid,
  pie,
  polar,
  radialArc,
  radialArea,
  radialGrid,
  radialLine,
} from '@tanstack/charts/polar'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scalePoint } from '@tanstack/charts/scales/point'
import { tooltip } from '@tanstack/charts/tooltip'
import { curveLinearClosed } from 'd3-shape'
import type { ChartValue, DomChartDefinition } from '@tanstack/charts'
import type { ChartSpec } from './chart'

/**
 * Draws a validated `ChartSpec` with TanStack Charts. Imported lazily by the
 * chart view so the library stays out of the main bundle. Axis and text colors
 * follow `currentColor`, so light/dark themes need no redraw.
 */

/** Mid-tone colors that read on both light and dark backgrounds. */
const PALETTE = [
  '#3b82f6',
  '#f97316',
  '#22c55e',
  '#ec4899',
  '#a855f7',
  '#06b6d4',
  '#eab308',
  '#ef4444',
  '#6366f1',
  '#84cc16',
  '#14b8a6',
  '#d946ef',
]

interface CategoryRow {
  id: string
  category: string
  series: string
  value: number
}

interface PointRow {
  id: string
  series: string
  x: number
  y: number
}

function categoryRows(spec: ChartSpec): CategoryRow[] {
  const labels = spec.labels ?? []
  return spec.datasets.flatMap((dataset) =>
    labels.map((category, i) => ({
      id: `${dataset.label}\u0000${category}`,
      category,
      series: dataset.label,
      value: dataset.data[i] as number,
    })),
  )
}

function pointRows(spec: ChartSpec): PointRow[] {
  return spec.datasets.flatMap((dataset) =>
    (dataset.data as { x: number; y: number }[]).map((point, i) => ({
      id: `${dataset.label}\u0000${i}`,
      series: dataset.label,
      x: point.x,
      y: point.y,
    })),
  )
}

function seriesColor(spec: ChartSpec) {
  const domain = spec.datasets.map((dataset) => dataset.label)
  return {
    domain,
    range: domain.map((_, i) => PALETTE[i % PALETTE.length]),
    legend: domain.length > 1 ? colorLegend() : undefined,
  }
}

function axisLabel(label: string | undefined) {
  return label ? { label } : undefined
}

export type UseChartDefinition<TResult> = <TDatum, TX extends ChartValue, TY extends ChartValue>(
  definition: DomChartDefinition<TDatum, TX, TY>,
) => TResult

/**
 * Build the TanStack definition for `spec` and pass it to `use`. Each chart
 * type has its own definition type, so the callback is generic.
 */
export function withChartDefinition<TResult>(
  spec: ChartSpec,
  use: UseChartDefinition<TResult>,
): TResult {
  const rows = categoryRows(spec)
  const color = seriesColor(spec)
  const labels = spec.labels ?? []

  switch (spec.type) {
    case 'bar':
      return use(
        defineChart(
          {
            marks: [
              barY(rows, {
                x: 'category',
                y: 'value',
                color: 'series',
                key: 'id',
                inset: 1,
                layout:
                  spec.stacked || spec.datasets.length === 1
                    ? stack()
                    : group(),
              }),
              ruleY([0]),
            ],
            scales: {
              x: {
                scale: () => scaleBand<string>().domain(labels).padding(0.16),
                axis: axisLabel(spec.x_label),
              },
              y: {
                scale: scaleLinear,
                nice: true,
                grid: true,
                axis: axisLabel(spec.y_label),
              },
            },
            color,
          },
          { tooltip },
        ),
      )
    case 'horizontal_bar':
      return use(
        defineChart(
          {
            marks: [
              barX(rows, {
                x: 'value',
                y: 'category',
                color: 'series',
                key: 'id',
                inset: 1,
                layout:
                  spec.stacked || spec.datasets.length === 1
                    ? stack()
                    : group(),
              }),
            ],
            scales: {
              x: {
                scale: scaleLinear,
                nice: true,
                grid: true,
                axis: axisLabel(spec.y_label),
              },
              y: {
                scale: () => scaleBand<string>().domain(labels).padding(0.16),
                axis: axisLabel(spec.x_label),
              },
            },
            color,
          },
          { tooltip },
        ),
      )
    case 'line':
    case 'area':
      return use(
        defineChart(
          {
            marks: [
              ...(spec.type === 'area'
                ? [
                    areaY(rows, {
                      x: 'category',
                      y: 'value',
                      z: 'series',
                      color: 'series',
                      fillOpacity: spec.stacked ? 0.8 : 0.25,
                      ...(spec.stacked ? { layout: stack() } : {}),
                    }),
                  ]
                : []),
              ...(spec.type === 'line' || !spec.stacked
                ? [
                    lineY(rows, {
                      x: 'category',
                      y: 'value',
                      z: 'series',
                      color: 'series',
                    }),
                  ]
                : []),
            ],
            scales: {
              x: {
                scale: () => scalePoint<string>().domain(labels).padding(0.1),
                axis: axisLabel(spec.x_label),
              },
              y: {
                scale: scaleLinear,
                nice: true,
                grid: true,
                axis: axisLabel(spec.y_label),
              },
            },
            color,
          },
          { tooltip },
        ),
      )
    case 'scatter':
      return use(
        defineChart(
          {
            marks: [
              dot(pointRows(spec), {
                x: 'x',
                y: 'y',
                color: 'series',
                key: 'id',
              }),
            ],
            scales: {
              x: {
                scale: scaleLinear,
                nice: true,
                grid: true,
                axis: axisLabel(spec.x_label),
              },
              y: {
                scale: scaleLinear,
                nice: true,
                grid: true,
                axis: axisLabel(spec.y_label),
              },
            },
            color,
          },
          { tooltip },
        ),
      )
    case 'pie':
    case 'doughnut': {
      // One ring: the first dataset, one slice per label.
      const slices = pie(
        rows.filter((row) => row.series === spec.datasets[0].label),
        { value: 'value' },
      )
      const doughnut = spec.type === 'doughnut'
      return use(
        defineChart(
          {
            marks: [
              polar({
                inset: 8,
                radiusRatio: 0.82,
                marks: [
                  radialArc(slices, {
                    innerRadius: ({ radius }) => (doughnut ? radius * 0.58 : 0),
                    color: 'category',
                    key: 'category',
                  }),
                ],
                scales: { angle: null, radius: null },
              }),
            ],
            scales: { x: null, y: null },
            color: {
              domain: labels,
              range: labels.map((_, i) => PALETTE[i % PALETTE.length]),
              legend: colorLegend(),
            },
          },
          { tooltip },
        ),
      )
    }
    case 'radar':
      return use(
        defineChart(
          {
            marks: [
              polar({
                radiusRatio: 0.72,
                scales: {
                  angle: {
                    scale: scalePoint<string>().domain(labels),
                    wrap: true,
                  },
                  radius: { scale: scaleLinear, nice: true },
                },
                guides: [
                  radialGrid({ shape: 'polygon' }),
                  angleGrid({ labels: true }),
                ],
                marks: [
                  radialArea(rows, {
                    angle: 'category',
                    radius: 'value',
                    z: 'series',
                    color: 'series',
                    curve: curveLinearClosed,
                    fillOpacity: 0.2,
                  }),
                  radialLine(rows, {
                    angle: 'category',
                    radius: 'value',
                    z: 'series',
                    color: 'series',
                    curve: curveLinearClosed,
                    strokeWidth: 2,
                  }),
                ],
              }),
            ],
            scales: { x: null, y: null },
            color,
          },
          { tooltip },
        ),
      )
  }
}

/** Mount `spec` into `container`; returns a cleanup function. */
export function mountChartSpec(
  container: HTMLElement,
  spec: ChartSpec,
): () => void {
  return withChartDefinition(spec, (definition) => {
    const host = mountChart(container, {
      definition,
      ariaLabel: spec.title ?? `${spec.type.replace('_', ' ')} chart`,
      height: 288,
    })
    return () => host.destroy()
  })
}
