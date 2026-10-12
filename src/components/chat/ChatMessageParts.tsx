import { For, Match, Show, Switch, createMemo } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { UIMessage } from '@tanstack/ai-client'
import { FileText } from '../icons'
import { renderMarkdownToHtml } from '../../lib/markdown'

type MessagePart = UIMessage['parts'][number]

export function MessageParts(props: { message: UIMessage }) {
  return (
    <For each={props.message.parts} keyed={false}>
      {(part) => <PartBlock part={part} role={() => props.message.role} />}
    </For>
  )
}

function PartBlock(props: {
  part: Accessor<MessagePart>
  role: Accessor<UIMessage['role']>
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
        <ToolResultPart part={props.part} />
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

  return (
    <Show
      when={props.role() === 'assistant'}
      fallback={<p class="whitespace-pre-wrap">{props.content()}</p>}
    >
      <div class="chat-md" innerHTML={html()} />
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

function ToolCallPart(props: { part: Accessor<MessagePart> }) {
  const name = createMemo(() => {
    const part = props.part()
    return part.type === 'tool-call' ? part.name : ''
  })
  const args = createMemo(() => {
    const part = props.part()
    return part.type === 'tool-call' ? part.arguments : ''
  })

  return (
    <pre class="bg-muted mt-2 max-h-48 overflow-auto rounded-lg p-2 text-xs first:mt-0">
      <span class="font-semibold">{name()}</span>
      {'\n'}
      {args()}
    </pre>
  )
}

function ToolResultPart(props: { part: Accessor<MessagePart> }) {
  const text = createMemo(() => {
    const part = props.part()
    if (part.type !== 'tool-result') return ''
    return typeof part.content === 'string'
      ? part.content
      : JSON.stringify(part.content, null, 2)
  })

  return (
    <pre class="bg-muted mt-2 max-h-48 overflow-auto rounded-lg p-2 text-xs first:mt-0">
      {text()}
    </pre>
  )
}
