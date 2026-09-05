/* =========================================================================
 * domain/workflow.js — the request lifecycle state machine.
 *
 *   REQUEST_CREATED → QR_ISSUED → PRESENTED_AT_COLLECTION → SAMPLE_COLLECTED
 *     → LAB_PROCESSING → RESULT_AVAILABLE
 *         ├─ routed    → AWAITING_CLINICIAN_REVIEW → REVIEWED   (terminal)
 *         └─ no route  → ROUTING_FAILED ⇄ AWAITING_CLINICIAN_REVIEW
 *   any non-terminal state → CANCELLED   (terminal)
 *
 * Plan §2 correction is applied here: with a real lab actor,
 * SAMPLE_COLLECTED → LAB_PROCESSING and LAB_PROCESSING → RESULT_AVAILABLE are
 * `requiresHuman: true` — they are no longer "Simulate" buttons the hospital
 * presses on the lab's behalf. RESULT_AVAILABLE → AWAITING_CLINICIAN_REVIEW /
 * ROUTING_FAILED stays automatic, because that genuinely is routing logic.
 *
 * `transition()` is a pure function of a snapshot. It answers "may this actor
 * take this step right now", and nothing writes state without asking it first.
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});
  var domain = (FL.domain = FL.domain || {});
  var S = domain.STATES;
  var R = domain.ROLES;

  var STEPS = {
    ISSUE_QR: "ISSUE_QR",
    PRESENT_QR: "PRESENT_QR",
    CONFIRM_COLLECTED: "CONFIRM_COLLECTED",
    LAB_RECEIVE_SPECIMEN: "LAB_RECEIVE_SPECIMEN",
    ENTER_RESULT: "ENTER_RESULT",
    ROUTE_RESULT: "ROUTE_RESULT",
    ROUTE_FAILED: "ROUTE_FAILED",
    RETRY_ROUTING: "RETRY_ROUTING",
    CLINICIAN_REVIEW: "CLINICIAN_REVIEW",
    CANCEL: "CANCEL"
  };

  /**
   * The transition table. `requiresHuman` rejects the system actor;
   * `role` pins the step to one actor's screen.
   */
  var TRANSITIONS = [
    {
      step: STEPS.ISSUE_QR,
      from: S.REQUEST_CREATED,
      to: S.QR_ISSUED,
      label: "Issue QR to patient",
      requiresHuman: true,
      role: R.HOSPITAL
    },
    {
      step: STEPS.PRESENT_QR,
      from: S.QR_ISSUED,
      to: S.PRESENTED_AT_COLLECTION,
      label: "QR presented and scanned",
      requiresHuman: true,
      role: R.COLLECTION_UNIT
    },
    {
      step: STEPS.CONFIRM_COLLECTED,
      from: S.PRESENTED_AT_COLLECTION,
      to: S.SAMPLE_COLLECTED,
      label: "Sample collected",
      requiresHuman: true,
      role: R.COLLECTION_UNIT
    },
    {
      // §2: a real lab actor scanning the barcode label on the tube.
      step: STEPS.LAB_RECEIVE_SPECIMEN,
      from: S.SAMPLE_COLLECTED,
      to: S.LAB_PROCESSING,
      label: "Lab receives specimen",
      requiresHuman: true,
      role: R.LAB
    },
    {
      // §2: a real lab actor entering the result.
      step: STEPS.ENTER_RESULT,
      from: S.LAB_PROCESSING,
      to: S.RESULT_AVAILABLE,
      label: "Result entered",
      requiresHuman: true,
      role: R.LAB,
      requiresResult: true
    },
    {
      step: STEPS.ROUTE_RESULT,
      from: S.RESULT_AVAILABLE,
      to: S.AWAITING_CLINICIAN_REVIEW,
      label: "Result routed to requester",
      requiresHuman: false,
      role: R.SYSTEM,
      requiresRoutable: true
    },
    {
      step: STEPS.ROUTE_FAILED,
      from: S.RESULT_AVAILABLE,
      to: S.ROUTING_FAILED,
      label: "Routing failed",
      requiresHuman: false,
      role: R.SYSTEM
    },
    {
      step: STEPS.RETRY_ROUTING,
      from: S.ROUTING_FAILED,
      to: S.AWAITING_CLINICIAN_REVIEW,
      label: "Route to requester manually",
      requiresHuman: true,
      role: R.HOSPITAL
    },
    {
      step: STEPS.CLINICIAN_REVIEW,
      from: S.AWAITING_CLINICIAN_REVIEW,
      to: S.REVIEWED,
      label: "Result reviewed by clinician",
      requiresHuman: true,
      role: R.HOSPITAL,
      requiresResult: true
    }
  ];

  // A request can be cancelled from any non-terminal state, by the hospital.
  [
    S.REQUEST_CREATED,
    S.QR_ISSUED,
    S.PRESENTED_AT_COLLECTION,
    S.SAMPLE_COLLECTED,
    S.LAB_PROCESSING,
    S.RESULT_AVAILABLE,
    S.AWAITING_CLINICIAN_REVIEW,
    S.ROUTING_FAILED
  ].forEach(function (state) {
    TRANSITIONS.push({
      step: STEPS.CANCEL,
      from: state,
      to: S.CANCELLED,
      label: "Cancel request",
      requiresHuman: true,
      role: R.HOSPITAL
    });
  });

  function findTransition(state, step) {
    for (var i = 0; i < TRANSITIONS.length; i++) {
      if (TRANSITIONS[i].from === state && TRANSITIONS[i].step === step) return TRANSITIONS[i];
    }
    return null;
  }

  function stepsFrom(state) {
    return TRANSITIONS.filter(function (t) { return t.from === state; });
  }

  /**
   * Decide whether `step` may be taken. Pure — no mutation, no I/O.
   *
   * @param {object} snapshot { state, hasResult, routable }
   * @param {string} step
   * @param {string} actorRole one of domain.ROLES
   * @returns {{ ok: boolean, to?: string, transition?: object, error?: string }}
   */
  function transition(snapshot, step, actorRole) {
    var candidate = findTransition(snapshot.state, step);
    if (!candidate) {
      var allowed = stepsFrom(snapshot.state).map(function (t) { return t.step; });
      return {
        ok: false,
        error:
          "'" + step + "' is not a permitted step from " + snapshot.state + ". " +
          (allowed.length
            ? "Allowed from here: " + allowed.join(", ") + "."
            : "This state is terminal.")
      };
    }

    if (candidate.requiresHuman && actorRole === R.SYSTEM) {
      return {
        ok: false,
        transition: candidate,
        error:
          "'" + candidate.label + "' is a human step — the system cannot take it. " +
          "It belongs to the " + domain.roleLabel(candidate.role).toLowerCase() + "."
      };
    }

    if (candidate.role !== actorRole) {
      return {
        ok: false,
        transition: candidate,
        error:
          "'" + candidate.label + "' is performed by the " +
          domain.roleLabel(candidate.role).toLowerCase() + ", not the " +
          domain.roleLabel(actorRole).toLowerCase() + "."
      };
    }

    if (candidate.requiresResult && !snapshot.hasResult) {
      return {
        ok: false,
        transition: candidate,
        error: "There is no result recorded on this request yet."
      };
    }

    if (candidate.requiresRoutable && !snapshot.routable) {
      return {
        ok: false,
        transition: candidate,
        error:
          "The result cannot be routed automatically — the requesting site or " +
          "clinician could not be resolved."
      };
    }

    return { ok: true, to: candidate.to, transition: candidate };
  }

  /** Steps this actor could take right now, for rendering buttons. */
  function availableSteps(snapshot, actorRole) {
    return stepsFrom(snapshot.state).filter(function (t) {
      return transition(snapshot, t.step, actorRole).ok;
    });
  }

  /** Steps blocked right now, with the reason — shown rather than hidden. */
  function blockedSteps(snapshot, actorRole) {
    var out = [];
    stepsFrom(snapshot.state).forEach(function (t) {
      var result = transition(snapshot, t.step, actorRole);
      if (!result.ok && t.step !== STEPS.CANCEL) {
        out.push({ step: t.step, label: t.label, reason: result.error, role: t.role });
      }
    });
    return out;
  }

  /** Build the snapshot `transition()` is allowed to see, from a request. */
  function snapshotOf(request) {
    return {
      state: request.state,
      hasResult: !!(request.result && request.result.summary),
      routable: FL.domain.canRoute ? FL.domain.canRoute(request) : true
    };
  }

  domain.STEPS = STEPS;
  domain.TRANSITIONS = TRANSITIONS;
  domain.transition = transition;
  domain.availableSteps = availableSteps;
  domain.blockedSteps = blockedSteps;
  domain.stepsFrom = stepsFrom;
  domain.findTransition = findTransition;
  domain.snapshotOf = snapshotOf;
})(typeof window !== "undefined" ? window : globalThis);
