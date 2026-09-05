import type { GuidanceRule, PathwayDecision, PathwayKind, PathwayOption, Referral } from './types'

/**
 * Deterministic guidance matcher. Produces pathway *options* from configurable
 * rules; it does not rank, decide, or apply anything.
 */
export function generatePathwayOptions(referral: Referral, guidance: GuidanceRule[]): PathwayOption[] {
  const findings = new Set(referral.features.findings.value ?? [])
  const options: PathwayOption[] = []
  for (const rule of guidance) {
    const allPresent = rule.whenFindings.every((f) => findings.has(f))
    const noneExcluded = (rule.unlessFindings ?? []).every((f) => !findings.has(f))
    if (!allPresent || !noneExcluded) continue
    for (const s of rule.suggests) {
      options.push({ ...s, kind: s.kind, guidanceId: rule.id, source: rule.source })
    }
  }
  return options
}

export interface SelectPathwayInput {
  kind: PathwayKind
  service?: string
  actor: string
  note: string
  now?: () => string
}

/**
 * Records the clinician's explicit pathway decision. Must be a human actor.
 * If the choice is not among the generated options it is recorded as an override
 * and a note is mandatory.
 */
export function selectPathway(referral: Referral, input: SelectPathwayInput): Referral {
  if (!input.actor || input.actor === 'system') throw new Error('Pathway selection requires a clinician')
  if (input.kind === 'SECONDARY_CARE_REFERRAL' && !input.service) {
    throw new Error('A receiving service is required for a secondary-care referral')
  }
  const matches = referral.pathwayOptions.some(
    (o) => o.kind === input.kind && (o.service === undefined || o.service === input.service),
  )
  const override = !matches
  if (override && input.note.trim().length === 0) {
    throw new Error('An override must include a note explaining the decision')
  }
  const decision: PathwayDecision = {
    kind: input.kind,
    service: input.service,
    override,
    actor: input.actor,
    note: input.note,
    at: (input.now ?? (() => new Date().toISOString()))(),
  }
  return {
    ...referral,
    pathway: decision,
    history: [
      ...referral.history,
      {
        at: decision.at,
        from: referral.state,
        to: referral.state,
        actor: input.actor,
        note: `${override ? 'Override: ' : ''}selected pathway ${input.kind}${input.service ? ` → ${input.service}` : ''}. ${input.note}`.trim(),
      },
    ],
  }
}
