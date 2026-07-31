import { For, createMemo } from 'solid-js'
import type { UIMessage } from '@tanstack/ai-solid'
import { FileText } from 'lucide-solid'
import { renderMarkdownToHtml } from '../../lib/markdown'

export function MessageParts(props: { message: UIMessage }) {
  return (
    <For each={props.message.parts}>
      {(part) => <PartBlock part={part} role={props.message.role} />}
    </For>
  )
}

function PartBlock(props: {
  part: UIMessage['parts'][number]
  role: UIMessage['role']
}) {
  const part = props.part
  if (part.type === 'text') {
    return <TextPart role={props.role} content={part.content} />
  }
  if (part.type === 'image') {
    return <ImagePart part={part} />
  }
  if (part.type === 'document') {
    return <DocumentPart part={part} />
  }
  if (part.type === 'thinking') {
    return (
      <details class="group mt-2 overflow-hidden rounded-lg border border-border first:mt-0">
        <summary class="text-muted-foreground hover:bg-muted/40 cursor-pointer list-none px-3 py-2 text-xs font-medium select-none [&::-webkit-details-marker]:hidden">
          <span class="mr-1.5 inline-block transition-transform duration-150 group-open:rotate-90">
            ▸
          </span>
          Reasoning
        </summary>
        <div class="text-muted-foreground border-t border-border px-3 py-2 text-xs italic whitespace-pre-wrap">
          {part.content}
        </div>
      </details>
    )
  }
  if (part.type === 'tool-call') {
    return (
      <pre class="bg-muted mt-2 max-h-48 overflow-auto rounded-lg p-2 text-xs first:mt-0">
        <span class="font-semibold">{part.name}</span>
        {'\n'}
        {part.arguments}
      </pre>
    )
  }
  if (part.type === 'tool-result') {
    const resultContent =
      typeof part.content === 'string'
        ? part.content
        : JSON.stringify(part.content, null, 2)
    return (
      <pre class="bg-muted mt-2 max-h-48 overflow-auto rounded-lg p-2 text-xs first:mt-0">
        {resultContent}
      </pre>
    )
  }
  return (
    <p class="text-muted-foreground text-xs">
      Unsupported part: {(part as { type: string }).type}
    </p>
  )
}

function ImagePart(props: {
  part: Extract<UIMessage['parts'][number], { type: 'image' }>
}) {
  const p = props.part
  const src = () => {
    if (p.source.type === 'data') {
      const v = p.source.value
      if (v.startsWith('data:')) return v
      return `data:${p.source.mimeType};base64,${v}`
    }
    return p.source.value
  }
  return (
    <img
      src={src()}
      alt=""
      class="mt-2 max-h-56 max-w-full rounded-lg border border-white/20 object-contain first:mt-0"
    />
  )
}

function DocumentPart(props: {
  part: Extract<UIMessage['parts'][number], { type: 'document' }>
}) {
  const meta = props.part.metadata as { filename?: string } | undefined
  const name = meta?.filename ?? 'Attached file'
  return (
    <p class="mt-2 flex items-center gap-1.5 text-xs opacity-90 first:mt-0">
      <FileText class="size-3.5 shrink-0" aria-hidden={true} />
      <span class="truncate">{name}</span>
    </p>
  )
}

function TextPart(props: { role: UIMessage['role']; content: string }) {
  const html = createMemo(() =>
    props.role === 'assistant' ? renderMarkdownToHtml(props.content) : '',
  )

  if (props.role === 'assistant') {
    return <div class="chat-md" innerHTML={html()}></div>
  }
  return <p class="whitespace-pre-wrap">{props.content}</p>
}
