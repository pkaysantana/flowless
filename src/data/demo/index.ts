/**
 * FICTIONAL demo data. Edit the JSON files in this folder to change guidance,
 * receiving-service requirements, or case scenarios — no code changes needed.
 *
 * - referrals.json     : CASE-DEMO-001 = golden path, CASE-DEMO-002 = incomplete/uncertain
 * - guidance.json      : local/national guidance rules → pathway options
 * - requirements.json  : required fields per receiving service (referral pre-flight)
 */
import type { GuidanceRule, Referral, ServiceRequirements } from '../../domain'
import referralsJson from './referrals.json'
import requirementsJson from './requirements.json'
import guidanceJson from './guidance.json'

export const DEMO_REFERRALS = referralsJson as Referral[]
export const DEMO_REQUIREMENTS = requirementsJson as ServiceRequirements[]
export const DEMO_GUIDANCE = guidanceJson as GuidanceRule[]

/** Deep-clone so callers can mutate freely and `reset` always returns pristine data. */
export function loadDemoReferrals(): Referral[] {
  return structuredClone(DEMO_REFERRALS)
}

export function requirementsFor(service: string): ServiceRequirements {
  const found = DEMO_REQUIREMENTS.find((r) => r.service === service)
  if (!found) {
    throw new Error(`No requirements configured for service "${service}" (see src/data/demo/requirements.json)`)
  }
  return found
}

export function knownServices(): string[] {
  return DEMO_REQUIREMENTS.map((r) => r.service)
}
