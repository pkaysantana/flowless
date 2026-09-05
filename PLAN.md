# Care Relay — 1-hour demo build-out (descoped)

## ⚠️ Time-boxed rescope

The user has **~1 hour** before presenting, live, from their own laptop — no public
deployment. That kills two things from the original plan:

- **No Django/backend.** The existing in-memory `requestStore.ts` already lets the demo
  move between "specialist console" and "provider view" *within one browser tab* via
  hash-link navigation without losing data (that's how today's README walkthrough
  already works — a hash change is not a page reload, so the module-level `state`
  survives it). Standing up Django, wiring polling, and reworking `useSyncExternalStore`
  for async loading is real integration-and-debugging time this doesn't have. All new
  views below read/write the same existing in-memory store, same as today.
- **No real cross-device phone scan.** That would need both devices hitting a shared
  server over local WiFi — the same class of live-demo risk (network/CORS/firewall) as
  deployment, just local. Instead: one laptop, multiple hash-routed "screens," clicked
  through in front of judges — same story, no network dependency.

Everything below is additive to the current codebase, not a rewrite. §1–3 (data model,
workflow correction, SNOMED list) are unchanged from the original plan and still worth
doing — they're small, self-contained, and covered by existing tests. §4 (backend) is
dropped. §5–8 are simplified to plain hash-routed views against the existing store.

---

## Original context (why these changes, background)

The existing codebase (`care-relay`) is a well-designed single-tab demo: pure domain
state machine (`src/domain/`), an in-memory store (`src/store/requestStore.ts`), and two
UI views (specialist console, provider "present" view). It correctly models the
hospital → collection unit → lab → hospital result flow *conceptually*, but:

- it only runs inside one browser tab (in-memory state — a phone scanning a QR from a
  laptop sees nothing),
- there is no way to actually create a new monitoring plan/request (only seed JSON),
- requester identifiers don't include ODS number, ESR number, or a unit number,
- test codes are placeholder strings, not real SNOMED CT codes,
- the lab step is a button the hospital clicks to fake it — there's no real lab actor,
  no barcode/label concept, and no answer to "how does the token get to the lab when
  the patient isn't there,"
- there's no way to actually get the QR to a patient (print / email / SMS / NHS App).

Decisions already made with the user:
- **Lab hand-off**: physical barcode label on the sample tube, printed by the collection
  unit, scanned by the lab. No digital "send to lab" step needed.
- **Backend**: build a real shared backend now — **Django REST Framework + polling** (not
  Supabase) — so hospital / patient / collection unit / lab are genuinely separate
  devices, not one browser tab. The domain layer (`src/domain/*`) is pure, framework-
  agnostic TS with no dependency on any backend, so it keeps running client-side
  unchanged; only `requestStore.ts`'s internals change (see §4). Polling (not Django
  Channels/WebSockets) was chosen to keep the hackathon build simple — no Redis/ASGI
  needed. Caveat: the client, not Django, still applies the state-machine rules before
  writing back, same trust model as today's in-memory store — fine for a demo, not for
  production.
- **Test coding**: static curated list, but using **real, accurate SNOMED CT codes** for
  the tests included, so the demo mirrors the real workflow.
- **QR delivery**: build Print (real) + Email/SMS (simulated, no real provider) + an NHS
  App **mockup screen** (phone-frame UI showing QR + due date + reminder) purely to pitch
  "this could plug into the NHS App" — not a real integration, since the demo is a
  presentation, not a code walkthrough.
