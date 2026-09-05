/* =========================================================================
 * domain/types.js — the shared vocabulary.
 *
 * `CR.domain` is pure: no DOM, no store, no fetch. Everything in here can be
 * loaded in Node and unit tested (see tests/run.js), which is the point — the
 * lifecycle rules are the part that must not quietly break.
 *
 * Plan §1 data-model changes are all here: ODS org code, the RequestingSite
 * type (real ODS site code + trust-invented ward code), ESR number on the
 * clinician, SNOMED codes on tests, and optional email/phone on demographics.
 * ========================================================================= */

(function (global) {
  "use strict";

  var CR = (global.CR = global.CR || {});
  var domain = (CR.domain = CR.domain || {});

  // ---------------------------------------------------------------- states
  var STATES = {
    REQUEST_CREATED: "REQUEST_CREATED",
    QR_ISSUED: "QR_ISSUED",
    PRESENTED_AT_COLLECTION: "PRESENTED_AT_COLLECTION",
    SAMPLE_COLLECTED: "SAMPLE_COLLECTED",
    LAB_PROCESSING: "LAB_PROCESSING",
    RESULT_AVAILABLE: "RESULT_AVAILABLE",
    AWAITING_CLINICIAN_REVIEW: "AWAITING_CLINICIAN_REVIEW",
    ROUTING_FAILED: "ROUTING_FAILED",
    REVIEWED: "REVIEWED",
    CANCELLED: "CANCELLED"
  };

  var STATE_LABELS = {
    REQUEST_CREATED: "Request created",
    QR_ISSUED: "QR issued to patient",
    PRESENTED_AT_COLLECTION: "Presented at collection unit",
    SAMPLE_COLLECTED: "Sample collected",
    LAB_PROCESSING: "With the lab",
    RESULT_AVAILABLE: "Result available",
    AWAITING_CLINICIAN_REVIEW: "Awaiting clinician review",
    ROUTING_FAILED: "Routing failed",
    REVIEWED: "Reviewed and closed",
    CANCELLED: "Cancelled"
  };

  var TERMINAL_STATES = [STATES.REVIEWED, STATES.CANCELLED];

  /** States where something has gone wrong and a human needs to look. */
  var ATTENTION_STATES = [STATES.ROUTING_FAILED];

  // ----------------------------------------------------------------- roles
  // Which actor is allowed to take which step. This is what makes the four
  // hash-routed screens genuinely different actors rather than four skins on
  // the same buttons.
  var ROLES = {
    SYSTEM: "system",
    HOSPITAL: "hospital",
    COLLECTION_UNIT: "collection_unit",
    LAB: "lab",
    PATIENT: "patient"
  };

  var ROLE_LABELS = {
    system: "System",
    hospital: "Requesting hospital",
    collection_unit: "Collection unit",
    lab: "Laboratory",
    patient: "Patient"
  };

  // ------------------------------------------------------------ constructors
  /**
   * @param {object} o { odsOrgCode, name }
   * odsOrgCode is the real, nationally standardised NHS ODS trust code (e.g. "RRK").
   */
  function organisation(o) {
    return { odsOrgCode: o.odsOrgCode, name: o.name };
  }

  /**
   * Plan §1: real ODS site code, plus a trust-internal ward/department code
   * beneath it. There is no national registry at ward granularity, so wardCode
   * is genuinely trust-invented — that distinction is surfaced in the UI rather
   * than glossed over.
   * @param {object} o { odsSiteCode, siteName, wardCode, wardName }
   */
  function requestingSite(o) {
    return {
      odsSiteCode: o.odsSiteCode,
      siteName: o.siteName,
      wardCode: o.wardCode,
      wardName: o.wardName
    };
  }

  /**
   * @param {object} o { name, role, esrNumber }
   * ESR number only, per the explicit decision recorded in the plan. Noted
   * there and repeated here: real pathology order comms normally identifies the
   * requesting clinician by GMC number — ESR is an HR/payroll identifier.
   */
  function clinician(o) {
    return { name: o.name, role: o.role, esrNumber: o.esrNumber };
  }

  /**
   * @param {object} o { code, name, snomedCode, snomedResultCode?, snomedTerm? }
   * `code` stays the short local panel code (INR, FBC). `snomedCode` is the real
   * SNOMED CT *procedure* concept — see js/data/testPanels.js for why procedure
   * rather than observable entity.
   */
  function requestedTest(o) {
    return {
      code: o.code,
      name: o.name,
      snomedCode: o.snomedCode,
      snomedTerm: o.snomedTerm || null,
      snomedResultCode: o.snomedResultCode || null
    };
  }

  /**
   * @param {object} o { name, dateOfBirth, nhsNumber, email?, phone? }
   * email/phone are optional and exist only for the simulated delivery step.
   */
  function demographics(o) {
    return {
      name: o.name,
      dateOfBirth: o.dateOfBirth,
      nhsNumber: o.nhsNumber,
      email: o.email || null,
      phone: o.phone || null
    };
  }

  /** @param {object} o { mode: 'ONE_OFF'|'RECURRING', intervalDays?, endDate? } */
  function recurrence(o) {
    if (!o || o.mode === "ONE_OFF") return { mode: "ONE_OFF", intervalDays: null, endDate: null };
    return {
      mode: "RECURRING",
      intervalDays: Number(o.intervalDays),
      endDate: o.endDate || null
    };
  }

  // ------------------------------------------------------------- utilities
  function isTerminal(state) {
    return TERMINAL_STATES.indexOf(state) !== -1;
  }

  function stateLabel(state) {
    return STATE_LABELS[state] || state;
  }

  function roleLabel(role) {
    return ROLE_LABELS[role] || role;
  }

  /** Format an ISO date (YYYY-MM-DD) for display, without timezone surprises. */
  function formatDate(iso) {
    if (!iso) return "—";
    var parts = String(iso).slice(0, 10).split("-");
    if (parts.length !== 3) return String(iso);
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return Number(parts[2]) + " " + months[Number(parts[1]) - 1] + " " + parts[0];
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var pad = function (n) { return n < 10 ? "0" + n : String(n); };
    return formatDate(iso) + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function addDays(iso, days) {
    var d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + Number(days));
    return d.toISOString().slice(0, 10);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  /** Present an NHS number in the conventional 3-3-4 grouping. */
  function formatNhsNumber(value) {
    var digits = String(value || "").replace(/\D/g, "");
    if (digits.length !== 10) return String(value || "—");
    return digits.slice(0, 3) + " " + digits.slice(3, 6) + " " + digits.slice(6);
  }

  domain.STATES = STATES;
  domain.STATE_LABELS = STATE_LABELS;
  domain.TERMINAL_STATES = TERMINAL_STATES;
  domain.ATTENTION_STATES = ATTENTION_STATES;
  domain.ROLES = ROLES;
  domain.ROLE_LABELS = ROLE_LABELS;
  domain.organisation = organisation;
  domain.requestingSite = requestingSite;
  domain.clinician = clinician;
  domain.requestedTest = requestedTest;
  domain.demographics = demographics;
  domain.recurrence = recurrence;
  domain.isTerminal = isTerminal;
  domain.stateLabel = stateLabel;
  domain.roleLabel = roleLabel;
  domain.formatDate = formatDate;
  domain.formatDateTime = formatDateTime;
  domain.formatNhsNumber = formatNhsNumber;
  domain.addDays = addDays;
  domain.today = today;
})(typeof window !== "undefined" ? window : globalThis);
