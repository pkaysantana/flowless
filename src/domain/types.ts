/**
 * Care Relay domain types — a location-agnostic diagnostic monitoring request and
 * result-routing layer. All data is fictional. No real NHS integration.
 */

export const REQUEST_STATES = [
  'DRAFT',
  'ACTIVE',
  'PRESENTED',
  'SAMPLE_COLLECTED',
  'LAB_PROCESSING',
  'RESULT_AVAILABLE',
  'AWAITING_CLINICIAN_REVIEW',
  'REVIEWED',
  // Exceptional
  'EXPIRED',
  'CANCELLED',
  'INVALID',
  'ROUTING_FAILED',
] as const
export type RequestState = (typeof REQUEST_STATES)[number]

export const TERMINAL_STATES: ReadonlySet<RequestState> = new Set<RequestState>([
  'REVIEWED',
  'EXPIRED',
  'CANCELLED',
  'INVALID',
])

/** ISO-8601 timestamp string. */
export type Iso = string

/** Fictional demographics. `null` = not recorded; never filled in by the system. */
export interface Demographics {
  fullName: string
  dateOfBirth: string | null
  sex: string | null
  nhsNumber: string | null
  /** Fictional contact details — used only for the simulated email/SMS delivery step. */
  email?: string | null
  phone?: string | null
}

export interface RequestedTest {
  code: string
  name: string
  /** Real SNOMED CT concept id for the test/procedure (see src/data/testPanels.ts). */
  snomedCode: string
  /** Free text for the collector, e.g. "fasting", "citrate tube". */
  instructions?: string
}

export interface Clinician {
  id: string
  name: string
  role: string
  /** NHS Electronic Staff Record number for the requesting clinician. */
  esrNumber: string
}

export interface Organisation {
  id: string
  name: string
  /** Real, standardized NHS ODS trust/organisation code, e.g. "RRK". */
  odsOrgCode: string
}

/**
 * The specific hospital site and local ward/department that raised the request.
 * `odsSiteCode` is real, standardized NHS ODS data (a trust can run several sites).
 * `wardCode`/`wardName` are genuinely trust-invented — the NHS has no national
 * registry below site level.
 */
export interface RequestingSite {
  odsSiteCode: string
  siteName: string
  wardCode: string
  wardName: string
}

/** Where results are sent. Demo abstraction — replace with a real endpoint later. */
export interface RoutingDestination {
  kind: 'CLINICIAN_INBOX' | 'TEAM_INBOX'
  /** Opaque address, e.g. a mailbox id. `null` = not configured (routing will fail). */
  address: string | null
  label: string
}

export interface Recurrence {
  intervalDays: number
  /** No requests are created with validFrom after this date. */
  endsAt: Iso
}

export interface HistoryEntry {
  at: Iso
  actor: string
  from?: RequestState
  to?: RequestState
  note?: string
}

/**
 * A specialist creates a plan once; requests are generated from it.
 * The plan owns the clinical content; a request is one fulfilment window.
 */
export interface MonitoringPlan {
  id: string
  patientRef: string
  demographics: Demographics
  tests: RequestedTest[]
  requestingClinician: Clinician
  requestingOrganisation: Organisation
  requestingSite: RequestingSite
  routing: RoutingDestination
  reasonableAdjustments: string[]
  /** Days a request remains valid after its validFrom. */
  validityDays: number
  recurrence: Recurrence | null
  /** validFrom of the first request. */
  startsAt: Iso
}

export interface MonitoringRequest {
  id: string
  /** Opaque token — the ONLY thing encoded in the QR. Carries no clinical/demographic data. */
  token: string
  planId: string
  /** 1-based position within the plan's recurrence. */
  sequence: number
  patientRef: string
  demographics: Demographics
  tests: RequestedTest[]
  requestingClinician: Clinician
  requestingOrganisation: Organisation
  requestingSite: RequestingSite
  routing: RoutingDestination
  validFrom: Iso
  expiresAt: Iso
  recurrence: Recurrence | null
  reasonableAdjustments: string[]
  status: RequestState
  /** Set when a provider presents the token. Fictional provider name. */
  fulfilledBy?: string
  /** Fictional result summary; never interpreted by the system. */
  result?: { receivedAt: Iso; summary: string }
  history: HistoryEntry[]
}