- **Requester identity uses real NHS ODS hierarchy**, not a fully invented field: ODS
  trust code + ODS site code (both real, nationally standardized) plus a local
  ward/department code underneath (genuinely trust-invented — the NHS has no national
  registry at that granularity). Requesting clinician keeps **ESR number only**, as
  originally specified (note: real pathology order-comms usually uses a GMC number for
  this, since ESR is an HR/payroll identifier, not a clinical one — flagged, not changed,
  per the user's explicit choice).

This plan turns the single-tab demo into a real multi-actor prototype without discarding
the domain layer, which is sound and should be kept almost as-is.

## 1. Data model changes (`src/domain/types.ts`)

- `Organisation`: add `odsOrgCode: string` — the real NHS ODS trust code (e.g. `RRK`).
- Add new `RequestingSite` type — real ODS site-level data plus a locally-invented ward/
  department code underneath it:
  ```ts
  export interface RequestingSite {
    odsSiteCode: string   // real, standardized NHS ODS site code, e.g. "RRK01"
    siteName: string
    wardCode: string      // trust-internal, invented — no national registry, e.g. "HAEM-OP-C"
    wardName: string
  }
  ```
  Add `requestingSite: RequestingSite` to `MonitoringPlan` and `MonitoringRequest`,
  alongside the existing `requestingOrganisation: Organisation`.
- `Clinician`: add `esrNumber: string` (ESR staff number) — ESR only, as specified.
- `RequestedTest`: add `snomedCode: string` alongside existing `code`/`name` (keep `code`
  as the short local panel code, e.g. `INR`, `FBC`; `snomedCode` is the real SNOMED CT
  concept id).
- `Demographics`: add optional `email?: string | null` and `phone?: string | null` — needed
  for the (simulated) email/SMS delivery step.
- No changes to `RequestState`/`TERMINAL_STATES` shape.

## 2. Lifecycle correction (`src/domain/workflow.ts`)

Today `SAMPLE_COLLECTED → LAB_PROCESSING` and `LAB_PROCESSING → RESULT_AVAILABLE` are
`requiresHuman: false` (the hospital console fakes them with "Simulate" buttons). With a
real lab actor these become genuine human actions:

- `SAMPLE_COLLECTED → LAB_PROCESSING`: `requiresHuman: true`, label "Lab receives
  specimen" — performed by lab staff scanning the barcode label.
- `LAB_PROCESSING → RESULT_AVAILABLE`: `requiresHuman: true`, label "Result entered" —
  performed by lab staff entering the result.
- `RESULT_AVAILABLE → AWAITING_CLINICIAN_REVIEW` / `ROUTING_FAILED` stay
  `requiresHuman: false` — this is genuinely automatic routing logic, unchanged.

`requestStore.receiveResult(id, summary, actor)` gains an `actor` parameter (lab name)
instead of hardcoding `'system'` for the `RESULT_AVAILABLE` transition; `routeResult`
itself is unchanged (still system/automatic).

## 3. Curated SNOMED CT test list (`src/data/testPanels.ts`, new)

A small static table of realistic test panels with real SNOMED CT codes, e.g.:
`FBC` (Full blood count, 26604007), `INR` (International normalised ratio, 49578-6 →
use the correct SNOMED procedure code, not LOINC — verify each code against the NHS
SNOMED CT UK browser during implementation), `TFT`, `U&E`, `HbA1c`, `LFT`. Exposed as a
picklist for the new intake form (§5). Clearly commented as a demo subset, not the full
NHS terminology.

## 4. ~~Shared backend~~ — dropped for tonight, see rescope note above

`requestStore.ts` is untouched except for one small addition: a `createPlan(plan)`
method (needed by §5) that appends to `state.plans`, computes `requestFromPlan(plan, 1)`
(existing, `src/domain/recurrence.ts`, unchanged), appends to `state.requests`, and
`emit()`s — same pattern as the existing `scheduleNext` internal helper.

## 5. New hospital intake form (`src/ui/NewRequestForm.tsx`, new)

Nothing today lets a user actually create a plan — only seed JSON exists. Add a form,
launched from the specialist console, capturing:
- requesting organisation (ODS trust code + name), requesting site (ODS site code, site
  name, local ward code + ward name), requesting clinician (name, role, ESR number),
- patient demographics (name, DOB, NHS number, optional email/phone for delivery),
- one or more tests picked from the curated SNOMED list (§3),
- reasonable adjustments (free-text tags, reusing the existing pattern),
- one-off vs recurring toggle → interval (days) + end date, matching the existing
  `Recurrence` shape.

On submit: build a `MonitoringPlan` object and call the new `requestStore.createPlan(plan)`
(§4) — synchronous, same as every other store method today.

## 6. Lab view (`src/ui/LabView.tsx`, new) + barcode label

- New route `#/lab/<token>` (extend `src/ui/route.ts`'s `Route` union and `parseRoute`).
- Lab staff scan/paste the token (same pattern as `ProviderView`), see the request only
  once it's `SAMPLE_COLLECTED`, and can: confirm "Sample received" (→ `LAB_PROCESSING`,
  human actor = lab name) and later enter a result (→ `RESULT_AVAILABLE` via
  `receiveResult(id, summary, labActor)`).
- In `ProviderView.tsx`, after "Confirm sample collected" succeeds, add a "Print
  specimen label" action: opens a print-friendly window rendering the same opaque QR
  token (via `presentUrl`-style link but pointed at `#/lab/<token>`) plus the request id
  — no patient name/DOB on the label, consistent with the existing no-PII-in-QR design.

## 7. Patient delivery (§ print / simulated email-SMS / NHS App mockup)

- **Print**: in `RequestDetail.tsx`, add a "Print patient letter" action opening a
  print-optimized view (new `src/ui/PatientLetter.tsx`, reusing `QRCodeSVG` +
  `presentUrl`) styled like a real patient letter (test name, when/where to go, QR).
- **Email/SMS (simulated)**: a "Notify patient" action in `RequestDetail.tsx` that does
  not call a real provider — it renders a preview modal of the email/SMS content
  (using `demographics.email`/`phone` if present) and appends a `HistoryEntry` note like
  `Simulated email sent to <address>` / `Simulated SMS sent to <phone>` so it shows up in
  the request history for the demo narrative.
- **NHS App mockup**: new route `#/nhsapp/<token>` (`src/ui/NhsAppMock.tsx`) — a
  phone-frame-styled screen showing the QR, next-due date (from `recurrence`), and a
  reminder banner, explicitly labelled as a concept mockup of NHS App integration for
  pitching purposes.

## 8. Routing & nav (`src/ui/route.ts`, `src/ui/App.tsx`)

Extend `Route` to `{view:'console'} | {view:'present', token} | {view:'lab', token} |
{view:'nhsapp', token}`, update `parseRoute`/header nav links accordingly so each actor
(hospital, collection unit, lab, patient/NHS App) has its own shareable URL — this is
what actually lets four separate devices act out the flow.

## 9. Demo data / tests

- Update `src/data/demo/plans.json` with the new required fields (ODS org + site codes,
  ward code/name, ESR number, SNOMED codes) so the two existing scenarios keep working.
- Update `src/domain/workflow.test.ts` and `src/ui/App.test.tsx` for the
  `requiresHuman` changes in §2 and the `receiveResult` signature change.
- Add a focused test for the new lab-actor transitions (human required, correct actor
  recorded in history).

## Verification

1. `npm run check` (lint + typecheck + vitest) — the domain module changes (§1, §2) are
   the highest-risk part and are fully covered by `workflow.test.ts`; fix breakage from
   the `requiresHuman`/`receiveResult` signature changes rather than expanding coverage —
   no time budget for new test suites tonight.
2. Manual single-laptop walkthrough in one browser tab, all via hash-link navigation
   (no reload, so the in-memory store persists across every step): create a request
   (§5) → open provider view (existing) → present → confirm collected → "print specimen
   label" (§6) → open lab view (§6) → receive sample → enter result → back to console,
   confirm routing/review → open the NHS App mockup (§7) and print patient letter (§7).
3. Re-run the QR-privacy test (`workflow.test.ts`'s "QR token" describe block) to confirm
   no PII leaks into the token after the new fields are added.
