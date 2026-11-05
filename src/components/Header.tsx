import { Link } from '@tanstack/solid-router'

import { For, Show, createSignal, onSettled } from 'solid-js'

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

const NAV_LINKS = [
  { to: '/', label: 'Chat' },
  { to: '/review', label: 'Review' },
  { to: '/saved', label: 'Saved' },
  { to: '/insights', label: 'Insights' },
  { to: '/arena', label: 'Arena' },
  { to: '/study', label: 'Study' },
  { to: '/roundtable', label: 'Roundtable' },
  { to: '/dev', label: 'Dev' },
  { to: '/about', label: 'About' },
] as const

function MobileMenu() {
  const [open, setOpen] = createSignal(false)
  let button: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined

  const close = (refocus = false) => {
    setOpen(false)
    if (refocus) button?.focus()
  }

  onSettled(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open()) close(true)
    }
    const onDown = (e: PointerEvent) => {
      if (!open()) return
      const t = e.target as Node
      if (panel?.contains(t) || button?.contains(t)) return
      close()
    }
    addEventListener('keydown', onKey)
    addEventListener('pointerdown', onDown)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('pointerdown', onDown)
    }
  })

  return (
    <div class="md:hidden">
      <button
        ref={button}
        type="button"
        aria-label="Menu"
        aria-expanded={open() ? 'true' : 'false'}
        aria-controls="mobile-nav"
        class="border-border bg-muted/50 text-foreground hover:bg-muted inline-flex size-9 items-center justify-center rounded-lg border transition-colors"
        onClick={() => setOpen(!open())}
      >
        <svg
          viewBox="0 0 24 24"
          class="size-5"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <Show when={open()}>
        <div
          ref={panel}
          id="mobile-nav"
          class="border-border bg-card absolute inset-x-0 top-14 z-50 border-b shadow-lg"
        >
          <nav
            aria-label="Main"
            class="mx-auto flex max-w-6xl flex-col gap-1 p-3 text-base font-medium"
          >
            <For each={NAV_LINKS}>
              {(l) => (
                <Link
                  to={l.to}
                  class="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-3 py-2.5 no-underline transition-colors"
                  activeProps={{
                    class:
                      'text-foreground bg-muted rounded-md px-3 py-2.5 no-underline transition-colors',
                  }}
                  activeOptions={{ exact: l.to === '/' }}
                  onClick={() => close()}
                >
                  {l.label}
                </Link>
              )}
            </For>
          </nav>
        </div>
      </Show>
    </div>
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

        <div class="hidden min-w-0 flex-1 items-center justify-center gap-x-1 px-2 text-sm font-medium whitespace-nowrap md:flex">
          <For each={NAV_LINKS}>
            {(l) => (
              <Link
                to={l.to}
                class="text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1.5 no-underline transition-colors"
                activeProps={{
                  class:
                    'text-foreground bg-muted rounded-md px-2.5 py-1.5 no-underline transition-colors',
                }}
                activeOptions={{ exact: l.to === '/' }}
              >
                {l.label}
              </Link>
            )}
          </For>
        </div>
        <div class="flex-1 md:hidden" />

        <div class="flex shrink-0 items-center gap-2">
          <InstallButton />
          <ThemeSwitcher />
          <MobileMenu />
        </div>
      </nav>
    </header>
  )
}
