import type { CaseState } from '../domain'

const TONE: Record<CaseState, string> = {
  CASE_OPENED: 'neutral',
  PATHWAY_OPTIONS_GENERATED: 'neutral',
  CLINICIAN_PATHWAY_REVIEW: 'info',
  PATHWAY_SELECTED: 'neutral',
  ACTION_READY: 'ok',
  REFERRAL_DRAFTED: 'neutral',
  REFERRAL_REQUIREMENTS_CHECKED: 'neutral',
  NEEDS_REVIEW: 'warn',
  READY_FOR_CLINICIAN_APPROVAL: 'info',
  CLINICIAN_APPROVED: 'ok',
  READY_TO_SEND: 'ok',
}

export function StateBadge({ state }: { state: CaseState }) {
  return (
    <span className={`badge badge--${TONE[state]}`} data-testid="state-badge">
      {state.replaceAll('_', ' ')}
    </span>
  )
}
