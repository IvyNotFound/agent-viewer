/**
 * agents-default.spec.ts — Targeted StringLiteral mutation kill tests
 *
 * Verifies that DEFAULT_AGENTS_GLOBAL and DEFAULT_AGENTS_SCOPED contain
 * the expected agent entries with correct name, type, and scope values.
 * This kills uncovered StringLiteral mutants in agents-default.ts and
 * agents-default-scoped.ts.
 *
 * Framework: Vitest (node environment)
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_AGENTS_GLOBAL } from './agents-default'
import { DEFAULT_AGENTS_SCOPED } from './agents-default-scoped'

type Agent = { name: string; type: string; scope: string | null }

function findAgent(agents: Agent[], name: string): Agent | undefined {
  return agents.find(a => a.name === name)
}

// ── DEFAULT_AGENTS_GLOBAL (agents-default.ts) ──────────────────────────────────

describe('DEFAULT_AGENTS_GLOBAL — agent names, types, scopes', () => {
  it('contains 9 agents', () => {
    expect(DEFAULT_AGENTS_GLOBAL).toHaveLength(9)
  })

  it('setup: name=setup, type=setup, scope=null', () => {
    const agent = findAgent(DEFAULT_AGENTS_GLOBAL, 'setup')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('setup')
    expect(agent!.type).toBe('setup')
    expect(agent!.scope).toBeNull()
  })

  it('dev-front-vuejs: name=dev-front-vuejs, type=dev, scope=front-vuejs', () => {
    const agent = findAgent(DEFAULT_AGENTS_GLOBAL, 'dev-front-vuejs')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('dev-front-vuejs')
    expect(agent!.type).toBe('dev')
    expect(agent!.scope).toBe('front-vuejs')
  })

  it('dev-back-electron: name=dev-back-electron, type=dev, scope=back-electron', () => {
    const agent = findAgent(DEFAULT_AGENTS_GLOBAL, 'dev-back-electron')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('dev-back-electron')
    expect(agent!.type).toBe('dev')
    expect(agent!.scope).toBe('back-electron')
  })

  it('review: name=review, type=review, scope=global', () => {
    const agent = findAgent(DEFAULT_AGENTS_GLOBAL, 'review')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('review')
    expect(agent!.type).toBe('review')
    expect(agent!.scope).toBe('global')
  })

  it('devops: name=devops, type=devops, scope=global', () => {
    const agent = findAgent(DEFAULT_AGENTS_GLOBAL, 'devops')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('devops')
    expect(agent!.type).toBe('devops')
    expect(agent!.scope).toBe('global')
  })

  it('review-master: name=review-master, type=review, scope=global', () => {
    const agent = findAgent(DEFAULT_AGENTS_GLOBAL, 'review-master')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('review-master')
    expect(agent!.type).toBe('review')
    expect(agent!.scope).toBe('global')
  })

  it('ux-front-vuejs: name=ux-front-vuejs, type=ux, scope=front-vuejs', () => {
    const agent = findAgent(DEFAULT_AGENTS_GLOBAL, 'ux-front-vuejs')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('ux-front-vuejs')
    expect(agent!.type).toBe('ux')
    expect(agent!.scope).toBe('front-vuejs')
  })

  it('arch: name=arch, type=arch, scope=global', () => {
    const agent = findAgent(DEFAULT_AGENTS_GLOBAL, 'arch')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('arch')
    expect(agent!.type).toBe('arch')
    expect(agent!.scope).toBe('global')
  })

  it('doc: name=doc, type=doc, scope=global', () => {
    const agent = findAgent(DEFAULT_AGENTS_GLOBAL, 'doc')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('doc')
    expect(agent!.type).toBe('doc')
    expect(agent!.scope).toBe('global')
  })

  it('all agents have non-empty system_prompt', () => {
    DEFAULT_AGENTS_GLOBAL.forEach(agent => {
      expect(agent.system_prompt).toBeTruthy()
      expect(agent.system_prompt.length).toBeGreaterThan(0)
    })
  })
})

// ── DEFAULT_AGENTS_SCOPED (agents-default-scoped.ts) ──────────────────────────

describe('DEFAULT_AGENTS_SCOPED — agent names, types, scopes', () => {
  it('contains 6 agents', () => {
    expect(DEFAULT_AGENTS_SCOPED).toHaveLength(6)
  })

  it('secu: name=secu, type=secu, scope=global', () => {
    const agent = findAgent(DEFAULT_AGENTS_SCOPED, 'secu')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('secu')
    expect(agent!.type).toBe('secu')
    expect(agent!.scope).toBe('global')
  })

  it('perf: name=perf, type=perf, scope=global', () => {
    const agent = findAgent(DEFAULT_AGENTS_SCOPED, 'perf')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('perf')
    expect(agent!.type).toBe('perf')
    expect(agent!.scope).toBe('global')
  })

  it('test: name=test, type=test, scope=global', () => {
    const agent = findAgent(DEFAULT_AGENTS_SCOPED, 'test')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('test')
    expect(agent!.type).toBe('test')
    expect(agent!.scope).toBe('global')
  })

  it('data: name=data, type=data, scope=global', () => {
    const agent = findAgent(DEFAULT_AGENTS_SCOPED, 'data')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('data')
    expect(agent!.type).toBe('data')
    expect(agent!.scope).toBe('global')
  })

  it('test-front-vuejs: name=test-front-vuejs, type=test, scope=front-vuejs', () => {
    const agent = findAgent(DEFAULT_AGENTS_SCOPED, 'test-front-vuejs')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('test-front-vuejs')
    expect(agent!.type).toBe('test')
    expect(agent!.scope).toBe('front-vuejs')
  })

  it('test-back-electron: name=test-back-electron, type=test, scope=back-electron', () => {
    const agent = findAgent(DEFAULT_AGENTS_SCOPED, 'test-back-electron')
    expect(agent).toBeDefined()
    expect(agent!.name).toBe('test-back-electron')
    expect(agent!.type).toBe('test')
    expect(agent!.scope).toBe('back-electron')
  })

  it('all agents have non-empty system_prompt', () => {
    DEFAULT_AGENTS_SCOPED.forEach(agent => {
      expect(agent.system_prompt).toBeTruthy()
    })
  })
})
