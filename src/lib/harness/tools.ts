import { toolDefinition } from '@tanstack/ai'
import type { Tool } from '@tanstack/ai'
import { runInSandbox } from './sandbox'
import type { SandboxResult } from './sandbox'

/**
 * Browser-local tools for the harness.
 *
 * `chat()` runs in the browser (see `run-agent.ts`), so tools created with
 * `.server(...)` execute here — "server" is from the agent loop's point of view.
 * To add a tool: define it below and append a descriptor to `HARNESS_TOOLS`.
 */

export interface HarnessSkillSummary {
  id: string
  name: string
  instructions: string
  attached: boolean
}

/** App state the skill tools can touch; supplied by the chat thread (keeps this module store-free). */
export interface HarnessSkillsApi {
  list: () => HarnessSkillSummary[]
  create: (name: string, instructions: string) => string | undefined
  update: (skillId: string, patch: { name?: string; instructions?: string }) => boolean
  setAttached: (skillId: string, attached: boolean) => boolean
}

export interface HarnessToolContext {
  skills: HarnessSkillsApi
}

export interface HarnessToolDescriptor {
  id: string
  label: string
  /** Shown in the tools menu. */
  summary: string
  enabledByDefault: boolean
  /** One menu entry may expose several related tools to the model. */
  create: (context: HarnessToolContext) => Tool | Tool[]
}

/** Keep tool results small enough to send back to the model. */
const MAX_TOOL_OUTPUT_CHARS = 20_000

function truncate(text: string): string {
  if (text.length <= MAX_TOOL_OUTPUT_CHARS) return text
  const omitted = text.length - MAX_TOOL_OUTPUT_CHARS
  return `${text.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n… [truncated ${omitted} chars]`
}

function sandboxResultToToolOutput(result: SandboxResult) {
  return {
    ok: result.ok,
    ...(result.output ? { output: truncate(result.output) } : {}),
    ...(result.result !== undefined ? { result: truncate(result.result) } : {}),
    ...(result.error ? { error: truncate(result.error) } : {}),
  }
}

const codeInputSchema = (description: string) => ({
  type: 'object' as const,
  properties: {
    code: { type: 'string' as const, description },
  },
  required: ['code'],
  additionalProperties: false,
})

const currentDateTimeTool = toolDefinition({
  name: 'get_current_datetime',
  description:
    "Get the user's current local date, time, timezone, and locale. Use this whenever the answer depends on today's date or the current time.",
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
})

const runJavaScriptTool = toolDefinition({
  name: 'run_javascript',
  description:
    'Execute JavaScript in an isolated browser Web Worker (no DOM, no network credentials, no access to the app). ' +
    'The code is the body of an async function: use `return` to produce a result and `console.log` for output. ' +
    'Top-level `await` and `fetch` to CORS-enabled URLs work. Each call starts fresh. ' +
    'Use for calculations, data transformation, parsing, and checking logic. Times out after 15 seconds.',
  inputSchema: codeInputSchema('JavaScript function body to execute.'),
})

const SKILL_TIMING_NOTE =
  'Attached skills are added to the system prompt starting with the next user message.'

const listSkillsTool = toolDefinition({
  name: 'list_skills',
  description:
    "List the user's saved skills (reusable instruction snippets composed into the system prompt) and whether each is attached to this chat.",
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
})

const createSkillTool = toolDefinition({
  name: 'create_skill',
  description:
    "Save a new skill to the user's skill library. Use when the user asks you to remember a way of working, a persona, " +
    'or standing instructions. Write `instructions` as direct guidance addressed to the assistant. ' +
    `Check list_skills first to avoid duplicates. ${SKILL_TIMING_NOTE}`,
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short, descriptive skill name (max 120 chars).' },
      instructions: { type: 'string', description: 'The instructions the skill adds to the system prompt.' },
      attach: {
        type: 'boolean',
        description: 'Attach the new skill to this chat (default true).',
      },
    },
    required: ['name', 'instructions'],
    additionalProperties: false,
  },
})

const updateSkillTool = toolDefinition({
  name: 'update_skill',
  description: `Rename an existing skill or replace its instructions. Get ids from list_skills. ${SKILL_TIMING_NOTE}`,
  inputSchema: {
    type: 'object',
    properties: {
      skill_id: { type: 'string' },
      name: { type: 'string' },
      instructions: { type: 'string' },
    },
    required: ['skill_id'],
    additionalProperties: false,
  },
})

