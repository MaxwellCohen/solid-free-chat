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
        <p class="text-destructive text-xs">
          Could not draw diagram: {error()}
        </p>
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

/** Image from the `generate_image` tool. No credentials or referrer are sent to the image host. */
export function ImageCard(props: { url: string; prompt: string }) {
  const [loaded, setLoaded] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  const linkClass =
    'border-border text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium'
  return (
    <figure
      class="border-border bg-background mt-2 w-80 max-w-full rounded-lg border p-3 first:mt-0"
      data-testid="image-card"
    >
      <div class="bg-muted relative aspect-square w-full overflow-hidden rounded-md">
        <Show when={!loaded() && !failed()}>
          <div
            class="absolute inset-0 animate-pulse"
            data-testid="image-skeleton"
            aria-hidden="true"
          />
        </Show>
        <Show
          when={!failed()}
          fallback={
            <p
              class="text-muted-foreground flex h-full items-center justify-center p-4 text-center text-xs"
              role="alert"
            >
              Could not load the image.
            </p>
          }
        >
          <img
            src={props.url}
            alt={props.prompt}
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
            class="size-full object-contain"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </Show>
      </div>
      <figcaption class="text-muted-foreground mt-2 line-clamp-2 text-xs">
        {props.prompt}
      </figcaption>
      <div class="mt-2 flex gap-2">
        <a
          href={props.url}
          target="_blank"
          rel="noreferrer noopener"
          class={linkClass}
        >
          Open
        </a>
        <a
          href={props.url}
          download="image.png"
          target="_blank"
          rel="noreferrer noopener"
          class={linkClass}
        >
          Download
        </a>
      </div>
    </figure>
  )
}
