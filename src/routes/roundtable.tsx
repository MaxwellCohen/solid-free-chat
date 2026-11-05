import { Link, createFileRoute, useNavigate } from '@tanstack/solid-router'
import { For, Show, createSignal, onSettled } from 'solid-js'
import type { UIMessage } from '@tanstack/ai-client'

import { MessageParts } from '../components/chat/ChatMessageParts'
import { chatActions } from '../store/chat.store'
import type { ChatUIMessage } from '../store/chat.store'
import type { ChatModelOption } from '../lib/chat-models'
import {
  loadChatStateAsync,
  persistChatStateAsync,
} from '../lib/chat-persistence'
import { runAgent } from '../lib/harness/run-agent'
import { loadAllModelOptions } from '../lib/model-options'
import { loadStoredApiKey } from '../lib/openrouter-key-storage'
import { BUILT_IN_PERSONAS, loadCustomPersonas } from '../lib/personas'
import type { Persona } from '../lib/personas'
import { getProvider } from '../lib/providers'
import {
  MODERATOR,
  ROUNDTABLE_DEFAULT_ROUNDS,
  ROUNDTABLE_MAX_PERSONAS,
  ROUNDTABLE_MAX_ROUNDS,
  ROUNDTABLE_MIN_PERSONAS,
  addModeratorTurn,
  clampRounds,
  roundQueue,
  runTurns,
  speakerName,
  transcriptToChat,
} from '../lib/roundtable'
import type { RoundtableRunner, RoundtableTurn } from '../lib/roundtable'

export const Route = createFileRoute('/roundtable')({
  component: Roundtable,
})

const encode = (providerId: string, modelId: string) =>
  `${providerId}\n${modelId}`

function makeRunner(providerId: string, modelId: string): RoundtableRunner {
  return async function* (req, signal) {
    const apiKey = loadStoredApiKey(providerId).key.trim()
    for await (const chunk of runAgent({
      apiKey,
      providerId,
      model: modelId,
      systemPrompt: req.system,
      messages: [{ role: 'user', content: req.prompt }],
      abortSignal: signal,
    })) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') yield chunk.delta
      else if (chunk.type === 'RUN_ERROR') throw new Error(chunk.message)
    }
  }
}

