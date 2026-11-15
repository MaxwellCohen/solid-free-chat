/** Unsent composer drafts, kept per conversation across chat switches. */
export type ChatDraft<TImage = unknown, TFile = unknown> = {
  text: string
  images: TImage[]
  files: TFile[]
}

const STORAGE_KEY = 'solid-free-chat:drafts'
export const MAX_DRAFT_TEXT = 20_000
export const MAX_STORED_DRAFTS = 50

const memory = new Map<string, ChatDraft>()

function readStored(): Record<string, string> {
  try {
    if (typeof sessionStorage === 'undefined') return {}
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeStored(id: string, text: string | null) {
  try {
    if (typeof sessionStorage === 'undefined') return
    const stored = readStored()
    delete stored[id]
    if (text) stored[id] = text.slice(0, MAX_DRAFT_TEXT)
    const keys = Object.keys(stored)
    for (const k of keys.slice(
      0,
      Math.max(0, keys.length - MAX_STORED_DRAFTS),
    )) {
      delete stored[k]
    }
    if (Object.keys(stored).length === 0) {
      sessionStorage.removeItem(STORAGE_KEY)
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    }
  } catch {
    /* storage unavailable or full */
  }
}

export function loadDraft<TImage = unknown, TFile = unknown>(
  id: string,
): ChatDraft<TImage, TFile> {
  const mem = memory.get(id) as ChatDraft<TImage, TFile> | undefined
  if (mem) return mem
  const text = readStored()[id] ?? ''
  return { text, images: [], files: [] }
}

export function saveDraft<TImage, TFile>(
  id: string,
  draft: ChatDraft<TImage, TFile>,
) {
  if (!draft.text && draft.images.length === 0 && draft.files.length === 0) {
    clearDraft(id)
    return
  }
  memory.set(id, draft)
  writeStored(id, draft.text)
}

export function clearDraft(id: string) {
  memory.delete(id)
  writeStored(id, null)
}

/** Test helper: drop the in-memory map (sessionStorage is left as is). */
export function resetDraftMemory() {
  memory.clear()
}
