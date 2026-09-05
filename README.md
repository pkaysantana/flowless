---

# Flowless

**A closed-loop diagnostic coordination layer that lets specialist diagnostic requests travel with the patient to a convenient collection site, while routing results back to the clinical team responsible for their care.**

## Live prototype

👉 **[Launch Flowless](https://flowless2.netlify.app)**

**Demo flow:** Hospital → Patient → Collection Unit → Laboratory → Responsible Specialist Team

> Hackathon prototype using synthetic/demo patient data.

---

# nxgn-x-tandem — clinician-controlled NHS referral co-pilot (prototype)

Hackathon prototype (Tandem Health / NXGN) combining:

1. **Pathway support** — given a fictional case, surface possible next-step pathways from *configurable*
   local/national guidance (manage in primary care, advice & guidance, community service, further
   investigation first, secondary-care referral). **Recommendations only**: the clinician explicitly chooses or overrides.
2. **Referral pre-flight** — if secondary-care referral is chosen, check the draft against the receiving
   service's *configurable* requirements. Missing / uncertain / conflicting information is surfaced, never inferred.

> **All data is fictional.** The app does **not** make clinical decisions, never fills in missing clinical
> information, and never sends anything — `READY_TO_SEND` is the end of the prototype.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run build`     | Typecheck + production build to `dist/`        |
| `npm run preview`   | Serve the production build                     |
| `npm test`          | Run smoke tests once (Vitest + Testing Library)|
| `npm run test:watch`| Watch mode                                     |
| `npm run lint`      | oxlint                                         |
| `npm run typecheck` | `tsc -b --noEmit`                              |
| `npm run check`     | lint + typecheck + test (run before pushing)   |

Environment variables are optional — see `.env.example`. Never commit `.env`.

## Stack

Vite + React 19 + TypeScript. No backend, no database: state lives in an in-memory store seeded from JSON.
Kept deliberately small so the clinical workflow can change without rewrites.

## Demo

Two fictional cases load on start (cardiology-flavoured guidance by default):

- **CASE-DEMO-001 — golden path.** Exertional chest pain → guidance suggests RACPC referral or A&G.
  Clinician chooses RACPC; pre-flight is clean; clinician approves → `READY_TO_SEND`.
- **CASE-DEMO-002 — failure case.** Palpitations with no ECG → guidance suggests *investigate first* /
  primary care as well as referral. If the clinician refers anyway: missing NHS number, history, allergies and
  urgency; low-confidence extracted DOB; conflicting medication dose (GP letter vs EHR). Routes to `NEEDS_REVIEW`
  and cannot progress until a human resolves each issue with a note.

Any pathway not in the generated options can still be chosen via **override**, which records a mandatory note.

**Reset demo** (header button) restores the seed. Deterministic, safe to repeat on stage.

## Workflow state model

```
CASE_OPENED → PATHWAY_OPTIONS_GENERATED → CLINICIAN_PATHWAY_REVIEW → PATHWAY_SELECTED
    non-referral pathway ─────────────────────────────────────────────→ ACTION_READY
    SECONDARY_CARE_REFERRAL → REFERRAL_DRAFTED → REFERRAL_REQUIREMENTS_CHECKED
                                                   ├─ (issues)    → NEEDS_REVIEW ⇄ READY_FOR_CLINICIAN_APPROVAL
                                                   └─ (no issues) → READY_FOR_CLINICIAN_APPROVAL
    READY_FOR_CLINICIAN_APPROVAL → CLINICIAN_APPROVED → READY_TO_SEND   (terminal — no auto-submission)
```

Defined in `src/domain/workflow.ts` as a transition table. Guards enforced by the pure `transition()` function:

- Only listed transitions are allowed.
- Steps marked `requiresHuman` (review options, select pathway, approve, mark ready) reject the `system` actor.
- `PATHWAY_SELECTED` requires a recorded `PathwayDecision` (`selectPathway`, human only; overrides need a note).
- Leaving `PATHWAY_SELECTED` must follow the branch implied by the decision (`pathwayBranch`).
- `READY_FOR_CLINICIAN_APPROVAL`, `CLINICIAN_APPROVED`, `READY_TO_SEND` are blocked while any issue is unresolved.
- The outcome of `REFERRAL_REQUIREMENTS_CHECKED` is computed (`requirementsOutcome`), not chosen.

### Pathway options (`src/domain/pathways.ts`)

`generatePathwayOptions(case, guidance)` matches `guidance.json` rules against the case's `features.findings`
tags (`whenFindings` all present, `unlessFindings` none present) and returns the rules' `suggests` entries with
traceability (`guidanceId`, `source`). No ranking, no auto-selection.

### Safety / uncertainty flags (`Issue.kind`)

| Kind                    | Origin                                        |
| ----------------------- | --------------------------------------------- |
| `MISSING_REQUIRED`      | Derived: required field for receiving service is null |
| `UNCERTAIN_EXTRACTION`  | Derived: `EXTRACTED` value below confidence threshold (`UNCERTAINTY_THRESHOLD`) |
| `CONFLICTING`           | Authored in data / by integration — preserved |
| `HUMAN_REVIEW_REQUIRED` | Authored by a human — preserved               |

Every field carries provenance (`source`, optional `confidence`); `value: null` means "not known" and is rendered as *Not recorded*.

## Folder map / who owns what

```
src/
  domain/        Pure TS, no React. Types, transition table, pathway matcher, requirements check, issue resolution. Tested.
  data/demo/     Editable JSON: referrals.json (cases), guidance.json (pathway rules), requirements.json (per receiving service).
  store/         In-memory store + React hook. Swap for API/persistence here.
  ui/            React components (App, ReferralDetail, PathwayPanel, StateBadge). CSS in src/index.css.
  test/          Vitest setup.
```

Three engineers can work in parallel with minimal collisions:

1. **Clinical data / workflow** — edit `data/demo/*.json` (guidance rules, service requirements, cases);
   adjust `domain/workflow.ts` transitions or `domain/requirements.ts` rules as doctors refine the flow.
2. **UI/UX** — `ui/`. Consumes the store; no domain logic in components.
3. **Integrations** — implement behind `store/referralStore.ts`.

## Integration points (not built — deliberately)

- **Document/letter extraction** → produce `FieldValue` with `source: 'EXTRACTED'` + `confidence`; the
  requirements check flags low confidence automatically.
- **EHR / FHIR read** → populate `Patient` / `ClinicalSummary` fields with `source: 'EHR'`; conflicts vs.
  letter become `CONFLICTING` issues with `candidates`.
- **Guidance source** → replace `DEMO_GUIDANCE` with a loader for real local/national guidance; keep the
  `GuidanceRule` shape (or map into it). Richer matching (age, vitals) goes in `domain/pathways.ts`.
- **Receiving-service requirements** → replace `requirementsFor()` in `data/demo/index.ts` (e.g. DoS lookup).
- **Sending** → deliberately absent. `READY_TO_SEND` is terminal; any future send step must be a separate,
  explicit human action.
- **Auth / actor identity** → replace `DEMO_ACTOR` in `ui/ReferralDetail.tsx` with the signed-in user.
- **Persistence / API** → replace the in-memory store; the domain layer is pure and can run server-side unchanged.

## Guardrails for contributors

- No real patient data, ever. Keep fictional names/IDs obviously fake.
- Never auto-transition through `requiresHuman` steps, auto-select a pathway, or auto-resolve issues.
- Never default a `null` clinical value to something plausible.
