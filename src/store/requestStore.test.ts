import { beforeEach, describe, expect, it } from 'vitest'
import { requestStore } from './requestStore'
import { TransitionError, type MonitoringPlan } from '../domain'

const NEW_PLAN: MonitoringPlan = {
  id: 'PLAN-TEST-999',
  patientRef: 'PT-FICTIONAL-TEST',
  demographics: { fullName: 'Test Patient', dateOfBirth: '1990-01-01', sex: 'Female', nhsNumber: null },
  tests: [{ code: 'FBC', name: 'Full blood count', snomedCode: '26604007' }],
  requestingClinician: { id: 'CLIN-TEST', name: 'Dr Test', role: 'Test Registrar', esrNumber: 'ESR-0001' },
  requestingOrganisation: { id: 'ORG-TEST', name: 'Test NHS Trust', odsOrgCode: 'TST' },
  requestingSite: { odsSiteCode: 'TST01', siteName: 'Test Hospital', wardCode: 'TST-WARD-1', wardName: 'Test Ward' },
  routing: { kind: 'TEAM_INBOX', address: 'inbox://test-team', label: 'Test team inbox' },
  reasonableAdjustments: [],
  validityDays: 14,
  recurrence: null,
  startsAt: '2026-09-01T00:00:00.000Z',
}

beforeEach(() => {
  requestStore.reset()
})

describe('requestStore.createPlan', () => {
  it('adds the plan and its first request to the store', () => {
    const before = requestStore.getSnapshot()
    const first = requestStore.createPlan(NEW_PLAN)

    const after = requestStore.getSnapshot()
    expect(after.plans.length).toBe(before.plans.length + 1)
    expect(after.requests.length).toBe(before.requests.length + 1)
    expect(after.plans.find((p) => p.id === NEW_PLAN.id)).toEqual(NEW_PLAN)

    expect(first.status).toBe('ACTIVE')
    expect(first.planId).toBe(NEW_PLAN.id)
    expect(first.sequence).toBe(1)
    expect(first.requestingSite).toEqual(NEW_PLAN.requestingSite)
    expect(requestStore.byToken(first.token)).toEqual(first)
  })

  it('notifies subscribers', () => {
    let notified = false
    const unsubscribe = requestStore.subscribe(() => {
      notified = true
    })
    requestStore.createPlan({ ...NEW_PLAN, id: 'PLAN-TEST-998' })
    unsubscribe()
    expect(notified).toBe(true)
  })
})

describe('requestStore guarded operations', () => {
  const PROVIDER = 'Test Provider'
  const LAB = 'Test Lab'
  const recurring = () => requestStore.getSnapshot().requests[0]

  it('generic transition cannot present or collect', () => {
    const r = recurring()
    expect(() => requestStore.transition(r.id, 'PRESENTED', PROVIDER)).toThrow(TransitionError)
    requestStore.present(r.token, PROVIDER)
    expect(() => requestStore.transition(r.id, 'SAMPLE_COLLECTED', PROVIDER)).toThrow(/dedicated operation/)
    // Nothing moved: still PRESENTED, no next request scheduled
    expect(recurring().status).toBe('PRESENTED')
    expect(requestStore.getSnapshot().requests.filter((x) => x.planId === r.planId)).toHaveLength(1)
  })

  it('collectSample schedules the next recurring request exactly once', () => {
    const r = recurring()
    requestStore.present(r.token, PROVIDER)
    requestStore.collectSample(r.id, PROVIDER)
    const ofPlan = () => requestStore.getSnapshot().requests.filter((x) => x.planId === r.planId)
    expect(ofPlan()).toHaveLength(2)
    expect(ofPlan()[1].sequence).toBe(2)

    // A duplicate collection fails and does not schedule a third request
    expect(() => requestStore.collectSample(r.id, PROVIDER)).toThrow(/only be collected once/)
    expect(ofPlan()).toHaveLength(2)
  })

  it('walks the golden path with named lab actor recorded in history', () => {
    const r = recurring()
    requestStore.present(r.token, PROVIDER)
    requestStore.collectSample(r.id, PROVIDER)
    requestStore.transition(r.id, 'LAB_PROCESSING', LAB)
    requestStore.receiveResult(r.id, 'Fictional result', LAB)
    const done = requestStore.getSnapshot().requests.find((x) => x.id === r.id)!
    expect(done.status).toBe('AWAITING_CLINICIAN_REVIEW')
    expect(done.result?.summary).toBe('Fictional result')
    const actors = done.history.map((h) => h.actor)
    expect(actors).toContain(LAB)
    expect(done.history.at(-1)?.actor).toBe('system') // routing itself stays automatic
    requestStore.transition(r.id, 'REVIEWED', 'Dr Demo')
    expect(requestStore.getSnapshot().requests.find((x) => x.id === r.id)?.status).toBe('REVIEWED')
  })

  it('lab steps reject the system actor', () => {
    const r = recurring()
    requestStore.present(r.token, PROVIDER)
    requestStore.collectSample(r.id, PROVIDER)
    expect(() => requestStore.transition(r.id, 'LAB_PROCESSING', 'system')).toThrow(/named actor/)
    requestStore.transition(r.id, 'LAB_PROCESSING', LAB)
    expect(() => requestStore.receiveResult(r.id, 'x', 'system')).toThrow(/named actor/)
  })
})
