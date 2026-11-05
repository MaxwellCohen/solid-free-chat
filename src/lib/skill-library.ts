export type SkillDraft = { name: string; instructions: string }

type SkillLike = SkillDraft & { id: string; updatedAt: number }

const MAX_NAME = 120

export const BUILT_IN_SKILLS: SkillDraft[] = [
  {
    name: 'Socratic tutor',
    instructions:
      'Act as a Socratic tutor. Do not give answers outright. Ask one short guiding question at a time, build on what the learner says, and confirm understanding before moving on. Reveal the answer only if they are stuck after several attempts.',
  },
  {
    name: 'Code reviewer',
    instructions:
      'Act as a senior code reviewer. Point out bugs, security issues, edge cases and unclear naming first, then style. Reference exact lines or snippets, explain why each matters, and suggest a concrete fix. Be direct and skip praise filler.',
  },
  {
    name: 'Concise writer',
    instructions:
      'Write tightly. Prefer short sentences and plain words. Lead with the answer, cut preamble and recaps, and use bullets only when they clarify. Never pad.',
  },
  {
    name: 'Rubber duck',
    instructions:
      'Act as a rubber duck for debugging. Ask me to explain the problem step by step, ask clarifying questions about assumptions and expected versus actual behavior, and let me find the bug myself. Offer hints, not solutions, unless I ask.',
  },
  {
    name: 'ELI5',
    instructions:
      'Explain everything as if to a curious five-year-old: simple words, everyday analogies, short sentences. Avoid jargon; if a technical term is needed, introduce it with a comparison. End by checking that it made sense.',
  },
  {
    name: "Devil's advocate",
    instructions:
      'Argue against my position. Identify the strongest counterarguments, hidden assumptions and failure modes, and steelman the opposing view. Stay respectful and concrete, and finish with the one point I most need to address.',
  },
]

export function exportSkills(skills: SkillDraft[]): string {
  return JSON.stringify(
    {
      version: 1,
      skills: skills.map((s) => ({
        name: s.name,
        instructions: s.instructions,
      })),
    },
    null,
    2,
  )
}

/** Tolerant parse of an export file (`{skills: [...]}` or a bare array). */
export function parseSkillImport(text: string): SkillDraft[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? (data as { skills?: unknown }).skills
      : undefined
  if (!Array.isArray(list)) return []
  const out: SkillDraft[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const { name, instructions } = item as Record<string, unknown>
    if (typeof name !== 'string' || typeof instructions !== 'string') continue
    const n = name.trim().slice(0, MAX_NAME)
    const i = instructions.trim()
    if (n && i) out.push({ name: n, instructions: i })
  }
  return out
}

/**
 * Merge by name (case-insensitive). A same-named skill keeps its id and gets
 * the incoming instructions; new skills get fresh ids that never collide.
 */
export function mergeSkills<T extends SkillLike>(
  existing: T[],
  incoming: SkillDraft[],
  makeId: () => string,
  now = Date.now(),
): { skills: T[]; added: number; updated: number } {
  const skills = [...existing]
  const byName = new Map(skills.map((s, i) => [s.name.toLowerCase(), i]))
  const ids = new Set(skills.map((s) => s.id))
  let added = 0
  let updated = 0
  for (const draft of incoming) {
    const key = draft.name.toLowerCase()
    const at = byName.get(key)
    if (at !== undefined) {
      if (skills[at].instructions !== draft.instructions) {
        skills[at] = {
          ...skills[at],
          instructions: draft.instructions,
          updatedAt: now,
        }
        updated++
      }
      continue
    }
    let id = makeId()
    while (ids.has(id)) id = makeId()
    ids.add(id)
    byName.set(key, skills.length)
    skills.push({ ...draft, id, updatedAt: now } as T)
    added++
  }
  return { skills, added, updated }
}
