import { beforeEach, describe, expect, it } from 'vitest'
import { requestStore } from './requestStore'
import type { MonitoringPlan } from '../domain'

const NEW_PLAN: MonitoringPlan = {
  id: 'PLAN-TEST-999',
  patientRef: 'PT-TEST-999',
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
