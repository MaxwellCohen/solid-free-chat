import { For, Match, Show, Switch, createEffect, createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { UIMessage } from '@tanstack/ai-client'
import { CircleAlert, FileText, LoaderCircle, Wrench } from '../icons'
import { renderMarkdownToHtml } from '../../lib/markdown'
import { validateChartSpec } from '../../lib/visuals/chart'
import type { ChartSpec } from '../../lib/visuals/chart'
import { enhanceMermaidBlocks } from '../../lib/visuals/mermaid'
import { ChartView, DiagramView } from './ChatVisuals'

type MessagePart = UIMessage['parts'][number]

export function MessageParts(props: { message: UIMessage }) {
  return (
    <For each={props.message.parts} keyed={false}>
      {(part) => (
        <PartBlock
          part={part}
          role={() => props.message.role}
          message={() => props.message}
        />
      )}
    </For>
  )
}

function PartBlock(props: {
  part: Accessor<MessagePart>
  role: Accessor<UIMessage['role']>
  message: Accessor<UIMessage>
}) {
  return (
    <Switch>
      <Match when={props.part().type === 'text'}>
        <TextPart
          role={props.role}
          content={() => {
            const part = props.part()
            return part.type === 'text' ? part.content : ''
          }}
        />
      </Match>
      <Match when={props.part().type === 'image'}>
        <ImagePart part={props.part} />
      </Match>
      <Match when={props.part().type === 'document'}>
        <DocumentPart part={props.part} />
      </Match>
      <Match when={props.part().type === 'thinking'}>
        <ThinkingPart part={props.part} />
      </Match>
      <Match when={props.part().type === 'tool-call'}>
        <ToolCallPart part={props.part} />
      </Match>
      <Match when={props.part().type === 'tool-result'}>
        <Show when={!isShownOnToolCall(props.part(), props.message())}>
          <ToolResultPart part={props.part} />
        </Show>
      </Match>
      <Match when={props.part().type}>
        <p class="text-muted-foreground text-xs">
          Unsupported part: {props.part().type}
        </p>
      </Match>
    </Switch>
  )
}

function TextPart(props: {
  role: Accessor<UIMessage['role']>
  content: Accessor<string>
}) {
  const html = createMemo(() =>
    props.role() === 'assistant' ? renderMarkdownToHtml(props.content()) : '',
  )
  let container: HTMLDivElement | undefined

  // Draw ```mermaid fences once the markdown HTML is in the DOM.
  createEffect(html, (markup) => {
    if (!container || !markup.includes('data-lang="mermaid"')) return
    return enhanceMermaidBlocks(container)
  })

  return (
    <Show
      when={props.role() === 'assistant'}
      fallback={<p class="whitespace-pre-wrap">{props.content()}</p>}
    >
      <div ref={(el) => (container = el)} class="chat-md" innerHTML={html()} />
    </Show>
  )
}

function ImagePart(props: { part: Accessor<MessagePart> }) {
  const src = createMemo(() => {
    const part = props.part()
    if (part.type !== 'image') return ''
    if (part.source.type === 'data') {
      const value = part.source.value
      if (value.startsWith('data:')) return value
      return `data:${part.source.mimeType};base64,${value}`
    }
    return part.source.value
  })

  return (
    <img
      src={src()}
      alt=""
      class="mt-2 max-h-56 max-w-full rounded-lg border border-white/20 object-contain first:mt-0"
    />
  )
}

function DocumentPart(props: { part: Accessor<MessagePart> }) {
  const name = createMemo(() => {
    const part = props.part()
    if (part.type !== 'document') return 'Attached file'
    const meta = part.metadata as { filename?: string } | undefined
    return meta?.filename ?? 'Attached file'
  })

  return (
    <p class="mt-2 flex items-center gap-1.5 text-xs opacity-90 first:mt-0">
      <FileText class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{name()}</span>
    </p>
  )
}

function ThinkingPart(props: { part: Accessor<MessagePart> }) {
  const content = createMemo(() => {
    const part = props.part()
    return part.type === 'thinking' ? part.content : ''
  })

  return (
    <details class="group mt-2 overflow-hidden rounded-lg border border-border first:mt-0">
      <summary class="text-muted-foreground hover:bg-muted/40 cursor-pointer list-none px-3 py-2 text-xs font-medium select-none [&::-webkit-details-marker]:hidden">
        <span class="mr-1.5 inline-block transition-transform duration-150 group-open:rotate-90">
          ▸
        </span>
        Reasoning
      </summary>
      <div class="text-muted-foreground border-t border-border px-3 py-2 text-xs italic whitespace-pre-wrap">
        {content()}
      </div>
    </details>
  )
}

/** Tool results are rendered inside their tool-call card when it carries the output. */
function isShownOnToolCall(part: MessagePart, message: UIMessage): boolean {
  if (part.type !== 'tool-result') return false
  return message.parts.some(
    (p) => p.type === 'tool-call' && p.id === part.toolCallId && p.output !== undefined,
  )
}

type HarnessToolOutput = {
  ok?: boolean
  output?: string
  result?: string
  error?: string
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function isHarnessToolOutput(value: unknown): value is HarnessToolOutput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length > 0 &&
    keys.every((k) => k === 'ok' || k === 'output' || k === 'result' || k === 'error')
  )
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function ToolCallPart(props: { part: Accessor<MessagePart> }) {
  const call = createMemo(() => {
    const part = props.part()
    return part.type === 'tool-call' ? part : null
  })
  const input = createMemo(() => {
    const part = call()
    if (!part) return ''
    const parsed = part.input ?? parseMaybeJson(part.arguments)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'code' in parsed &&
      typeof (parsed as { code: unknown }).code === 'string'
    ) {
      return (parsed as { code: string }).code
    }
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0) {
      return ''
    }
    return formatValue(parsed)
  })
  const output = createMemo(() => {
    const part = call()
    return part?.output === undefined ? undefined : parseMaybeJson(part.output)
  })
  const failed = createMemo(() => {
    const out = output()
    return (
      call()?.state === 'error' ||
      (isHarnessToolOutput(out) && out.ok === false)
    )
  })
  const running = createMemo(() => output() === undefined && !failed())
  const visual = createMemo(() => {
    const part = call()
    const out = output()
    if (!part || failed() || !isHarnessToolOutput(out) || out.ok !== true) return null
    return toolVisual(part.name, part.input ?? parseMaybeJson(part.arguments))
  })

  return (
    <>
      <Show when={visual()} keyed>
        {(v) =>
          v.kind === 'diagram' ? (
            <DiagramView code={v.code} title={v.title} />
          ) : (
            <ChartView spec={v.spec} />
          )
        }
      </Show>
      <ToolCallDetails call={call} input={input} output={output} running={running} failed={failed} />
    </>
  )
}

