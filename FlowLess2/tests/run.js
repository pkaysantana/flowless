/* =========================================================================
 * tests/run.js — `node tests/run.js`
 *
 * The domain layer is plain browser JavaScript attached to a FL namespace, so
 * the runner fakes a `window` and loads the same files the page loads. No build
 * step, no test framework, no install.
 *
 * Covers plan §Verification: the §2 requiresHuman changes, the receiveResult
 * actor change, the new lab-actor transitions, and the QR-privacy property.
 * ========================================================================= */

"use strict";

var path = require("path");
var Module = require("module");

global.window = globalThis;
var ROOT = path.join(__dirname, "..");
[
  "js/lib/qrcode.js",
  "js/lib/code39.js",
  "js/domain/types.js",
  "js/domain/workflow.js",
  "js/domain/tokens.js",
  "js/domain/recurrence.js",
  "js/domain/routing.js",
  "js/data/testPanels.js",
  "js/data/odsDirectory.js",
  "js/data/demoPlans.js",
  "js/store/requestStore.js"
].forEach(function (file) {
  require(path.join(ROOT, file));
});

var d = FL.domain;
var store = FL.store;
var data = FL.data;

// ------------------------------------------------------------- tiny runner
var passed = 0;
var failures = [];
var currentGroup = "";

function describe(name, fn) {
  currentGroup = name;
  fn();
}

function it(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(currentGroup + " › " + name + "\n      " + err.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "expected truthy");
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      (message || "values differ") + "\n      expected: " + JSON.stringify(expected) +
      "\n      actual:   " + JSON.stringify(actual)
    );
  }
}

// ------------------------------------------------------------------- tests
describe("workflow — the lifecycle table", function () {
  it("only lists transitions that exist", function () {
    var snapshot = { state: d.STATES.REQUEST_CREATED, hasResult: false, routable: true };
    var result = d.transition(snapshot, d.STEPS.CLINICIAN_REVIEW, d.ROLES.HOSPITAL);
    assert(!result.ok, "review should not be reachable from REQUEST_CREATED");
    assert(/not a permitted step/.test(result.error), "error should say why");
  });

  it("treats REVIEWED and CANCELLED as terminal", function () {
    assert(d.isTerminal(d.STATES.REVIEWED));
    assert(d.isTerminal(d.STATES.CANCELLED));
    equal(d.stepsFrom(d.STATES.REVIEWED).length, 0);
    equal(d.stepsFrom(d.STATES.CANCELLED).length, 0);
  });

  it("lets the hospital cancel from any non-terminal state", function () {
    Object.keys(d.STATES).forEach(function (key) {
      var s = d.STATES[key];
      if (d.isTerminal(s)) return;
      var verdict = d.transition(
        { state: s, hasResult: true, routable: true },
        d.STEPS.CANCEL,
        d.ROLES.HOSPITAL
      );
      assert(verdict.ok, "cancel should be allowed from " + s);
    });
  });
});

describe("workflow §2 — the lab is a real actor now", function () {
  it("SAMPLE_COLLECTED -> LAB_PROCESSING requires a human", function () {
    var def = d.findTransition(d.STATES.SAMPLE_COLLECTED, d.STEPS.LAB_RECEIVE_SPECIMEN);
    equal(def.requiresHuman, true, "lab receipt must be a human step");
    equal(def.role, d.ROLES.LAB);
  });

  it("LAB_PROCESSING -> RESULT_AVAILABLE requires a human", function () {
    var def = d.findTransition(d.STATES.LAB_PROCESSING, d.STEPS.ENTER_RESULT);
    equal(def.requiresHuman, true, "entering a result must be a human step");
    equal(def.role, d.ROLES.LAB);
  });

  it("rejects the system actor on both lab steps", function () {
    [
      [d.STATES.SAMPLE_COLLECTED, d.STEPS.LAB_RECEIVE_SPECIMEN],
      [d.STATES.LAB_PROCESSING, d.STEPS.ENTER_RESULT]
    ].forEach(function (pair) {
      var verdict = d.transition(
        { state: pair[0], hasResult: true, routable: true },
        pair[1],
        d.ROLES.SYSTEM
      );
      assert(!verdict.ok, pair[1] + " must reject the system actor");
      assert(/human step/.test(verdict.error), "should explain it is a human step");
    });
  });

  it("stops the hospital doing the lab's job", function () {
    var verdict = d.transition(
      { state: d.STATES.SAMPLE_COLLECTED, hasResult: false, routable: true },
      d.STEPS.LAB_RECEIVE_SPECIMEN,
      d.ROLES.HOSPITAL
    );
    assert(!verdict.ok, "the hospital must not receive its own specimen");
    assert(/laboratory/i.test(verdict.error));
  });

  it("keeps result routing automatic", function () {
    [d.STEPS.ROUTE_RESULT, d.STEPS.ROUTE_FAILED].forEach(function (step) {
      var def = d.findTransition(d.STATES.RESULT_AVAILABLE, step);
      equal(def.requiresHuman, false, step + " should stay automatic");
      equal(def.role, d.ROLES.SYSTEM);
    });
  });

  it("will not mark a result available without one recorded", function () {
    var verdict = d.transition(
      { state: d.STATES.LAB_PROCESSING, hasResult: false, routable: true },
      d.STEPS.ENTER_RESULT,
      d.ROLES.LAB
    );
    assert(!verdict.ok);
    assert(/no result/i.test(verdict.error));
  });
});

