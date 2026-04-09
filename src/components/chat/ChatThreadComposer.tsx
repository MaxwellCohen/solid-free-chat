import { For, Show } from 'solid-js'
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  X,
} from 'lucide-solid'
import type { PendingFile, PendingImage } from './chat-thread-utils'

type ChatThreadComposerProps = {
  supportsImage: () => boolean
  supportsDocument: () => boolean
  pendingImages: () => PendingImage[]
  pendingFiles: () => PendingFile[]
  imageButtonPulse: () => boolean
  isLoading: () => boolean
  onImageInput: (e: Event & { currentTarget: HTMLInputElement }) => void
  onFileInput: (e: Event & { currentTarget: HTMLInputElement }) => void
  attachmentSummary: () => string | null
  attachError: () => string | null
  imageAttachNotice: () => string | null
  onRemovePendingImage: (id: string) => void
  onRemovePendingFile: (id: string) => void
  draft: () => string
  onDraftInput: (value: string) => void
  onSubmit: (e: Event) => void
  canSend: () => boolean
  onStop: () => void
}

export function ChatThreadComposer(props: ChatThreadComposerProps) {
  return (
    <form
      class="border-t border-border bg-card shrink-0 p-3 sm:p-4"
      onSubmit={props.onSubmit}
    >
      <div class="mx-auto flex max-w-3xl flex-col gap-2">
        <AttachmentPickerRow props={props} />
        <ComposerFeedback props={props} />
        <PendingAttachmentList props={props} />
        <ComposerInputRow props={props} />
      </div>
    </form>
  )
}

function AttachmentPickerRow(props: { props: ChatThreadComposerProps }) {
  return (
    <Show when={props.props.supportsImage() || props.props.supportsDocument()}>
      <div class="flex flex-wrap items-center gap-2">
        <Show when={props.props.supportsImage()}>
          <ImageAttachmentButton props={props.props} />
        </Show>
        <Show when={props.props.supportsDocument()}>
          <PdfAttachmentButton props={props.props} />
        </Show>
      </div>
    </Show>
  )
}

function ImageAttachmentButton(props: { props: ChatThreadComposerProps }) {
  return (
    <div
      class="border-border text-muted-foreground hover:bg-muted hover:text-foreground relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-[box-shadow,background-color,color] duration-300 disabled:opacity-50"
      classList={{
        'ring-primary/70 bg-primary/5 text-foreground ring-2':
          props.props.imageButtonPulse(),
        'pointer-events-none opacity-50': props.props.isLoading(),
      }}
    >
      <ImageIcon class="size-3.5 shrink-0" aria-hidden={true} />
      Image
      <Show when={props.props.pendingImages().length > 0}>
        <span class="bg-primary/15 text-primary rounded-full px-1.5 py-px text-[10px] font-semibold">
          {props.props.pendingImages().length}
        </span>
      </Show>
      <input
        id="chat-image-input"
        type="file"
        accept="image/*"
        multiple
        class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Attach images"
        onChange={props.props.onImageInput}
      />
    </div>
  )
}

function PdfAttachmentButton(props: { props: ChatThreadComposerProps }) {
  return (
    <div
      class="border-border text-muted-foreground hover:bg-muted hover:text-foreground relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
      classList={{
        'pointer-events-none opacity-50': props.props.isLoading(),
      }}
    >
      <FileText class="size-3.5 shrink-0" aria-hidden={true} />
      PDF
      <input
        id="chat-pdf-input"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Attach PDF"
        onChange={props.props.onFileInput}
      />
    </div>
  )
}

function ComposerFeedback(props: { props: ChatThreadComposerProps }) {
  return (
    <>
      <Show when={props.props.attachmentSummary()} keyed>
        {(summary) => (
          <p class="text-muted-foreground text-xs" aria-live="polite">
            {summary}
          </p>
        )}
      </Show>

      <Show when={props.props.attachError()} keyed>
        {(msg) => (
          <p class="text-destructive text-xs" role="alert">
            {msg}
          </p>
        )}
      </Show>

      <Show when={props.props.imageAttachNotice()} keyed>
        {(msg) => (
          <div
            class="border-primary/25 bg-primary/8 text-foreground flex items-start gap-2 rounded-xl border px-3 py-2 text-xs shadow-sm"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2
              class="text-primary mt-0.5 size-3.5 shrink-0"
              aria-hidden={true}
            />
            <span>{msg}</span>
          </div>
        )}
      </Show>
    </>
  )
}

function PendingAttachmentList(props: { props: ChatThreadComposerProps }) {
  return (
    <Show
      when={
        props.props.pendingImages().length > 0 || props.props.pendingFiles().length > 0
      }
    >
      <ul class="flex flex-wrap gap-2" aria-label="Attachments ready to send">
        <For each={props.props.pendingImages()}>
          {(img) => (
            <PendingImagePreview
              image={img}
              onRemove={props.props.onRemovePendingImage}
            />
          )}
        </For>
        <For each={props.props.pendingFiles()}>
          {(file) => (
            <PendingFileChip
              file={file}
              onRemove={props.props.onRemovePendingFile}
            />
          )}
        </For>
      </ul>
    </Show>
  )
}

function PendingImagePreview(props: {
  image: PendingImage
  onRemove: (id: string) => void
}) {
  return (
    <li class="relative inline-block">
      <img
        src={props.image.previewUrl}
        alt=""
        class="border-border h-16 w-16 rounded-lg border object-cover shadow-sm"
      />
      <button
        type="button"
        class="bg-background/90 ring-border absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full shadow ring-1"
        aria-label="Remove image"
        onClick={() => props.onRemove(props.image.id)}
      >
        <X class="size-3" aria-hidden={true} />
      </button>
    </li>
  )
}

function PendingFileChip(props: {
  file: PendingFile
  onRemove: (id: string) => void
}) {
  return (
    <li class="border-border bg-muted/50 text-muted-foreground relative inline-flex max-w-48 items-center gap-1 rounded-lg border px-2 py-1 text-xs">
      <FileText class="size-3.5 shrink-0" aria-hidden={true} />
      <span class="min-w-0 truncate">{props.file.name}</span>
      <button
        type="button"
        class="hover:text-foreground ml-1 shrink-0 rounded p-0.5"
        aria-label="Remove file"
        onClick={() => props.onRemove(props.file.id)}
      >
        <X class="size-3.5" aria-hidden={true} />
      </button>
    </li>
  )
}

function ComposerInputRow(props: { props: ChatThreadComposerProps }) {
  return (
    <div class="flex gap-2">
      <textarea
        class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring max-h-40 min-h-11 flex-1 resize-y rounded-xl border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
        placeholder="Message…"
        rows={2}
        value={props.props.draft()}
        onInput={(e) => props.props.onDraftInput(e.currentTarget.value)}
        disabled={props.props.isLoading()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault()
            void props.props.onSubmit(e)
          }
        }}
      />
      <div class="flex flex-col gap-2">
        <button
          type="submit"
          class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
          disabled={!props.props.canSend()}
        >
          Send
        </button>
        <Show when={props.props.isLoading()}>
          <button
            type="button"
            class="border-border hover:bg-muted rounded-xl border px-3 py-1 text-xs"
            onClick={props.props.onStop}
          >
            Stop
          </button>
        </Show>
      </div>
    </div>
  )
}
