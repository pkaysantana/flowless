/**
 * Core referral workflow types.
 *
 * All data here is FICTIONAL. Nothing in this module makes clinical decisions;
 * it only models state and flags that a human must act on.
 */

export const REFERRAL_STATES = [
  'REFERRAL_DECIDED',
  'INFORMATION_ASSEMBLED',
  'REQUIREMENTS_CHECKED',
  'NEEDS_HUMAN_REVIEW',
  'READY_FOR_REVIEW',
  'CLINICIAN_APPROVED',
  'SUBMITTED',
  'TRACKING',
] as const

export type ReferralState = (typeof REFERRAL_STATES)[number]

/** Explicit safety / uncertainty flags. The UI must surface these, never resolve them silently. */
export type IssueKind =
  | 'MISSING_REQUIRED'
  | 'CONFLICTING'
  | 'UNCERTAIN_EXTRACTION'
  | 'HUMAN_REVIEW_REQUIRED'

export interface Issue {
  kind: IssueKind
  /** Field or area the issue relates to, e.g. "patient.nhsNumber" or "clinical.medications". */
  field: string
  /** Plain-language explanation shown to the clinician/admin. */
  message: string
  /** For UNCERTAIN_EXTRACTION: 0..1 confidence reported by the extractor (if any). */
  confidence?: number
  /** For CONFLICTING: the competing values and where they came from. */
  candidates?: { value: string; source: string }[]
}

/**
 * A single referral field value with provenance.
 * `value: null` means "not known" — it is never guessed.
 */
export interface FieldValue<T = string> {
  value: T | null
  source: 'GP_LETTER' | 'EHR' | 'PATIENT' | 'MANUAL' | 'EXTRACTED'
  /** Extraction confidence 0..1 when source is EXTRACTED. */
  confidence?: number
}

export interface Patient {
  /** Fictional identifier only; never a real NHS number. */
  nhsNumber: FieldValue
  fullName: FieldValue
  dateOfBirth: FieldValue
  gpPractice: FieldValue
}

export interface ClinicalSummary {
  reasonForReferral: FieldValue
  relevantHistory: FieldValue
  medications: FieldValue<string[]>
  allergies: FieldValue<string[]>
  /** Free-text urgency as stated by the referrer — not auto-derived. */
  urgency: FieldValue<'ROUTINE' | 'URGENT' | 'TWO_WEEK_WAIT'>
}

export interface HistoryEntry {
  at: string
  from: ReferralState | null
  to: ReferralState
  /** Who/what performed the transition. Clinical judgement steps must be a human actor. */
  actor: string
  note?: string
}

export interface Referral {
  id: string
  /** Target specialty — easy to change while the clinical team refines the workflow. */
  specialty: string
  state: ReferralState
  patient: Patient
  clinical: ClinicalSummary
  issues: Issue[]
  history: HistoryEntry[]
  /** Populated only once SUBMITTED. */
  submission?: { reference: string; submittedAt: string; destination: string }
}

/** Requirements a specialty needs before a referral can be reviewed. Editable per specialty. */
export interface SpecialtyRequirements {
  specialty: string
  requiredFields: string[]
}
