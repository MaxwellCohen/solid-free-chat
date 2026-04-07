import { createFileRoute, Link } from '@tanstack/solid-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main class="page-wrap px-4 py-12">
      <section class="island-shell rounded-2xl p-6 sm:p-8">
        <h1 class="display-title mb-3 text-3xl font-bold text-sea-ink">
          About
        </h1>
        <p class="text-sea-ink-soft mb-4">
          Local AI chat powered by TanStack AI, Solid, and OpenRouter.
        </p>
        <Link to="/" class="nav-link">
          Back to chat
        </Link>
      </section>
    </main>
  )
}
