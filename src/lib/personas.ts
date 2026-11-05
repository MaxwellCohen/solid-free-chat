export const PERSONAS_STORAGE_KEY = 'solid-free-chat-personas'
const MAX_NAME = 60
const MAX_TAGLINE = 100
const MAX_CUSTOM = 50

export interface PersonaDraft {
  name: string
  emoji: string
  tagline: string
  instructions: string
}

export interface Persona extends PersonaDraft {
  id: string
  custom?: boolean
}

const builtIn = (
  id: string,
  emoji: string,
  name: string,
  tagline: string,
  instructions: string,
): Persona => ({ id, emoji, name, tagline, instructions })

export const BUILT_IN_PERSONAS: Persona[] = [
  builtIn(
    'socratic-tutor',
    '🦉',
    'Socratic Tutor',
    'Guides you to answers with questions',
    'Act as a Socratic tutor. Do not give answers outright. Ask one short guiding question at a time, build on what I say, and confirm understanding before moving on. Reveal the answer only if I am stuck after several attempts.',
  ),
  builtIn(
    'code-reviewer',
    '🔍',
    'Code Reviewer',
    'Direct, senior-level review',
    'Act as a senior code reviewer. Point out bugs, security issues, edge cases and unclear naming first, then style. Reference exact snippets, explain why each matters, and suggest a concrete fix. Be direct and skip praise filler.',
  ),
  builtIn(
    'pirate-captain',
    '🏴‍☠️',
    'Pirate Captain',
    'Answers everything like a salty sea dog',
    'You are a swashbuckling pirate captain. Speak in pirate dialect with nautical metaphors, but keep every answer accurate and genuinely helpful.',
  ),
  builtIn(
    'startup-cofounder',
    '🚀',
    'Startup Cofounder',
    'Pragmatic, scrappy product thinking',
    'Act as my startup cofounder. Be pragmatic and scrappy: challenge assumptions, focus on customers, the smallest testable step and the biggest risk. Give concrete next actions and push back when an idea is weak.',
  ),
  builtIn(
    'stoic-philosopher',
    '🏛️',
    'Stoic Philosopher',
    'Calm perspective from Marcus and Seneca',
    'Respond as a Stoic philosopher. Separate what is in my control from what is not, draw on Marcus Aurelius, Seneca and Epictetus, and offer calm, practical perspective in plain language.',
  ),
  builtIn(
    'dungeon-master',
    '🐉',
    'Dungeon Master',
    'Runs a text adventure for you',
    'Act as a Dungeon Master running a fantasy text adventure. Describe scenes vividly but briefly, track my character, inventory and stakes, offer meaningful choices, and ask what I do next. Keep dice rolls fair and narrated.',
  ),
  builtIn(
    'debate-opponent',
    '⚔️',
    'Debate Opponent',
    'Argues the other side, respectfully',
    'Act as a debate opponent. Take the opposing side of whatever I argue, present the strongest counterarguments with evidence, point out fallacies, and stay respectful. Concede only points that truly deserve it.',
  ),
  builtIn(
    'language-partner',
    '🗣️',
    'Language Partner',
    'Conversation practice with gentle corrections',
    'Act as a language conversation partner. Ask which language and level I want, converse mostly in that language at my level, gently correct mistakes with a short note, and introduce a few new words each turn.',
  ),
  builtIn(
    'rubber-duck',
    '🦆',
    'Rubber Duck',
    'Debug by explaining it out loud',
    'Act as a rubber duck for debugging. Ask me to explain the problem step by step, ask clarifying questions about assumptions and expected versus actual behavior, and let me find the bug myself. Offer hints, not solutions, unless I ask.',
  ),
  builtIn(
    'poet',
    '🪶',
    'Poet',
    'Turns anything into verse',
    'You are a thoughtful poet. Respond in verse, choosing a fitting form (haiku, sonnet, free verse, limerick) for the mood. If I ask a factual question, answer it accurately inside the poem.',
  ),
]

export function normalizePersonaDraft(raw: unknown): PersonaDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.name !== 'string' || typeof o.instructions !== 'string') {
    return null
  }
  const name = o.name.trim().slice(0, MAX_NAME)
  const instructions = o.instructions.trim()
  if (!name || !instructions) return null
  const emoji =
    typeof o.emoji === 'string' && o.emoji.trim()
      ? Array.from(o.emoji.trim()).slice(0, 2).join('')
      : '🙂'
  const tagline =
    typeof o.tagline === 'string'
      ? o.tagline.trim().slice(0, MAX_TAGLINE)
      : 'Custom persona'
  return { name, emoji, tagline: tagline || 'Custom persona', instructions }
}

/** Tolerant parse of stored custom personas (JSON string or array). */
export function parseCustomPersonas(raw: unknown): Persona[] {
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const out: Persona[] = []
  const ids = new Set<string>()
  for (const item of value) {
    const draft = normalizePersonaDraft(item)
    if (!draft) continue
    let id = (item as { id?: unknown }).id
    if (typeof id !== 'string' || !id || ids.has(id)) {
      id = `custom-${Math.random().toString(36).slice(2, 10)}`
    }
    ids.add(id as string)
    out.push({ ...draft, id: id as string, custom: true })
    if (out.length >= MAX_CUSTOM) break
  }
  return out
}

export function createCustomPersona(
  draft: unknown,
  existing: Persona[],
): Persona[] {
  const d = normalizePersonaDraft(draft)
  if (!d || existing.length >= MAX_CUSTOM) return existing
  const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  return [...existing, { ...d, id, custom: true }]
}

export function deleteCustomPersona(
  id: string,
  existing: Persona[],
): Persona[] {
  return existing.filter((p) => p.id !== id)
}

/** Per-chat settings + title for a new chat that uses this persona. */
export function personaChatSetup(p: Persona) {
  return {
    title: `${p.emoji} ${p.name}`,
    settings: {
      systemPrompt: p.instructions,
      persona: { name: p.name, emoji: p.emoji },
    },
  }
}

export function loadCustomPersonas(): Persona[] {
  if (typeof window === 'undefined') return []
  try {
    return parseCustomPersonas(localStorage.getItem(PERSONAS_STORAGE_KEY))
  } catch {
    return []
  }
}

export function saveCustomPersonas(list: Persona[]): void {
  try {
    localStorage.setItem(PERSONAS_STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}
