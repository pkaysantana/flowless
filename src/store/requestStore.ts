import { useSyncExternalStore } from 'react'
import {
  ExpiredOnPresentError,
  nextScheduledRequest,
  present,
  routeResult,
  transition,
  type MonitoringPlan,
  type MonitoringRequest,
  type RequestState,
} from '../domain'
import { demoClock, loadDemoPlans, loadDemoRequests } from '../data/demo'

/**
 * In-memory store. Integration point: swap the mutation methods for API calls
 * (or a Supabase table) keeping the same public surface.
 */
interface State {
  plans: MonitoringPlan[]
  requests: MonitoringRequest[]
}

let state: State = { plans: loadDemoPlans(), requests: loadDemoRequests() }
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function update(id: string, fn: (r: MonitoringRequest) => MonitoringRequest) {
  const idx = state.requests.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error(`Unknown request ${id}`)
  const next = fn(state.requests[idx])
  const requests = state.requests.slice()
  requests[idx] = next
  state = { ...state, requests }
  return next
}

/** Recurring plans create the next request once the current one has been fulfilled. */
function scheduleNext(planId: string) {
  const plan = state.plans.find((p) => p.id === planId)
  if (!plan) return
  const next = nextScheduledRequest(plan, state.requests)
  if (next) state = { ...state, requests: [...state.requests, next] }
}

export const requestStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  getSnapshot: () => state,
  now: demoClock,

  reset() {
    state = { plans: loadDemoPlans(), requests: loadDemoRequests() }
    emit()
  },

  byToken(token: string): MonitoringRequest | undefined {
    return state.requests.find((r) => r.token === token)
  },

  transition(id: string, to: RequestState, actor: string, note?: string) {
    const next = update(id, (r) => transition(r, { to, actor, note, now: demoClock }))
    if (to === 'SAMPLE_COLLECTED') scheduleNext(next.planId)
    emit()
  },

  /** Provider scans a token. Throws on refusal; an expired request is recorded as EXPIRED before throwing. */
  present(token: string, provider: string) {
    const r = state.requests.find((x) => x.token === token)
    if (!r) throw new Error('Unknown token — no request found')
    try {
      update(r.id, (cur) => present(cur, { token, provider, now: demoClock }))
      emit()
    } catch (e) {
      if (e instanceof ExpiredOnPresentError) {
        update(r.id, () => e.request)
        emit()
      }
      throw e
    }
  },

  /** Lab staff enter a fictional result; the system then routes it. */
  receiveResult(id: string, summary: string, actor: string) {
    update(id, (r) => ({
      ...transition(r, { to: 'RESULT_AVAILABLE', actor, now: demoClock }),
      result: { receivedAt: demoClock(), summary },
    }))
    update(id, (r) => routeResult(r, demoClock))
    emit()
  },
}

export function useRequestStore(): State {
  return useSyncExternalStore(requestStore.subscribe, requestStore.getSnapshot, requestStore.getSnapshot)
}
