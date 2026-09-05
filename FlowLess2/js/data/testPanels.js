/* =========================================================================
 * data/testPanels.js — curated test picklist with real SNOMED CT codes.
 *
 * Plan §3. A deliberately small demo subset, NOT the full NHS terminology.
 *
 * Which hierarchy: NHS England's pathology standards state that *procedure*
 * concepts are used for test REQUESTS (held in the PaLM procedure simple
 * reference set) and *observable entity* concepts represent RESULTS. These are
 * request forms, so `snomedCode` is the procedure concept; `snomedResultCode`
 * is carried alongside for when the lab enters a result.
 *   https://digital.nhs.uk/services/pathology-standards-and-implementation/snomed-ct-for-pathology-reporting
 *
 * Every code below was confirmed by $lookup against the HL7 FHIR terminology
 * server for both SNOMED CT International and the SNOMED CT UK Edition
 * (http://snomed.info/sct/83821000000107, release 20230412) — code, fully
 * specified name and semantic tag seen together.
 *
 * TWO HONEST CAVEATS, worth knowing before anyone asks in a Q&A:
 *
 *  1. Membership of the PaLM procedure simple reference set was NOT verified —
 *     that content sits behind an NHS TRUD login. "This is the code UK order
 *     comms uses" is an inference from NHS England's published hierarchy rule,
 *     not from checking the refset itself.
 *  2. The UK Edition load checked was April 2023. All six are long-established
 *     concepts and none appeared inactive, but this was not diffed against a
 *     current release. Worth a five-minute re-check on termbrowser.nhs.uk.
 *
 * Note also that `displayName` is the term UK clinicians expect, which is not
 * always the fully specified name (35650009's FSN is "Thyroid panel", not
 * "Thyroid function test"); `snomedTerm` carries the FSN so both are truthful.
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});
  var data = (FL.data = FL.data || {});

  var TEST_PANELS = [
    {
      code: "FBC",
      name: "Full blood count",
      snomedCode: "26604007",
      snomedTerm: "Complete blood count (procedure)",
      snomedResultCode: "1022441000000101",
      specimen: "EDTA (purple top)",
      hint: "Haematology monitoring — e.g. on methotrexate or azathioprine."
    },
    {
      code: "INR",
      name: "International normalised ratio",
      snomedCode: "440685005",
      snomedTerm: "Calculation of international normalized ratio (procedure)",
      snomedResultCode: "165581004",
      specimen: "Citrate (blue top)",
      hint: "Anticoagulation monitoring. The plan's 49578-6 was a LOINC code, not SNOMED."
    },
    {
      code: "U&E",
      name: "Urea and electrolytes",
      snomedCode: "252167001",
      snomedTerm: "Measurement of urea and electrolytes (procedure)",
      snomedResultCode: "1000971000000107",
      specimen: "Serum (gold top)",
      hint: "Renal monitoring — e.g. on ACE inhibitors, lithium, diuretics."
    },
    {
      code: "LFT",
      name: "Liver function test",
      snomedCode: "26958001",
      snomedTerm: "Hepatic function panel (procedure)",
      snomedResultCode: "997531000000108",
      specimen: "Serum (gold top)",
      hint: "Hepatic monitoring on long-term therapy."
    },
    {
      code: "TFT",
      name: "Thyroid function test",
      snomedCode: "35650009",
      snomedTerm: "Thyroid panel (procedure)",
      snomedResultCode: "1016851000000107",
      specimen: "Serum (gold top)",
      hint: "Thyroid replacement or amiodarone monitoring."
    },
    {
      code: "HbA1c",
      name: "Haemoglobin A1c",
      snomedCode: "43396009",
      snomedTerm: "Hemoglobin A1c measurement (procedure)",
      snomedResultCode: "1003671000000109",
      specimen: "EDTA (purple top)",
      hint: "Diabetes monitoring. Several UK observables exist; this is the generic level."
    }
  ];

  function byCode(code) {
    for (var i = 0; i < TEST_PANELS.length; i++) {
      if (TEST_PANELS[i].code === code) return TEST_PANELS[i];
    }
    return null;
  }

  /** Build a RequestedTest from a picklist entry. */
  function toRequestedTest(panel) {
    return FL.domain.requestedTest({
      code: panel.code,
      name: panel.name,
      snomedCode: panel.snomedCode,
      snomedTerm: panel.snomedTerm,
      snomedResultCode: panel.snomedResultCode
    });
  }

  data.TEST_PANELS = TEST_PANELS;
  data.testPanelByCode = byCode;
  data.toRequestedTest = toRequestedTest;
})(typeof window !== "undefined" ? window : globalThis);