describe("QR token — privacy", function () {
  it("is well formed and unguessable in shape", function () {
    for (var i = 0; i < 50; i++) {
      assert(d.isWellFormedToken(d.newToken()), "token shape");
    }
  });

  it("carries no patient identifier", function () {
    // The property the whole design rests on: a photographed QR reveals nothing.
    var patient = d.demographics({
      name: "Aisha Demo-Kaur",
      dateOfBirth: "1959-04-12",
      nhsNumber: "9990000012",
      email: "aisha.demo@example.invalid",
      phone: "07700 900123"
    });
    var identifiers = [
      patient.name, "AISHA", "KAUR", "DEMO",
      patient.nhsNumber, "9990000012", "999",
      patient.dateOfBirth, "1959", "0412",
      patient.email, patient.phone, "07700900123"
    ];
    for (var i = 0; i < 300; i++) {
      var token = d.newToken();
      assert(
        !d.tokenLeaksAnyOf(token, identifiers),
        "token " + token + " leaked a patient identifier"
      );
    }
  });

  it("uses an alphabet with no visually ambiguous characters", function () {
    ["I", "O", "0", "1"].forEach(function (ch) {
      equal(d.TOKEN_ALPHABET.indexOf(ch), -1, ch + " should not be in the alphabet");
    });
  });

  it("gives every occurrence its own token", function () {
    store.seedDemo();
    var plan = store.findPlan("PLAN-001");
    var first = d.requestFromPlan(plan, 1);
    var second = d.requestFromPlan(plan, 2);
    assert(first.token !== second.token, "one QR is one visit");
  });
});

describe("recurrence", function () {
  it("dates occurrences from the plan interval", function () {
    var plan = {
      startDate: "2026-09-08",
      recurrence: d.recurrence({ mode: "RECURRING", intervalDays: 28, endDate: "2026-12-18" })
    };
    equal(d.dueDateFor(plan, 1), "2026-09-08");
    equal(d.dueDateFor(plan, 2), "2026-10-06");
    equal(d.dueDateFor(plan, 3), "2026-11-03");
  });

  it("stops at the end date", function () {
    var plan = {
      startDate: "2026-09-08",
      recurrence: d.recurrence({ mode: "RECURRING", intervalDays: 28, endDate: "2026-11-03" })
    };
    assert(d.hasNextOccurrence(plan, 2), "occurrence 3 is still within the end date");
    assert(!d.hasNextOccurrence(plan, 3), "occurrence 4 falls past the end date");
  });

  it("never repeats a one-off", function () {
    var plan = { startDate: "2026-09-02", recurrence: d.recurrence({ mode: "ONE_OFF" }) };
    assert(!d.hasNextOccurrence(plan, 1));
  });
});

describe("routing — the ODS hierarchy doing real work", function () {
  it("resolves a site that is in the distribution directory", function () {
    store.seedDemo();
    var request = store.activeRequestFor("PLAN-001");
    var outcome = d.routeOutcome(request);
    assert(outcome.routable, "RRK01 should resolve");
    equal(outcome.destination.odsSiteCode, "RRK01");
    assert(/HAEM-OP-C/.test(outcome.reason), "reason should name the ward");
  });

  it("fails for a site that is not", function () {
    store.seedDemo();
    var request = store.requests().filter(function (r) { return r.planId === "PLAN-002"; })[0];
    var outcome = d.routeOutcome(request);
    assert(!outcome.routable, "RRK07 is deliberately absent from the directory");
    assert(/RRK07/.test(outcome.reason));
  });

  it("fails when the requesting clinician has no ESR number", function () {
    store.seedDemo();
    var request = store.activeRequestFor("PLAN-001");
    var stripped = Object.assign({}, request, {
      requestingClinician: { name: "Dr No Record", role: "Locum", esrNumber: "" }
    });
    assert(!d.routeOutcome(stripped).routable);
  });
});

