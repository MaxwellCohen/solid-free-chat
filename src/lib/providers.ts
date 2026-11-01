/**
 * Inference providers the browser can call directly. OpenRouter keeps its own
 * sign-in/model-list flow; the rest speak the OpenAI Chat Completions dialect
 * and are used with a pasted key. Only providers that answer CORS preflights
 * (including the OpenAI SDK's headers) are listed.
 */
export type ProviderId =
  'openrouter' | 'groq' | 'cerebras' | 'mistral' | 'huggingface'

export type Provider = {
  id: ProviderId
  name: string
  /** OpenAI-compatible base URL (no trailing slash). */
  baseUrl: string
  /** Where the user creates a key. */
  keyUrl: string
  keyPlaceholder: string
  note: string
}

export const PROVIDERS: Provider[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/settings/keys',
    keyPlaceholder: 'sk-or-…',
    note: 'Many free models, one-click sign-in.',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_…',
    note: 'Free tier, very fast Llama / Qwen / GPT-OSS.',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyUrl: 'https://cloud.cerebras.ai/platform/',
    keyPlaceholder: 'csk-…',
    note: 'Free tier, very fast inference.',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    keyPlaceholder: 'API key',
    note: 'Free "Experiment" tier with rate limits.',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    keyUrl: 'https://huggingface.co/settings/tokens',
    keyPlaceholder: 'hf_…',
    note: 'Monthly free credits across many open models.',
  },
]

export const DEFAULT_PROVIDER_ID: ProviderId = 'openrouter'

export function getProvider(id: string | null | undefined): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
}

export function providerOrigins(): string[] {
  return PROVIDERS.map((p) => new URL(p.baseUrl).origin)
}
