import { createFileRoute, Navigate } from '@tanstack/solid-router'

export const Route = createFileRoute('/example/chat')({
  component: () => <Navigate to="/" />,
})
