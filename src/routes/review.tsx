import { createFileRoute } from '@tanstack/solid-router'
import { For, Show, createMemo, createSignal } from 'solid-js'

import { runAgent } from '../lib/harness/run-agent'
import { DEFAULT_CHAT_MODEL } from '../lib/chat-models'
import { loadStoredApiKey } from '../lib/openrouter-key-storage'
import {
  applySuggestion,
  buildReviewSystemPrompt,
  parseReviewComments,
  segmentText,
  type ReviewComment,
  type ReviewFocus,
} from '../lib/writing-review'

export const Route = createFileRoute('/review')({
  component: Review,
})

const FOCUSES: { id: ReviewFocus; label: string }[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'copy-edit', label: 'Copy edit' },
  { id: 'critique', label: 'Critique' },
]

function Review() {
  const [text, setText] = createSignal('')
  const [focus, setFocus] = createSignal<ReviewFocus>('editor')
  const [reviewedText, setReviewedText] = createSignal<string | null>(null)
  const [comments, setComments] = createSignal<ReviewComment[]>([])
  const [activeId, setActiveId] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal('')
  let abort: AbortController | undefined

  const annotated = createMemo(() => {
    const t = reviewedText()
    return t === null ? null : segmentText(t, comments())
  })

  const dismiss = (id: string) =>
    setComments((list) => list.filter((c) => c.id !== id))

  const accept = (comment: ReviewComment) => {
    const next = applySuggestion(reviewedText() ?? '', comment)
    setReviewedText(next)
    setText(next)
    dismiss(comment.id)
  }

  const runReview = async () => {
    const apiKey = loadStoredApiKey().key.trim()
    if (!apiKey) {
      setError('Add your OpenRouter API key on the Chat page first.')
      return
    }
    const input = text()
    if (!input.trim()) return
    abort?.abort()
    abort = new AbortController()
    setLoading(true)
    setError('')
    setComments([])
    setReviewedText(input)
    try {
      let raw = ''
      for await (const chunk of runAgent({
        apiKey,
        model: DEFAULT_CHAT_MODEL,
        messages: [{ role: 'user', content: input }],
        systemPrompt: buildReviewSystemPrompt(focus()),
        abortSignal: abort.signal,
      })) {
        if (chunk.type === 'TEXT_MESSAGE_CONTENT') raw += chunk.delta
        else if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
      }
      const parsed = parseReviewComments(raw)
      if (parsed.length === 0)
        setError('No feedback could be parsed. Try again.')
      setComments(parsed)
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Review failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main class="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_20rem]">
      <section class="min-w-0">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <h1 class="text-foreground mr-auto text-2xl font-bold tracking-tight">
            Writing review
          </h1>
          <For each={FOCUSES}>
            {(f) => (
              <button
                type="button"
                class={[
                  'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  focus() === f.id
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                ]}
                onClick={() => setFocus(f.id)}
              >
                {f.label}
              </button>
            )}
          </For>
          <button
            type="button"
            class="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            disabled={loading() || !text().trim()}
            onClick={runReview}
          >
            {loading() ? 'Reviewing…' : 'Review'}
          </button>
        </div>

        <Show when={error()}>
          <p class="text-destructive mb-3 text-sm" role="alert">
            {error()}
          </p>
        </Show>

        <Show
          when={annotated()}
          fallback={
            <textarea
              class="border-border bg-card text-foreground min-h-[60vh] w-full rounded-2xl border p-5 font-serif text-lg leading-relaxed"
              placeholder="Paste or write your post here…"
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          }
        >
          {(a) => (
            <article class="border-border bg-card text-foreground rounded-2xl border p-5 font-serif text-lg leading-relaxed whitespace-pre-wrap">
              <For each={a().segments}>
                {(seg) =>
                  seg.type === 'mark' ? (
                    <mark
                      class={[
                        'cursor-pointer rounded px-0.5',
                        activeId() === seg.comment.id
                          ? 'bg-primary/30'
                          : 'bg-primary/10',
                      ]}
                      onClick={() => setActiveId(seg.comment.id)}
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    seg.text
                  )
                }
              </For>
              <div class="mt-6">
                <button
                  type="button"
                  class="text-primary text-sm font-medium not-italic underline-offset-4 hover:underline"
                  style={{ 'font-family': 'var(--font-sans, inherit)' }}
                  onClick={() => {
                    abort?.abort()
                    setReviewedText(null)
                    setComments([])
                  }}
                >
                  Edit text
                </button>
              </div>
            </article>
          )}
        </Show>
      </section>

      <aside class="space-y-3">
        <Show
          when={
            reviewedText() !== null &&
            !loading() &&
            comments().length === 0 &&
            !error()
          }
        >
          <p class="text-muted-foreground text-sm">All feedback handled.</p>
        </Show>
        <For each={comments()}>
          {(c) => (
            <div
              class={[
                'border-border bg-card rounded-xl border p-3 text-sm',
                activeId() === c.id && 'ring-primary ring-2',
              ]}
              onClick={() => setActiveId(c.id)}
            >
              <div class="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                {c.kind}
              </div>
              <p class="text-foreground">{c.comment}</p>
              <Show when={c.suggestion !== undefined}>
                <p class="bg-muted mt-2 rounded-md p-2">{c.suggestion}</p>
              </Show>
              <div class="mt-2 flex gap-2">
                <Show when={c.suggestion !== undefined}>
                  <button
                    type="button"
                    class="text-primary font-medium"
                    onClick={(e) => {
                      e.stopPropagation()
                      accept(c)
                    }}
                  >
                    Accept
                  </button>
                </Show>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation()
                    dismiss(c.id)
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </For>
      </aside>
    </main>
  )
}
