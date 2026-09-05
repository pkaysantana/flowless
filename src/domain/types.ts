/**
 * Core case / referral workflow types.
 *
 * All data here is FICTIONAL. Nothing in this module makes clinical decisions;
 * it only models state, pathway *options* and flags that a human must act on.
 */

export const CASE_STATES = [
  'CASE_OPENED',
  'PATHWAY_OPTIONS_GENERATED',
  'CLINICIAN_PATHWAY_REVIEW',
  'PATHWAY_SELECTED',
  // non-referral branch
  'ACTION_READY',
  // referral branch
  'REFERRAL_DRAFTED',
  'REFERRAL_REQUIREMENTS_CHECKED',
  'NEEDS_REVIEW',
  'READY_FOR_CLINICIAN_APPROVAL',
  'CLINICIAN_APPROVED',
  'READY_TO_SEND',
] as const

export type CaseState = (typeof CASE_STATES)[number]
/** @deprecated alias kept for readability in older code */
export type ReferralState = CaseState

/** Pathway kinds. Editable: add new kinds here and in guidance.json. */
export const PATHWAY_KINDS = [
  'MANAGE_IN_PRIMARY_CARE',
  'ADVICE_AND_GUIDANCE',
  'COMMUNITY_SERVICE',
  'FURTHER_INVESTIGATION_FIRST',
  'SECONDARY_CARE_REFERRAL',
] as const
export type PathwayKind = (typeof PATHWAY_KINDS)[number]

/** A pathway *suggestion* produced by matching configurable guidance. Never auto-applied. */
export interface PathwayOption {
  kind: PathwayKind
  /** Guidance rule id that produced this option (for traceability). */
  guidanceId: string
  title: string
  rationale: string
  /** Receiving service for SECONDARY_CARE_REFERRAL / COMMUNITY_SERVICE options. */
  service?: string
  source: string
}

/** The clinician's explicit pathway decision. */
export interface PathwayDecision {
  kind: PathwayKind
  service?: string
  /** true when the clinician chose something not in the generated options. */
  override: boolean
  actor: string
  note: string
  at: string
}

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
  from: CaseState | null
  to: CaseState
  /** Who/what performed the transition. Clinical judgement steps must be a human actor. */
  actor: string
  note?: string
}

/** Structured, clinician-entered case features used ONLY for guidance matching. */
export interface CaseFeatures {
  presentingProblem: FieldValue
  /** Simple tags such as "chest-pain", "ecg-normal". Editable in demo data. */
  findings: FieldValue<string[]>
}

export interface Referral {
  id: string
  state: CaseState
  patient: Patient
  features: CaseFeatures
  clinical: ClinicalSummary
  /** Generated pathway suggestions (recommendations only). */
  pathwayOptions: PathwayOption[]
  /** Set only by an explicit clinician action. */
  pathway?: PathwayDecision
  issues: Issue[]
  history: HistoryEntry[]
}
/** A case is a referral-in-the-making; same shape. */
export type ClinicalCase = Referral

/** Requirements a receiving service needs before a referral is ready. Editable per service. */
export interface ServiceRequirements {
  service: string
  requiredFields: string[]
}

/** A configurable guidance rule (local/national). Matches when ALL `whenFindings` tags are present. */
export interface GuidanceRule {
  id: string
  source: string
  whenFindings: string[]
  /** Optional: only match when NONE of these tags are present. */
  unlessFindings?: string[]
  suggests: {
    kind: PathwayKind
    title: string
    rationale: string
    service?: string
  }[]
}
