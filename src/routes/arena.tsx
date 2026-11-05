import { Link, createFileRoute, useNavigate } from '@tanstack/solid-router'
import { For, Show, createMemo, createSignal, onSettled } from 'solid-js'
import type { UIMessage } from '@tanstack/ai-client'

import { MessageParts } from '../components/chat/ChatMessageParts'
import { chatActions } from '../store/chat.store'
import type { ChatUIMessage } from '../store/chat.store'
import {
  ARENA_MAX_MODELS,
  isFinished,
  newColumn,
  normalizeTargets,
  runArena,
} from '../lib/arena'
import type {
  ArenaChunk,
  ArenaColumn,
  ArenaRunner,
  ArenaTarget,
} from '../lib/arena'
import { leaderboard, loadArenaWins, recordArenaWin } from '../lib/arena-stats'
import type { ArenaWins } from '../lib/arena-stats'
import type { ChatModelOption } from '../lib/chat-models'
import {
  persistChatStateAsync,
  loadChatStateAsync,
} from '../lib/chat-persistence'
import { runAgent } from '../lib/harness/run-agent-lazy'
import { loadAllModelOptions } from '../lib/model-options'
import { loadStoredApiKey } from '../lib/openrouter-key-storage'
import { getProvider } from '../lib/providers'

export const Route = createFileRoute('/arena')({
  component: Arena,
})

const STATUS_LABEL: Record<ArenaColumn['status'], string> = {
  idle: 'Ready',
  running: 'Streaming…',
  done: 'Done',
  error: 'Failed',
  'rate-limited': 'Rate limited',
  stopped: 'Stopped',
}

const runner: ArenaRunner = async function* (
  target,
  prompt,
  signal,
): AsyncGenerator<ArenaChunk> {
  const apiKey = loadStoredApiKey(target.providerId).key.trim()
  for await (const chunk of runAgent({
    apiKey,
    providerId: target.providerId,
    model: target.modelId,
    messages: [{ role: 'user', content: prompt }],
    abortSignal: signal,
  })) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      yield { type: 'text', delta: chunk.delta }
    } else if (chunk.type === 'RUN_ERROR') {
      throw new Error(chunk.message)
    } else if (chunk.type === 'RUN_FINISHED' && chunk.usage) {
      yield {
        type: 'usage',
        promptTokens: chunk.usage.promptTokens,
        completionTokens: chunk.usage.completionTokens,
        totalTokens: chunk.usage.totalTokens,
      }
    }
  }
}

