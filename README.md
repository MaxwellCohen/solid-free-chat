# Solid Free Chat

A [SolidStart](https://start.solidjs.com/) browser-based AI harness for [OpenRouter](https://openrouter.ai/) models. The agent loop, tools, and conversations all live in the browser, which talks to OpenRouter directly. Bring your own key: sign in with OpenRouter or paste a key — either way it **never reaches this app's server** (see [Key privacy](#key-privacy)).

## Tech stack

- **SolidStart** + **Vite** 8 + **TanStack Router** (file-based routes)
- **SolidJS** + **TypeScript**
- **Tailwind CSS** v4
- **TanStack AI** (`@tanstack/ai`, `@tanstack/ai-openrouter`, `@tanstack/ai-solid`) for streaming
- **TanStack Query** for data loading on the client
- **TanStack Markdown** + **TanStack Highlight** for message markdown and syntax-highlighted code blocks
- **Sentry** — browser SDK (optional `VITE_SENTRY_DSN`)

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

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Vite dev server (port 3000)          |
| `npm run build`   | Production build                     |
| `npm run start`   | Run the built server via Wrangler    |
| `npm run preview` | Preview the production build         |
| `npm run test`    | Unit tests (Vitest)                  |
| `npm run lint`    | ESLint                               |
| `npm run format`  | Check formatting with Prettier       |
| `npm run check`   | Write formatting + ESLint auto-fixes |

## Features

- Streaming replies via OpenRouter, called straight from the browser with your own key (OAuth sign-in or pasted)
- **Browser tools** the model can call, toggled from the toolbar's **Tools** menu (only offered to models that support tool calling)
- Free-model discovery for your key, with a model picker and safe fallbacks for stale selections
- Reusable **skills** (named instruction snippets) you can attach per chat; composed with a baseline system message on each reply
- Local persistence for chats and skills
- Markdown in messages with syntax highlighting
- Light / dark / system theme, stored in the browser
- Optional Sentry browser init
- **Chat management:** pin and rename chats, import chats from a backup, export/share
- **Voice:** dictate into the composer and read replies aloud (browser speech APIs)
- **Command palette** (Mod+K) and **slash commands** in the composer
- **Per-chat settings** (system prompt, parameters) and **starter prompts** on empty chats
- **Insights:** usage and cost stats across your chats; optional spend warning
- **Arena:** compare two models side by side on one prompt
- **Study (`/study`):** generate 5-12 flashcards from the current chat or pasted text with the selected free model, review with spaced repetition (Space flips, 1/2/3 = Again/Good/Easy), decks stored locally, export as JSON or Anki TSV
- **Accent color themes** alongside light / dark
- **Follow-up suggestions** after each reply
- **Attachments:** drag-and-drop or paste images and PDFs (gated by what the model accepts)
- **Find in chat** (Mod+F): highlights matches, Enter / Shift+Enter to step, Esc to close
- **Personas**, **Roundtable** (personas discuss a topic), **Saved messages**, chat **tags**, **reply variants**, **quote reply**, message **keyboard navigation**, a **context meter** with compact, free **calculate / Wikipedia / weather / image generation** tools, and **print / PDF export**
- **Conversation outline** (Mod+Shift+U, wide screens): a side panel listing your messages and the h1-h3 headings in replies; click to jump, the item nearest the viewport is highlighted, open state is remembered
- **Zen mode** (Mod+Shift+Z or palette): hides the sidebar, toolbar, outline and context meter for a centered thread and composer; Esc or the pill exits; kept for the browser tab session only
- **Projects** (palette: New project…): group chats under collapsible sidebar headers, each with shared instructions and reference notes (paste or add a .txt/.md/.json file up to 200 KB) that are composed into the system prompt of every chat in the project; move chats via the row button or palette, deleting a project only ungroups its chats; included in backups and exports
- **Snippets** (palette: Snippets…): a text expander for the composer. Type a trigger like `;sig` then space (or Enter) to expand it; supports `{{date}}`, `{{time}}` and `{{clipboard}}`; stored locally, with built-in examples to add
- **What's new / Tour:** a feature tour (command palette entry or the `?` toolbar button), shown once to returning users
- **Installable PWA:** works offline for the app shell and saved chats, with an offline indicator (model calls still need a network)

## Architecture

```
Browser                                             Worker
┌────────────────────────────────────────────┐      ┌──────────────────────┐
│ ChatClient ─▶ runAgent → chat() agent loop │─────────────────────────────▶ openrouter.ai
│                  │                         │      │ SSR + static assets  │
│                  ▼                         │      │ (never sees the key) │
│            tools execute locally           │      └──────────────────────┘
│      (sandboxed iframe → Web Worker)       │
└────────────────────────────────────────────┘
```

Everything — model selection, system prompts, tool calls, persistence, and every OpenRouter request — is client-side.

## Key privacy

The app is bring-your-own-key, and the server is never in the key's path:

- **Direct calls.** The browser calls `https://openrouter.ai/api/v1` itself (CORS). There is no proxy and no server-side key fallback. You can verify in DevTools → Network: requests with an `Authorization` header go only to `openrouter.ai`.
- **Sign in with OpenRouter (OAuth PKCE).** `src/lib/openrouter-oauth.ts` redirects to `openrouter.ai/auth`, and the returned one-time code is exchanged for a key by the browser using a verifier that never leaves the tab. The key is scoped to this app in your OpenRouter account, so you can cap its spend or revoke it there. Pasting a key still works.
- **Storage.** By default the key lives in `sessionStorage` (this tab only). "Remember on this device" moves it to `localStorage`.
- **Content-Security-Policy.** `src/lib/content-security-policy.ts` limits `connect-src` to this origin, OpenRouter, and the Sentry ingest host, so injected script can't quietly `fetch` the key elsewhere. The code sandbox is served from its own page (`/harness-sandbox`) in an opaque-origin iframe so it keeps open network access without being able to read the key.
- **Sentry.** `src/router.tsx` strips request headers and redacts `sk-or-…` keys, bearer tokens, and OAuth `code` params from events, breadcrumbs, and transactions.

Limits: whatever JavaScript this site serves can read the key while you use it — that's inherent to any in-browser BYOK app. The code is open source so you can audit it, and an OAuth key with a spending limit keeps the damage small if anything goes wrong.

## Tools

| Tool                                                                | Default | What it does                                                                                             |
| ------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `list_skills`, `create_skill`, `update_skill`, `set_skill_attached` | on      | Lets the model manage your skill library and this chat's attached skills (takes effect next message)     |
| `get_current_datetime`                                              | on      | Local date, time, timezone, locale                                                                       |
| `run_javascript`                                                    | on      | Runs JS in an isolated Web Worker (bare expressions or async function bodies; 15s timeout)               |
| `calculate`                                                         | on      | Safe local math evaluator (no `eval`): `+ - * / ^ %`, parentheses, `sqrt`/`sin`/`log`/`min`/…, `pi`, `e` |
| `convert_units`                                                     | on      | Local length, mass, temperature, volume, time, and data unit conversion                                  |
| `random`                                                            | on      | Dice (`2d6+1`), coin flip, or pick from a list                                                           |
| `wikipedia_lookup`                                                  | off     | Article summary + URL from en.wikipedia.org (keyless; sends the query to Wikipedia)                      |
| `get_weather`                                                       | off     | Current + 3-day forecast via Open-Meteo (keyless; sends the place name to Open-Meteo)                    |
| `generate_image`                                                    | off     | Image card from a Pollinations URL (keyless; sends the prompt to image.pollinations.ai, no referrer)     |

Code tools run inside a `sandbox="allow-scripts"` iframe (opaque origin), so they cannot read the app's localStorage, API key, or DOM. To add a tool, define it with `toolDefinition(...)` in `src/lib/harness/tools.ts` and append a descriptor to `HARNESS_TOOLS`; because `chat()` runs in the browser, `.server(execute)` tools execute locally.

## Project layout

- `src/components/chat` — Chat UI (`ChatApp`, `ChatThread`, skills / API key modals)
- `src/lib/harness/run-agent.ts` — Browser agent loop (`chat()` from TanStack AI) calling OpenRouter directly
- `src/lib/harness/tools.ts` — Tool registry; add new browser tools here
- `src/lib/harness/sandbox.ts` — Isolated code sandbox (opaque-origin iframe + Web Worker)
- `src/lib/openrouter-models.ts` — Model list filtering and caching (fetched directly from OpenRouter)
- `src/lib/compose-system-prompt.ts` — Baseline + skills composition
- `src/lib/chat-persistence.ts` — Browser storage for conversations
- `src/store` — Chat state (`chat.store`, `chat.hooks`)
- `src/routes` — Routes (`/`, `/arena`, `/insights`, `/about`, …)
- `src/sw.js` + `public/manifest.webmanifest` — PWA service worker and manifest
- `src/integrations/tanstack-query` — TanStack Query provider and SSR wiring

## Notes

- Without a valid key (from the app or optional `.env.local` for local dev), model loading and chat show clear errors.
- The free-model filter is a UI default, not a server-side gate: any request your key allows can be sent.
- Conversation data stays in the browser; there is no backend that sees your chats or key.
- There is no Anthropic sidecar or separate model host — only OpenRouter.
- The API key in localStorage is a XSS risk by design (BYOK); keep the app origin trusted.