describe("store — the whole relay, end to end", function () {
  it("seeds two scenarios in reachable states", function () {
    store.seedDemo();
    equal(store.plans().length, 2);
    equal(store.activeRequestFor("PLAN-001").state, d.STATES.QR_ISSUED);
    var second = store.requests().filter(function (r) { return r.planId === "PLAN-002"; })[0];
    equal(second.state, d.STATES.ROUTING_FAILED);
    assert(second.result && second.result.summary, "the failure case has a real result");
  });

  it("walks collection unit -> lab -> routed -> reviewed", function () {
    store.seedDemo();
    var request = store.activeRequestFor("PLAN-001");

    assert(store.applyStep(request.id, d.STEPS.PRESENT_QR, {
      actorRole: d.ROLES.COLLECTION_UNIT, actorName: "Demo Phlebotomy"
    }).ok);
    assert(store.applyStep(request.id, d.STEPS.CONFIRM_COLLECTED, {
      actorRole: d.ROLES.COLLECTION_UNIT, actorName: "Demo Phlebotomy"
    }).ok);
    equal(request.collectionUnit, "Demo Phlebotomy");

    assert(store.applyStep(request.id, d.STEPS.LAB_RECEIVE_SPECIMEN, {
      actorRole: d.ROLES.LAB, actorName: "Demo Lab"
    }).ok);
    equal(request.lab, "Demo Lab");

    var outcome = store.receiveResult(request.id, "INR 2.6 — in range.", "Demo Lab");
    assert(outcome.ok, outcome.error);
    // Entering the result routes it automatically, in the same beat.
    equal(request.state, d.STATES.AWAITING_CLINICIAN_REVIEW);

    assert(store.applyStep(request.id, d.STEPS.CLINICIAN_REVIEW, {
      actorRole: d.ROLES.HOSPITAL, actorName: "Dr Priya Demo-Nair"
    }).ok);
    equal(request.state, d.STATES.REVIEWED);
  });

  it("records the lab, not the system, against the result", function () {
    store.seedDemo();
    var request = store.activeRequestFor("PLAN-001");
    store.applyStep(request.id, d.STEPS.PRESENT_QR, { actorRole: d.ROLES.COLLECTION_UNIT, actorName: "U" });
    store.applyStep(request.id, d.STEPS.CONFIRM_COLLECTED, { actorRole: d.ROLES.COLLECTION_UNIT, actorName: "U" });
    store.applyStep(request.id, d.STEPS.LAB_RECEIVE_SPECIMEN, { actorRole: d.ROLES.LAB, actorName: "UHB Demo Pathology" });
    store.receiveResult(request.id, "INR 2.6", "UHB Demo Pathology");

    var entry = request.history.filter(function (h) { return h.step === d.STEPS.ENTER_RESULT; })[0];
    assert(entry, "the result entry should be in the history");
    equal(entry.actor, "UHB Demo Pathology");
    equal(entry.actorRole, d.ROLES.LAB);
    equal(request.result.enteredBy, "UHB Demo Pathology");
  });

  it("schedules the next occurrence when a recurring request is reviewed", function () {
    store.seedDemo();
    var request = store.activeRequestFor("PLAN-001");
    var before = store.requests().length;

    store.applyStep(request.id, d.STEPS.PRESENT_QR, { actorRole: d.ROLES.COLLECTION_UNIT, actorName: "U" });
    store.applyStep(request.id, d.STEPS.CONFIRM_COLLECTED, { actorRole: d.ROLES.COLLECTION_UNIT, actorName: "U" });
    store.applyStep(request.id, d.STEPS.LAB_RECEIVE_SPECIMEN, { actorRole: d.ROLES.LAB, actorName: "L" });
    store.receiveResult(request.id, "INR 2.6", "L");
    store.applyStep(request.id, d.STEPS.CLINICIAN_REVIEW, { actorRole: d.ROLES.HOSPITAL, actorName: "Dr D" });

    equal(store.requests().length, before + 1, "a second occurrence should appear");
    var next = store.activeRequestFor("PLAN-001");
    equal(next.occurrence, 2);
    equal(next.dueDate, "2026-10-06");
    equal(next.state, d.STATES.REQUEST_CREATED);
  });

  it("routes an unroutable result to ROUTING_FAILED, and lets a human rescue it", function () {
    store.seedDemo();
    var request = store.requests().filter(function (r) { return r.planId === "PLAN-002"; })[0];
    equal(request.state, d.STATES.ROUTING_FAILED);

    var blocked = store.applyStep(request.id, d.STEPS.RETRY_ROUTING, { actorRole: d.ROLES.LAB, actorName: "L" });
    assert(!blocked.ok, "the lab cannot re-route a result");

    var rescued = store.applyStep(request.id, d.STEPS.RETRY_ROUTING, {
      actorRole: d.ROLES.HOSPITAL, actorName: "Dr Sam Demo-Oduya", note: "Phoned through and filed manually."
    });
    assert(rescued.ok, rescued.error);
    equal(request.state, d.STATES.AWAITING_CLINICIAN_REVIEW);
  });

  it("finds a request by its token, however it is typed", function () {
    store.seedDemo();
    var request = store.activeRequestFor("PLAN-001");
    assert(store.findByToken(request.token));
    assert(store.findByToken(request.token.toLowerCase()));
    assert(store.findByToken("  " + request.token + " "));
    assert(store.findByToken("https://flow-less.demo/#/lab/" + request.token));
    assert(!store.findByToken("FL-ZZZZ-ZZZZ"));
  });

  it("createPlan builds occurrence 1 and notifies subscribers", function () {
    store.seedDemo();
    var notified = 0;
    var off = store.subscribe(function () { notified++; });

    var plan = {
      startDate: "2026-10-01",
      clinicalReason: "New plan from the intake form.",
      patient: d.demographics({ name: "New Demo-Patient", dateOfBirth: "1990-01-01", nhsNumber: "9990000099" }),
      requestingOrganisation: d.organisation(data.ODS_TRUST),
      requestingSite: d.requestingSite({
        odsSiteCode: "RRK02", siteName: "Heartlands Hospital (demo site)",
        wardCode: "GEN-MED-1", wardName: "General medicine, ward 1"
      }),
      requestingClinician: d.clinician({ name: "Dr A Demo", role: "Consultant", esrNumber: "11112222" }),
      tests: [data.toRequestedTest(data.testPanelByCode("HbA1c"))],
      reasonableAdjustments: [],
      recurrence: d.recurrence({ mode: "ONE_OFF" })
    };
    var created = store.createPlan(plan);
    off();

    assert(notified > 0, "subscribers should be told");
    equal(created.occurrence, 1);
    equal(created.state, d.STATES.REQUEST_CREATED);
    equal(created.dueDate, "2026-10-01");
    assert(d.isWellFormedToken(created.token));
  });
});

