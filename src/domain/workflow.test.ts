import { describe, expect, it } from 'vitest'
import { loadDemoReferrals, requirementsFor } from '../data/demo'
import { checkRequirements, resolveIssue } from './requirements'
import { requirementsOutcome, transition, TransitionError } from './workflow'
import type { Referral } from './types'

const now = () => '2026-01-01T00:00:00.000Z'

function golden(): Referral {
  return loadDemoReferrals().find((r) => r.id === 'REF-DEMO-001')!
}
function incomplete(): Referral {
  return loadDemoReferrals().find((r) => r.id === 'REF-DEMO-002')!
}

describe('golden-path referral', () => {
  it('walks the full workflow when a human performs judgement steps', () => {
    let r = golden()
    r = transition(r, { to: 'INFORMATION_ASSEMBLED', actor: 'system', now })
    r = { ...r, issues: checkRequirements(r, requirementsFor(r.specialty)) }
    expect(r.issues).toEqual([])
    r = transition(r, { to: 'REQUIREMENTS_CHECKED', actor: 'system', now })
    expect(requirementsOutcome(r)).toBe('READY_FOR_REVIEW')
    r = transition(r, { to: 'READY_FOR_REVIEW', actor: 'system', now })
    r = transition(r, { to: 'CLINICIAN_APPROVED', actor: 'Dr Demo', now })
    r = transition(r, { to: 'SUBMITTED', actor: 'Admin Demo', now })
    r = transition(r, { to: 'TRACKING', actor: 'system', now })
    expect(r.state).toBe('TRACKING')
    expect(r.history).toHaveLength(7)
  })

  it('never lets the system approve on behalf of a clinician', () => {
    let r = golden()
    r = transition(r, { to: 'INFORMATION_ASSEMBLED', actor: 'system', now })
    r = transition(r, { to: 'REQUIREMENTS_CHECKED', actor: 'system', now })
    r = transition(r, { to: 'READY_FOR_REVIEW', actor: 'system', now })
    expect(() => transition(r, { to: 'CLINICIAN_APPROVED', actor: 'system', now })).toThrowError(
      expect.objectContaining({ code: 'HUMAN_REQUIRED' }),
    )
  })

  it('rejects transitions that skip states', () => {
    expect(() => transition(golden(), { to: 'SUBMITTED', actor: 'Dr Demo', now })).toThrow(TransitionError)
  })
})

describe('incomplete / uncertain referral', () => {
  it('surfaces missing, conflicting and uncertain information as explicit issues', () => {
    const r = incomplete()
    const issues = checkRequirements(r, requirementsFor(r.specialty))
    const kinds = issues.map((i) => `${i.kind}:${i.field}`)
    expect(kinds).toEqual(
      expect.arrayContaining([
        'MISSING_REQUIRED:patient.nhsNumber',
        'MISSING_REQUIRED:clinical.allergies',
        'MISSING_REQUIRED:clinical.urgency',
        'UNCERTAIN_EXTRACTION:patient.dateOfBirth',
        'CONFLICTING:clinical.medications',
      ]),
    )
    // No values were invented.
    expect(r.patient.nhsNumber.value).toBeNull()
    expect(r.clinical.urgency.value).toBeNull()
  })

  it('routes to NEEDS_HUMAN_REVIEW and blocks review until issues are resolved by a human', () => {
    let r = incomplete()
    r = transition(r, { to: 'INFORMATION_ASSEMBLED', actor: 'system', now })
    r = { ...r, issues: checkRequirements(r, requirementsFor(r.specialty)) }
    r = transition(r, { to: 'REQUIREMENTS_CHECKED', actor: 'system', now })

    expect(() => transition(r, { to: 'READY_FOR_REVIEW', actor: 'system', now })).toThrowError(
      expect.objectContaining({ code: 'BLOCKED_BY_ISSUES' }),
    )
    r = transition(r, { to: 'NEEDS_HUMAN_REVIEW', actor: 'system', now })
    expect(() => transition(r, { to: 'READY_FOR_REVIEW', actor: 'Admin Demo', now })).toThrowError(
      expect.objectContaining({ code: 'BLOCKED_BY_ISSUES' }),
    )

    expect(() => resolveIssue(r, r.issues[0], 'system', 'auto')).toThrow()
    for (const issue of [...r.issues]) r = resolveIssue(r, issue, 'Admin Demo', 'Confirmed with GP practice')
    expect(r.issues).toEqual([])

    r = transition(r, { to: 'READY_FOR_REVIEW', actor: 'Admin Demo', now })
    expect(r.state).toBe('READY_FOR_REVIEW')
  })
})

describe('demo data', () => {
  it('is deterministic and reset-safe', () => {
    const a = loadDemoReferrals()
    a[0].state = 'TRACKING'
    const b = loadDemoReferrals()
    expect(b[0].state).toBe('REFERRAL_DECIDED')
    expect(b).toHaveLength(2)
  })
})
