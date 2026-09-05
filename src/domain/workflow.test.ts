import { describe, expect, it } from 'vitest'
import {
  ExpiredOnPresentError,
  TransitionError,
  demoToken,
  nextScheduledRequest,
  present,
  requestFromPlan,
  routeResult,
  transition,
  type MonitoringRequest,
} from '.'
import { DEMO_NOW, DEMO_PLANS, demoClock, loadDemoRequests } from '../data/demo'

const [recurring, expired] = loadDemoRequests()
const PROVIDER = 'Test Provider'

describe('QR token', () => {
  it('is opaque and deterministic', () => {
    expect(recurring.token).toBe(demoToken('PLAN-DEMO-001', 1))
    expect(recurring.token).toMatch(/^tok_[a-z0-9]+$/)
    for (const leak of [recurring.demographics.fullName, recurring.patientRef, 'INR', recurring.demographics.nhsNumber!]) {
      expect(recurring.token).not.toContain(leak)
    }
  })
})

describe('golden path (recurring request)', () => {
  it('runs from ACTIVE to REVIEWED and creates the next request on collection', () => {
    let r = present(recurring, { token: recurring.token, provider: PROVIDER, now: demoClock })
    expect(r.status).toBe('PRESENTED')
    expect(r.fulfilledBy).toBe(PROVIDER)

    r = transition(r, { to: 'SAMPLE_COLLECTED', actor: PROVIDER, now: demoClock })
    const plan = DEMO_PLANS[0]
    const next = nextScheduledRequest(plan, [r])
    expect(next?.sequence).toBe(2)
    expect(next?.validFrom).toBe('2026-09-29T00:00:00.000Z')
    expect(next?.token).not.toBe(r.token)

    r = transition(r, { to: 'LAB_PROCESSING', actor: 'system', now: demoClock })
    r = transition(r, { to: 'RESULT_AVAILABLE', actor: 'system', now: demoClock })
    r = routeResult(r, demoClock)
    expect(r.status).toBe('AWAITING_CLINICIAN_REVIEW')
    expect(r.history.at(-1)?.note).toContain('Anticoagulation team inbox')

    r = transition(r, { to: 'REVIEWED', actor: 'Dr Demo', now: demoClock })
    expect(r.status).toBe('REVIEWED')
    expect(() => transition(r, { to: 'ACTIVE', actor: 'Dr Demo', now: demoClock })).toThrow(TransitionError)
  })

  it('stops generating requests after the recurrence end date', () => {
    const plan = { ...DEMO_PLANS[0], recurrence: { intervalDays: 28, endsAt: '2026-09-20T00:00:00.000Z' } }
    expect(requestFromPlan(plan, 1)).not.toBeNull()
    expect(requestFromPlan(plan, 2)).toBeNull()
    expect(nextScheduledRequest({ ...plan, recurrence: null }, [])).toBeNull()
  })
})

describe('expired request', () => {
  it('blocks collection and records EXPIRED', () => {
    expect(expired.expiresAt < DEMO_NOW).toBe(true)
    try {
      present(expired, { token: expired.token, provider: PROVIDER, now: demoClock })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ExpiredOnPresentError)
      const err = e as ExpiredOnPresentError
      expect(err.code).toBe('EXPIRED')
      expect(err.request.status).toBe('EXPIRED')
      expect(err.request.fulfilledBy).toBeUndefined()
      expect(() => transition(err.request, { to: 'SAMPLE_COLLECTED', actor: PROVIDER, now: demoClock })).toThrow(/Cannot move/)
    }
  })

  it('refuses a wrong token without touching the request', () => {
    expect(() => present(recurring, { token: 'tok_nope', provider: PROVIDER, now: demoClock })).toThrow(/does not match/)
  })

  it('refuses presentation before validFrom', () => {
    expect(() => present(recurring, { token: recurring.token, provider: PROVIDER, now: () => '2026-08-01T00:00:00.000Z' })).toThrow(
      /not valid until/,
    )
  })
})

describe('guards', () => {
  it('human steps cannot be performed by system', () => {
    expect(() => present(recurring, { token: recurring.token, provider: PROVIDER, now: demoClock })).not.toThrow()
    const presented = present(recurring, { token: recurring.token, provider: PROVIDER, now: demoClock })
    expect(() => transition(presented, { to: 'SAMPLE_COLLECTED', actor: 'system', now: demoClock })).toThrow(/named actor/)
  })

  it('routing fails explicitly when no destination is configured', () => {
    const r: MonitoringRequest = { ...recurring, status: 'RESULT_AVAILABLE', routing: { ...recurring.routing, address: null } }
    const failed = routeResult(r, demoClock)
    expect(failed.status).toBe('ROUTING_FAILED')
    expect(() => transition(failed, { to: 'AWAITING_CLINICIAN_REVIEW', actor: 'Dr Demo', now: demoClock })).toThrow(/No address/)
    const fixed = { ...failed, routing: { ...failed.routing, address: 'inbox://fixed' } }
    expect(transition(fixed, { to: 'AWAITING_CLINICIAN_REVIEW', actor: 'Dr Demo', now: demoClock }).status).toBe('AWAITING_CLINICIAN_REVIEW')
  })

  it('cancelled request cannot be presented', () => {
    const c = transition(recurring, { to: 'CANCELLED', actor: 'Dr Demo', now: demoClock })
    expect(() => present(c, { token: c.token, provider: PROVIDER, now: demoClock })).toThrow(/CANCELLED/)
  })
})
