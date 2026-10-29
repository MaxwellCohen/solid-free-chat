import { describe, expect, it } from 'vitest'
import { validateChartSpec } from './chart'

describe('validateChartSpec', () => {
  it('accepts a bar chart and normalizes optional fields', () => {
    const result = validateChartSpec({
      type: 'bar',
      title: ' Sales ',
      labels: ['Q1', 'Q2'],
      datasets: [{ data: [1, 2] }],
    })
    expect(result).toEqual({
      ok: true,
      spec: {
        type: 'bar',
        title: 'Sales',
        labels: ['Q1', 'Q2'],
        datasets: [{ label: 'Series 1', data: [1, 2] }],
        x_label: undefined,
        y_label: undefined,
        stacked: false,
      },
    })
  })

  it('accepts scatter points without labels', () => {
    expect(
      validateChartSpec({
        type: 'scatter',
        datasets: [{ label: 'a', data: [{ x: 1, y: 2 }] }],
      }).ok,
    ).toBe(true)
  })

  it('explains invalid specs', () => {
    expect(validateChartSpec({ type: 'bubble', datasets: [] })).toMatchObject({
      ok: false,
    })
    expect(
      validateChartSpec({
        type: 'line',
        labels: ['a', 'b'],
        datasets: [{ data: [1] }],
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/1 values but there are 2 labels/),
    })
    expect(
      validateChartSpec({
        type: 'pie',
        labels: ['a'],
        datasets: [{ data: ['x'] }],
      }),
    ).toMatchObject({ ok: false })
    expect(
      validateChartSpec({ type: 'bar', datasets: [{ data: [1] }] }),
    ).toMatchObject({
      ok: false,
      error: 'labels is required for bar charts.',
    })
  })
})
