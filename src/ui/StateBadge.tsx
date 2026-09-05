import type { RequestState } from '../domain'

const TONE: Record<RequestState, string> = {
  DRAFT: 'neutral',
  ACTIVE: 'info',
  PRESENTED: 'info',
  SAMPLE_COLLECTED: 'info',
  LAB_PROCESSING: 'neutral',
  RESULT_AVAILABLE: 'info',
  AWAITING_CLINICIAN_REVIEW: 'warn',
  REVIEWED: 'ok',
  EXPIRED: 'danger',
  CANCELLED: 'neutral',
  INVALID: 'danger',
  ROUTING_FAILED: 'danger',
}

export function StateBadge({ state }: { state: RequestState }) {
  return (
    <span className={`badge badge--${TONE[state]}`} data-testid="state-badge">
      {state.replaceAll('_', ' ')}
    </span>
  )
}
