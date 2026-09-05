/* =========================================================================
 * store/requestStore.js — the in-memory store.
 *
 * Deliberately in-memory (plan §4 rescope): the whole demo runs in one browser
 * tab, and every actor screen is a hash route. A hash change is not a page
 * reload, so this module-level state survives navigating between the hospital
 * console, the collection unit, the lab and the NHS App mockup. No server, no
 * network, nothing to fail in the room.
 *
 * Every state change goes through `applyStep`, which asks the domain state
 * machine for permission first. Nothing else writes `state`.
 * ========================================================================= */

(function (global) {
  "use strict";

  var CR = (global.CR = global.CR || {});
  var d = CR.domain;
  var data = CR.data;

  var state = { plans: [], requests: [] };
  var listeners = [];

  function emit() {
    listeners.slice().forEach(function (fn) { fn(state); });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      var i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  function getSnapshot() {
    return state;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  // ------------------------------------------------------------- lookups
  function requests() {
    return state.requests.slice();
  }

  function plans() {
    return state.plans.slice();
  }

  function findRequest(id) {
    return state.requests.filter(function (r) { return r.id === id; })[0] || null;
  }

  function findByToken(token) {
    var wanted = d.normaliseToken(token);
    return state.requests.filter(function (r) { return r.token === wanted; })[0] || null;
  }

  function findPlan(id) {
    return state.plans.filter(function (p) { return p.id === id; })[0] || null;
  }

  /** The live (non-terminal) request for a plan, if any. */
  function activeRequestFor(planId) {
    return (
      state.requests.filter(function (r) {
        return r.planId === planId && !d.isTerminal(r.state);
      })[0] || null
    );
  }

  // ------------------------------------------------------------ mutations
  function record(request, transitionDef, actorRole, actorName, note) {
    request.history.push({
      at: nowIso(),
      from: transitionDef.from,
      to: transitionDef.to,
      step: transitionDef.step,
      label: transitionDef.label,
      actor: actorName || d.roleLabel(actorRole),
      actorRole: actorRole,
      note: note || ""
    });
  }

  /**
   * The single write path.
   * @param {string} requestId
   * @param {string} step
   * @param {object} opts { actorRole, actorName, note }
   * @returns {{ ok: boolean, error?: string, request?: object }}
   */
  function applyStep(requestId, step, opts) {
    var o = opts || {};
    var request = findRequest(requestId);
    if (!request) return { ok: false, error: "No such request." };

    var verdict = d.transition(d.snapshotOf(request), step, o.actorRole);
    if (!verdict.ok) return { ok: false, error: verdict.error };

    request.state = verdict.to;
    record(request, verdict.transition, o.actorRole, o.actorName, o.note);

    // Side effects that belong to specific steps.
    if (step === d.STEPS.CONFIRM_COLLECTED && o.actorName) {
      request.collectionUnit = o.actorName;
    }
    if (step === d.STEPS.LAB_RECEIVE_SPECIMEN && o.actorName) {
      request.lab = o.actorName;
    }
    if (step === d.STEPS.CLINICIAN_REVIEW) {
      scheduleNextIfDue(request);
    }

    emit();
    return { ok: true, request: request };
  }

  /**
   * Plan §2: the lab enters the result, so the actor is the lab — not a
   * hardcoded 'system'.
   */
  function receiveResult(requestId, summary, actorName, detail) {
    var request = findRequest(requestId);
    if (!request) return { ok: false, error: "No such request." };
    if (!summary || !String(summary).trim()) {
      return { ok: false, error: "A result summary is required." };
    }

    request.result = {
      summary: String(summary).trim(),
      detail: (detail || "").trim(),
      enteredBy: actorName || "Laboratory",
      enteredAt: nowIso()
    };

    var outcome = applyStep(requestId, d.STEPS.ENTER_RESULT, {
      actorRole: d.ROLES.LAB,
      actorName: actorName || "Laboratory",
      note: String(summary).trim()
    });
    if (!outcome.ok) {
      request.result = null; // do not leave a result on a request that did not move
      return outcome;
    }

    // Routing itself stays automatic (plan §2) — the system, not the lab,
    // decides where the result goes, and whether it can go anywhere at all.
    return routeResult(requestId);
  }

  /** Automatic. Computes the outcome; the caller does not get to choose it. */
  function routeResult(requestId) {
    var request = findRequest(requestId);
    if (!request) return { ok: false, error: "No such request." };

    var outcome = d.routeOutcome(request);
    request.routing = outcome;

    var step = outcome.routable ? d.STEPS.ROUTE_RESULT : d.STEPS.ROUTE_FAILED;
    var result = applyStep(requestId, step, {
      actorRole: d.ROLES.SYSTEM,
      actorName: "Results routing",
      note: outcome.reason
    });
    return result;
  }

  /** Free-text history entry — used by the simulated email/SMS in §7. */
  function addNote(requestId, note, actorName, actorRole) {
    var request = findRequest(requestId);
    if (!request) return { ok: false, error: "No such request." };
    request.history.push({
      at: nowIso(),
      from: request.state,
      to: request.state,
      step: "NOTE",
      label: "Note",
      actor: actorName || "Requesting hospital",
      actorRole: actorRole || d.ROLES.HOSPITAL,
      note: note
    });
    emit();
    return { ok: true, request: request };
  }

  /**
   * Plan §4: the one store addition the rescope keeps. Appends the plan,
   * builds occurrence 1 via the untouched recurrence helper, and emits.
   */
  function createPlan(plan) {
    if (!plan.id) {
      plan.id = "PLAN-" + String(state.plans.length + 1).padStart(3, "0");
    }
    plan.createdAt = plan.createdAt || nowIso();
    state.plans.push(plan);

    var request = d.requestFromPlan(plan, 1);
    state.requests.push(request);
    emit();
    return request;
  }

  /** When a recurring plan's current occurrence closes, open the next one. */
  function scheduleNextIfDue(request) {
    var plan = findPlan(request.planId);
    if (!plan) return null;
    if (!d.hasNextOccurrence(plan, request.occurrence)) return null;
    var next = d.requestFromPlan(plan, request.occurrence + 1);
    state.requests.push(next);
    return next;
  }

  // --------------------------------------------------------------- seeding
  /**
   * Advance a seeded request to its starting state by replaying real steps, so
   * the seed can never produce a state the machine would not allow.
   */
  function advanceTo(request, targetState) {
    var actors = data.DEMO_ACTORS;
    var guard = 0;

    while (request.state !== targetState && guard++ < 12) {
      if (request.state === d.STATES.REQUEST_CREATED) {
        applyStep(request.id, d.STEPS.ISSUE_QR, {
          actorRole: d.ROLES.HOSPITAL,
          actorName: request.requestingClinician.name,
          note: "QR issued and patient letter printed."
        });
      } else if (request.state === d.STATES.QR_ISSUED) {
        applyStep(request.id, d.STEPS.PRESENT_QR, {
          actorRole: d.ROLES.COLLECTION_UNIT,
          actorName: actors.collectionUnit
        });
      } else if (request.state === d.STATES.PRESENTED_AT_COLLECTION) {
        applyStep(request.id, d.STEPS.CONFIRM_COLLECTED, {
          actorRole: d.ROLES.COLLECTION_UNIT,
          actorName: actors.collectionUnit
        });
      } else if (request.state === d.STATES.SAMPLE_COLLECTED) {
        applyStep(request.id, d.STEPS.LAB_RECEIVE_SPECIMEN, {
          actorRole: d.ROLES.LAB,
          actorName: actors.lab,
          note: "Barcode label scanned on receipt."
        });
      } else if (request.state === d.STATES.LAB_PROCESSING) {
        receiveResult(
          request.id,
          "U&E, FBC and LFT within normal limits. Safe to start methotrexate.",
          actors.lab,
          "eGFR 88 mL/min/1.73m². Hb 139 g/L. ALT 24 U/L. No action required beyond routine monitoring."
        );
      } else {
        break; // RESULT_AVAILABLE routes itself; anything else is terminal
      }
    }
    return request;
  }

  function seedDemo() {
    state = { plans: [], requests: [] };
    d.setRoutingDirectory(data.ODS_DIRECTORY);

    data.DEMO_PLANS().forEach(function (plan) {
      var seedTo = plan.seedTo;
      delete plan.seedTo;
      var request = createPlan(plan);
      if (seedTo && seedTo !== d.STATES.REQUEST_CREATED) advanceTo(request, seedTo);
    });

    emit();
    return state;
  }

  function reset() {
    return seedDemo();
  }

  CR.store = {
    subscribe: subscribe,
    getSnapshot: getSnapshot,
    requests: requests,
    plans: plans,
    findRequest: findRequest,
    findPlan: findPlan,
    findByToken: findByToken,
    activeRequestFor: activeRequestFor,
    applyStep: applyStep,
    receiveResult: receiveResult,
    routeResult: routeResult,
    addNote: addNote,
    createPlan: createPlan,
    seedDemo: seedDemo,
    reset: reset
  };
})(typeof window !== "undefined" ? window : globalThis);
