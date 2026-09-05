# nxgn-x-tandem — Referral Coordination prototype

Hackathon prototype for a clinical-admin **referral coordination** workflow (Tandem Health / NXGN).

> **All data is fictional.** The app models workflow state and surfaces uncertainty for humans to act on.
> It does **not** make clinical decisions and never fills in missing clinical information.

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

Two fictional referrals load on start (Cardiology by default):

- **REF-DEMO-001 — golden path.** All required fields present; walks straight through to `TRACKING`.
- **REF-DEMO-002 — incomplete / uncertain.** Missing NHS number, allergies and urgency; low-confidence
  extracted DOB; conflicting medication dose between GP letter and EHR. Routes to `NEEDS_HUMAN_REVIEW`
  and cannot progress until a human resolves each issue with a note.

**Reset demo** (header button) restores the seed. Deterministic, safe to repeat on stage.

## Workflow state model

```
REFERRAL_DECIDED → INFORMATION_ASSEMBLED → REQUIREMENTS_CHECKED
                                                 ├─ (issues)    → NEEDS_HUMAN_REVIEW ⇄ READY_FOR_REVIEW
                                                 └─ (no issues) → READY_FOR_REVIEW
READY_FOR_REVIEW → CLINICIAN_APPROVED → SUBMITTED → TRACKING
```

Defined in `src/domain/workflow.ts` as a transition table. Guards enforced by the pure `transition()` function:

- Only listed transitions are allowed.
- Steps marked `requiresHuman` (approve, submit, resolve review) reject the `system` actor.
- `READY_FOR_REVIEW`, `CLINICIAN_APPROVED`, `SUBMITTED` are blocked while any issue is unresolved.
- The outcome of `REQUIREMENTS_CHECKED` is computed (`requirementsOutcome`), not chosen.

### Safety / uncertainty flags (`Issue.kind`)

| Kind                    | Origin                                        |
| ----------------------- | --------------------------------------------- |
| `MISSING_REQUIRED`      | Derived: required field for specialty is null |
| `UNCERTAIN_EXTRACTION`  | Derived: `EXTRACTED` value below confidence threshold (`UNCERTAINTY_THRESHOLD`) |
| `CONFLICTING`           | Authored in data / by integration — preserved |
| `HUMAN_REVIEW_REQUIRED` | Authored by a human — preserved               |

Every field carries provenance (`source`, optional `confidence`); `value: null` means "not known" and is rendered as *Not recorded*.

## Folder map / who owns what

```
src/
  domain/        Pure TS, no React. Types, transition table, requirements check, issue resolution. Tested.
  data/demo/     Editable JSON: referrals.json (scenarios), requirements.json (required fields per specialty).
  store/         In-memory store + React hook. Swap for API/persistence here.
  ui/            React components (App, ReferralDetail, StateBadge). CSS in src/index.css.
  test/          Vitest setup.
```

Three engineers can work in parallel with minimal collisions:

1. **Clinical data / workflow** — edit `data/demo/*.json`; adjust `domain/workflow.ts` transitions or
   `domain/requirements.ts` rules as doctors refine the specialty.
2. **UI/UX** — `ui/`. Consumes the store; no domain logic in components.
3. **Integrations** — implement behind `store/referralStore.ts`.

## Integration points (not built — deliberately)

- **Document/letter extraction** → produce `FieldValue` with `source: 'EXTRACTED'` + `confidence`; the
  requirements check flags low confidence automatically.
- **EHR / FHIR read** → populate `Patient` / `ClinicalSummary` fields with `source: 'EHR'`; conflicts vs.
  letter become `CONFLICTING` issues with `candidates`.
- **e-Referral submission** → replace the stub in `referralStore.transition` (`to === 'SUBMITTED'`).
- **Tracking** → feed status updates into `history` while in `TRACKING`.
- **Auth / actor identity** → replace `DEMO_ACTOR` in `ui/ReferralDetail.tsx` with the signed-in user.
- **Persistence / API** → replace the in-memory store; the domain layer is pure and can run server-side unchanged.

## Guardrails for contributors

- No real patient data, ever. Keep fictional names/IDs obviously fake.
- Never auto-transition through `requiresHuman` steps or auto-resolve issues.
- Never default a `null` clinical value to something plausible.
