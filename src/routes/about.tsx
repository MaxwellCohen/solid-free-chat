import { createFileRoute, Link } from '@tanstack/solid-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main class="mx-auto max-w-2xl px-4 py-12">
      <section class="border-border bg-card text-card-foreground rounded-2xl border p-6 shadow-sm sm:p-8">
        <h1 class="text-foreground mb-3 text-3xl font-bold tracking-tight">
          About
        </h1>
        <p class="text-muted-foreground mb-4">
          Local AI chat powered by TanStack AI, Solid, and OpenRouter. Attach
          reusable skills to shape system instructions per chat.
        </p>
        <Link
          to="/"
          class="text-primary font-medium underline-offset-4 hover:underline"
        >
          Back to chat
        </Link>
      </section>
    </main>
  )
}
