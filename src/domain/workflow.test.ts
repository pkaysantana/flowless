import { describe, expect, it } from 'vitest'
import {
  collectSample,
  ExpiredOnCollectError,
  ExpiredOnPresentError,
  TransitionError,
  availableTransitions,
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

    r = collectSample(r, { actor: PROVIDER, now: demoClock })
    expect(r.status).toBe('SAMPLE_COLLECTED')
    const plan = DEMO_PLANS[0]
    const next = nextScheduledRequest(plan, [r])
    expect(next?.sequence).toBe(2)
    expect(next?.validFrom).toBe('2026-09-29T00:00:00.000Z')
    expect(next?.token).not.toBe(r.token)

    r = transition(r, { to: 'LAB_PROCESSING', actor: 'Demo Lab', now: demoClock })
    r = transition(r, { to: 'RESULT_AVAILABLE', actor: 'Demo Lab', now: demoClock })
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
      expect(() => collectSample(err.request, { actor: PROVIDER, now: demoClock })).toThrow(/EXPIRED/)
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
    const presented = present(recurring, { token: recurring.token, provider: PROVIDER, now: demoClock })
    expect(() => collectSample(presented, { actor: 'system', now: demoClock })).toThrow(/named actor/)
  })

  it('lab steps require a named lab actor, not system', () => {
    const collected = collectSample(
      present(recurring, { token: recurring.token, provider: PROVIDER, now: demoClock }),
      { actor: PROVIDER, now: demoClock },
    )
    expect(() => transition(collected, { to: 'LAB_PROCESSING', actor: 'system', now: demoClock })).toThrow(/named actor/)
    const processing = transition(collected, { to: 'LAB_PROCESSING', actor: 'Demo Lab', now: demoClock })
    expect(processing.status).toBe('LAB_PROCESSING')
    expect(() => transition(processing, { to: 'RESULT_AVAILABLE', actor: 'system', now: demoClock })).toThrow(/named actor/)
    const resulted = transition(processing, { to: 'RESULT_AVAILABLE', actor: 'Demo Lab', now: demoClock })
    expect(resulted.status).toBe('RESULT_AVAILABLE')
    expect(resulted.history.at(-1)?.actor).toBe('Demo Lab')
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

describe('guarded transitions cannot be bypassed', () => {
  it('ACTIVE → PRESENTED is not reachable via generic transition', () => {
    try {
      transition(recurring, { to: 'PRESENTED', actor: PROVIDER, now: demoClock })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(TransitionError)
      expect((e as TransitionError).code).toBe('GUARDED')
    }
  })

  it('PRESENTED → SAMPLE_COLLECTED is not reachable via generic transition', () => {
    const presented = present(recurring, { token: recurring.token, provider: PROVIDER, now: demoClock })
    expect(() => transition(presented, { to: 'SAMPLE_COLLECTED', actor: PROVIDER, now: demoClock })).toThrow(/dedicated operation/)
  })

  it('result-routing outcomes are not reachable via generic transition', () => {
    const r: MonitoringRequest = { ...recurring, status: 'RESULT_AVAILABLE' }
    expect(() => transition(r, { to: 'AWAITING_CLINICIAN_REVIEW', actor: 'anyone', now: demoClock })).toThrow(/dedicated operation/)
    expect(() => transition(r, { to: 'ROUTING_FAILED', actor: 'anyone', now: demoClock })).toThrow(/dedicated operation/)
  })

  it('availableTransitions never offers a guarded rule', () => {
    for (const state of ['ACTIVE', 'PRESENTED', 'RESULT_AVAILABLE'] as const) {
      for (const rule of availableTransitions(state)) {
        expect(rule.guarded).toBeUndefined()
      }
    }
  })
})

describe('collectSample', () => {
  const presented = () => present(recurring, { token: recurring.token, provider: PROVIDER, now: demoClock })

  it('collects exactly once — a second collection fails', () => {
    const collected = collectSample(presented(), { actor: PROVIDER, now: demoClock })
    expect(collected.status).toBe('SAMPLE_COLLECTED')
    expect(collected.history.at(-1)?.actor).toBe(PROVIDER)
    expect(() => collectSample(collected, { actor: PROVIDER, now: demoClock })).toThrow(/only be collected once/)
  })

  it('rechecks expiry at collection time and records EXPIRED', () => {
    const afterExpiry = () => '2026-09-16T09:00:00.000Z' // recurring expires 2026-09-15
    try {
      collectSample(presented(), { actor: PROVIDER, now: afterExpiry })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ExpiredOnCollectError)
      const err = e as ExpiredOnCollectError
      expect(err.code).toBe('EXPIRED')
      expect(err.request.status).toBe('EXPIRED')
      expect(err.request.history.at(-1)?.note).toMatch(/collection refused/)
    }
  })

  it('refuses collection for cancelled, invalid and expired requests', () => {
    for (const status of ['CANCELLED', 'INVALID', 'EXPIRED', 'ACTIVE'] as const) {
      const r: MonitoringRequest = { ...recurring, status }
      try {
        collectSample(r, { actor: PROVIDER, now: demoClock })
        throw new Error('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(TransitionError)
        expect((e as TransitionError).code).toBe('NOT_COLLECTABLE')
      }
    }
  })
})
