export type TourAction =
  | 'palette'
  | 'composer'
  | 'personas'
  | 'arena'
  | 'study'
  | 'roundtable'
  | 'insights'
  | 'saved'
  | 'shortcuts'
  | 'display'
  | 'import'

export type TourItem = {
  id: string
  emoji: string
  title: string
  description: string
  how: string
  action: TourAction
  actionLabel?: string
}

export const TOUR_SEEN_KEY = 'tour-seen-v1'

export const TOUR_ITEMS: readonly TourItem[] = [
  {
    id: 'palette',
    emoji: '⌘',
    title: 'Command palette',
    description: 'Jump to any action or chat without leaving the keyboard.',
    how: 'Press Ctrl/Cmd+K',
    action: 'palette',
  },
  {
    id: 'slash',
    emoji: '/',
    title: 'Slash commands',
    description:
      'Type / in the composer for /new, /export, /summarize and more.',
    how: 'Type / in the message box',
    action: 'composer',
    actionLabel: 'Focus composer',
  },
  {
    id: 'personas',
    emoji: '🎭',
    title: 'Personas',
    description: 'Start a chat with a ready-made character or your own.',
    how: 'Command palette: Personas…',
    action: 'personas',
  },
  {
    id: 'arena',
    emoji: '⚔️',
    title: 'Arena',
    description: 'Compare two models side by side and vote on the winner.',
    how: 'Command palette: Open arena',
    action: 'arena',
  },
  {
    id: 'study',
    emoji: '🎓',
    title: 'Study mode',
    description:
      'Turn a chat or notes into flashcards and review them with spaced repetition.',
    how: 'Command palette: Open study mode',
    action: 'study',
  },
  {
    id: 'roundtable',
    emoji: '🗣️',
    title: 'Roundtable',
    description: 'Let several personas discuss a topic together.',
    how: 'Command palette: Open roundtable',
    action: 'roundtable',
  },
  {
    id: 'insights',
    emoji: '📊',
    title: 'Insights',
    description: 'See usage, tokens, cost and streaks across your chats.',
    how: 'Command palette: Open insights',
    action: 'insights',
  },
  {
    id: 'saved',
    emoji: '🔖',
    title: 'Saved messages',
    description: 'Bookmark great replies and find them again in one place.',
    how: 'Bookmark icon on a message',
    action: 'saved',
  },
  {
    id: 'tags',
    emoji: '🏷️',
    title: 'Chat tags',
    description: 'Label chats and filter the sidebar by tag.',
    how: 'Chat menu in the sidebar',
    action: 'composer',
    actionLabel: 'Back to chat',
  },
  {
    id: 'variants',
    emoji: '🔀',
    title: 'Reply variants',
    description: 'Regenerate an answer and flip between the versions.',
    how: 'Regenerate under a reply',
    action: 'composer',
    actionLabel: 'Back to chat',
  },
  {
    id: 'voice',
    emoji: '🎙️',
    title: 'Voice',
    description: 'Dictate into the composer and have replies read aloud.',
    how: 'Mic button / speaker on a reply',
    action: 'composer',
    actionLabel: 'Focus composer',
  },
  {
    id: 'quote',
    emoji: '💬',
    title: 'Quote reply',
    description: 'Select text in a message to quote it in your next one.',
    how: 'Select text, click Quote',
    action: 'composer',
    actionLabel: 'Back to chat',
  },
  {
    id: 'find',
    emoji: '🔎',
    title: 'Find in chat',
    description: 'Highlight matches in the conversation and step through them.',
    how: 'Ctrl/Cmd+F, Enter / Shift+Enter',
    action: 'composer',
    actionLabel: 'Back to chat',
  },
  {
    id: 'keynav',
    emoji: '⌨️',
    title: 'Keyboard navigation',
    description: 'Move between messages and act on them without the mouse.',
    how: 'Press ? for all shortcuts',
    action: 'shortcuts',
    actionLabel: 'Show shortcuts',
  },
  {
    id: 'tools',
    emoji: '🧮',
    title: 'Free tools',
    description:
      'Models can calculate, look up Wikipedia, check weather and draw images.',
    how: 'Toolbar Tools menu',
    action: 'composer',
    actionLabel: 'Back to chat',
  },
  {
    id: 'context',
    emoji: '📏',
    title: 'Context meter + compact',
    description: 'Watch how full the context is and compact long chats.',
    how: 'Meter above the composer',
    action: 'composer',
    actionLabel: 'Back to chat',
  },
  {
    id: 'themes',
    emoji: '🎨',
    title: 'Themes and accent',
    description: 'Light, dark or system, plus accent colors and layout tweaks.',
    how: 'Command palette: Display settings',
    action: 'display',
  },
  {
    id: 'data',
    emoji: '📦',
    title: 'Import, export, print',
    description: 'Back up, import from ChatGPT, export Markdown or save a PDF.',
    how: 'Command palette: Import chats',
    action: 'import',
  },
  {
    id: 'pwa',
    emoji: '📲',
    title: 'Install and offline',
    description: 'Install as an app; saved chats work without a network.',
    how: 'Browser install button',
    action: 'composer',
    actionLabel: 'Got it',
  },
]
