import { Show } from 'solid-js'
import { SolidQueryDevtools } from '@tanstack/solid-query-devtools'

export default function AppTanstackQueryHeaderUser() {
  return (
    <Show when={import.meta.env.DEV}>
      <SolidQueryDevtools buttonPosition="bottom-right" />
    </Show>
  )
}