function Arena() {
  const [options, setOptions] = createSignal<ChatModelOption[]>([])
  const [picks, setPicks] = createSignal<string[]>(['', '', ''])
  const [prompt, setPrompt] = createSignal('')
  const [ranPrompt, setRanPrompt] = createSignal('')
  const [columns, setColumns] = createSignal<ArenaColumn[]>([])
  const [running, setRunning] = createSignal(false)
  const [hasKey, setHasKey] = createSignal(true)
  const [wins, setWins] = createSignal<ArenaWins>({})
  const [voted, setVoted] = createSignal(false)
  const navigate = useNavigate()
  let abort: AbortController | undefined

  const encode = (providerId: string, modelId: string) =>
    `${providerId}\n${modelId}`
  const decode = (raw: string): ArenaTarget | null => {
    const i = raw.indexOf('\n')
    return i < 0
      ? null
      : { providerId: raw.slice(0, i), modelId: raw.slice(i + 1) }
  }

  onSettled(() => {
    setHasKey(
      !!loadStoredApiKey('openrouter').key.trim() || options().length > 0,
    )
    setWins(loadArenaWins())
    void loadAllModelOptions().then((r) => {
      setOptions(r.options)
      const keyed = r.options.some(
        (o) => !!loadStoredApiKey(o.providerId ?? 'openrouter').key.trim(),
      )
      setHasKey(
        keyed ||
          !!loadStoredApiKey('openrouter').key.trim() ||
          r.options.length > 0,
      )
      setPicks((p) =>
        p.map((v, i) =>
          v || i >= 2
            ? v
            : r.options[i]
              ? encode(r.options[i].providerId ?? 'openrouter', r.options[i].id)
              : '',
        ),
      )
    })
  })

  const targets = createMemo(() =>
    normalizeTargets(
      picks()
        .map(decode)
        .filter((t): t is ArenaTarget => t !== null),
    ),
  )
  const canRun = () => !running() && prompt().trim() && targets().length >= 2
  const nameOf = (t: ArenaTarget) =>
    options().find(
      (o) =>
        o.id === t.modelId && (o.providerId ?? 'openrouter') === t.providerId,
    )?.name ?? t.modelId

  const hasAnyKey = () =>
    !!loadStoredApiKey('openrouter').key.trim() ||
    targets().some((t) => !!loadStoredApiKey(t.providerId).key.trim())

  const start = async () => {
    if (!canRun()) return
    const ts = targets()
    abort?.abort()
    abort = new AbortController()
    setRanPrompt(prompt().trim())
    setVoted(false)
    setRunning(true)
    setColumns(ts.map(newColumn))
    try {
      await runArena({
        prompt: prompt().trim(),
        targets: ts,
        runner,
        signal: abort.signal,
        onUpdate: (i, col) =>
          setColumns((cs) => cs.map((c, j) => (j === i ? col : c))),
      })
    } finally {
      setRunning(false)
    }
  }

  const retryColumn = async (index: number) => {
    const col = columns()[index]
    if (running()) return
    const ac = new AbortController()
    abort = ac
    setRunning(true)
    try {
      await runArena({
        prompt: ranPrompt(),
        targets: [col.target],
        runner,
        signal: ac.signal,
        onUpdate: (_i, c) =>
          setColumns((cs) => cs.map((x, j) => (j === index ? c : x))),
      })
    } finally {
      setRunning(false)
    }
  }

  const vote = (col: ArenaColumn) => {
    setWins(recordArenaWin(col.target.modelId))
    setVoted(true)
  }

  const continueInChat = async (col: ArenaColumn) => {
    const saved = await loadChatStateAsync()
    if (saved) chatActions.hydrate(saved)
    const id = chatActions.createConversation()
    const now = new Date()
    const msg = (
      role: UIMessage['role'],
      content: string,
      n: number,
    ): ChatUIMessage => ({
      id: `arena-${Date.now()}-${n}`,
      role,
      parts: [{ type: 'text', content }],
      createdAt: now,
    })
    chatActions.setConversationMessages(id, [
      msg('user', ranPrompt(), 0),
      msg('assistant', col.text, 1),
    ])
    await persistChatStateAsync()
    void navigate({ to: '/' })
  }

  const asMessage = (text: string): UIMessage => ({
    id: 'arena-answer',
    role: 'assistant',
    parts: [{ type: 'text', content: text }],
  })

  const board = createMemo(() => leaderboard(wins(), 8))
  const slotCount = () => ARENA_MAX_MODELS

  return (
    <main class="mx-auto max-w-6xl px-4 py-8">
      <h1 class="text-foreground mb-1 text-3xl font-bold tracking-tight">
        Arena
      </h1>
      <p class="text-muted-foreground mb-4 text-sm">
        Send one prompt to 2-3 free models at once and compare. Plain text, no
        tools.
      </p>

      <Show when={!hasKey()}>
        <p
          class="border-border bg-card mb-4 rounded-xl border p-4 text-sm"
          role="status"
        >
          Add an API key to compare models.{' '}
          <Link to="/" class="text-primary underline-offset-4 hover:underline">
            Connect OpenRouter in chat
          </Link>
        </p>
      </Show>

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <For each={Array.from({ length: slotCount() }, (_, i) => i)}>
          {(i) => (
            <select
              aria-label={`Arena model ${i + 1}`}
              class="border-input bg-background max-w-64 min-w-0 rounded-lg border px-2 py-1.5 text-sm"
              value={picks()[i]}
              onChange={(e) => {
                const v = e.currentTarget.value
                setPicks((p) => p.map((x, j) => (j === i ? v : x)))
              }}
            >
              <option value="">
                {i < 2 ? 'Choose model…' : 'No third model'}
              </option>
              <For each={options()}>
                {(m) => (
                  <option value={encode(m.providerId ?? 'openrouter', m.id)}>
                    {getProvider(m.providerId).name}: {m.name}
                  </option>
                )}
              </For>
            </select>
          )}
        </For>
      </div>

      <div class="mb-6 flex flex-col gap-2 sm:flex-row">
        <textarea
          aria-label="Arena prompt"
          class="border-border bg-card text-foreground min-h-24 flex-1 rounded-xl border p-3 text-sm"
          placeholder="Type one prompt to send to every model…"
          value={prompt()}
          onInput={(e) => setPrompt(e.currentTarget.value)}
        />
        <div class="flex gap-2 sm:flex-col">
          <button
            type="button"
            class="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={!canRun() || !hasAnyKey()}
            onClick={() => void start()}
          >
            {running() ? 'Running…' : 'Compare'}
          </button>
          <button
            type="button"
            class="border-border text-foreground rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={!running()}
            onClick={() => abort?.abort()}
          >
            Stop all
          </button>
        </div>
      </div>

      <Show when={columns().length > 0}>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
          <For each={columns()} keyed={false}>
            {(col, index) => (
              <section
                class="border-border bg-card text-card-foreground flex min-w-0 flex-col rounded-xl border"
                aria-label={`${nameOf(col().target)} answer`}
              >
                <header class="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 text-xs">
                  <span class="text-foreground mr-auto truncate text-sm font-medium">
                    {nameOf(col().target)}
                  </span>
                  <span data-testid="arena-status">
                    {STATUS_LABEL[col().status]}
                  </span>
                  <span>{(col().elapsedMs / 1000).toFixed(1)}s</span>
                  <Show when={col().totalTokens}>
                    <span>{col().totalTokens} tokens</span>
                  </Show>
                </header>
                <div class="min-h-32 flex-1 overflow-auto p-3 text-sm">
                  <Show when={col().text}>
                    <MessageParts message={asMessage(col().text)} />
                  </Show>
                  <Show when={col().error}>
                    <p class="text-destructive mt-2" role="alert">
                      {col().error}
                    </p>
                    <Show when={isFinished(col().status) && !running()}>
                      <button
                        type="button"
                        class="text-primary mt-1 text-sm underline-offset-4 hover:underline"
                        onClick={() => void retryColumn(index)}
                      >
                        Retry
                      </button>
                    </Show>
                  </Show>
                </div>
                <footer class="border-border flex gap-2 border-t px-3 py-2">
                  <button
                    type="button"
                    class="border-border rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                    disabled={!col().text || col().status === 'running'}
                    onClick={() => void continueInChat(col())}
                  >
                    Continue in chat
                  </button>
                  <button
                    type="button"
                    class="border-border rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                    disabled={
                      !col().text || col().status === 'running' || voted()
                    }
                    onClick={() => vote(col())}
                  >
                    Vote best
                  </button>
                </footer>
              </section>
            )}
          </For>
        </div>
      </Show>

      <Show when={board().length > 0}>
        <section
          class="border-border bg-card mt-8 rounded-xl border p-4"
          aria-label="Leaderboard"
        >
          <h2 class="mb-2 text-sm font-medium">Leaderboard</h2>
          <ol class="space-y-1 text-sm">
            <For each={board()}>
              {(r) => (
                <li class="flex justify-between gap-3">
                  <span class="truncate">{r.modelId}</span>
                  <span class="text-muted-foreground shrink-0">
                    {r.wins} {r.wins === 1 ? 'win' : 'wins'}
                  </span>
                </li>
              )}
            </For>
          </ol>
        </section>
      </Show>
    </main>
  )
}
