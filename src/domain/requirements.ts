import type { FieldValue, Issue, Referral, SpecialtyRequirements } from './types'

/** Below this confidence an EXTRACTED value is flagged as uncertain. Tune with the clinical team. */
export const UNCERTAINTY_THRESHOLD = 0.8

type FieldPath = `patient.${keyof Referral['patient']}` | `clinical.${keyof Referral['clinical']}`

function getField(referral: Referral, path: string): FieldValue<unknown> | undefined {
  const [group, key] = path.split('.')
  if (group === 'patient') return referral.patient[key as keyof Referral['patient']]
  if (group === 'clinical') return referral.clinical[key as keyof Referral['clinical']]
  return undefined
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

/**
 * Deterministic requirements check. Produces issues; it never fills in values.
 *
 * - MISSING_REQUIRED: a required field for the specialty is null/empty.
 * - UNCERTAIN_EXTRACTION: an EXTRACTED value has confidence below threshold.
 * - Existing CONFLICTING / HUMAN_REVIEW_REQUIRED issues are preserved (they are
 *   authored by the data source or a human, not derived here).
 */
export function checkRequirements(referral: Referral, requirements: SpecialtyRequirements): Issue[] {
  const derived: Issue[] = []

  for (const path of requirements.requiredFields as FieldPath[]) {
    const field = getField(referral, path)
    if (!field || isEmpty(field.value)) {
      derived.push({
        kind: 'MISSING_REQUIRED',
        field: path,
        message: `${path} is required for ${requirements.specialty} referrals but is not recorded.`,
      })
    }
  }

  const allPaths: FieldPath[] = [
    ...(Object.keys(referral.patient) as (keyof Referral['patient'])[]).map((k) => `patient.${k}` as const),
    ...(Object.keys(referral.clinical) as (keyof Referral['clinical'])[]).map((k) => `clinical.${k}` as const),
  ]
  for (const path of allPaths) {
    const field = getField(referral, path)
    if (
      field &&
      field.source === 'EXTRACTED' &&
      !isEmpty(field.value) &&
      (field.confidence ?? 0) < UNCERTAINTY_THRESHOLD
    ) {
      derived.push({
        kind: 'UNCERTAIN_EXTRACTION',
        field: path,
        confidence: field.confidence,
        message: `${path} was extracted with low confidence and needs confirming.`,
      })
    }
  }

  const preserved = referral.issues.filter(
    (i) => i.kind === 'CONFLICTING' || i.kind === 'HUMAN_REVIEW_REQUIRED',
  )
  return dedupe([...preserved, ...derived])
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>()
  return issues.filter((i) => {
    const key = `${i.kind}:${i.field}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * A human explicitly resolves an issue. This records provenance and removes the
 * flag — it does not change any clinical value on its own.
 */
export function resolveIssue(referral: Referral, issue: Issue, actor: string, note: string): Referral {
  if (!actor || actor === 'system') throw new Error('Issues can only be resolved by a human actor')
  return {
    ...referral,
    issues: referral.issues.filter((i) => !(i.kind === issue.kind && i.field === issue.field)),
    history: [
      ...referral.history,
      {
        at: new Date().toISOString(),
        from: referral.state,
        to: referral.state,
        actor,
        note: `Resolved ${issue.kind} on ${issue.field}: ${note}`,
      },
    ],
  }
}
