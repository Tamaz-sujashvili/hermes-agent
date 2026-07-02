import { atom, computed } from 'nanostores'

import { $activeSessionId } from './session'

// Per-session flag while auto-compaction runs mid-turn. Without it the
// transcript looks like it reset; per-session so a background chat can't
// clobber the foreground view.
const keyFor = (sessionId: string | null | undefined): string => sessionId ?? ''

export const $compactingSessions = atom<Record<string, true>>({})

// Track when each session entered compaction so we can recover if the backend
// never emits the clearing event (e.g. the slash_worker is killed or the
// compression LLM call hangs). This matches the backend compression lock TTL of
// 300s and prevents the "Summarizing thread" overlay from sticking forever.
const $compactingSince = atom<Record<string, number>>({})

// Safety net: auto-clear the compaction flag if the backend never confirms the
// end of compaction. Must be >= the backend compression lock TTL so we don't
// prematurely hide a real, slow compaction.
const COMPACTION_STUCK_TIMEOUT_MS = 5 * 60 * 1000

export function clearStuckCompactionFlags(): void {
  const sessions = $compactingSessions.get()
  const since = $compactingSince.get()
  const now = Date.now()
  const nextSessions: Record<string, true> = {}
  const nextSince: Record<string, number> = {}
  let changed = false

  for (const key of Object.keys(sessions)) {
    const startedAt = since[key]

    if (startedAt && now - startedAt > COMPACTION_STUCK_TIMEOUT_MS) {
      changed = true
      continue
    }

    nextSessions[key] = true
    if (startedAt) {
      nextSince[key] = startedAt
    }
  }

  if (changed) {
    $compactingSessions.set(nextSessions)
    $compactingSince.set(nextSince)
  }
}

// Poll once per minute — cheap, module-level, and avoids side effects inside
// the computed derived atom.
if (typeof window !== 'undefined') {
  window.setInterval(clearStuckCompactionFlags, 60_000)
}

export const $compactionActive = computed(
  [$compactingSessions, $activeSessionId],
  (sessions, activeId) => keyFor(activeId) in sessions
)

export function setSessionCompacting(sessionId: string | null | undefined, active: boolean): void {
  const key = keyFor(sessionId)
  const sessions = $compactingSessions.get()
  const since = $compactingSince.get()

  if (active) {
    if (key in sessions) {
      return
    }

    $compactingSessions.set({ ...sessions, [key]: true })
    $compactingSince.set({ ...since, [key]: Date.now() })

    return
  }

  if (!(key in sessions)) {
    return
  }

  const nextSessions = { ...sessions }
  delete nextSessions[key]
  $compactingSessions.set(nextSessions)

  const nextSince = { ...since }
  delete nextSince[key]
  $compactingSince.set(nextSince)
}
