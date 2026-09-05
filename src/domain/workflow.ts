import type { HistoryEntry, MonitoringRequest, RequestState } from './types'

export interface TransitionRule {
  from: RequestState
  to: RequestState
  /** Must be performed by a named human/provider actor, never `'system'`. */
  requiresHuman: boolean
  label: string
}

/**
 * Lifecycle. Exceptional states are reachable from the operational states shown.
 * `present()` and `routeResult()` below own the guarded entries into PRESENTED / EXPIRED /
 * AWAITING_CLINICIAN_REVIEW / ROUTING_FAILED; the UI should call those rather than `transition()`.
 */
export const TRANSITIONS: TransitionRule[] = [
  { from: 'DRAFT', to: 'ACTIVE', requiresHuman: true, label: 'Activate request' },
  { from: 'ACTIVE', to: 'PRESENTED', requiresHuman: true, label: 'Present at provider' },
  { from: 'PRESENTED', to: 'SAMPLE_COLLECTED', requiresHuman: true, label: 'Confirm sample collected' },
  { from: 'SAMPLE_COLLECTED', to: 'LAB_PROCESSING', requiresHuman: true, label: 'Lab receives specimen' },
  { from: 'LAB_PROCESSING', to: 'RESULT_AVAILABLE', requiresHuman: true, label: 'Result entered' },
  { from: 'RESULT_AVAILABLE', to: 'AWAITING_CLINICIAN_REVIEW', requiresHuman: false, label: 'Route result' },
  { from: 'RESULT_AVAILABLE', to: 'ROUTING_FAILED', requiresHuman: false, label: 'Routing failed' },
  { from: 'ROUTING_FAILED', to: 'AWAITING_CLINICIAN_REVIEW', requiresHuman: true, label: 'Retry routing' },
  { from: 'AWAITING_CLINICIAN_REVIEW', to: 'REVIEWED', requiresHuman: true, label: 'Mark reviewed' },
  { from: 'DRAFT', to: 'CANCELLED', requiresHuman: true, label: 'Cancel' },
  { from: 'ACTIVE', to: 'CANCELLED', requiresHuman: true, label: 'Cancel' },
  { from: 'PRESENTED', to: 'CANCELLED', requiresHuman: true, label: 'Cancel' },
  { from: 'ACTIVE', to: 'EXPIRED', requiresHuman: false, label: 'Expire' },
  { from: 'PRESENTED', to: 'EXPIRED', requiresHuman: false, label: 'Expire' },
  { from: 'ACTIVE', to: 'INVALID', requiresHuman: false, label: 'Invalidate' },
  { from: 'PRESENTED', to: 'INVALID', requiresHuman: false, label: 'Invalidate' },
]

export function availableTransitions(state: RequestState): TransitionRule[] {
  return TRANSITIONS.filter((t) => t.from === state)
}

export type TransitionErrorCode =
  | 'NOT_ALLOWED'
  | 'HUMAN_REQUIRED'
  | 'TOKEN_MISMATCH'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'NOT_PRESENTABLE'
  | 'NO_ROUTING_DESTINATION'

export class TransitionError extends Error {
  readonly code: TransitionErrorCode
  constructor(message: string, code: TransitionErrorCode) {
    super(message)
    this.name = 'TransitionError'
    this.code = code
  }
}

export interface TransitionInput {
  to: RequestState
  /** Named actor. Use 'system' only for automatic steps. */
  actor: string
  note?: string
  now: () => string
}

function withHistory(r: MonitoringRequest, entry: HistoryEntry): MonitoringRequest {
  return { ...r, status: entry.to ?? r.status, history: [...r.history, entry] }
}

/** Pure: returns a new request or throws `TransitionError`. Only rules in TRANSITIONS are allowed. */
export function transition(r: MonitoringRequest, input: TransitionInput): MonitoringRequest {
  const rule = TRANSITIONS.find((t) => t.from === r.status && t.to === input.to)
  if (!rule) throw new TransitionError(`Cannot move from ${r.status} to ${input.to}`, 'NOT_ALLOWED')
  if (rule.requiresHuman && input.actor === 'system') {
    throw new TransitionError(`"${rule.label}" must be performed by a named actor`, 'HUMAN_REQUIRED')
  }
  if (input.to === 'AWAITING_CLINICIAN_REVIEW' && !r.routing.address) {
    throw new TransitionError(`No address configured for ${r.routing.label}`, 'NO_ROUTING_DESTINATION')
  }
  return withHistory(r, { at: input.now(), actor: input.actor, from: r.status, to: input.to, note: input.note })
}

export interface PresentInput {
  /** Token read from the QR. */
  token: string
  /** Fictional provider identity, e.g. 'Hillside Community Phlebotomy'. */
  provider: string
  now: () => string
}

/**
 * A provider scans the QR and presents the token. Guards:
 * - token must match (otherwise no state change — the request is untouched)
 * - request must be ACTIVE
 * - now must be within [validFrom, expiresAt]; a lapsed request is moved to EXPIRED and collection is refused
 */
export function present(r: MonitoringRequest, input: PresentInput): MonitoringRequest {
  if (input.token !== r.token) throw new TransitionError('Token does not match this request', 'TOKEN_MISMATCH')
  if (r.status !== 'ACTIVE') {
    throw new TransitionError(`Request is ${r.status} and cannot be presented`, 'NOT_PRESENTABLE')
  }
  const at = input.now()
  if (at < r.validFrom) {
    throw new TransitionError(`Request is not valid until ${r.validFrom.slice(0, 10)}`, 'NOT_YET_VALID')
  }
  if (at > r.expiresAt) {
    // Expiry is recorded on the request; the caller receives the error and the updated record.
    const expired = withHistory(r, {
      at,
      actor: 'system',
      from: r.status,
      to: 'EXPIRED',
      note: `Presented by ${input.provider} after expiry (${r.expiresAt.slice(0, 10)}); collection refused`,
    })
    throw new ExpiredOnPresentError(expired)
  }
  return {
    ...withHistory(r, { at, actor: input.provider, from: r.status, to: 'PRESENTED', note: 'Token presented' }),
    fulfilledBy: input.provider,
  }
}

/** Thrown by `present()` when the request lapsed; carries the request with EXPIRED recorded. */
export class ExpiredOnPresentError extends TransitionError {
  readonly request: MonitoringRequest
  constructor(request: MonitoringRequest) {
    super(`Request expired on ${request.expiresAt.slice(0, 10)} — sample must not be collected`, 'EXPIRED')
    this.name = 'ExpiredOnPresentError'
    this.request = request
  }
}

/**
 * Route an available result to the original requesting clinician/team.
 * Outcome is computed from the routing destination, never chosen by the caller.
 */
export function routeResult(r: MonitoringRequest, now: () => string): MonitoringRequest {
  if (r.status !== 'RESULT_AVAILABLE') {
    throw new TransitionError(`No result to route while ${r.status}`, 'NOT_ALLOWED')
  }
  if (!r.routing.address) {
    return withHistory(r, {
      at: now(),
      actor: 'system',
      from: r.status,
      to: 'ROUTING_FAILED',
      note: `No address configured for ${r.routing.label}`,
    })
  }
  return withHistory(r, {
    at: now(),
    actor: 'system',
    from: r.status,
    to: 'AWAITING_CLINICIAN_REVIEW',
    note: `Routed to ${r.routing.label} (${r.routing.kind})`,
  })
}
