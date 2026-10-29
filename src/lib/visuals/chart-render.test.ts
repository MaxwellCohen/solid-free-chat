import { describe, expect, it } from 'vitest'
import { createChartScene } from '@tanstack/charts'
import { renderChartSvg } from '@tanstack/charts/svg'
import { CHART_TYPES, validateChartSpec } from './chart'
import type { ChartType } from './chart'
import { withChartDefinition } from './chart-render'
import type { UseChartDefinition } from './chart-render'

/** Our definitions are static, so a scene can be built without a DOM. */
const toSvg: UseChartDefinition<string> = (definition) =>
  renderChartSvg(
    createChartScene(definition as Parameters<typeof createChartScene>[0], {
      width: 640,
      height: 288,
    }),
    { ariaLabel: 'test chart' },
  )

function specFor(type: ChartType) {
  const input =
    type === 'scatter'
      ? {
          type,
          datasets: [
            { label: 'A', data: [{ x: 1, y: 2 }, { x: 3, y: 5 }] },
            { label: 'B', data: [{ x: 2, y: 1 }] },
          ],
        }
      : {
          type,
          labels: ['Q1', 'Q2', 'Q3'],
          datasets: [
            { label: 'North', data: [3, 5, 4] },
            { label: 'South', data: [2, 1, 6] },
          ],
          x_label: 'Quarter',
          y_label: 'Revenue',
        }
  const checked = validateChartSpec(input)
  if (!checked.ok) throw new Error(checked.error)
  return checked.spec
}

describe('withChartDefinition', () => {
  it.each(CHART_TYPES)('builds a renderable %s chart', (type) => {
    const svg = withChartDefinition(specFor(type), toSvg)
    expect(svg).toMatch(/^<svg/)
  })

  it('renders stacked bars', () => {
    const spec = { ...specFor('bar'), stacked: true }
    const svg = withChartDefinition(spec, toSvg)
    expect(svg).toMatch(/^<svg/)
  })
})
