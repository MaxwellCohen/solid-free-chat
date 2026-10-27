# Solid Free Chat

A [SolidStart](https://start.solidjs.com/) browser-based AI harness for [OpenRouter](https://openrouter.ai/) models. The agent loop, tools, and conversations all live in the browser; the backend is a dumb pass-through proxy to OpenRouter. You enter your API key in the app; the proxy forwards it and never stores it.

## Tech stack

- **SolidStart** + **Vite** 8 + **TanStack Router** (file-based routes)
- **SolidJS** + **TypeScript**
- **Tailwind CSS** v4
- **TanStack AI** (`@tanstack/ai`, `@tanstack/ai-openrouter`, `@tanstack/ai-solid`) for streaming
- **TanStack Query** for data loading on the client
- **TanStack Markdown** + **TanStack Highlight** for message markdown and syntax-highlighted code blocks
- **Sentry** — browser SDK (optional `VITE_SENTRY_DSN`)
- **Pyodide** (loaded on demand from jsDelivr) for the Python tool

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

- Streaming replies via OpenRouter; you supply the API key in the app (forwarded by the proxy)
- **Browser tools** the model can call, toggled from the toolbar's **Tools** menu (only offered to models that support tool calling)
- Free-model discovery for your key, with a model picker and safe fallbacks for stale selections
- Reusable **skills** (named instruction snippets) you can attach per chat; composed with a baseline system message on each reply
- Local persistence for chats and skills
- Markdown in messages with syntax highlighting
- Light / dark / system theme, stored in the browser
- Optional Sentry browser init

## Architecture

```
Browser                                              Worker (dumb proxy)
┌────────────────────────────────────────────┐       ┌─────────────────────┐
│ ChatClient ─▶ runAgent → chat() agent loop │──────▶│ /api/openrouter/v1/*│──▶ openrouter.ai
│                  │                         │◀──────│  (streams back)     │
│                  ▼                         │       └─────────────────────┘
│            tools execute locally           │
│  (sandboxed iframe → Web Worker / Pyodide) │
└────────────────────────────────────────────┘
```

The proxy only forwards `v1/*` paths, the `Authorization` header (falling back to `OPENROUTER_API_KEY` when absent), and the optional attribution headers. Everything else — model selection, system prompts, tool calls, persistence — is client-side.

## Tools

| Tool | Default | What it does |
| --- | --- | --- |
| `get_current_datetime` | on | Local date, time, timezone, locale |
| `run_javascript` | on | Runs JS in an isolated Web Worker (bare expressions or async function bodies; 15s timeout) |
| `run_python` | off | Python via Pyodide with numpy/pandas/etc. auto-loaded; state persists per session (~10 MB first load; 60s timeout) |

Code tools run inside a `sandbox="allow-scripts"` iframe (opaque origin), so they cannot read the app's localStorage, API key, or DOM. To add a tool, define it with `toolDefinition(...)` in `src/lib/harness/tools.ts` and append a descriptor to `HARNESS_TOOLS`; because `chat()` runs in the browser, `.server(execute)` tools execute locally.

## Project layout

- `src/components/chat` — Chat UI (`ChatApp`, `ChatThread`, skills / API key modals)
- `src/routes/api/openrouter/$.ts` — The only backend: `/api/openrouter/v1/*` → `https://openrouter.ai/api/v1/*`
- `src/lib/harness/run-agent.ts` — Browser agent loop (`chat()` from TanStack AI) pointed at the proxy
- `src/lib/harness/tools.ts` — Tool registry; add new browser tools here
- `src/lib/harness/sandbox.ts` — Isolated code sandbox (opaque-origin iframe + Web Worker)
- `src/lib/openrouter-models.ts` — Model list filtering and caching (via the proxy)
- `src/lib/compose-system-prompt.ts` — Baseline + skills composition
- `src/lib/chat-persistence.ts` — Browser storage for conversations
- `src/store` — Chat state (`chat.store`, `chat.hooks`)
- `src/routes` — Routes (`/`, `/about`, …)
- `src/integrations/tanstack-query` — TanStack Query provider and SSR wiring

## Notes

- Without a valid key (from the app or optional `.env.local` for local dev), model loading and chat show clear errors.
- The free-model filter is a UI default, not a server-side gate: with a dumb proxy, any request your key allows can be sent.
- Conversation data stays in the browser; the proxy forwards requests to OpenRouter and keeps nothing.
- There is no Anthropic sidecar or separate model host — only OpenRouter.
- The API key in localStorage is a XSS risk by design (BYOK); keep the app origin trusted.
