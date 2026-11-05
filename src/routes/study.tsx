import { Link, createFileRoute } from '@tanstack/solid-router'
import { For, Show, createMemo, createSignal, onSettled } from 'solid-js'

import { messageToPlainText } from '../components/chat/chat-thread-utils'
import type { ChatUIMessage } from '../store/chat.store'
import type { ChatModelOption } from '../lib/chat-models'
import { loadChatStateAsync } from '../lib/chat-persistence'
import {
  FLASHCARD_SYSTEM_PROMPT,
  buildFlashcardMessages,
  deckToJson,
  deckToTsv,
  dueCards,
  dueCount,
  gradeCard,
  loadDecks,
  newDeck,
  parseFlashcards,
  saveDecks,
} from '../lib/flashcards'
import type { Deck, Grade } from '../lib/flashcards'
import { runAgent } from '../lib/harness/run-agent'
import { isEditableTarget } from '../lib/keyboard-shortcuts'
import { loadAllModelOptions } from '../lib/model-options'
import { loadStoredApiKey } from '../lib/openrouter-key-storage'
import { getProvider } from '../lib/providers'

export const Route = createFileRoute('/study')({
  component: Study,
})

const BTN =
  'border-border text-foreground hover:bg-muted rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50'
const PRIMARY =
  'bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50'

function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'deck'

