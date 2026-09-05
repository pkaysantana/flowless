import { beforeEach, describe, expect, it } from 'vitest'
import { TransitionError } from '../domain'
import { requestStore } from './requestStore'

const PROVIDER = 'Test Provider'
const LAB = 'Test Lab'

const recurring = () => requestStore.getSnapshot().requests[0]

beforeEach(() => {
  requestStore.reset()
})

describe('requestStore guarded operations', () => {
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
