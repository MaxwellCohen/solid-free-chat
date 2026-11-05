export type SlashCommand = {
  name: string
  description: string
  /** Argument hint shown after the name, e.g. `<name>`. */
  args?: string
  /** Quick prompt: replaces the draft with this prefix. */
  template?: string
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: 'new', description: 'Start a new chat' },
  { name: 'clear', description: 'Clear: start a new chat' },
  { name: 'skill', description: 'Toggle a skill by name', args: '<name>' },
  {
    name: 'export',
    description: 'Export chat (md or json)',
    args: '[md|json]',
  },
  { name: 'model', description: 'Switch model' },
  { name: 'help', description: 'Keyboard shortcuts' },
  {
    name: 'summarize',
    description: 'Summarize',
    template: 'Summarize the following:\n\n',
  },
  {
    name: 'explain',
    description: 'Explain',
    template: 'Explain the following clearly:\n\n',
  },
  {
    name: 'translate',
    description: 'Translate to English',
    template: 'Translate the following to English:\n\n',
  },
  {
    name: 'eli5',
    description: 'Explain like I am five',
    template: "Explain like I'm five:\n\n",
  },
  {
    name: 'fix',
    description: 'Fix grammar and errors',
    template: 'Fix any errors in the following:\n\n',
  },
  {
    name: 'shorter',
    description: 'Make shorter',
    template: 'Make this shorter while keeping the meaning:\n\n',
  },
]

/** Commands whose name starts with the typed `/prefix` (no whitespace yet). */
export function matchSlashCommands(draft: string): SlashCommand[] {
  if (!/^\/[^\s]*$/.test(draft)) return []
  const q = draft.slice(1).toLowerCase()
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q))
}

export type ParsedSlash = { command: SlashCommand; arg: string }

/** Parses a full `/name arg` draft; null when it is not a known command. */
export function parseSlash(draft: string): ParsedSlash | null {
  const m = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(draft.trim())
  if (!m) return null
  const name = m[1].toLowerCase()
  const command = SLASH_COMMANDS.find((c) => c.name === name)
  return command ? { command, arg: m[2].trim() } : null
}

/** Case-insensitive exact match first, then unique prefix/substring match. */
export function findByName<T extends { id: string; name: string }>(
  items: readonly T[],
  query: string,
): T | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  const exact = items.find((i) => i.name.toLowerCase() === q)
  if (exact) return exact
  const partial = items.filter((i) => i.name.toLowerCase().includes(q))
  return partial.length === 1 ? partial[0] : undefined
}
