import type { ReferralState } from '../domain'

const TONE: Record<ReferralState, string> = {
  REFERRAL_DECIDED: 'neutral',
  INFORMATION_ASSEMBLED: 'neutral',
  REQUIREMENTS_CHECKED: 'neutral',
  NEEDS_HUMAN_REVIEW: 'warn',
  READY_FOR_REVIEW: 'info',
  CLINICIAN_APPROVED: 'ok',
  SUBMITTED: 'ok',
  TRACKING: 'ok',
}

export function StateBadge({ state }: { state: ReferralState }) {
  return (
    <span className={`badge badge--${TONE[state]}`} data-testid="state-badge">
      {state.replaceAll('_', ' ')}
    </span>
  )
}
