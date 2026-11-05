import type { StreamChunk } from '@tanstack/ai'
import type { RunAgentOptions } from './run-agent'

/** Same as `runAgent`, but loads the heavy provider SDKs on first use. */
export async function* runAgent(
  options: RunAgentOptions,
): AsyncGenerator<StreamChunk> {
  const { runAgent: run } = await import('./run-agent')
  yield* run(options)
}
