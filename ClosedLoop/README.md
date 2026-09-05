# Care Relay — monitoring bloods without the paperwork

A prototype of the relay: a patient takes an opaque code to **any** collection unit, the sample
carries that code to the lab on a printed barcode, and the result routes itself back to the
requesting clinician. Four actors, four screens, one laptop.

**All data is fictional.** No backend, no network, nothing is sent anywhere. The NHS App screen is
a concept mockup, not an integration.

---

## Run it

Double-click `index.html`. That is the whole setup.

No build step, no `npm install`, no server, no internet. Plain `<script>` tags rather than ES
modules, precisely so `file://` works — modules are blocked by CORS from the filesystem, which
would have made a laptop demo fail in the room.

If you would rather serve it (nicer URLs in the address bar for the audience):

```bash
python3 -m http.server 8080     # then open http://localhost:8080
```

Run the tests:

```bash
node tests/run.js               # 31 tests, no framework, no install
```

---

## The demo script

Roughly three minutes. The header tabs switch between actors — each is a hash change, so the
in-memory state survives the whole walkthrough. **Do not reload the page mid-demo.**

1. **Hospital** — you land on Aisha Demo-Kaur, an INR plan repeating every 28 days. Point out the
   access code panel: *"the QR carries this code and nothing else."*
2. **+ New plan** — create one live if you have time (30 seconds: name, DOB, NHS number, a test or
   two, an adjustment). Otherwise skip and keep using Aisha.
3. **Issue QR to patient**, then **Notify patient** → shows the email and SMS that would go out.
   Sending records it in the history; no provider is contacted.
4. **Print patient letter** — the paper route, for the patient with no smartphone. Real QR, real
   code in plain type underneath.
5. **Collection unit** tab → the code is pre-filled as a shortcut, or type it. Note that
   **reasonable adjustments are the first thing on the page** — the phlebotomist knows before the
   patient has to explain.
6. **QR presented and scanned** → **Sample collected** → **Print specimen label**. This is the
   answer to *"how does the token reach the lab when the patient has gone home?"* It travels on the
   tube, as a Code 39 barcode. Nothing identifying is on the label.
7. **Laboratory** tab → scan/type the same code → **Lab receives specimen** → enter a result.
   The lab is a real actor here, not a "Simulate" button on the hospital's screen.
8. Entering the result **routes it automatically** — back on the **Hospital** tab it is now awaiting
   review, addressed to the named clinician at the resolved ODS site. Review it, and the next
   occurrence of the recurring plan is scheduled on the spot.
9. **The failure case** — open Tom Demo-Whyte. His sample was taken at RRK07, a site that is not in
   the results-distribution directory. The lab did its job, the result exists, and it has **nowhere
   to go**. That is the failure this project removes; a human has to route it by hand.
10. **Patient** tab → the NHS App concept mockup. Labelled on screen as a concept, twice.

**Reset demo** in the header restores the seed at any point. Deterministic, safe to repeat.

---

## What is real and what is not

Worth being straight about this if anyone asks — the honest version is more persuasive than the
hand-wave.

| | Status |
| --- | --- |
| Workflow state machine, guards, role enforcement | **Real.** Pure functions, unit tested. |
| QR codes | **Real.** Hand-written ISO/IEC 18004 encoder, verified by decoding the rendered pixels. |
| Specimen barcode | **Real** Code 39, verified the same way — scan the screen with a barcode app. |
| SNOMED CT codes | **Real** concept ids, verified against a terminology server (caveats below). |
| ODS trust code `RRK` | **Real** — University Hospitals Birmingham NHS Foundation Trust. |
| ODS site codes, ward codes | **Structured like the real thing**, names illustrative. Ward codes are trust-invented by design — the NHS has no national registry at that granularity. |
| Result routing | **Real logic** against a directory, but the directory is three rows of demo data. |
| Cross-device phone scanning | **No.** One laptop, hash-routed screens. Scanning a QR pointing at `file://` would not open on a phone. |
| Email / SMS delivery | **Simulated.** No provider is contacted; sending writes a history note. |
| NHS App | **Concept mockup only.** No API, no affiliation, no endorsement. |
| Backend, database, multi-device sync | **None.** In-memory, single tab. |

### SNOMED CT codes

Ordered tests carry **procedure** concepts, because NHS England's pathology standards say procedure
concepts represent test *requests* and observable entities represent *results*. Both are stored.

| Panel | Order code (procedure) | Result code (observable) |
| --- | --- | --- |
| FBC | `26604007` Complete blood count | `1022441000000101` |
| INR | `440685005` Calculation of international normalized ratio | `165581004` |
| U&E | `252167001` Measurement of urea and electrolytes | `1000971000000107` |
| LFT | `26958001` Hepatic function panel | `997531000000108` |
| TFT | `35650009` Thyroid panel | `1016851000000107` |
| HbA1c | `43396009` Hemoglobin A1c measurement | `1003671000000109` |

