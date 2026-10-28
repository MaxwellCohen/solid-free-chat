/**
 * Where the user's OpenRouter key lives: `sessionStorage` (this tab, cleared
 * when it closes) by default, or `localStorage` when they opt into "remember on
 * this device". Never sent anywhere except openrouter.ai.
 */
const OPENROUTER_API_KEY_STORAGE_KEY = 'solid-free-chat-openrouter-api-key'

export type StoredApiKey = { key: string; remember: boolean }

export function loadStoredApiKey(): StoredApiKey {
  try {
    const remembered = localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY)
    if (remembered) return { key: remembered, remember: true }
    const session = sessionStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY)
    return { key: session ?? '', remember: false }
  } catch {
    return { key: '', remember: false }
  }
}

export function storeApiKey({ key, remember }: StoredApiKey) {
  try {
    localStorage.removeItem(OPENROUTER_API_KEY_STORAGE_KEY)
    sessionStorage.removeItem(OPENROUTER_API_KEY_STORAGE_KEY)
    if (!key) return
    const storage = remember ? localStorage : sessionStorage
    storage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, key)
  } catch {
    /* ignore quota / private mode */
  }
}
