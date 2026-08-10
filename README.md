# Solid Free Chat

A [SolidStart](https://start.solidjs.com/) app that streams chat from [OpenRouter](https://openrouter.ai/) models. You enter your API key in the app; it is sent to server functions for OpenRouter calls and is not stored on the server. Conversations stay in the browser.

## Tech stack

- **SolidStart** + **Vite** 8 + **TanStack Router** (file-based routes)
- **SolidJS** + **TypeScript**
- **Tailwind CSS** v4
- **TanStack AI** (`@tanstack/ai`, `@tanstack/ai-openrouter`, `@tanstack/ai-solid`) for streaming
- **TanStack Query** for data loading on the client
- **TanStack Markdown** + **TanStack Highlight** for message markdown and syntax-highlighted code blocks
- **Sentry** — browser SDK (optional `VITE_SENTRY_DSN`) plus `startSpan` from `@sentry/core` around OpenRouter server work

## Prerequisites

- Node.js 20+
- npm
- An OpenRouter API key ([create one](https://openrouter.ai/keys))

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example env file:

```bash
cp .env.example .env.local
```

3. (Optional, local dev) If you prefer not to paste a key in the UI, set it in `.env.local` (value only — no `Bearer ` prefix, no quotes):

```env
OPENROUTER_API_KEY=your_openrouter_api_key
```

Optional [OpenRouter attribution](https://openrouter.ai/docs) headers:

```env
OPENROUTER_HTTP_REFERER=https://your-app.com
OPENROUTER_APP_TITLE=Solid Free Chat
```

Optional Sentry error collection:

```env
VITE_SENTRY_DSN=https://…@….ingest.sentry.io/…
```

## Run locally

```bash
npm run dev
```

The app serves at `http://localhost:3000`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server (port 3000) |
| `npm run build` | Production build |
| `npm run start` | Run the built server via Wrangler |
| `npm run preview` | Preview the production build |
| `npm run test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run format` | Check formatting with Prettier |
| `npm run check` | Write formatting + ESLint auto-fixes |

## Features

- Streaming replies via OpenRouter; you supply the API key in the app (sent through server functions to OpenRouter)
- Free-model discovery for your key, with a model picker and safe fallbacks for stale selections
- Reusable **skills** (named instruction snippets) you can attach per chat; composed with a baseline system message on each reply
- Local persistence for chats and skills
- Markdown in messages with syntax highlighting
- Light / dark / system theme, stored in the browser
- Optional Sentry browser init + server spans on OpenRouter calls

## Project layout

- `src/components/chat` — Chat UI (`ChatApp`, `ChatThread`, skills / API key modals)
- `src/server/openrouter-fns.ts` — Server functions: models + chat streaming
- `src/lib/openrouter-api-key.server.ts` — API key resolution for the server
- `src/lib/openrouter-user-models.server.ts` — Model list filtering and caching
- `src/lib/compose-system-prompt.ts` — Baseline + skills composition
- `src/lib/chat-persistence.ts` — Browser storage for conversations
- `src/store` — Chat state (`chat.store`, `chat.hooks`)
- `src/routes` — Routes (`/`, `/about`, …)
- `src/integrations/tanstack-query` — TanStack Query provider and SSR wiring

## Notes

- Without a valid key (from the app or optional `.env.local` for local dev), model loading and chat show clear errors.
- Conversation data stays in the browser; it is not sent to a first-party backend beyond OpenRouter.
- There is no Anthropic sidecar or separate model host — only OpenRouter.
- The API key in localStorage is a XSS risk by design (BYOK); keep the app origin trusted.
