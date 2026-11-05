import type { ChatSkill } from '../store/chat.store'

/** Always prepended before any attached skill instructions. */
export const BASELINE_SYSTEM_MESSAGE =
  'You are a helpful chat assistant. Follow the user\'s instructions carefully and concisely.'

/**
 * Compose the system prompt from the baseline plus attached skills (in order).
 * Missing skill ids are skipped. Per-chat custom instructions come last.
 */
export function composeSystemPrompt(
  skillIds: readonly string[],
  skills: readonly ChatSkill[],
  customInstructions?: string,
): string {
  const byId = new Map(skills.map((skill) => [skill.id, skill]))
  const parts = [BASELINE_SYSTEM_MESSAGE]
  for (const id of skillIds) {
    const skill = byId.get(id)
    if (!skill) continue
    const instructions = skill.instructions.trim()
    if (!instructions) continue
    parts.push(instructions)
  }
  const custom = customInstructions?.trim()
  if (custom) parts.push(custom)
  return parts.join('\n\n')
}
