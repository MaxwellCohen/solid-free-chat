import { createFileRoute } from '@tanstack/solid-router'
import ChatApp from '../components/chat/ChatApp'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main class="bg-background text-foreground w-full">
      <ChatApp />
    </main>
  )
}