describe("SNOMED test panels", function () {
  it("carries a procedure code for every panel", function () {
    equal(data.TEST_PANELS.length, 6);
    data.TEST_PANELS.forEach(function (panel) {
      assert(/^\d{6,18}$/.test(panel.snomedCode), panel.code + " needs a numeric SNOMED code");
      assert(/\(procedure\)$/.test(panel.snomedTerm), panel.code + " should use a procedure concept for the order");
      assert(/^\d{6,18}$/.test(panel.snomedResultCode), panel.code + " needs a result concept too");
    });
  });

  it("uses the SNOMED INR code, not the LOINC one from the draft plan", function () {
    var inr = data.testPanelByCode("INR");
    equal(inr.snomedCode, "440685005");
    assert(inr.snomedCode.indexOf("-") === -1, "49578-6 is a LOINC code");
  });
});

describe("encoders", function () {
  it("round-trips a QR payload through the module layout", function () {
    var qr = FL.qr.encode("https://flow-less.demo/#/present/FL-7K3D-9QW2");
    equal(qr.size, 17 + 4 * qr.version);
    equal(qr.modules.length, qr.size);
    // Finder pattern corners must be dark.
    assert(qr.modules[0][0] && qr.modules[0][qr.size - 1] && qr.modules[qr.size - 1][0]);
    // The always-dark module.
    assert(qr.modules[qr.size - 8][8], "dark module missing");
  });

  it("encodes every token character in Code 39", function () {
    for (var i = 0; i < 30; i++) {
      assert(FL.code39.isEncodable(d.newToken()), "tokens must fit on a specimen label");
    }
  });

  it("refuses characters Code 39 cannot carry", function () {
    assert(!FL.code39.isEncodable("lower case ok?"));
    assert(!FL.code39.isEncodable(""));
  });
});

// ------------------------------------------------------------------ report
console.log("");
if (failures.length === 0) {
  console.log("  " + passed + " passing");
  console.log("");
  process.exit(0);
} else {
  console.log("  " + passed + " passing, " + failures.length + " failing\n");
  failures.forEach(function (f) { console.log("  ✗ " + f + "\n"); });
  process.exit(1);
}
