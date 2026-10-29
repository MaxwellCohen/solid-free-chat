import { beforeEach, describe, expect, it } from 'vitest'
import type { Tool } from '@tanstack/ai'
import { chatActions, chatStore, createConversationSkillsApi } from '../../store/chat.store'
import { createEnabledTools } from './tools'

function skillTools(conversationId: string) {
  const tools = createEnabledTools(['skills'], {
    skills: createConversationSkillsApi(conversationId),
    history: { list: () => [] },
  })
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  return (name: string, input: unknown = {}) => {
    const tool = byName.get(name) as Tool | undefined
    if (!tool?.execute) throw new Error(`missing tool ${name}`)
    return tool.execute(input as never, undefined as never)
  }
}

describe('skill tools', () => {
  let conversationId: string

  beforeEach(() => {
    chatActions.resetToEmpty()
    chatActions.ensureDefaultConversation()
    conversationId = chatStore.state.currentConversationId!
  })

  it('exposes list, create, update, and attach tools under one menu entry', () => {
    const names = createEnabledTools(['skills'], {
      skills: createConversationSkillsApi(conversationId),
      history: { list: () => [] },
    }).map((tool) => tool.name)
    expect(names).toEqual([
      'list_skills',
      'create_skill',
      'update_skill',
      'set_skill_attached',
    ])
  })

  it('creates a skill and attaches it to the current chat by default', async () => {
    const run = skillTools(conversationId)
    const created = (await run('create_skill', {
      name: 'Terse',
      instructions: 'Answer in one sentence.',
    })) as { ok: boolean; skill_id: string; attached: boolean }

    expect(created).toMatchObject({ ok: true, attached: true })
    expect(chatStore.state.skills[0]).toMatchObject({
      id: created.skill_id,
      name: 'Terse',
      instructions: 'Answer in one sentence.',
    })
    expect(chatStore.state.conversationsById[conversationId].skillIds).toEqual([
      created.skill_id,
    ])
    expect(await run('list_skills')).toEqual({
      skills: [
        {
          id: created.skill_id,
          name: 'Terse',
          instructions: 'Answer in one sentence.',
          attached: true,
        },
      ],
    })
  })

  it('can create without attaching, then attach, detach, and update', async () => {
    const run = skillTools(conversationId)
    const { skill_id } = (await run('create_skill', {
      name: 'Pirate',
      instructions: 'Talk like a pirate.',
      attach: false,
    })) as { skill_id: string }
    const attachedIds = () =>
      chatStore.state.conversationsById[conversationId].skillIds

    expect(attachedIds()).toEqual([])
    await run('set_skill_attached', { skill_id, attached: true })
    await run('set_skill_attached', { skill_id, attached: true })
    expect(attachedIds()).toEqual([skill_id])
    await run('set_skill_attached', { skill_id, attached: false })
    expect(attachedIds()).toEqual([])

    expect(await run('update_skill', { skill_id, name: 'Captain' })).toEqual({ ok: true })
    expect(chatStore.state.skills[0].name).toBe('Captain')
  })

  it('reports errors for empty input and unknown ids', async () => {
    const run = skillTools(conversationId)
    expect(await run('create_skill', { name: ' ', instructions: 'x' })).toMatchObject({
      ok: false,
    })
    expect(
      await run('set_skill_attached', { skill_id: 'nope', attached: true }),
    ).toMatchObject({ ok: false })
    expect(await run('update_skill', { skill_id: 'nope', name: 'x' })).toMatchObject({
      ok: false,
    })
    expect(chatStore.state.skills).toEqual([])
  })
})