function ToolCallDetails(props: {
  call: Accessor<Extract<MessagePart, { type: 'tool-call' }> | null>
  input: Accessor<string>
  output: Accessor<unknown>
  running: Accessor<boolean>
  failed: Accessor<boolean>
}) {
  const { call, input, output, running, failed } = props
  return (
    <details class="group border-border mt-2 overflow-hidden rounded-lg border first:mt-0">
      <summary class="text-muted-foreground hover:bg-muted/40 flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium select-none [&::-webkit-details-marker]:hidden">
        <span class="inline-block transition-transform duration-150 group-open:rotate-90">
          ▸
        </span>
        <Wrench class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="text-foreground font-mono">{call()?.name}</span>
        <Show when={running()}>
          <LoaderCircle class="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
          <span>running…</span>
        </Show>
        <Show when={failed()}>
          <CircleAlert class="text-destructive size-3.5 shrink-0" aria-hidden="true" />
          <span class="text-destructive">failed</span>
        </Show>
      </summary>
      <div class="border-border space-y-2 border-t px-3 py-2">
        <Show when={input()}>
          <pre class="bg-muted max-h-64 overflow-auto rounded-md p-2 text-xs">
            {input()}
          </pre>
        </Show>
        <Show when={output() !== undefined}>
          <ToolOutputView value={output()} />
        </Show>
      </div>
    </details>
  )
}

type ToolVisual =
  | { kind: 'diagram'; code: string; title?: string }
  | { kind: 'chart'; spec: ChartSpec }

/** Inline visual for tools that draw something (`render_diagram`, `render_chart`). */
function toolVisual(name: string, args: unknown): ToolVisual | null {
  if (!args || typeof args !== 'object') return null
  if (name === 'render_diagram') {
    const { code, title } = args as { code?: unknown; title?: unknown }
    if (typeof code !== 'string') return null
    return { kind: 'diagram', code, title: typeof title === 'string' ? title : undefined }
  }
  if (name === 'render_chart') {
    const checked = validateChartSpec(args)
    return checked.ok ? { kind: 'chart', spec: checked.spec } : null
  }
  return null
}

function ToolOutputView(props: { value: unknown }) {
  return (
    <Show
      when={isHarnessToolOutput(props.value) ? props.value : null}
      keyed
      fallback={
        <pre class="bg-muted max-h-64 overflow-auto rounded-md p-2 text-xs">
          {formatValue(props.value)}
        </pre>
      }
    >
      {(out) => (
        <>
          <Show when={out.output}>
            <pre class="bg-muted max-h-64 overflow-auto rounded-md p-2 text-xs">
              {out.output}
            </pre>
          </Show>
          <Show when={out.result !== undefined}>
            <pre class="bg-muted max-h-64 overflow-auto rounded-md p-2 text-xs">
              <span class="text-muted-foreground">→ </span>
              {out.result}
            </pre>
          </Show>
          <Show when={out.error}>
            <pre class="text-destructive bg-muted max-h-64 overflow-auto rounded-md p-2 text-xs">
              {out.error}
            </pre>
          </Show>
          <Show when={!out.output && out.result === undefined && !out.error}>
            <p class="text-muted-foreground text-xs">No output.</p>
          </Show>
        </>
      )}
    </Show>
  )
}

function ToolResultPart(props: { part: Accessor<MessagePart> }) {
  const value = createMemo(() => {
    const part = props.part()
    if (part.type !== 'tool-result') return ''
    return parseMaybeJson(part.content)
  })

  return (
    <div class="mt-2 first:mt-0">
      <ToolOutputView value={value()} />
    </div>
  )
}
