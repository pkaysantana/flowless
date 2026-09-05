/**
 * Minimal in-memory store. Deterministic: `reset()` always returns to the demo seed.
 *
 * Integration point: swap this for an API client or persistence layer without
 * touching the domain or UI.
 */
import { useSyncExternalStore } from 'react'
import {
  checkRequirements,
  resolveIssue,
  transition,
  type Issue,
  type Referral,
  type ReferralState,
} from '../domain'
import { loadDemoReferrals, requirementsFor } from '../data/demo'

type Listener = () => void

let referrals: Referral[] = loadDemoReferrals()
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l()
}

function update(id: string, fn: (r: Referral) => Referral) {
  const idx = referrals.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error(`Referral ${id} not found`)
  const next = fn(referrals[idx])
  referrals = referrals.map((r, i) => (i === idx ? next : r))
  emit()
  return next
}

export const referralStore = {
  getAll: () => referrals,
  getById: (id: string) => referrals.find((r) => r.id === id),

  reset() {
    referrals = loadDemoReferrals()
    emit()
  },

  /** Runs the deterministic requirements check and stores resulting issues. */
  runRequirementsCheck(id: string) {
    return update(id, (r) => ({ ...r, issues: checkRequirements(r, requirementsFor(r.specialty)) }))
  },

  transition(id: string, to: ReferralState, actor: string, note?: string) {
    return update(id, (r) => {
      let next = r
      if (to === 'REQUIREMENTS_CHECKED') {
        next = { ...next, issues: checkRequirements(next, requirementsFor(next.specialty)) }
      }
      next = transition(next, { to, actor, note })
      if (to === 'SUBMITTED') {
        next = {
          ...next,
          submission: {
            reference: `DEMO-${next.id}-${next.history.length}`,
            submittedAt: new Date().toISOString(),
            destination: 'Demo e-Referral endpoint (stub)',
          },
        }
      }
      return next
    })
  },

  resolveIssue(id: string, issue: Issue, actor: string, note: string) {
    return update(id, (r) => resolveIssue(r, issue, actor, note))
  },

  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export function useReferrals(): Referral[] {
  return useSyncExternalStore(referralStore.subscribe, referralStore.getAll, referralStore.getAll)
}
