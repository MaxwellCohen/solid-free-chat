import {
  base64UrlToBytes,
  bytesToBase64Url,
  gunzipBytes,
  gzipBytes,
} from './chat-share'
import type { Files } from './dev-workspace'

const PREFIX = 'w1.'

/** Encodes workspace files as a gzip+base64url URL hash (`#w1.…`). */
export async function encodeWorkspace(files: Files): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(files))
  return `#${PREFIX}${bytesToBase64Url(await gzipBytes(bytes))}`
}

export async function decodeWorkspace(hash: string): Promise<Files | null> {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw.startsWith(PREFIX)) return null
  try {
    const json = await gunzipBytes(base64UrlToBytes(raw.slice(PREFIX.length)))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(json))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return null
    const files: Files = {}
    for (const [path, content] of Object.entries(parsed)) {
      if (typeof content !== 'string') return null
      files[path] = content
    }
    return Object.keys(files).length ? files : null
  } catch {
    return null
  }
}
