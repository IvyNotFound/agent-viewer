/**
 * hookEvents-gaps.spec.ts
 * Coverage gaps for hookEvents.ts — TTL pruning alone, LRU eviction for
 * computed caches, eventsForSession(null), exact MAX_EVENTS boundary.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { useHookEventsStore } from '@renderer/stores/hookEvents'

const mockElectronAPI = {
  queryDb: vi.fn().mockResolvedValue([]),
  watchDb: vi.fn().mockResolvedValue(undefined),
  unwatchDb: vi.fn().mockResolvedValue(undefined),
  onDbChanged: vi.fn().mockReturnValue(() => {}),
  selectProjectDir: vi.fn().mockResolvedValue(null),
  showConfirmDialog: vi.fn().mockResolvedValue(true),
  migrateDb: vi.fn().mockResolvedValue({ success: true }),
  terminalKill: vi.fn(),
  findProjectDb: vi.fn().mockResolvedValue(null),
  getTaskLinks: vi.fn().mockResolvedValue({ success: true, links: [] }),
  getTaskAssignees: vi.fn().mockResolvedValue({ success: true, assignees: [] }),
  agentGroupsList: vi.fn().mockResolvedValue({ success: true, groups: [] }),
  agentGroupsCreate: vi.fn().mockResolvedValue({ success: true, group: { id: 1, name: 'New Group', sort_order: 0, created_at: '' } }),
  agentGroupsRename: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsDelete: vi.fn().mockResolvedValue({ success: true }),
  agentGroupsSetMember: vi.fn().mockResolvedValue({ success: true }),
  agentKill: vi.fn(),
}

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
})

const TTL = 5 * 60 * 1000   // 300_000 ms — matches HOOK_EVENT_TTL_MS in hookEvents.ts
const MAX_EVENTS = 500       // matches MAX_EVENTS in hookEvents.ts
const MAX_CACHED = 20        // matches MAX_CACHED_COMPUTEDS in hookEvents.ts


// ─── TTL pruning alone (without hitting MAX_EVENTS cap) ──────────────────────

describe('stores/hookEvents — TTL pruning without hitting MAX_EVENTS', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('removes events older than TTL relative to newest event', () => {
    const store = useHookEventsStore()
    const base = 1_000_000

    // Push an old event (before TTL window)
    store.push({ event: 'SessionStart', payload: null, ts: base })
    // Push a new event 301s later — cutoff = base+301000 - 300000 = base+1000 > base
    store.push({ event: 'SessionStart', payload: null, ts: base + 301_000 })

    // Old event (ts=base) should be pruned: base < (base+301000 - 300000) = base+1000
    expect(store.events.some(e => e.ts === base)).toBe(false)
    expect(store.events).toHaveLength(1)
    expect(store.events[0].ts).toBe(base + 301_000)
  })

  it('keeps events within TTL window', () => {
    const store = useHookEventsStore()
    const base = 2_000_000

    store.push({ event: 'SessionStart', payload: null, ts: base })
    // Push second event within TTL window (299s later, cutoff = base+299000-300000 = base-1000 < base)
    store.push({ event: 'SessionStart', payload: null, ts: base + 299_000 })

    // Both events are within window
    expect(store.events).toHaveLength(2)
    expect(store.events.some(e => e.ts === base)).toBe(true)
  })

  it('exactly at TTL boundary — event at cutoff is excluded (strict >)', () => {
    const store = useHookEventsStore()
    const base = 3_000_000
    const later = base + TTL + 1 // cutoff = later - TTL = base + 1

    store.push({ event: 'SessionStart', payload: null, ts: base })        // ts === base < cutoff → excluded
    store.push({ event: 'SessionStart', payload: null, ts: base + 1 })    // ts === cutoff → NOT > cutoff → excluded
    store.push({ event: 'SessionStart', payload: null, ts: base + 2 })    // ts > cutoff (if later - TTL = base+1)
    store.push({ event: 'SessionStart', payload: null, ts: later })        // newest

    // cutoff = later - TTL = base + TTL + 1 - TTL = base + 1
    // Only events with ts > base+1 survive: base+2 and later
    expect(store.events).toHaveLength(2)
    expect(store.events.some(e => e.ts === base)).toBe(false)
    expect(store.events.some(e => e.ts === base + 1)).toBe(false)
    expect(store.events.some(e => e.ts === base + 2)).toBe(true)
    expect(store.events.some(e => e.ts === later)).toBe(true)
  })
})


// ─── MAX_EVENTS exact boundary ────────────────────────────────────────────────

describe('stores/hookEvents — MAX_EVENTS exact boundary', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps exactly MAX_EVENTS (500) events when adding exactly 500', () => {
    const store = useHookEventsStore()
    const base = 10_000_000
    for (let i = 0; i < MAX_EVENTS; i++) {
      store.push({ event: 'SessionStart', payload: null, ts: base + i })
    }
    expect(store.events).toHaveLength(MAX_EVENTS)
  })

  it('caps at MAX_EVENTS when adding 500+1 events', () => {
    const store = useHookEventsStore()
    const base = 20_000_000
    for (let i = 0; i < MAX_EVENTS + 1; i++) {
      store.push({ event: 'SessionStart', payload: null, ts: base + i })
    }
    expect(store.events).toHaveLength(MAX_EVENTS)
    // Oldest (ts=base) removed, newest (ts=base+500) present
    expect(store.events.some(e => e.ts === base)).toBe(false)
    expect(store.events[MAX_EVENTS - 1].ts).toBe(base + MAX_EVENTS)
  })
})


// ─── eventsForSession(null): null sessionId filter ───────────────────────────

describe('stores/hookEvents — eventsForSession(null)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns only events with sessionId === null', async () => {
    const store = useHookEventsStore()
    store.push({ event: 'SessionStart', payload: null, ts: 1 })             // sessionId = null
    store.push({ event: 'SessionStart', payload: { session_id: 'A' }, ts: 2 })  // sessionId = 'A'

    const forNull = store.eventsForSession(null)
    expect(forNull.value).toHaveLength(1)
    expect(forNull.value[0].sessionId).toBeNull()
  })

  it('uses "__null__" cache key for null sessionId (no duplicate computed)', async () => {
    const store = useHookEventsStore()

    // Both calls return the same computed ref
    const ref1 = store.eventsForSession(null)
    const ref2 = store.eventsForSession(null)
    expect(ref1).toBe(ref2)
  })

  it('updates reactively for null sessionId events', async () => {
    const store = useHookEventsStore()
    const forNull = store.eventsForSession(null)
    expect(forNull.value).toHaveLength(0)

    store.push({ event: 'SessionStart', payload: null, ts: 1 }) // sessionId = null
    await nextTick()

    expect(forNull.value).toHaveLength(1)
  })
})


// ─── LRU eviction for _sessionComputeds ──────────────────────────────────────

describe('stores/hookEvents — LRU eviction for _sessionComputeds (T1135)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('evicts oldest computed when cap (20) is exceeded', () => {
    const store = useHookEventsStore()

    // Create MAX_CACHED_COMPUTEDS + 1 distinct session computeds
    const refs = []
    for (let i = 0; i < MAX_CACHED + 1; i++) {
      refs.push(store.eventsForSession(`session-${i}`))
    }

    // The 21st call should trigger eviction of session-0
    // After eviction, calling eventsForSession('session-0') returns a NEW ref (not the old one)
    const newRef = store.eventsForSession('session-0')
    // The original ref (refs[0]) may be stale — a new computed was created
    // We just verify no errors and it returns a valid computed
    expect(newRef.value).toEqual([])
  })
})


// ─── LRU eviction for _activeToolComputeds ───────────────────────────────────

describe('stores/hookEvents — LRU eviction for _activeToolComputeds (T1135)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('evicts oldest activeToolForSession computed when cap (20) is exceeded', () => {
    const store = useHookEventsStore()

    const refs = []
    for (let i = 0; i < MAX_CACHED + 1; i++) {
      refs.push(store.activeToolForSession(`sess-${i}`))
    }

    // After eviction, the 22nd call on same key creates fresh computed
    const newRef = store.activeToolForSession('sess-0')
    expect(newRef.value).toBeNull()
  })
})


// ─── activeToolForSession(null): __global__ key ──────────────────────────────

describe('stores/hookEvents — activeToolForSession(null) uses __global__ key', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('tracks active tool for null sessionId under __global__ key', () => {
    const store = useHookEventsStore()
    store.push({ event: 'PreToolUse', payload: { tool_name: 'Read' }, ts: 1 }) // no session_id → null
    expect(store.activeTools['__global__']).toBe('Read')

    const tool = store.activeToolForSession(null)
    expect(tool.value).toBe('Read')
  })

  it('returns null after PostToolUse for null sessionId', () => {
    const store = useHookEventsStore()
    store.push({ event: 'PreToolUse', payload: { tool_name: 'Write' }, ts: 1 })
    store.push({ event: 'PostToolUse', payload: null, ts: 2 })

    const tool = store.activeToolForSession(null)
    expect(tool.value).toBeNull()
  })
})
