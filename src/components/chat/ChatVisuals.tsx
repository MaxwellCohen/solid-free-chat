import { Show, createEffect, createSignal } from 'solid-js'
import type { ParentProps } from 'solid-js'
import type { ChartSpec } from '../../lib/visuals/chart'
import { renderMermaidSvg } from '../../lib/visuals/mermaid'

function VisualFrame(props: ParentProps<{ title?: string }>) {
  return (
    <figure class="border-border bg-background mt-2 rounded-lg border p-3 first:mt-0">
      <Show when={props.title}>
        <figcaption class="mb-2 text-sm font-medium">{props.title}</figcaption>
      </Show>
      {props.children}
    </figure>
  )
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Mermaid diagram from the `render_diagram` tool. */
export function DiagramView(props: { code: string; title?: string }) {
  const [error, setError] = createSignal<string>()
  let container: HTMLDivElement | undefined

  createEffect(
    () => props.code,
    (code) => {
      let cancelled = false
      setError(undefined)
      renderMermaidSvg(code).then(
        (svg) => {
          if (!cancelled && container) container.innerHTML = svg
        },
        (err: unknown) => {
          if (!cancelled) setError(errorMessage(err))
        },
      )
      return () => {
        cancelled = true
      }
    },
  )

  return (
    <VisualFrame title={props.title}>
      <Show when={error()}>
        <p class="text-destructive text-xs">Could not draw diagram: {error()}</p>
      </Show>
      <div ref={(el) => (container = el)} class="chat-diagram" />
    </VisualFrame>
  )
}

/** Chart from the `render_chart` tool; TanStack Charts loads on first use. */
export function ChartView(props: { spec: ChartSpec }) {
  const [error, setError] = createSignal<string>()
  let container: HTMLDivElement | undefined

  createEffect(
    () => props.spec,
    (spec) => {
      let cancelled = false
      let destroy: (() => void) | undefined
      setError(undefined)
      import('../../lib/visuals/chart-render').then(
        ({ mountChartSpec }) => {
          if (cancelled || !container) return
          try {
            destroy = mountChartSpec(container, spec)
          } catch (err) {
            setError(errorMessage(err))
          }
        },
        (err: unknown) => {
          if (!cancelled) setError(errorMessage(err))
        },
      )
      return () => {
        cancelled = true
        destroy?.()
      }
    },
  )

  return (
    <VisualFrame title={props.spec.title}>
      <Show when={error()}>
        <p class="text-destructive text-xs">Could not draw chart: {error()}</p>
      </Show>
      <div ref={(el) => (container = el)} class="chat-chart w-full" />
    </VisualFrame>
  )
}
