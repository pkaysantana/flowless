import type { PathwayKind } from '../domain'

export const PATHWAY_LABEL: Record<PathwayKind, string> = {
  MANAGE_IN_PRIMARY_CARE: 'Manage in primary care',
  ADVICE_AND_GUIDANCE: 'Advice & guidance',
  COMMUNITY_SERVICE: 'Community service',
  FURTHER_INVESTIGATION_FIRST: 'Further investigation first',
  SECONDARY_CARE_REFERRAL: 'Secondary-care referral',
}