function Study() {
  const [options, setOptions] = createSignal<ChatModelOption[]>([])
  const [pick, setPick] = createSignal('')
  const [source, setSource] = createSignal('')
  const [name, setName] = createSignal('')
  const [decks, setDecks] = createSignal<Deck[]>([])
  const [hasKey, setHasKey] = createSignal(true)
  const [generating, setGenerating] = createSignal(false)
  const [error, setError] = createSignal('')
  const [reviewId, setReviewId] = createSignal<string | null>(null)
  const [queue, setQueue] = createSignal<string[]>([])
  const [flipped, setFlipped] = createSignal(false)
  let abort: AbortController | undefined

  const encode = (providerId: string, modelId: string) =>
    `${providerId}\n${modelId}`
  const target = () => {
    const raw = pick()
    const i = raw.indexOf('\n')
    return i < 0
      ? null
      : { providerId: raw.slice(0, i), modelId: raw.slice(i + 1) }
  }

  const persist = (next: Deck[]) => {
    setDecks(next)
    saveDecks(next)
  }

  onSettled(() => {
    setDecks(loadDecks())
    setHasKey(!!loadStoredApiKey('openrouter').key.trim())
    void loadAllModelOptions().then((r) => {
      setOptions(r.options)
      setHasKey(
        !!loadStoredApiKey('openrouter').key.trim() ||
          r.options.some(
            (o) => !!loadStoredApiKey(o.providerId ?? 'openrouter').key.trim(),
          ),
      )
      if (!pick() && r.options[0]) {
        setPick(
          encode(r.options[0].providerId ?? 'openrouter', r.options[0].id),
        )
      }
    })
    const onKey = (e: KeyboardEvent) => {
      if (!reviewId() || e.ctrlKey || e.metaKey || e.altKey) return
      if (isEditableTarget(e.target)) return
      if (e.key === ' ') {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'BUTTON' || tag === 'A') return
        e.preventDefault()
        if (!flipped()) setFlipped(true)
      } else if (
        flipped() &&
        (e.key === '1' || e.key === '2' || e.key === '3')
      ) {
        e.preventDefault()
        grade(e.key === '1' ? 'again' : e.key === '2' ? 'good' : 'easy')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      abort?.abort()
    }
  })

  const canGenerate = () =>
    !generating() && source().trim().length > 0 && !!target() && hasKey()

  async function useCurrentChat() {
    setError('')
    const saved = await loadChatStateAsync()
    const id = saved?.currentConversationId
    const msgs: ChatUIMessage[] = id
      ? ((saved.messagesByConversationId[id] as ChatUIMessage[] | undefined) ??
        [])
      : []
    const text = msgs
      .map((m) => {
        const t = messageToPlainText(m).trim()
        return t ? `${m.role === 'user' ? 'User' : 'Assistant'}: ${t}` : ''
      })
      .filter(Boolean)
      .join('\n\n')
    if (!text) {
      setError('The current chat has no text to study yet.')
      return
    }
    setSource(text)
    if (!name().trim() && id) {
      const conv = saved.conversationsById[id] as { title?: string } | undefined
      setName(conv?.title ?? '')
    }
  }

  async function generate() {
    const t = target()
    if (!t) return
    setError('')
    setGenerating(true)
    abort = new AbortController()
    try {
      let out = ''
      for await (const chunk of runAgent({
        apiKey: loadStoredApiKey(t.providerId).key.trim(),
        providerId: t.providerId,
        model: t.modelId,
        messages: buildFlashcardMessages(source()),
        systemPrompt: FLASHCARD_SYSTEM_PROMPT,
        temperature: 0.4,
        maxTokens: 2000,
        tools: [],
        abortSignal: abort.signal,
      })) {
        if (chunk.type === 'TEXT_MESSAGE_CONTENT') out += chunk.delta
        else if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
      }
      const pairs = parseFlashcards(out)
      if (pairs.length === 0) {
        setError('The model did not return usable flashcards. Try again.')
        return
      }
      const deck = newDeck(
        name().trim() ||
          source().trim().split('\n')[0].slice(0, 40) ||
          'Untitled deck',
        pairs,
      )
      persist([deck, ...decks()])
      setSource('')
      setName('')
      startReview(deck)
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setGenerating(false)
    }
  }

  const deck = createMemo(() => decks().find((d) => d.id === reviewId()))
  const current = createMemo(() => {
    const id = queue()[0]
    return deck()?.cards.find((c) => c.id === id)
  })

  function startReview(d: Deck) {
    setQueue(dueCards(d).map((c) => c.id))
    setFlipped(false)
    setReviewId(d.id)
  }

  function grade(g: Grade) {
    const d = deck()
    const c = current()
    if (!d || !c || !flipped()) return
    const graded = gradeCard(c, g)
    persist(
      decks().map((x) =>
        x.id === d.id
          ? { ...x, cards: x.cards.map((k) => (k.id === c.id ? graded : k)) }
          : x,
      ),
    )
    // "Again" cards come back at the end of this session.
    setQueue((q) => (g === 'again' ? [...q.slice(1), c.id] : q.slice(1)))
    setFlipped(false)
  }

  function remove(d: Deck) {
    if (!window.confirm(`Delete deck "${d.name}"?`)) return
    persist(decks().filter((x) => x.id !== d.id))
    if (reviewId() === d.id) setReviewId(null)
  }

  return (
    <main class="mx-auto max-w-3xl px-4 py-8">
      <h1 class="text-foreground mb-1 text-3xl font-bold tracking-tight">
        Study
      </h1>
      <p class="text-muted-foreground mb-4 text-sm">
        Turn a chat or notes into flashcards and review them with spaced
        repetition. Decks stay in this browser.
      </p>

      <Show when={!hasKey()}>
        <p
          class="border-border bg-card mb-4 rounded-xl border p-4 text-sm"
          role="status"
        >
          Add an API key to generate flashcards.{' '}
          <Link to="/" class="text-primary underline-offset-4 hover:underline">
            Connect OpenRouter in chat
          </Link>
        </p>
      </Show>

      <Show
        when={deck()}
        keyed
        fallback={
          <>
            <section
              class="border-border bg-card mb-6 rounded-xl border p-4"
              aria-label="Generate flashcards"
            >
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class={BTN}
                  onClick={() => void useCurrentChat()}
                >
                  Use current chat
                </button>
                <select
                  aria-label="Study model"
                  class="border-input bg-background max-w-64 min-w-0 rounded-lg border px-2 py-1.5 text-sm"
                  value={pick()}
                  onChange={(e) => setPick(e.currentTarget.value)}
                >
                  <option value="">Choose model…</option>
                  <For each={options()}>
                    {(m) => (
                      <option
                        value={encode(m.providerId ?? 'openrouter', m.id)}
                      >
                        {getProvider(m.providerId).name}: {m.name}
                      </option>
                    )}
                  </For>
                </select>
              </div>
              <textarea
                aria-label="Study source text"
                class="border-border bg-background text-foreground mb-2 min-h-32 w-full rounded-lg border p-3 text-sm"
                placeholder="Paste notes or text to study, or use the current chat…"
                value={source()}
                onInput={(e) => setSource(e.currentTarget.value)}
              />
              <div class="flex flex-wrap gap-2">
                <input
                  aria-label="Deck name"
                  class="border-border bg-background min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
                  placeholder="Deck name (optional)"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                />
                <button
                  type="button"
                  class={PRIMARY}
                  disabled={!canGenerate()}
                  onClick={() => void generate()}
                >
                  {generating() ? 'Generating…' : 'Generate flashcards'}
                </button>
                <Show when={generating()}>
                  <button
                    type="button"
                    class={BTN}
                    onClick={() => abort?.abort()}
                  >
                    Cancel
                  </button>
                </Show>
              </div>
              <Show when={error()}>
                <p class="text-destructive mt-2 text-sm" role="alert">
                  {error()}
                </p>
              </Show>
            </section>

            <h2 class="text-foreground mb-2 text-lg font-semibold">Decks</h2>
            <Show
              when={decks().length > 0}
              fallback={
                <p class="text-muted-foreground text-sm">
                  No decks yet. Generate your first one above.
                </p>
              }
            >
              <ul class="flex flex-col gap-2">
                <For each={decks()} keyed={false}>
                  {(d) => (
                    <li
                      class="border-border bg-card flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3"
                      data-testid="deck-row"
                    >
                      <div class="mr-auto min-w-0">
                        <div class="text-foreground truncate text-sm font-medium">
                          {d().name}
                        </div>
                        <div class="text-muted-foreground text-xs">
                          {d().cards.length} cards ·{' '}
                          <span data-testid="due-count">{dueCount(d())}</span>{' '}
                          due
                        </div>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          class={PRIMARY}
                          onClick={() => startReview(d())}
                        >
                          Review
                        </button>
                        <button
                          type="button"
                          class={BTN}
                          aria-label={`Export ${d().name} as JSON`}
                          onClick={() =>
                            download(
                              `${fileSlug(d().name)}.json`,
                              'application/json',
                              deckToJson(d()),
                            )
                          }
                        >
                          JSON
                        </button>
                        <button
                          type="button"
                          class={BTN}
                          aria-label={`Export ${d().name} as Anki TSV`}
                          onClick={() =>
                            download(
                              `${fileSlug(d().name)}.tsv`,
                              'text/tab-separated-values',
                              deckToTsv(d()),
                            )
                          }
                        >
                          TSV
                        </button>
                        <button
                          type="button"
                          class={BTN}
                          aria-label={`Delete ${d().name}`}
                          onClick={() => remove(d())}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </>
        }
      >
        {(d) => (
          <section aria-label={`Review ${d.name}`}>
            <div class="mb-3 flex items-center gap-3">
              <button
                type="button"
                class={BTN}
                onClick={() => setReviewId(null)}
              >
                Back to decks
              </button>
              <span class="text-foreground truncate text-sm font-medium">
                {d.name}
              </span>
              <span
                class="text-muted-foreground ml-auto text-xs"
                data-testid="remaining"
              >
                {queue().length} left
              </span>
            </div>
            <Show
              when={current()}
              keyed
              fallback={
                <p
                  class="border-border bg-card rounded-xl border p-6 text-center text-sm"
                  role="status"
                >
                  All caught up. Nothing else is due in this deck.
                </p>
              }
            >
              {(c) => (
                <div class="border-border bg-card rounded-xl border p-4 sm:p-6">
                  <p class="text-muted-foreground mb-1 text-xs uppercase">
                    Question
                  </p>
                  <p
                    class="text-foreground mb-4 text-lg break-words"
                    data-testid="card-q"
                  >
                    {c.q}
                  </p>
                  <Show
                    when={flipped()}
                    fallback={
                      <button
                        type="button"
                        class={PRIMARY}
                        onClick={() => setFlipped(true)}
                      >
                        Show answer
                      </button>
                    }
                  >
                    <p class="text-muted-foreground mb-1 text-xs uppercase">
                      Answer
                    </p>
                    <p
                      class="text-foreground mb-4 text-lg break-words"
                      data-testid="card-a"
                    >
                      {c.a}
                    </p>
                    <div class="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        class={BTN}
                        onClick={() => grade('again')}
                      >
                        Again <kbd class="text-muted-foreground text-xs">1</kbd>
                      </button>
                      <button
                        type="button"
                        class={BTN}
                        onClick={() => grade('good')}
                      >
                        Good <kbd class="text-muted-foreground text-xs">2</kbd>
                      </button>
                      <button
                        type="button"
                        class={BTN}
                        onClick={() => grade('easy')}
                      >
                        Easy <kbd class="text-muted-foreground text-xs">3</kbd>
                      </button>
                    </div>
                  </Show>
                  <p class="text-muted-foreground mt-4 text-xs">
                    Space flips the card. 1, 2, 3 grade it.
                  </p>
                </div>
              )}
            </Show>
          </section>
        )}
      </Show>
    </main>
  )
}
