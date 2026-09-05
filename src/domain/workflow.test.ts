import { describe, expect, it } from 'vitest'
import { DEMO_GUIDANCE, loadDemoReferrals, requirementsFor } from '../data/demo'
import { generatePathwayOptions, selectPathway } from './pathways'
import { checkRequirements, resolveIssue } from './requirements'
import { nextSteps, pathwayBranch, requirementsOutcome, transition, TransitionError } from './workflow'
import type { Referral } from './types'

const now = () => '2026-01-01T00:00:00.000Z'
const DR = 'Dr Demo'

function golden(): Referral {
  return loadDemoReferrals().find((r) => r.id === 'CASE-DEMO-001')!
}
function incomplete(): Referral {
  return loadDemoReferrals().find((r) => r.id === 'CASE-DEMO-002')!
}

/** Shared prefix: open case → options → clinician review. */
function toReview(r: Referral): Referral {
  r = { ...r, pathwayOptions: generatePathwayOptions(r, DEMO_GUIDANCE) }
  r = transition(r, { to: 'PATHWAY_OPTIONS_GENERATED', actor: 'system', now })
  return transition(r, { to: 'CLINICIAN_PATHWAY_REVIEW', actor: DR, now })
}

describe('pathway support', () => {
  it('generates options from configurable guidance without choosing', () => {
    const r = golden()
    const options = generatePathwayOptions(r, DEMO_GUIDANCE)
    expect(options.map((o) => o.kind)).toEqual(['SECONDARY_CARE_REFERRAL', 'ADVICE_AND_GUIDANCE'])
    expect(options[0].guidanceId).toBe('LOCAL-CARD-001')
    expect(r.pathway).toBeUndefined()
  })

  it('cannot reach PATHWAY_SELECTED without an explicit clinician decision', () => {
    const r = toReview(golden())
    expect(() => transition(r, { to: 'PATHWAY_SELECTED', actor: DR, now })).toThrowError(
      expect.objectContaining({ code: 'PATHWAY_NOT_SELECTED' }),
    )
    expect(() => selectPathway(r, { kind: 'MANAGE_IN_PRIMARY_CARE', actor: 'system', note: '', now })).toThrow()
  })

  it('records an override with a mandatory note and routes to the non-referral branch', () => {
    let r = toReview(golden())
    expect(() => selectPathway(r, { kind: 'MANAGE_IN_PRIMARY_CARE', actor: DR, note: '', now })).toThrow()
    r = selectPathway(r, { kind: 'MANAGE_IN_PRIMARY_CARE', actor: DR, note: 'Patient prefers watchful waiting', now })
    expect(r.pathway?.override).toBe(true)
    r = transition(r, { to: 'PATHWAY_SELECTED', actor: DR, now })
    expect(pathwayBranch(r)).toBe('ACTION_READY')
    expect(nextSteps(r).map((t) => t.to)).toEqual(['ACTION_READY'])
    expect(() => transition(r, { to: 'REFERRAL_DRAFTED', actor: 'system', now })).toThrowError(
      expect.objectContaining({ code: 'WRONG_BRANCH' }),
    )
    r = transition(r, { to: 'ACTION_READY', actor: 'system', now })
    expect(r.state).toBe('ACTION_READY')
  })
})

