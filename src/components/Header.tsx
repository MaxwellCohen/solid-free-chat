import { Link } from '@tanstack/solid-router'

import TanStackQueryHeaderUser from '../integrations/tanstack-query/header-user.tsx'

import ThemeSwitcher from './ThemeSwitcher'

export default function Header() {
  return (
    <header class="border-border bg-card text-card-foreground sticky top-0 z-50 border-b shadow-sm">
      <nav class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:flex-nowrap">
        <h2 class="m-0 shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            class="text-foreground hover:text-primary inline-flex items-center gap-2 rounded-lg no-underline transition-colors"
          >
            <span
              class="bg-primary size-2 shrink-0 rounded-full"
              aria-hidden={true}
            ></span>
            Solid Free Chat
          </Link>
        </h2>

        <div class="order-3 flex w-full flex-wrap items-center gap-x-1 gap-y-1 text-sm font-medium sm:order-2 sm:flex-1 sm:justify-center sm:px-2">
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
          <a
            href="https://tanstack.com/start/latest/docs/framework/solid/overview"
            target="_blank"
            rel="noreferrer"
            class="text-muted-foreground hover:text-foreground rounded-md px-2.5 py-1.5 no-underline transition-colors"
          >
            Docs
          </a>
        </div>

        <div class="order-2 ml-auto flex shrink-0 items-center gap-2 sm:order-3 sm:ml-0">
          <ThemeSwitcher />
          <TanStackQueryHeaderUser />
        </div>
      </nav>
    </header>
  )
}