function Roundtable() {
  const [options, setOptions] = createSignal<ChatModelOption[]>([])
  const [model, setModel] = createSignal('')
  const [custom, setCustom] = createSignal<Persona[]>([])
  const [picked, setPicked] = createSignal<string[]>([])
  const [topic, setTopic] = createSignal('')
  const [rounds, setRounds] = createSignal(ROUNDTABLE_DEFAULT_ROUNDS)
  const [started, setStarted] = createSignal<{
    topic: string
    personas: Persona[]
    providerId: string
    modelId: string
  } | null>(null)
  const [transcript, setTranscript] = createSignal<RoundtableTurn[]>([])
  const [remaining, setRemaining] = createSignal<number[]>([])
  const [pendingMod, setPendingMod] = createSignal<RoundtableTurn[]>([])
  const [interject, setInterject] = createSignal('')
  const [running, setRunning] = createSignal(false)
  const [hasKey, setHasKey] = createSignal(true)
  const [ready, setReady] = createSignal(false)
  const navigate = useNavigate()
  let abort: AbortController | undefined
  let seq = 0

  onSettled(() => {
    setCustom(loadCustomPersonas())
    setReady(true)
    setHasKey(!!loadStoredApiKey('openrouter').key.trim())
    void loadAllModelOptions().then((r) => {
      setOptions(r.options)
      setHasKey(
        !!loadStoredApiKey('openrouter').key.trim() ||
          r.options.some(
            (o) => !!loadStoredApiKey(o.providerId ?? 'openrouter').key.trim(),
          ) ||
          r.options.length > 0,
      )
      setModel((m) =>
        m || !r.options[0]
          ? m
          : encode(r.options[0].providerId ?? 'openrouter', r.options[0].id),
      )
    })
  })

  const allPersonas = () => [...BUILT_IN_PERSONAS, ...custom()]
  const chosen = () =>
    picked()
      .map((id) => allPersonas().find((p) => p.id === id))
      .filter((p): p is Persona => !!p)
  const decoded = () => {
    const raw = model()
    const i = raw.indexOf('\n')
    return i < 0
      ? null
      : { providerId: raw.slice(0, i), modelId: raw.slice(i + 1) }
  }
  const canStart = () =>
    !running() &&
    topic().trim() &&
    decoded() &&
    chosen().length >= ROUNDTABLE_MIN_PERSONAS

  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id)
        ? p.filter((x) => x !== id)
        : p.length >= ROUNDTABLE_MAX_PERSONAS
          ? p
          : [...p, id],
    )

  const shown = () => [...transcript(), ...pendingMod()]
  const personasOf = () => started()?.personas ?? []

  const run = async (
    s: NonNullable<ReturnType<typeof started>>,
    base: RoundtableTurn[],
    queue: number[],
  ) => {
    if (queue.length === 0) return
    abort?.abort()
    const ac = new AbortController()
    abort = ac
    setRunning(true)
    setRemaining(queue)
    try {
      const res = await runTurns({
        topic: s.topic,
        personas: s.personas,
        transcript: base,
        queue,
        runner: makeRunner(s.providerId, s.modelId),
        signal: ac.signal,
        onUpdate: setTranscript,
        inject: () => {
          const out = pendingMod()
          setPendingMod([])
          return out
        },
      })
      setRemaining(res.remaining)
    } finally {
      setRunning(false)
    }
  }

  const start = () => {
    const d = decoded()
    if (!canStart() || !d) return
    const personas = chosen()
    const s = { topic: topic().trim(), personas, ...d }
    setStarted(s)
    setTranscript([])
    setPendingMod([])
    void run(s, [], roundQueue(personas.length, rounds()))
  }

  const anotherRound = () => {
    const s = started()
    if (!s || running()) return
    const base = transcript().filter((t) => t.status !== 'error')
    setTranscript(base)
    void run(s, base, roundQueue(s.personas.length, 1))
  }

  const retry = () => {
    const s = started()
    if (!s || running()) return
    const base = transcript().filter((t) => t.status !== 'error')
    setTranscript(base)
    void run(s, base, remaining())
  }

  const send = () => {
    const text = interject().trim()
    if (!text || !started()) return
    const id = `rt-mod-${Date.now()}-${seq++}`
    if (running()) {
      setPendingMod((m) => addModeratorTurn(m, text, id))
    } else {
      setTranscript((t) => addModeratorTurn(t, text, id))
    }
    setInterject('')
  }

  const failed = () => transcript().find((t) => t.status === 'error')

  const saveAsChat = async () => {
    const s = started()
    if (!s || running()) return
    const saved = await loadChatStateAsync()
    if (saved) chatActions.hydrate(saved)
    const id = chatActions.createConversation()
    const now = new Date()
    const msgs: ChatUIMessage[] = transcriptToChat(
      s.topic,
      s.personas,
      transcript(),
    ).map((m, n) => ({
      id: `roundtable-${Date.now()}-${n}`,
      role: m.role,
      parts: [{ type: 'text', content: m.content }],
      createdAt: now,
    }))
    chatActions.setConversationMessages(id, msgs)
    chatActions.renameConversation(id, `Roundtable: ${s.topic}`.slice(0, 52))
    await persistChatStateAsync()
    void navigate({ to: '/' })
  }

  const asMessage = (t: RoundtableTurn): UIMessage => ({
    id: t.id,
    role: 'assistant',
    parts: [{ type: 'text', content: t.text }],
  })

  return (
    <main class="mx-auto max-w-3xl px-4 py-8">
      <h1 class="text-foreground mb-1 text-3xl font-bold tracking-tight">
        Roundtable
      </h1>
      <p class="text-muted-foreground mb-4 text-sm">
        Pick 2-4 personas and a topic. They take turns, one request at a time.
        Plain text, no tools.
      </p>

      <Show when={!hasKey()}>
        <p
          class="border-border bg-card mb-4 rounded-xl border p-4 text-sm"
          role="status"
        >
          Add an API key to start a roundtable.{' '}
          <Link to="/" class="text-primary underline-offset-4 hover:underline">
            Connect OpenRouter in chat
          </Link>
        </p>
      </Show>

      <section class="mb-6 space-y-3" aria-label="Roundtable setup">
        <textarea
          aria-label="Roundtable topic"
          class="border-border bg-card text-foreground min-h-20 w-full rounded-xl border p-3 text-sm"
          placeholder="A topic or question for the table…"
          value={topic()}
          disabled={running()}
          onInput={(e) => setTopic(e.currentTarget.value)}
        />
        <fieldset class="mx-0 mb-0 min-w-0 border-0 p-0">
          <legend class="text-muted-foreground mb-1 text-xs">
            Personas ({picked().length}/{ROUNDTABLE_MAX_PERSONAS})
          </legend>
          <div class="flex flex-wrap gap-2">
            <For each={ready() ? allPersonas() : []}>
              {(p) => (
                <button
                  type="button"
                  aria-pressed={picked().includes(p.id) ? 'true' : 'false'}
                  title={p.tagline}
                  disabled={
                    running() ||
                    (!picked().includes(p.id) &&
                      picked().length >= ROUNDTABLE_MAX_PERSONAS)
                  }
                  class="border-border text-foreground hover:bg-muted aria-pressed:border-primary aria-pressed:bg-muted rounded-full border px-3 py-1 text-sm disabled:opacity-50"
                  onClick={() => toggle(p.id)}
                >
                  {p.emoji} {p.name}
                </button>
              )}
            </For>
          </div>
        </fieldset>
        <div class="flex flex-wrap items-center gap-2">
          <select
            aria-label="Roundtable model"
            class="border-input bg-background max-w-full min-w-0 rounded-lg border px-2 py-1.5 text-sm"
            value={model()}
            disabled={running()}
            onChange={(e) => setModel(e.currentTarget.value)}
          >
            <option value="">Choose model…</option>
            <For each={options()}>
              {(m) => (
                <option value={encode(m.providerId ?? 'openrouter', m.id)}>
                  {getProvider(m.providerId).name}: {m.name}
                </option>
              )}
            </For>
          </select>
          <label class="text-muted-foreground flex items-center gap-1.5 text-sm">
            Rounds
            <input
              type="number"
              aria-label="Rounds"
              min="1"
              max={ROUNDTABLE_MAX_ROUNDS}
              class="border-input bg-background w-16 rounded-lg border px-2 py-1.5 text-sm"
              value={rounds()}
              disabled={running()}
              onChange={(e) =>
                setRounds(clampRounds(Number(e.currentTarget.value)))
              }
            />
          </label>
          <button
            type="button"
            class="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={!canStart() || !hasKey()}
            onClick={start}
          >
            {started() ? 'Restart' : 'Start'}
          </button>
          <button
            type="button"
            class="border-border text-foreground rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={!running()}
            onClick={() => abort?.abort()}
          >
            Stop
          </button>
        </div>
      </section>

      <Show when={started()}>
        <section
          class="space-y-3"
          role="log"
          aria-label="Roundtable transcript"
          aria-live="polite"
        >
          <p class="text-muted-foreground text-sm">
            <span class="font-medium">Topic:</span> {started()!.topic}
          </p>
          <For each={shown()} keyed={false}>
            {(t) => {
              const persona = () =>
                personasOf().find((p) => p.id === t().speaker)
              return (
                <article
                  class="border-border bg-card flex min-w-0 gap-3 rounded-xl border p-3"
                  data-testid="roundtable-turn"
                  data-speaker={t().speaker}
                  data-status={t().status}
                >
                  <span
                    class="bg-muted flex size-9 shrink-0 items-center justify-center rounded-full text-lg"
                    aria-hidden="true"
                  >
                    {t().speaker === MODERATOR ? '🎙️' : persona()?.emoji}
                  </span>
                  <div class="min-w-0 flex-1 text-sm">
                    <div class="text-foreground mb-1 flex items-center gap-2 font-medium">
                      {speakerName(t().speaker, personasOf())}
                      <Show when={t().status === 'running'}>
                        <span class="text-muted-foreground text-xs font-normal">
                          Streaming…
                        </span>
                      </Show>
                      <Show when={t().status === 'stopped'}>
                        <span class="text-muted-foreground text-xs font-normal">
                          Stopped
                        </span>
                      </Show>
                    </div>
                    <Show when={t().text}>
                      <Show
                        when={t().speaker !== MODERATOR}
                        fallback={<p class="m-0 break-words">{t().text}</p>}
                      >
                        <MessageParts message={asMessage(t())} />
                      </Show>
                    </Show>
                    <Show when={t().error}>
                      <p class="text-destructive mt-1" role="alert">
                        {t().error}
                      </p>
                      <Show when={!running()}>
                        <button
                          type="button"
                          class="text-primary mt-1 text-sm underline-offset-4 hover:underline"
                          onClick={retry}
                        >
                          Retry
                        </button>
                      </Show>
                    </Show>
                  </div>
                </article>
              )
            }}
          </For>
        </section>

        <div class="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="Moderator message"
            class="border-border bg-card text-foreground min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
            placeholder="Interject as Moderator…"
            value={interject()}
            onInput={(e) => setInterject(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
            }}
          />
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="border-border text-foreground rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              disabled={!interject().trim()}
              onClick={send}
            >
              Interject
            </button>
            <button
              type="button"
              class="border-border text-foreground rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              disabled={running() || !!failed() || transcript().length === 0}
              onClick={anotherRound}
            >
              Another round
            </button>
            <button
              type="button"
              class="border-border text-foreground rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              disabled={running() || transcript().length === 0}
              onClick={() => void saveAsChat()}
            >
              Save as chat
            </button>
          </div>
        </div>
      </Show>
    </main>
  )
}