describe('golden-path referral', () => {
  it('walks pathway → pre-flight → approval → READY_TO_SEND with human judgement steps', () => {
    let r = toReview(golden())
    const opt = r.pathwayOptions.find((o) => o.kind === 'SECONDARY_CARE_REFERRAL')!
    r = selectPathway(r, { kind: opt.kind, service: opt.service, actor: DR, note: 'Agree with guidance', now })
    expect(r.pathway?.override).toBe(false)
    r = transition(r, { to: 'PATHWAY_SELECTED', actor: DR, now })
    r = transition(r, { to: 'REFERRAL_DRAFTED', actor: 'system', now })
    r = { ...r, issues: checkRequirements(r, requirementsFor(r.pathway!.service!)) }
    expect(r.issues).toEqual([])
    r = transition(r, { to: 'REFERRAL_REQUIREMENTS_CHECKED', actor: 'system', now })
    expect(requirementsOutcome(r)).toBe('READY_FOR_CLINICIAN_APPROVAL')
    r = transition(r, { to: 'READY_FOR_CLINICIAN_APPROVAL', actor: 'system', now })
    r = transition(r, { to: 'CLINICIAN_APPROVED', actor: DR, now })
    r = transition(r, { to: 'READY_TO_SEND', actor: DR, now })
    expect(r.state).toBe('READY_TO_SEND')
    // Terminal: nothing is sent automatically.
    expect(() => transition(r, { to: 'CASE_OPENED', actor: 'system', now })).toThrow(TransitionError)
  })

  it('never lets the system approve on behalf of a clinician', () => {
    let r = toReview(golden())
    r = selectPathway(r, { kind: 'SECONDARY_CARE_REFERRAL', service: 'Rapid Access Chest Pain Clinic', actor: DR, note: '', now })
    r = transition(r, { to: 'PATHWAY_SELECTED', actor: DR, now })
    r = transition(r, { to: 'REFERRAL_DRAFTED', actor: 'system', now })
    r = transition(r, { to: 'REFERRAL_REQUIREMENTS_CHECKED', actor: 'system', now })
    r = transition(r, { to: 'READY_FOR_CLINICIAN_APPROVAL', actor: 'system', now })
    expect(() => transition(r, { to: 'CLINICIAN_APPROVED', actor: 'system', now })).toThrowError(
      expect.objectContaining({ code: 'HUMAN_REQUIRED' }),
    )
  })

  it('rejects transitions that skip states', () => {
    expect(() => transition(golden(), { to: 'READY_TO_SEND', actor: DR, now })).toThrow(TransitionError)
  })
})

describe('incomplete / uncertain referral', () => {
  it('surfaces missing, conflicting and uncertain information as explicit issues', () => {
    const r = incomplete()
    const issues = checkRequirements(r, requirementsFor('Cardiology Outpatients'))
    const kinds = issues.map((i) => `${i.kind}:${i.field}`)
    expect(kinds).toEqual(
      expect.arrayContaining([
        'MISSING_REQUIRED:patient.nhsNumber',
        'MISSING_REQUIRED:clinical.relevantHistory',
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

  it('offers investigation-first options and routes to NEEDS_REVIEW if referred anyway', () => {
    let r = toReview(incomplete())
    expect(r.pathwayOptions.map((o) => o.kind)).toContain('FURTHER_INVESTIGATION_FIRST')

    r = selectPathway(r, { kind: 'SECONDARY_CARE_REFERRAL', service: 'Cardiology Outpatients', actor: DR, note: '', now })
    r = transition(r, { to: 'PATHWAY_SELECTED', actor: DR, now })
    r = transition(r, { to: 'REFERRAL_DRAFTED', actor: 'system', now })
    r = { ...r, issues: checkRequirements(r, requirementsFor(r.pathway!.service!)) }
    r = transition(r, { to: 'REFERRAL_REQUIREMENTS_CHECKED', actor: 'system', now })

    expect(() => transition(r, { to: 'READY_FOR_CLINICIAN_APPROVAL', actor: 'system', now })).toThrowError(
      expect.objectContaining({ code: 'BLOCKED_BY_ISSUES' }),
    )
    r = transition(r, { to: 'NEEDS_REVIEW', actor: 'system', now })
    expect(() => transition(r, { to: 'READY_FOR_CLINICIAN_APPROVAL', actor: DR, now })).toThrowError(
      expect.objectContaining({ code: 'BLOCKED_BY_ISSUES' }),
    )

    expect(() => resolveIssue(r, r.issues[0], 'system', 'auto')).toThrow()
    for (const issue of [...r.issues]) r = resolveIssue(r, issue, DR, 'Confirmed with GP practice')
    expect(r.issues).toEqual([])

    r = transition(r, { to: 'READY_FOR_CLINICIAN_APPROVAL', actor: DR, now })
    expect(r.state).toBe('READY_FOR_CLINICIAN_APPROVAL')
  })
})

describe('demo data', () => {
  it('is deterministic and reset-safe', () => {
    const a = loadDemoReferrals()
    a[0].state = 'READY_TO_SEND'
    const b = loadDemoReferrals()
    expect(b[0].state).toBe('CASE_OPENED')
    expect(b).toHaveLength(2)
  })
})
