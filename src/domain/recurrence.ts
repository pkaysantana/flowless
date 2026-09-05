import type { MonitoringPlan, MonitoringRequest } from './types'

/**
 * Deterministic opaque token: stable for (planId, sequence) so demo data and QR codes are reproducible.
 * Carries no meaning — a real deployment would use a random, server-issued token.
 */
export function demoToken(planId: string, sequence: number): string {
  const input = `${planId}#${sequence}`
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < input.length; i++) {
    h1 = Math.imul(h1 ^ input.charCodeAt(i), 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ input.charCodeAt(i), 0x811c9dc5) >>> 0
  }
  return `tok_${h1.toString(36)}${h2.toString(36)}`
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

/** Build request #`sequence` of a plan. Returns null when it would start after the recurrence end. */
export function requestFromPlan(plan: MonitoringPlan, sequence: number): MonitoringRequest | null {
  const offsetDays = plan.recurrence ? (sequence - 1) * plan.recurrence.intervalDays : 0
  if (sequence > 1 && !plan.recurrence) return null
  const validFrom = addDays(plan.startsAt, offsetDays)
  if (plan.recurrence && validFrom > plan.recurrence.endsAt) return null
  return {
    id: `${plan.id}-R${String(sequence).padStart(2, '0')}`,
    token: demoToken(plan.id, sequence),
    planId: plan.id,
    sequence,
    patientRef: plan.patientRef,
    demographics: plan.demographics,
    tests: plan.tests,
    requestingClinician: plan.requestingClinician,
    requestingOrganisation: plan.requestingOrganisation,
    routing: plan.routing,
    validFrom,
    expiresAt: addDays(validFrom, plan.validityDays),
    recurrence: plan.recurrence,
    reasonableAdjustments: plan.reasonableAdjustments,
    status: 'ACTIVE',
    history: [{ at: validFrom, actor: 'system', to: 'ACTIVE', note: `Created from plan ${plan.id} (#${sequence})` }],
  }
}

/**
 * The next request a recurring plan should have, given those already created.
 * Returns null for non-recurring plans or once the end date is reached.
 */
export function nextScheduledRequest(plan: MonitoringPlan, existing: MonitoringRequest[]): MonitoringRequest | null {
  if (!plan.recurrence) return null
  const maxSeq = existing.filter((r) => r.planId === plan.id).reduce((m, r) => Math.max(m, r.sequence), 0)
  return requestFromPlan(plan, maxSeq + 1)
}
