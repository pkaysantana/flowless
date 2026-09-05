/**
 * Minimal in-memory store. Deterministic: `reset()` always returns to the demo seed.
 *
 * Integration point: swap this for an API client or persistence layer without
 * touching the domain or UI.
 */
import { useSyncExternalStore } from 'react'
import {
  checkRequirements,
  generatePathwayOptions,
  resolveIssue,
  selectPathway,
  transition,
  type CaseState,
  type Issue,
  type PathwayKind,
  type Referral,
} from '../domain'
import { DEMO_GUIDANCE, loadDemoReferrals, requirementsFor } from '../data/demo'

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

function runPreflight(r: Referral): Referral {
  const service = r.pathway?.service
  if (!service) throw new Error('Pre-flight requires a selected receiving service')
  return { ...r, issues: checkRequirements(r, requirementsFor(service)) }
}

export const referralStore = {
  getAll: () => referrals,
  getById: (id: string) => referrals.find((r) => r.id === id),

  reset() {
    referrals = loadDemoReferrals()
    emit()
  },

  transition(id: string, to: CaseState, actor: string, note?: string) {
    return update(id, (r) => {
      let next = r
      if (to === 'PATHWAY_OPTIONS_GENERATED') {
        next = { ...next, pathwayOptions: generatePathwayOptions(next, DEMO_GUIDANCE) }
      }
      if (to === 'REFERRAL_REQUIREMENTS_CHECKED') {
        next = runPreflight(next)
      }
      return transition(next, { to, actor, note })
    })
  },

  /** Clinician records a pathway decision, then the case moves to PATHWAY_SELECTED. */
  selectPathway(id: string, kind: PathwayKind, service: string | undefined, actor: string, note: string) {
    return update(id, (r) => {
      const withDecision = selectPathway(r, { kind, service, actor, note })
      return transition(withDecision, { to: 'PATHWAY_SELECTED', actor, note: undefined })
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
