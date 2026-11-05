import { createFileRoute, Link } from '@tanstack/solid-router'
import { For, Show, createSignal, onSettled } from 'solid-js'

import { ChartView } from '../components/chat/ChatVisuals'
import { computeInsights } from '../lib/insights'
import type { Insights } from '../lib/insights'
import { loadChatStateAsync } from '../lib/chat-persistence'
import { formatCost } from '../lib/usage-cost'

export const Route = createFileRoute('/insights')({
  component: InsightsPage,
})

function Stat(props: { label: string; value: string }) {
  return (
    <div class="border-border bg-card text-card-foreground rounded-xl border p-4">
      <div class="text-muted-foreground text-xs">{props.label}</div>
      <div class="text-foreground mt-1 text-2xl font-semibold">
        {props.value}
      </div>
    </div>
  )
}

function InsightsPage() {
  const [data, setData] = createSignal<Insights | null>(null)
  const [loaded, setLoaded] = createSignal(false)
  onSettled(() => {
    void loadChatStateAsync().then((state) => {
      setData(state ? computeInsights(state) : null)
      setLoaded(true)
    })
  })
  const nf = new Intl.NumberFormat()

  return (
    <main class="mx-auto max-w-3xl px-4 py-8">
      <h1 class="text-foreground mb-4 text-3xl font-bold tracking-tight">
        Insights
      </h1>
      <Show when={loaded()}>
        <Show
          when={data() && data()!.messages > 0 ? data() : null}
          fallback={
            <p class="text-muted-foreground">
              No conversations yet.{' '}
              <Link
                to="/"
                class="text-primary underline-offset-4 hover:underline"
              >
                Start a chat
              </Link>{' '}
              to see stats here. Everything is computed locally.
            </p>
          }
        >
          {(d) => (
            <div class="space-y-6">
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Chats" value={nf.format(d().chats)} />
                <Stat label="Messages" value={nf.format(d().messages)} />
                <Stat label="Tokens" value={nf.format(d().tokens)} />
                <Stat
                  label="Cost"
                  value={d().cost > 0 ? formatCost(d().cost) : '$0.00 (free)'}
                />
                <Stat label="Active days" value={nf.format(d().activeDays)} />
                <Stat label="Current streak" value={`${d().currentStreak} d`} />
                <Stat label="Longest streak" value={`${d().longestStreak} d`} />
              </div>
              <ChartView
                spec={{
                  type: 'bar',
                  title: 'Messages per day (last 30 days)',
                  labels: d().perDay.map((p) => p.day.slice(5)),
                  datasets: [
                    { label: 'Messages', data: d().perDay.map((p) => p.count) },
                  ],
                }}
              />
              <Show when={d().topByTokens.length > 0}>
                <ChartView
                  spec={{
                    type: 'horizontal_bar',
                    title: 'Tokens per chat (top 8)',
                    labels: d().topByTokens.map((r) => r.title.slice(0, 28)),
                    datasets: [
                      {
                        label: 'Tokens',
                        data: d().topByTokens.map((r) => r.tokens),
                      },
                    ],
                  }}
                />
              </Show>
              <section class="border-border bg-card text-card-foreground rounded-xl border p-4">
                <h2 class="mb-2 text-sm font-medium">Longest chats</h2>
                <ol class="space-y-1 text-sm">
                  <For each={d().longest}>
                    {(r) => (
                      <li class="flex justify-between gap-3">
                        <span class="truncate">{r.title}</span>
                        <span class="text-muted-foreground shrink-0">
                          {r.messages} messages
                        </span>
                      </li>
                    )}
                  </For>
                </ol>
              </section>
            </div>
          )}
        </Show>
      </Show>
    </main>
  )
}
