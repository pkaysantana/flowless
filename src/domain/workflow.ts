import type { HistoryEntry, Referral, ReferralState } from './types'

/**
 * Allowed transitions. Anything not listed here is rejected.
 *
 * `requiresHuman: true` means the step is clinical/administrative judgement and
 * MUST be triggered by a named human actor — never automatically.
 */
export interface TransitionRule {
  from: ReferralState
  to: ReferralState
  requiresHuman: boolean
  label: string
}

export const TRANSITIONS: TransitionRule[] = [
  { from: 'REFERRAL_DECIDED', to: 'INFORMATION_ASSEMBLED', requiresHuman: false, label: 'Assemble information' },
  { from: 'INFORMATION_ASSEMBLED', to: 'REQUIREMENTS_CHECKED', requiresHuman: false, label: 'Check requirements' },
  // Outcome of the requirements check is computed by `checkRequirements`, not chosen freely.
  { from: 'REQUIREMENTS_CHECKED', to: 'NEEDS_HUMAN_REVIEW', requiresHuman: false, label: 'Flag for human review' },
  { from: 'REQUIREMENTS_CHECKED', to: 'READY_FOR_REVIEW', requiresHuman: false, label: 'Mark ready for review' },
  // A human resolves issues and explicitly confirms the referral is ready.
  { from: 'NEEDS_HUMAN_REVIEW', to: 'READY_FOR_REVIEW', requiresHuman: true, label: 'Issues resolved — ready for review' },
  { from: 'NEEDS_HUMAN_REVIEW', to: 'INFORMATION_ASSEMBLED', requiresHuman: true, label: 'Send back to gather more information' },
  // Clinical judgement.
  { from: 'READY_FOR_REVIEW', to: 'CLINICIAN_APPROVED', requiresHuman: true, label: 'Clinician approves' },
  { from: 'READY_FOR_REVIEW', to: 'NEEDS_HUMAN_REVIEW', requiresHuman: true, label: 'Clinician requests changes' },
  { from: 'CLINICIAN_APPROVED', to: 'SUBMITTED', requiresHuman: true, label: 'Submit referral' },
  { from: 'SUBMITTED', to: 'TRACKING', requiresHuman: false, label: 'Start tracking' },
]

export const TERMINAL_STATES: ReferralState[] = ['TRACKING']

export function availableTransitions(state: ReferralState): TransitionRule[] {
  return TRANSITIONS.filter((t) => t.from === state)
}

export type TransitionErrorCode = 'NOT_ALLOWED' | 'HUMAN_REQUIRED' | 'BLOCKED_BY_ISSUES' | 'REQUIREMENTS_NOT_MET'

export class TransitionError extends Error {
  readonly code: TransitionErrorCode
  constructor(message: string, code: TransitionErrorCode) {
    super(message)
    this.name = 'TransitionError'
    this.code = code
  }
}

export interface TransitionInput {
  to: ReferralState
  /** Human actor name/role. Required when the rule has `requiresHuman`. Use 'system' for automatic steps. */
  actor: string
  note?: string
  now?: () => string
}

/**
 * Pure function: returns a new Referral or throws `TransitionError`.
 *
 * Guards:
 * - Only rules in TRANSITIONS are allowed.
 * - Human-required steps reject `actor === 'system'`.
 * - Moving to READY_FOR_REVIEW / CLINICIAN_APPROVED / SUBMITTED is blocked while
 *   unresolved issues exist (a human must clear them first — see `resolveIssue`).
 * - Leaving REQUIREMENTS_CHECKED must agree with `checkRequirements` (no bypassing).
 */
export function transition(referral: Referral, input: TransitionInput): Referral {
  const rule = TRANSITIONS.find((t) => t.from === referral.state && t.to === input.to)
  if (!rule) {
    throw new TransitionError(`Cannot move from ${referral.state} to ${input.to}`, 'NOT_ALLOWED')
  }
  if (rule.requiresHuman && (!input.actor || input.actor === 'system')) {
    throw new TransitionError(`${rule.label} requires a human actor`, 'HUMAN_REQUIRED')
  }
  const gated: ReferralState[] = ['READY_FOR_REVIEW', 'CLINICIAN_APPROVED', 'SUBMITTED']
  if (gated.includes(input.to) && referral.issues.length > 0) {
    throw new TransitionError(
      `${referral.issues.length} unresolved issue(s) must be addressed before ${input.to}`,
      'BLOCKED_BY_ISSUES',
    )
  }
  if (referral.state === 'REQUIREMENTS_CHECKED') {
    const expected = referral.issues.length > 0 ? 'NEEDS_HUMAN_REVIEW' : 'READY_FOR_REVIEW'
    if (input.to !== expected) {
      throw new TransitionError(`Requirements check outcome is ${expected}`, 'REQUIREMENTS_NOT_MET')
    }
  }

  const entry: HistoryEntry = {
    at: (input.now ?? (() => new Date().toISOString()))(),
    from: referral.state,
    to: input.to,
    actor: input.actor,
    note: input.note,
  }
  return { ...referral, state: input.to, history: [...referral.history, entry] }
}

/** Convenience: the single valid outcome of a requirements check for this referral. */
export function requirementsOutcome(referral: Referral): 'NEEDS_HUMAN_REVIEW' | 'READY_FOR_REVIEW' {
  return referral.issues.length > 0 ? 'NEEDS_HUMAN_REVIEW' : 'READY_FOR_REVIEW'
}
