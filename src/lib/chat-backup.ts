import type { ChatAppState } from '../store/chat.store'
import { normalizeChatAppState } from '../store/chat.store'

const MAGIC = 'solid-free-chat-backup'
const ITERATIONS = 250_000

interface BackupFile {
  magic: typeof MAGIC
  version: 1
  /** Present when encrypted; `data` is then base64 ciphertext. */
  encrypted: boolean
  salt?: string
  iv?: string
  data: string
}

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Serializes state to a backup file body; encrypts with AES-GCM when a passphrase is given. */
export async function createBackup(
  state: ChatAppState,
  passphrase?: string,
): Promise<string> {
  const json = JSON.stringify(state)
  if (!passphrase) {
    const file: BackupFile = {
      magic: MAGIC,
      version: 1,
      encrypted: false,
      data: json,
    }
    return JSON.stringify(file)
  }
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
  const key = await deriveKey(passphrase, salt)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(json),
  )
  const file: BackupFile = {
    magic: MAGIC,
    version: 1,
    encrypted: true,
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(new Uint8Array(cipher)),
  }
  return JSON.stringify(file)
}

export function isBackupFile(text: string): boolean {
  try {
    return (JSON.parse(text) as Partial<BackupFile>).magic === MAGIC
  } catch {
    return false
  }
}

export function isEncryptedBackup(text: string): boolean {
  try {
    const f = JSON.parse(text) as Partial<BackupFile>
    return f.magic === MAGIC && f.encrypted === true
  } catch {
    return false
  }
}

/** Throws a user-readable Error for bad files or wrong passphrases. */
export async function restoreBackup(
  text: string,
  passphrase?: string,
): Promise<ChatAppState> {
  let file: Partial<BackupFile>
  try {
    file = JSON.parse(text) as Partial<BackupFile>
  } catch {
    throw new Error('Not a valid backup file.')
  }
  if (file.magic !== MAGIC || typeof file.data !== 'string') {
    throw new Error('Not a valid backup file.')
  }
  let json = file.data
  if (file.encrypted) {
    if (!passphrase)
      throw new Error('This backup is encrypted; a passphrase is required.')
    if (!file.salt || !file.iv) throw new Error('Backup file is corrupted.')
    try {
      const key = await deriveKey(passphrase, fromB64(file.salt))
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(file.iv) },
        key,
        fromB64(file.data),
      )
      json = new TextDecoder().decode(plain)
    } catch {
      throw new Error('Wrong passphrase or corrupted backup.')
    }
  }
  const state = normalizeChatAppState(JSON.parse(json))
  if (!state) throw new Error('Backup contents are not recognised.')
  return state
}
