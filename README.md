# Solid Free Chat

A SolidStart chat app that streams responses from OpenRouter models, keeps conversation history in browser storage, and keeps your API key on the server.

## Tech Stack

- SolidStart + TanStack Router
- SolidJS + TypeScript
- Tailwind CSS v4
- TanStack AI (`@tanstack/ai`, `@tanstack/ai-openrouter`)
- Sentry instrumentation for server functions

## Prerequisites

- Node.js 20+
- npm or pnpm
- An OpenRouter API key ([create one here](https://openrouter.ai/keys))

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your local env file:

```bash
cp .env.example .env.local
```

3. Add your API key to `.env.local`:

```env
OPENROUTER_API_KEY=your_openrouter_api_key
```

Optional attribution values (recommended by OpenRouter):

```env
OPENROUTER_HTTP_REFERER=https://your-app.com
OPENROUTER_APP_TITLE=Solid Free Chat
```

## Run Locally

```bash
npm run dev
```

The app runs on `http://localhost:3000`.

## Available Scripts

- `npm run dev` - Start Vite dev server on port 3000
- `npm run build` - Build production assets
- `npm run start` - Run the built server from `.output/server/index.mjs`
- `npm run preview` - Preview production build
- `npm run test` - Run tests with Vitest
- `npm run lint` - Run ESLint
- `npm run format` - Check formatting with Prettier
- `npm run check` - Write formatting and apply ESLint fixes

## Features

- Streaming chat responses via OpenRouter
- Server-side API key usage (not exposed to the browser)
- Free-model discovery per API key
- Model picker with fallback behavior for saved selections
- Local chat persistence in browser storage
- Markdown rendering with syntax highlighting
- Sentry spans around key server-side operations

## Project Structure

- `src/components/chat` - Chat UI (`ChatApp`, `ChatThread`)
- `src/server/openrouter-fns.ts` - Server functions for model listing + chat streaming
- `src/lib/openrouter-user-models.server.ts` - Model filtering/allowlist + caching
- `src/store` - Chat state and actions
- `src/routes` - File-based routes

## Notes

- If `OPENROUTER_API_KEY` is missing or invalid, model loading and chat requests will fail with actionable errors.
- Conversation history is stored locally in the browser.
- This repository no longer depends on an Anthropic sidecar service.
