/**
 * Where the user's OpenRouter key lives: `sessionStorage` (this tab, cleared
 * when it closes) by default, or `localStorage` when they opt into "remember on
 * this device". Never sent anywhere except openrouter.ai.
 */
const OPENROUTER_API_KEY_STORAGE_KEY = 'solid-free-chat-openrouter-api-key'
const ACTIVE_PROVIDER_STORAGE_KEY = 'solid-free-chat-provider'

/** OpenRouter keeps its original key name so existing users stay signed in. */
function keyName(providerId: string): string {
  return providerId === 'openrouter'
    ? OPENROUTER_API_KEY_STORAGE_KEY
    : `solid-free-chat-api-key-${providerId}`
}

export function loadActiveProviderId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROVIDER_STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeActiveProviderId(id: string) {
  try {
    localStorage.setItem(ACTIVE_PROVIDER_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export type StoredApiKey = { key: string; remember: boolean }

export function loadStoredApiKey(providerId = 'openrouter'): StoredApiKey {
  const name = keyName(providerId)
  try {
    const remembered = localStorage.getItem(name)
    if (remembered) return { key: remembered, remember: true }
    const session = sessionStorage.getItem(name)
    return { key: session ?? '', remember: false }
  } catch {
    return { key: '', remember: false }
  }
}

/** Returns false when the key could not be saved (the previous key is left in place). */
export function storeApiKey(
  { key, remember }: StoredApiKey,
  providerId = 'openrouter',
): boolean {
  const name = keyName(providerId)
  try {
    if (!key) {
      localStorage.removeItem(name)
      sessionStorage.removeItem(name)
      return true
    }
    const target = remember ? localStorage : sessionStorage
    const other = remember ? sessionStorage : localStorage
    target.setItem(name, key)
    other.removeItem(name)
    return true
  } catch {
    /* ignore quota / private mode */
    return false
  }
}

const MODEL_PROVIDER_STORAGE_KEY = 'solid-free-chat-model-provider'

export function loadSelectedModelProviderId(): string | null {
  try {
    return localStorage.getItem(MODEL_PROVIDER_STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeSelectedModelProviderId(id: string) {
  try {
    localStorage.setItem(MODEL_PROVIDER_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}
