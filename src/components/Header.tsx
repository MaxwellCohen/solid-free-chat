import { Link } from '@tanstack/solid-router'

import { Show, createSignal, onSettled } from 'solid-js'

import { Download } from './icons'
import ThemeSwitcher from './ThemeSwitcher'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function InstallButton() {
  const [promptEvent, setPromptEvent] = createSignal<InstallPromptEvent | null>(
    null,
  )

  onSettled(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as InstallPromptEvent)
    }
    const onInstalled = () => setPromptEvent(null)
    addEventListener('beforeinstallprompt', onPrompt)
    addEventListener('appinstalled', onInstalled)
    return () => {
      removeEventListener('beforeinstallprompt', onPrompt)
      removeEventListener('appinstalled', onInstalled)
    }
  })

  const install = async () => {
    const e = promptEvent()
    if (!e) return
    setPromptEvent(null)
    await e.prompt()
  }

  return (
    <Show when={promptEvent()}>
      <button
        type="button"
        class="border-border bg-muted/50 text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors"
        onClick={install}
      >
        <Download class="size-4" aria-hidden="true" />
        <span class="max-[419px]:sr-only">Install</span>
      </button>
    </Show>
  )
}

export default function Header() {
  return (
    <header class="border-border bg-card text-card-foreground sticky top-0 z-50 h-14 border-b shadow-sm">
      <nav class="mx-auto flex h-full max-w-6xl flex-nowrap items-center gap-x-2 px-3 sm:gap-x-4 sm:px-4">
        <h2 class="m-0 shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            class="text-foreground hover:text-primary inline-flex items-center gap-2 rounded-lg no-underline transition-colors"
          >
            <span
              class="bg-primary size-2 shrink-0 rounded-full"
              aria-hidden="true"
            ></span>
            <span class="max-[419px]:sr-only">Solid Free Chat</span>
          </Link>
        </h2>

        <div class="flex min-w-0 flex-1 items-center gap-x-1 text-sm font-medium sm:justify-center sm:px-2">
          <Link
            to="/"
            class="text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1.5 no-underline transition-colors"
            activeProps={{
              class:
                'text-foreground bg-muted rounded-md px-2.5 py-1.5 no-underline transition-colors',
            }}
            activeOptions={{ exact: true }}
          >
            Chat
          </Link>
          <Link
            to="/about"
            class="text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1.5 no-underline transition-colors"
            activeProps={{
              class:
                'text-foreground bg-muted rounded-md px-2.5 py-1.5 no-underline transition-colors',
            }}
          >
            About
          </Link>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <InstallButton />
          <ThemeSwitcher />
        </div>
      </nav>
    </header>
  )
}
