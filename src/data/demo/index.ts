/**
 * FICTIONAL demo data. Edit the JSON files in this folder to change the
 * specialty, required fields, or referral scenarios — no code changes needed.
 *
 * - referrals.json     : REF-DEMO-001 = golden path, REF-DEMO-002 = incomplete/uncertain
 * - requirements.json  : required fields per specialty
 */
import type { Referral, SpecialtyRequirements } from '../../domain'
import referralsJson from './referrals.json'
import requirementsJson from './requirements.json'

export const DEMO_REFERRALS = referralsJson as Referral[]
export const DEMO_REQUIREMENTS = requirementsJson as SpecialtyRequirements[]

/** Deep-clone so callers can mutate freely and `reset` always returns pristine data. */
export function loadDemoReferrals(): Referral[] {
  return structuredClone(DEMO_REFERRALS)
}

export function requirementsFor(specialty: string): SpecialtyRequirements {
  const found = DEMO_REQUIREMENTS.find((r) => r.specialty === specialty)
  if (!found) {
    throw new Error(`No requirements configured for specialty "${specialty}" (see src/data/demo/requirements.json)`)
  }
  return found
}
