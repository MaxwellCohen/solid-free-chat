/**
 * Attachment payloads (base64 images/PDFs) are kept out of the localStorage
 * JSON: it stores `idb:<key>` references and the payloads live in IndexedDB.
 */

export const ATTACHMENT_REF_PREFIX = 'idb:'

export interface AttachmentBackend {
  getMany: (keys: string[]) => Promise<Map<string, string>>
  put: (key: string, value: string) => Promise<void>
  deleteMany: (keys: string[]) => Promise<void>
  keys: () => Promise<string[]>
}

export function isAttachmentRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ATTACHMENT_REF_PREFIX)
}

export function attachmentRef(key: string): string {
  return ATTACHMENT_REF_PREFIX + key
}

export function attachmentKeyFromRef(ref: string): string {
  return ref.slice(ATTACHMENT_REF_PREFIX.length)
}

/** cyrb53: fast, non-cryptographic 53-bit string hash. */
function cyrb53(str: string): number {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

const keyBySource = new WeakMap<object, string>()

/** Content-derived key; computed once per `source` object. */
export function attachmentKey(source: {
  value: string
  mimeType?: string
}): string {
  let key = keyBySource.get(source)
  if (key === undefined) {
    const { value } = source
    key = `${source.mimeType ?? ''}:${value.length}:${cyrb53(value).toString(36)}`
    keyBySource.set(source, key)
  }
  return key
}

/** Marks a restored source object so it is not hashed again. */
export function rememberAttachmentKey(source: object, key: string) {
  keyBySource.set(source, key)
}

/** Payloads this tab has loaded or written, by key. */
export const attachmentCache = new Map<string, string>()

const DB_NAME = 'solid-free-chat'
const STORE_NAME = 'attachments'
const OPEN_TIMEOUT_MS = 3000

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const result = work(tx.objectStore(STORE_NAME))
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function idbBackend(db: IDBDatabase): AttachmentBackend {
  db.onversionchange = () => db.close()
  return {
    getMany(keys) {
      const found = new Map<string, string>()
      return run(db, 'readonly', (store) => {
        for (const key of keys) {
          store.get(key).onsuccess = (event) => {
            const value = (event.target as IDBRequest).result as unknown
            if (typeof value === 'string') found.set(key, value)
          }
        }
        return found
      })
    },
    put(key, value) {
      return run(db, 'readwrite', (store) => void store.put(value, key))
    },
    deleteMany(keys) {
      return run(db, 'readwrite', (store) => {
        for (const key of keys) store.delete(key)
      })
    },
    async keys() {
      const request = await run(db, 'readonly', (store) => store.getAllKeys())
      return request.result.filter((k): k is string => typeof k === 'string')
    },
  }
}

/** Resolves null when IndexedDB is missing, blocked or fails to open. */
export function openAttachmentBackend(): Promise<AttachmentBackend | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    // Some private modes never settle `open`; don't hold up app startup.
    setTimeout(() => resolve(null), OPEN_TIMEOUT_MS)
    try {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME)
      }
      request.onsuccess = () => resolve(idbBackend(request.result))
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** In-memory backend (tests, fakes). */
export function createMemoryAttachmentBackend(): AttachmentBackend & {
  data: Map<string, string>
} {
  const data = new Map<string, string>()
  return {
    data,
    getMany: (keys) =>
      Promise.resolve(
        new Map(
          keys.flatMap((k) =>
            data.has(k) ? [[k, data.get(k)!] as const] : [],
          ),
        ),
      ),
    put: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
    deleteMany: (keys) => {
      for (const k of keys) data.delete(k)
      return Promise.resolve()
    },
    keys: () => Promise.resolve([...data.keys()]),
  }
}
