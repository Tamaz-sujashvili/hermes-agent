import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $activeSessionId } from './session'
import { $compactionActive, clearStuckCompactionFlags, setSessionCompacting } from './compaction'

const SID = 'sess-20260630_204016_d36a01'

describe('compaction store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    $activeSessionId.set(null)
    setSessionCompacting(SID, false)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    $activeSessionId.set(null)
  })

  it('starts active when the active session is compacting', () => {
    $activeSessionId.set(SID)
    setSessionCompacting(SID, true)

    expect($compactionActive.get()).toBe(true)
  })

  it('clears when setSessionCompacting is called with false', () => {
    $activeSessionId.set(SID)
    setSessionCompacting(SID, true)
    setSessionCompacting(SID, false)

    expect($compactionActive.get()).toBe(false)
  })

  it('is false for a different active session', () => {
    setSessionCompacting(SID, true)
    $activeSessionId.set('other-session')

    expect($compactionActive.get()).toBe(false)
  })

  it('auto-clears stuck compaction flags after the timeout', () => {
    $activeSessionId.set(SID)
    setSessionCompacting(SID, true)

    expect($compactionActive.get()).toBe(true)

    // Just before the timeout the flag should still be active.
    vi.advanceTimersByTime(5 * 60 * 1000 - 1)
    clearStuckCompactionFlags()
    expect($compactionActive.get()).toBe(true)

    // Advance past the timeout window and run the explicit recovery sweep.
    vi.advanceTimersByTime(2)
    clearStuckCompactionFlags()
    expect($compactionActive.get()).toBe(false)
  })

  it('does not auto-clear a recently started compaction', () => {
    $activeSessionId.set(SID)
    setSessionCompacting(SID, true)

    vi.advanceTimersByTime(60_000)

    expect($compactionActive.get()).toBe(true)
  })
})
