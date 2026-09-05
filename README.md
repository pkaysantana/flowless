# Flowless

A location-agnostic diagnostic monitoring request and result-routing layer (hackathon prototype).

A specialist creates a monitoring plan once. The system creates portable diagnostic requests that
can be fulfilled at any participating local phlebotomy provider. Results route directly back to the
requesting specialist/team. Recurring plans create the next request at clinician-defined intervals.

**All data is fictional. No real NHS/EHR/lab integration. No LLM. No authentication.**

## Setup

```bash
npm install
cp .env.example .env   # optional — all variables have defaults
npm run dev            # http://localhost:5173
```

| Command             | What it does                    |
| ------------------- | ------------------------------- |
| `npm run dev`       | dev server                      |
| `npm run build`     | typecheck + production build    |
| `npm run check`     | lint + typecheck + tests        |
| `npm test`          | vitest (domain + UI smoke)      |
| `npm run lint`      | oxlint                          |
| `npm run typecheck` | `tsc -b --noEmit`               |

## Demo scenarios (deterministic)

The demo clock is frozen at **2026-09-05** (`DEMO_NOW` in `src/data/demo/index.ts`) so the scenarios
never drift. "Reset demo" restores both.

| Request | Patient (fictional) | Scenario |
| --- | --- | --- |
| `PLAN-DEMO-001-R01` | Jordan Sample — INR every 28 days | **Golden path.** Valid 1–15 Sep. Present → collect → lab → result routed to the anticoagulation team inbox → clinician review. Confirming collection creates `…-R02` (valid from 29 Sep). Generation stops after the recurrence end date. |
| `PLAN-DEMO-002-R01` | Priya Placeholder — TFT + FBC, one-off | **Expired.** Was valid 1–15 Jul. Presenting the token records `EXPIRED` and refuses collection with a visible error. |

Golden-path walkthrough: in the console click **Open provider view for this token** (or scan the QR
with a phone pointed at the same dev server) → **Present token** → **Confirm sample collected** →
back to the console → **Simulate: lab receives sample** → **Simulate: lab result available → route** →
**Mark reviewed**.

## QR invariant

The QR encodes **only** `<origin>/#/present/<opaque token>`. The token is a hash of `(planId, sequence)`
in the demo and carries no clinical or demographic data; the provider view resolves it against the
request store. `src/domain/workflow.test.ts` asserts the token contains no patient/test identifiers.

## Lifecycle

```
DRAFT → ACTIVE → PRESENTED → SAMPLE_COLLECTED → LAB_PROCESSING → RESULT_AVAILABLE
      → AWAITING_CLINICIAN_REVIEW → REVIEWED
Exceptional: EXPIRED, CANCELLED, INVALID, ROUTING_FAILED (→ retry → AWAITING_CLINICIAN_REVIEW)
```

- `transition()` — pure, table-driven (`TRANSITIONS`), throws `TransitionError` for disallowed moves;
  `requiresHuman` steps reject `actor: 'system'`.
- `present()` — the guarded entry into `PRESENTED`: token must match, request must be `ACTIVE`, and
  the demo clock must be inside `[validFrom, expiresAt]`. Lapsed requests become `EXPIRED` and throw
  `ExpiredOnPresentError` (collection refused).
- `routeResult()` — computes `AWAITING_CLINICIAN_REVIEW` or `ROUTING_FAILED` from the routing
  destination; the caller never picks the outcome.
- `nextScheduledRequest()` — creates request `n+1` from the plan at `intervalDays`, stopping at
  `recurrence.endsAt`. The store calls it when a sample is collected.

## Folder map

| Path | Owns | Notes |
| --- | --- | --- |
| `src/domain/types.ts` | `MonitoringPlan`, `MonitoringRequest`, `RequestState`, routing/recurrence types | pure types |
| `src/domain/workflow.ts` | transition table, `transition`, `present`, `routeResult`, errors | pure functions, fully tested |
| `src/domain/recurrence.ts` | `demoToken`, `requestFromPlan`, `nextScheduledRequest` | pure |
| `src/data/demo/plans.json` | editable fictional plans | requests are derived from plans |
| `src/data/demo/index.ts` | demo clock + seed loaders | |
| `src/store/requestStore.ts` | in-memory store, `useRequestStore()`, `reset()` | **persistence seam** |
| `src/ui/App.tsx` | header, hash routing, request list | |
| `src/ui/RequestDetail.tsx` | specialist console: QR, actions, routing, history | |
| `src/ui/ProviderView.tsx` | phlebotomy provider: token → request, present/collect | `#/present/<token>` |
| `src/ui/route.ts` | hash router + `presentUrl()` | |

## Integration points (for Oleg's frontend)

Everything the UI does goes through two surfaces; a replacement frontend can keep them as-is:

1. **Read:** `useRequestStore()` → `{ plans, requests }`, or `requestStore.getSnapshot()` /
   `requestStore.byToken(token)`.
2. **Write:** `requestStore.transition(id, to, actor, note?)`, `requestStore.present(token, provider)`,
   `requestStore.receiveResult(id, summary)`, `requestStore.reset()`. All throw `TransitionError`
   (`.code`: `NOT_ALLOWED | HUMAN_REQUIRED | TOKEN_MISMATCH | NOT_YET_VALID | EXPIRED | NOT_PRESENTABLE | NO_ROUTING_DESTINATION`)
   — surface `.message` to the user.
3. **QR:** render `presentUrl(request.token)` (see `src/ui/route.ts`) with any QR component; never
   render anything else into the QR.
4. **Actors:** `DEMO_ACTOR` / `DEMO_PROVIDER` constants are placeholders for a demo login.
5. **Clock:** `requestStore.now()` — swap `demoClock` for `() => new Date().toISOString()` for live time.
6. **Persistence / cross-device:** replace the module-level `state` in `requestStore.ts` with an API or
   Supabase table; the domain functions are pure and unaffected. Needed before a phone can scan a
   QR produced on a laptop and see the same record.
7. **Lab / routing:** `receiveResult` and `routeResult` are the seams for a real lab feed and a real
   results destination.
