import {
  createBackup,
  isBackupFile,
  isEncryptedBackup,
  restoreBackup,
} from '../../lib/chat-backup'
import {
  MAX_IMPORT_BYTES,
  mergeImportedChats,
  parseChatImport,
} from '../../lib/chat-export'
import type { ChatAppState } from '../../store/chat.store'
import { chatStore } from '../../store/chat.store'

export function downloadTextFile(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportAllChats() {
  const passphrase =
    window.prompt(
      'Optional passphrase to encrypt the backup (leave blank for none):',
    ) || undefined
  downloadTextFile(
    'solid-free-chat-backup.json',
    await createBackup(chatStore.state, passphrase),
    'application/json',
  )
}

/** Imports a plain chat export or (encrypted) backup, merging into the store. */
export async function importChatsFromFile(
  file: File,
  onImported: () => void,
): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) return 'File is too large.'
  const text = await file.text()
  let incoming: ChatAppState
  if (isBackupFile(text)) {
    try {
      const passphrase = isEncryptedBackup(text)
        ? (window.prompt('Backup passphrase:') ?? undefined)
        : undefined
      incoming = await restoreBackup(text, passphrase)
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not read backup.'
    }
  } else {
    const result = parseChatImport(text)
    if (!result.ok) return result.error
    incoming = result.state
  }
  const { state, addedIds } = mergeImportedChats(chatStore.state, incoming)
  chatStore.setState(() => state)
  onImported()
  return `Imported ${addedIds.length} chat${addedIds.length === 1 ? '' : 's'}.`
}
