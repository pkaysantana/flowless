/* =========================================================================
 * data/demoPlans.js — the two seeded scenarios.
 *
 * ALL DATA IS FICTIONAL. Names are obviously invented and NHS numbers use the
 * 999 range reserved for test data.
 *
 * Scenario 1 (PLAN-001) is the happy path, parked at QR_ISSUED so the
 * presenter can walk the whole relay live: collection unit → lab → result →
 * routed → reviewed → next occurrence scheduled automatically.
 *
 * Scenario 2 (PLAN-002) is the failure path, parked at ROUTING_FAILED with a
 * result already entered: the sample was taken at a site (RRK07) that is not
 * in the results-distribution directory, so the result came back with nowhere
 * to go. The hospital has to route it by hand.
 * ========================================================================= */

(function (global) {
  "use strict";

  var CR = (global.CR = global.CR || {});
  var data = (CR.data = CR.data || {});
  var d = CR.domain;

  function panel(code) {
    return data.toRequestedTest(data.testPanelByCode(code));
  }

  data.DEMO_PLANS = function () {
    var trust = data.ODS_TRUST;

    return [
      {
        id: "PLAN-001",
        createdAt: "2026-09-01T09:15:00.000Z",
        startDate: "2026-09-08",
        clinicalReason: "Warfarin monitoring following mechanical mitral valve replacement.",
        patient: d.demographics({
          name: "Aisha Demo-Kaur",
          dateOfBirth: "1959-04-12",
          nhsNumber: "9990000012",
          email: "aisha.demo@example.invalid",
          phone: "07700 900123"
        }),
        requestingOrganisation: d.organisation(trust),
        requestingSite: d.requestingSite({
          odsSiteCode: "RRK01",
          siteName: "Queen Elizabeth Hospital (demo site)",
          wardCode: "HAEM-OP-C",
          wardName: "Haematology outpatients, clinic C"
        }),
        requestingClinician: d.clinician({
          name: "Dr Priya Demo-Nair",
          role: "Consultant Haematologist",
          esrNumber: "12345678"
        }),
        tests: [panel("INR")],
        reasonableAdjustments: [
          "Punjabi interpreter required",
          "Quiet waiting area — sensory sensitivity",
          "Difficult venous access: use the left arm"
        ],
        recurrence: d.recurrence({
          mode: "RECURRING",
          intervalDays: 28,
          endDate: "2026-12-18"
        }),
        // How far to advance this scenario when seeding.
        seedTo: "QR_ISSUED"
      },
      {
        id: "PLAN-002",
        createdAt: "2026-08-26T14:40:00.000Z",
        startDate: "2026-09-02",
        clinicalReason: "Baseline monitoring before starting methotrexate.",
        patient: d.demographics({
          name: "Tom Demo-Whyte",
          dateOfBirth: "1982-11-30",
          nhsNumber: "9990000027",
          email: null,
          phone: null // no contact details on file — print is the only channel
        }),
        requestingOrganisation: d.organisation(trust),
        requestingSite: d.requestingSite({
          odsSiteCode: "RRK07", // absent from the distribution directory
          siteName: "Selly Oak community diagnostic hub (demo site)",
          wardCode: "RHEUM-CDH",
          wardName: "Rheumatology, community diagnostic hub"
        }),
        requestingClinician: d.clinician({
          name: "Dr Sam Demo-Oduya",
          role: "Specialty Registrar, Rheumatology",
          esrNumber: "87654321"
        }),
        tests: [panel("U&E"), panel("FBC"), panel("LFT")],
        reasonableAdjustments: ["Wheelchair access required"],
        recurrence: d.recurrence({ mode: "ONE_OFF" }),
        seedTo: "ROUTING_FAILED"
      }
    ];
  };

  /** The actors the demo plays, used to label history entries realistically. */
  data.DEMO_ACTORS = {
    hospital: "Dr Priya Demo-Nair",
    collectionUnit: "Selly Oak Phlebotomy (demo unit)",
    lab: "UHB Demo Pathology Laboratory"
  };
})(typeof window !== "undefined" ? window : globalThis);
