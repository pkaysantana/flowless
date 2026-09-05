/* =========================================================================
 * data/odsDirectory.js — the results-distribution directory.
 *
 * ODS codes here follow the real NHS Organisation Data Service structure:
 * a three-character trust code, with site codes formed as the trust code plus
 * two digits. RRK is a real ODS trust code (University Hospitals Birmingham
 * NHS Foundation Trust) — used because the plan calls for real, nationally
 * standardised identifiers rather than invented ones.
 *
 * Site NAMES below are illustrative for the demo, and ward codes are
 * deliberately trust-invented: the NHS has no national registry at ward or
 * department granularity, which is exactly the gap the plan flags.
 *
 * RRK07 is intentionally ABSENT from this directory. That is what drives the
 * ROUTING_FAILED scenario — a result comes back from the lab and has nowhere
 * electronic to go. It is the failure this whole project exists to remove, so
 * the demo shows it rather than hiding it.
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});
  var data = (FL.data = FL.data || {});

  data.ODS_DIRECTORY = [
    {
      odsSiteCode: "RRK01",
      siteName: "Queen Elizabeth Hospital (demo site)",
      endpoint: "results.rrk01@demo.nhs.invalid"
    },
    {
      odsSiteCode: "RRK02",
      siteName: "Heartlands Hospital (demo site)",
      endpoint: "results.rrk02@demo.nhs.invalid"
    },
    {
      odsSiteCode: "RRK15",
      siteName: "Good Hope Hospital (demo site)",
      endpoint: "results.rrk15@demo.nhs.invalid"
    }
    // RRK07 deliberately missing — see the file header.
  ];

  data.ODS_TRUST = {
    odsOrgCode: "RRK",
    name: "University Hospitals Birmingham NHS Foundation Trust"
  };

  /** Sites a user may pick in the intake form, including the unroutable one. */
  data.SELECTABLE_SITES = [
    { odsSiteCode: "RRK01", siteName: "Queen Elizabeth Hospital (demo site)" },
    { odsSiteCode: "RRK02", siteName: "Heartlands Hospital (demo site)" },
    { odsSiteCode: "RRK15", siteName: "Good Hope Hospital (demo site)" },
    {
      odsSiteCode: "RRK07",
      siteName: "Selly Oak community diagnostic hub (demo site)",
      warning: "Not in the results-distribution directory — results will fail to route."
    }
  ];
})(typeof window !== "undefined" ? window : globalThis);