const setSkillAttachedTool = toolDefinition({
  name: 'set_skill_attached',
  description: `Attach a saved skill to this chat, or detach it. Get ids from list_skills. ${SKILL_TIMING_NOTE}`,
  inputSchema: {
    type: 'object',
    properties: {
      skill_id: { type: 'string' },
      attached: { type: 'boolean' },
    },
    required: ['skill_id', 'attached'],
    additionalProperties: false,
  },
})

function createSkillTools({ skills }: HarnessToolContext): Tool[] {
  const unknownSkill = (id: string) => ({
    ok: false,
    error: `No skill with id "${id}". Call list_skills to see valid ids.`,
  })
  return [
    listSkillsTool.server(() => ({
      skills: skills.list().map((skill) => ({
        ...skill,
        instructions: truncate(skill.instructions),
      })),
    })),
    createSkillTool.server((input) => {
      const { name, instructions, attach } = input as {
        name: string
        instructions: string
        attach?: boolean
      }
      const id = skills.create(name, instructions)
      if (!id) {
        return { ok: false, error: 'Both name and instructions must be non-empty.' }
      }
      const attached = attach !== false && skills.setAttached(id, true)
      return { ok: true, skill_id: id, attached }
    }),
    updateSkillTool.server((input) => {
      const { skill_id, name, instructions } = input as {
        skill_id: string
        name?: string
        instructions?: string
      }
      if (name === undefined && instructions === undefined) {
        return { ok: false, error: 'Provide name and/or instructions to update.' }
      }
      if (!skills.list().some((skill) => skill.id === skill_id)) {
        return unknownSkill(skill_id)
      }
      return skills.update(skill_id, { name, instructions })
        ? { ok: true }
        : { ok: false, error: 'Name and instructions cannot be empty.' }
    }),
    setSkillAttachedTool.server((input) => {
      const { skill_id, attached } = input as { skill_id: string; attached: boolean }
      return skills.setAttached(skill_id, attached)
        ? { ok: true, skill_id, attached }
        : unknownSkill(skill_id)
    }),
  ]
}

export const HARNESS_TOOLS: readonly HarnessToolDescriptor[] = [
  {
    id: 'skills',
    label: 'Skills',
    summary: 'Lets the model list, create, edit, and attach skills for this chat.',
    enabledByDefault: true,
    create: createSkillTools,
  },
  {
    id: 'get_current_datetime',
    label: 'Date & time',
    summary: "Reads your local date, time, and timezone.",
    enabledByDefault: true,
    create: () =>
      currentDateTimeTool.server(() => {
        const now = new Date()
        const resolved = Intl.DateTimeFormat().resolvedOptions()
        return {
          iso: now.toISOString(),
          local: now.toLocaleString(resolved.locale, {
            dateStyle: 'full',
            timeStyle: 'long',
          }),
          timeZone: resolved.timeZone,
          locale: resolved.locale,
          utcOffsetMinutes: -now.getTimezoneOffset(),
        }
      }),
  },
  {
    id: 'run_javascript',
    label: 'JavaScript sandbox',
    summary: 'Runs JS in an isolated Web Worker for calculations and data work.',
    enabledByDefault: true,
    create: () =>
      runJavaScriptTool.server(async (input) => {
        const { code } = input as { code: string }
        return sandboxResultToToolOutput(
          await runInSandbox(code, { timeoutMs: 15_000 }),
        )
      }),
  },
]

export const DEFAULT_ENABLED_TOOL_IDS: string[] = HARNESS_TOOLS.filter(
  (tool) => tool.enabledByDefault,
).map((tool) => tool.id)

const KNOWN_TOOL_IDS = new Set(HARNESS_TOOLS.map((tool) => tool.id))

export function isKnownToolId(id: string): boolean {
  return KNOWN_TOOL_IDS.has(id)
}

export function createEnabledTools(
  enabledIds: readonly string[],
  context: HarnessToolContext,
): Tool[] {
  const enabled = new Set(enabledIds)
  return HARNESS_TOOLS.filter((tool) => enabled.has(tool.id)).flatMap((tool) =>
    tool.create(context),
  )
}
