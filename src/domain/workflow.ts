import type { CaseState, HistoryEntry, Referral } from './types'

/**
 * Allowed transitions. Anything not listed here is rejected.
 *
 * `requiresHuman: true` means the step is clinical/administrative judgement and
 * MUST be triggered by a named human actor — never automatically.
 */
export interface TransitionRule {
  from: CaseState
  to: CaseState
  requiresHuman: boolean
  label: string
}

export const TRANSITIONS: TransitionRule[] = [
  // Pathway support
  { from: 'CASE_OPENED', to: 'PATHWAY_OPTIONS_GENERATED', requiresHuman: false, label: 'Generate pathway options' },
  { from: 'PATHWAY_OPTIONS_GENERATED', to: 'CLINICIAN_PATHWAY_REVIEW', requiresHuman: true, label: 'Clinician reviews options' },
  // PATHWAY_SELECTED is reached via `selectPathway`, which records the decision.
  { from: 'CLINICIAN_PATHWAY_REVIEW', to: 'PATHWAY_SELECTED', requiresHuman: true, label: 'Select pathway' },
  // Branch — computed from the recorded decision (see `pathwayBranch`).
  { from: 'PATHWAY_SELECTED', to: 'ACTION_READY', requiresHuman: false, label: 'Prepare non-referral action' },
  { from: 'PATHWAY_SELECTED', to: 'REFERRAL_DRAFTED', requiresHuman: false, label: 'Draft referral' },
  // Referral pre-flight
  { from: 'REFERRAL_DRAFTED', to: 'REFERRAL_REQUIREMENTS_CHECKED', requiresHuman: false, label: 'Run pre-flight check' },
  // Outcome is computed by `requirementsOutcome`, not chosen freely.
  { from: 'REFERRAL_REQUIREMENTS_CHECKED', to: 'NEEDS_REVIEW', requiresHuman: false, label: 'Flag for review' },
  { from: 'REFERRAL_REQUIREMENTS_CHECKED', to: 'READY_FOR_CLINICIAN_APPROVAL', requiresHuman: false, label: 'Ready for clinician approval' },
  { from: 'NEEDS_REVIEW', to: 'READY_FOR_CLINICIAN_APPROVAL', requiresHuman: true, label: 'Issues resolved — ready for approval' },
  { from: 'NEEDS_REVIEW', to: 'REFERRAL_DRAFTED', requiresHuman: true, label: 'Back to draft' },
  // Clinical judgement
  { from: 'READY_FOR_CLINICIAN_APPROVAL', to: 'CLINICIAN_APPROVED', requiresHuman: true, label: 'Clinician approves' },
  { from: 'READY_FOR_CLINICIAN_APPROVAL', to: 'NEEDS_REVIEW', requiresHuman: true, label: 'Clinician requests changes' },
  { from: 'CLINICIAN_APPROVED', to: 'READY_TO_SEND', requiresHuman: true, label: 'Mark ready to send' },
  // No automatic submission: READY_TO_SEND is terminal in this prototype.
]

export const TERMINAL_STATES: CaseState[] = ['ACTION_READY', 'READY_TO_SEND']

export function availableTransitions(state: CaseState): TransitionRule[] {
  return TRANSITIONS.filter((t) => t.from === state)
}

export type TransitionErrorCode =
  | 'NOT_ALLOWED'
  | 'HUMAN_REQUIRED'
  | 'BLOCKED_BY_ISSUES'
  | 'REQUIREMENTS_NOT_MET'
  | 'PATHWAY_NOT_SELECTED'
  | 'WRONG_BRANCH'

export class TransitionError extends Error {
  readonly code: TransitionErrorCode
  constructor(message: string, code: TransitionErrorCode) {
    super(message)
    this.name = 'TransitionError'
    this.code = code
  }
}

export interface TransitionInput {
  to: CaseState
  /** Human actor name/role. Required when the rule has `requiresHuman`. Use 'system' for automatic steps. */
  actor: string
  note?: string
  now?: () => string
}

/** Which branch the recorded pathway decision leads to. */
export function pathwayBranch(referral: Referral): 'ACTION_READY' | 'REFERRAL_DRAFTED' | null {
  if (!referral.pathway) return null
  return referral.pathway.kind === 'SECONDARY_CARE_REFERRAL' ? 'REFERRAL_DRAFTED' : 'ACTION_READY'
}

/**
 * Transitions that make sense to offer for this referral: filters out the branch not implied by the
 * recorded pathway decision and the pre-flight outcome that does not match the current issues.
 */
export function nextSteps(referral: Referral): TransitionRule[] {
  const branch = pathwayBranch(referral)
  const outcome = requirementsOutcome(referral)
  return availableTransitions(referral.state).filter((t) => {
    if (t.from === 'PATHWAY_SELECTED') return t.to === branch
    if (t.from === 'REFERRAL_REQUIREMENTS_CHECKED') return t.to === outcome
    return true
  })
}

/** The single valid outcome of a pre-flight check for this referral. */
export function requirementsOutcome(referral: Referral): 'NEEDS_REVIEW' | 'READY_FOR_CLINICIAN_APPROVAL' {
  return referral.issues.length > 0 ? 'NEEDS_REVIEW' : 'READY_FOR_CLINICIAN_APPROVAL'
}

/**
 * Pure function: returns a new Referral or throws `TransitionError`.
 *
 * Guards:
 * - Only rules in TRANSITIONS are allowed.
 * - Human-required steps reject `actor === 'system'`.
 * - PATHWAY_SELECTED requires a recorded clinician decision (`selectPathway`).
 * - Leaving PATHWAY_SELECTED must follow the branch implied by that decision.
 * - Approval-side states are blocked while unresolved issues exist.
 * - Leaving REFERRAL_REQUIREMENTS_CHECKED must agree with `requirementsOutcome`.
 */
export function transition(referral: Referral, input: TransitionInput): Referral {
  const rule = TRANSITIONS.find((t) => t.from === referral.state && t.to === input.to)
  if (!rule) {
    throw new TransitionError(`Cannot move from ${referral.state} to ${input.to}`, 'NOT_ALLOWED')
  }
  if (rule.requiresHuman && (!input.actor || input.actor === 'system')) {
    throw new TransitionError(`${rule.label} requires a human actor`, 'HUMAN_REQUIRED')
  }
  if (input.to === 'PATHWAY_SELECTED' && !referral.pathway) {
    throw new TransitionError('A clinician must select a pathway first', 'PATHWAY_NOT_SELECTED')
  }
  if (referral.state === 'PATHWAY_SELECTED') {
    const branch = pathwayBranch(referral)
    if (input.to !== branch) {
      throw new TransitionError(`Selected pathway leads to ${branch}`, 'WRONG_BRANCH')
    }
  }
  const gated: CaseState[] = ['READY_FOR_CLINICIAN_APPROVAL', 'CLINICIAN_APPROVED', 'READY_TO_SEND']
  if (gated.includes(input.to) && referral.issues.length > 0) {
    throw new TransitionError(
      `${referral.issues.length} unresolved issue(s) must be addressed before ${input.to}`,
      'BLOCKED_BY_ISSUES',
    )
  }
  if (referral.state === 'REFERRAL_REQUIREMENTS_CHECKED') {
    const expected = requirementsOutcome(referral)
    if (input.to !== expected) {
      throw new TransitionError(`Pre-flight outcome is ${expected}`, 'REQUIREMENTS_NOT_MET')
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
