import type { ChatProject, ChatSkill } from '../store/chat.store'
import { composeProjectContext } from './chat-projects'

/** Always prepended before any attached skill instructions. */
export const BASELINE_SYSTEM_MESSAGE =
  "You are a helpful chat assistant. Follow the user's instructions carefully and concisely."

/**
 * Compose the system prompt: baseline, then the chat's project context
 * (instructions + reference notes), then attached skills (in order).
 * Missing skill ids are skipped. Per-chat custom instructions come last.
 */
export function composeSystemPrompt(
  skillIds: readonly string[],
  skills: readonly ChatSkill[],
  customInstructions?: string,
  project?: ChatProject,
): string {
  const byId = new Map(skills.map((skill) => [skill.id, skill]))
  const parts = [BASELINE_SYSTEM_MESSAGE]
  const projectContext = composeProjectContext(project)
  if (projectContext) parts.push(projectContext)
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
