# Solid Free Chat

A [TanStack Start](https://tanstack.com/start) + SolidJS browser-based AI harness for [OpenRouter](https://openrouter.ai/) and other free-tier providers (Groq, Cerebras, Mistral, Hugging Face — see `src/lib/providers.ts`). The agent loop, tools, and conversations all live in the browser, which talks to the provider directly. Bring your own key: sign in with OpenRouter or paste a key — either way it **never reaches this app's server** (see [Key privacy](#key-privacy)).

## Tech stack

- **TanStack Start** + **Vite** 8 + **TanStack Router** (file-based routes), deployed to Cloudflare Workers
- **SolidJS** + **TypeScript**
- **Tailwind CSS** v4
- **TanStack AI** (`@tanstack/ai`, `@tanstack/ai-client`, `@tanstack/ai-openrouter`, `@tanstack/ai-openai`) for streaming
- **TanStack Query** for data loading on the client
- **TanStack Markdown** + **TanStack Highlight** for message markdown and syntax-highlighted code blocks
- **Sentry** — browser SDK (optional `VITE_SENTRY_DSN`)

## Prerequisites

- Node.js 22.12+
- npm
- An API key for a supported provider, e.g. OpenRouter ([create one](https://openrouter.ai/keys))

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the example env file:

```bash
cp .env.example .env.local
```

3. (Optional) Sentry error collection:

```env
VITE_SENTRY_DSN=https://…@….ingest.sentry.io/…
```

## Run locally

```bash
npm run dev
```

The app serves at `http://localhost:3000`.

## Scripts

| Command             | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Vite dev server (port 3000)                           |
| `npm run build`     | Production build                                      |
| `npm run start`     | Run the built server via Wrangler                     |
| `npm run deploy`    | Build and deploy to Cloudflare Workers                |
| `npm run preview`   | Preview the production build                          |
| `npm run test`      | Unit tests (Vitest)                                   |
| `npm run typecheck` | Type-check with `tsc --noEmit`                        |
| `npm run verify`    | Typecheck, tests, and production build (what CI runs) |
| `npm run lint`      | ESLint                                                |
| `npm run format`    | Check formatting with Prettier                        |
| `npm run check`     | Write formatting + ESLint auto-fixes                  |

## Features

- Streaming replies called straight from the browser with your own key (OpenRouter OAuth sign-in or pasted keys)
- **Browser tools** the model can call, toggled from the toolbar's **Tools** menu (only offered to models that support tool calling)
- Free-model discovery for your key, with a model picker and safe fallbacks for stale selections
- Reusable **skills** (named instruction snippets) you can attach per chat; composed with a baseline system message on each reply
- Local persistence for chats and skills
- Markdown in messages with syntax highlighting
- Light / dark / system theme, stored in the browser
- **`/dev`** — a coding agent that builds a small front-end project in the browser (esbuild-wasm bundle, sandboxed live preview, shareable link)
- **`/review`** — an AI writing reviewer that suggests inline edits you can accept
- **`/share`** — read-only view of a chat shared via link
- Optional Sentry browser init

## Architecture

```
Browser                                             Worker
┌────────────────────────────────────────────┐      ┌──────────────────────┐
│ ChatClient ─▶ runAgent → chat() agent loop │──────────────────────▶ provider API (e.g. openrouter.ai)
│                  │                         │      │ SSR + static assets  │
│                  ▼                         │      │ (never sees the key) │
│            tools execute locally           │      └──────────────────────┘
│      (sandboxed iframe → Web Worker)       │
└────────────────────────────────────────────┘
```

Everything — model selection, system prompts, tool calls, persistence, and every provider request — is client-side. The Worker only serves SSR/static assets, `/api/free-models` (a cached free-model catalog from models.dev), and the sandbox page `/harness-sandbox`.

## Key privacy

The app is bring-your-own-key, and the server is never in the key's path:

- **Direct calls.** The browser calls the provider's API (e.g. `https://openrouter.ai/api/v1`) itself (CORS). There is no proxy and no server-side key fallback. You can verify in DevTools → Network: requests with an `Authorization` header go only to the selected provider's origin.
- **Sign in with OpenRouter (OAuth PKCE).** `src/lib/openrouter-oauth.ts` redirects to `openrouter.ai/auth`, and the returned one-time code is exchanged for a key by the browser using a verifier that never leaves the tab. The key is scoped to this app in your OpenRouter account, so you can cap its spend or revoke it there. Pasting a key still works.
- **Storage.** By default the key lives in `sessionStorage` (this tab only). "Remember on this device" moves it to `localStorage`.
- **Content-Security-Policy.** `src/lib/content-security-policy.ts` limits `connect-src` to this origin, the configured provider origins, and the Sentry ingest host, so injected script can't quietly `fetch` the key elsewhere. The code sandbox is served from its own page (`/harness-sandbox`) in an opaque-origin iframe so it keeps open network access without being able to read the key.
- **Sentry.** `src/router.tsx` strips request headers and redacts `sk-or-…` keys, bearer tokens, and OAuth `code` params from events, breadcrumbs, and transactions.

Limits: whatever JavaScript this site serves can read the key while you use it — that's inherent to any in-browser BYOK app. The code is open source so you can audit it, and an OAuth key with a spending limit keeps the damage small if anything goes wrong.

## Tools

| Tool                                                                | Default | What it does                                                                                         |
| ------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `list_skills`, `create_skill`, `update_skill`, `set_skill_attached` | on      | Lets the model manage your skill library and this chat's attached skills (takes effect next message) |
| `get_current_datetime`                                              | on      | Local date, time, timezone, locale                                                                   |
| `run_javascript`                                                    | on      | Runs JS in an isolated Web Worker (bare expressions or async function bodies; 15s timeout)           |
| `render_diagram`                                                    | on      | Draws Mermaid diagrams in the chat                                                                   |
| `render_chart`                                                      | on      | Draws charts in the chat                                                                             |
| `search_chats`, `read_chat`                                         | on      | Searches and reads your saved conversations                                                          |

Code tools run inside a `sandbox="allow-scripts"` iframe (opaque origin), so they cannot read the app's localStorage, API key, or DOM. To add a tool, define it with `toolDefinition(...)` in `src/lib/harness/tools.ts` and append a descriptor to `HARNESS_TOOLS`; because `chat()` runs in the browser, `.server(execute)` tools execute locally.

## Project layout

- `src/components/chat` — Chat UI (`ChatApp`, `ChatThread`, skills / API key modals)
- `src/routes/api.free-models.ts` — Server route serving the cached free-model catalog; `src/routes/harness-sandbox.ts` serves the sandbox page
- `src/lib/harness/run-agent.ts` — Browser agent loop (`chat()` from TanStack AI) pointed at the selected provider
- `src/lib/harness/tools.ts` — Tool registry; add new browser tools here
- `src/lib/harness/sandbox.ts` — Isolated code sandbox (opaque-origin iframe + Web Worker)
- `src/lib/providers.ts` — Supported providers and their API base URLs
- `src/lib/openrouter-models.ts` — Model list filtering and caching
- `src/lib/compose-system-prompt.ts` — Baseline + skills composition
- `src/lib/chat-persistence.ts` — Browser storage for conversations
- `src/store` — Chat state (`chat.store`, `chat.hooks`)
- `src/routes` — Routes (`/`, `/about`, `/dev`, `/review`, `/share`, …)
- `src/integrations/tanstack-query` — TanStack Query provider and SSR wiring

## Notes

- Without a valid key (entered in the app), model loading and chat show clear errors. `.env.local` only configures the optional Sentry DSN.
- The free-model filter is a UI default, not a server-side gate: requests go straight to the provider, so anything your key allows can be sent.
- Conversation data stays in the browser; the server never receives it.
- There is no Anthropic sidecar or separate model host — only the providers listed in `src/lib/providers.ts`.
- The API key in localStorage is a XSS risk by design (BYOK); keep the app origin trusted.
