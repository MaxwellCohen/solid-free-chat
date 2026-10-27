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

export interface HarnessToolDescriptor {
  id: string
  label: string
  /** Shown in the tools menu. */
  summary: string
  enabledByDefault: boolean
  create: () => Tool
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

const runPythonTool = toolDefinition({
  name: 'run_python',
  description:
    'Execute Python 3 in the browser via Pyodide (WebAssembly). Prints are captured and the value of the last ' +
    'expression is returned. Variables and imports persist between calls in this session. Packages bundled ' +
    'with Pyodide (numpy, pandas, sympy, scipy, matplotlib, etc.) load automatically on import. No network ' +
    'sockets or filesystem access to the user. The first call may take a few seconds to load. Times out after 60 seconds.',
  inputSchema: codeInputSchema('Python source code to execute.'),
})

export const HARNESS_TOOLS: readonly HarnessToolDescriptor[] = [
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
          await runInSandbox('javascript', code, { timeoutMs: 15_000 }),
        )
      }),
  },
  {
    id: 'run_python',
    label: 'Python (Pyodide)',
    summary: 'Runs Python with numpy/pandas/sympy in WebAssembly. ~10 MB first load.',
    enabledByDefault: false,
    create: () =>
      runPythonTool.server(async (input) => {
        const { code } = input as { code: string }
        return sandboxResultToToolOutput(
          await runInSandbox('python', code, { timeoutMs: 60_000 }),
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

export function createEnabledTools(enabledIds: readonly string[]): Tool[] {
  const enabled = new Set(enabledIds)
  return HARNESS_TOOLS.filter((tool) => enabled.has(tool.id)).map((tool) =>
    tool.create(),
  )
}
