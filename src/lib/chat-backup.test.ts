import { describe, expect, it } from 'vitest'
import { chatActions, chatStore } from '../store/chat.store'
import { createBackup, isEncryptedBackup, restoreBackup } from './chat-backup'

describe('chat backup', () => {
  chatActions.resetToEmpty()
  chatActions.ensureDefaultConversation()
  const state = chatStore.state

  it('round-trips plain backups', async () => {
    const text = await createBackup(state)
    expect(isEncryptedBackup(text)).toBe(false)
    expect((await restoreBackup(text)).conversationOrder).toEqual(
      state.conversationOrder,
    )
  })

  it('round-trips encrypted backups and rejects wrong passphrases', async () => {
    const text = await createBackup(state, 'hunter2')
    expect(isEncryptedBackup(text)).toBe(true)
    expect((await restoreBackup(text, 'hunter2')).conversationOrder).toEqual(
      state.conversationOrder,
    )
    await expect(restoreBackup(text, 'nope')).rejects.toThrow(/passphrase/i)
    await expect(restoreBackup(text)).rejects.toThrow(/passphrase/i)
  })

  it('rejects junk', async () => {
    await expect(restoreBackup('{"a":1}')).rejects.toThrow(/valid backup/)
  })
})