Each was confirmed by `$lookup` against the HL7 FHIR terminology server, against both SNOMED CT
International and the UK Edition (release 20230412), with code, fully specified name and semantic
tag seen together.

**The plan's INR code was wrong** — `49578-6` is a LOINC code, not SNOMED. Corrected above.

Two things deliberately *not* claimed:

- **PaLM refset membership was not verified.** NHS England's rule (requests = procedure concepts,
  held in the pathology procedure simple reference set) is confirmed, but the refset content sits
  behind a TRUD login. "This is the code UK order comms uses" is an inference from the hierarchy
  rule, not from checking the refset. If a terminology specialist is in the room, soften that claim.
- **Currency against a 2025/26 UK release.** The reachable UK load was April 2023. None of the six
  showed as inactive, but it was not diffed against a current release. Five minutes on
  `termbrowser.nhs.uk` before the demo would close that off.

---

## Lifecycle

```
REQUEST_CREATED → QR_ISSUED → PRESENTED_AT_COLLECTION → SAMPLE_COLLECTED
  → LAB_PROCESSING → RESULT_AVAILABLE
      ├─ routed   → AWAITING_CLINICIAN_REVIEW → REVIEWED   (terminal)
      └─ no route → ROUTING_FAILED ⇄ AWAITING_CLINICIAN_REVIEW
  any non-terminal state → CANCELLED   (terminal)
```

`js/domain/workflow.js` holds this as a transition table. `transition()` is a pure function of a
snapshot and is the only thing that grants permission; `store.applyStep()` is the only thing that
writes state, and it asks first. So a guard cannot be bypassed by adding a screen.

Guards:

- Only listed transitions exist.
- `requiresHuman` steps reject the `system` actor.
- Every step is pinned to **one role** — the hospital cannot receive its own specimen, the lab
  cannot review a result. Blocked steps are shown with the reason rather than hidden.
- A result cannot be marked available without one recorded.
- Routing is computed from the ODS lookup, never chosen by a caller.

**Plan §2 is applied:** `SAMPLE_COLLECTED → LAB_PROCESSING` and `LAB_PROCESSING → RESULT_AVAILABLE`
are now `requiresHuman: true` and belong to the lab. `receiveResult(id, summary, actor, detail)`
takes the lab as the actor instead of hardcoding `'system'`. Routing itself stays automatic.

---

## Files

```
index.html              The shell. Script order matters: domain → data → store → ui.
css/app.css             Everything, including the print styles for letter and label.
js/lib/qrcode.js        QR encoder (byte mode, ECC M, versions 1–10). No CDN, no network.
js/lib/code39.js        Code 39 barcode for the specimen label.
js/domain/              Pure. No DOM, no store. Loadable in Node, unit tested.
  types.js              States, roles, constructors, formatting.
  workflow.js           Transition table + transition(). The rules live here.
  tokens.js             Opaque tokens. No PII, ever.
  recurrence.js         Plan → dated request occurrences.
  routing.js            ODS resolution, and why routing fails.
js/data/                Editable demo content.
  testPanels.js         The SNOMED picklist, with sources and caveats in the header.
  odsDirectory.js       Distribution directory. RRK07 is missing on purpose.
  demoPlans.js          The two seeded scenarios.
js/store/requestStore.js  In-memory store. createPlan, applyStep, receiveResult, routeResult.
js/ui/                  One file per screen.
  route.js              Hash routing — console | new | request | present | lab | nhsapp | letter | label
  consoleView.js        Hospital. Also the patient-delivery actions.
  newRequestForm.js     §5 intake form.
  providerView.js       Collection unit. §6 print specimen label.
  labView.js            §6 the lab, as a real actor.
  nhsAppMock.js         §7 concept mockup.
  printViews.js         §7 patient letter, §6 specimen label.
tests/run.js            node tests/run.js
```

---

## Notes for whoever picks this up next

- **Tokens carry nothing.** One occurrence, one token, drawn from an alphabet with no `I`, `O`, `0`
  or `1` so a smudged label cannot be misread. A test asserts across 300 tokens that no patient
  identifier leaks in.
- **`null` is never defaulted.** A missing value renders as *Not recorded*, in one place
  (`ui.field`), in red. Nothing is guessed on a clinical record.
- **Reasonable adjustments are load-bearing**, not decoration. They are the first panel on the
  collection unit screen and they appear in the patient letter and the NHS App mockup, because the
  point of carrying them on the request is that the patient stops having to re-explain themselves.
- **Adding a backend** later touches `js/store/requestStore.js` and nothing else. The domain layer
  has no idea where state lives — that was the plan's premise and it still holds.
- The intake form's site picker includes RRK07 with a visible warning, so you can create a fresh
  failing case live if a judge asks "what happens when it breaks?"
