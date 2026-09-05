/* =========================================================================
 * domain/recurrence.js — turning a monitoring plan into dated requests.
 *
 * A plan is the standing instruction ("INR every 28 days until 30 June"); a
 * request is one occurrence of it. Only one request is live at a time: the next
 * is scheduled when the current one is reviewed, which is what makes the
 * recurring case feel like ongoing monitoring rather than a batch of bookings.
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});
  var domain = (FL.domain = FL.domain || {});

  /** Due date of occurrence n (1-based) of a plan. */
  function dueDateFor(plan, occurrence) {
    if (!plan.recurrence || plan.recurrence.mode === "ONE_OFF" || occurrence <= 1) {
      return plan.startDate;
    }
    return domain.addDays(plan.startDate, plan.recurrence.intervalDays * (occurrence - 1));
  }

  /** Is there a further occurrence after `occurrence`, within the end date? */
  function hasNextOccurrence(plan, occurrence) {
    if (!plan.recurrence || plan.recurrence.mode !== "RECURRING") return false;
    var next = dueDateFor(plan, occurrence + 1);
    if (!plan.recurrence.endDate) return true;
    return next <= plan.recurrence.endDate;
  }

  /**
   * Build occurrence `n` of a plan as a fresh request.
   * Each occurrence gets its own token — one QR is one visit, so a photographed
   * QR from three months ago is not a key to today's appointment.
   */
  function requestFromPlan(plan, occurrence, nowIso) {
    var now = nowIso || new Date().toISOString();
    return {
      id: plan.id + "-R" + String(occurrence).padStart(2, "0"),
      planId: plan.id,
      occurrence: occurrence,
      token: domain.newToken(),
      state: domain.STATES.REQUEST_CREATED,
      dueDate: dueDateFor(plan, occurrence),
      patient: plan.patient,
      requestingOrganisation: plan.requestingOrganisation,
      requestingSite: plan.requestingSite,
      requestingClinician: plan.requestingClinician,
      tests: plan.tests.slice(),
      reasonableAdjustments: (plan.reasonableAdjustments || []).slice(),
      clinicalReason: plan.clinicalReason || "",
      collectionUnit: null,
      lab: null,
      result: null,
      history: [
        {
          at: now,
          from: null,
          to: domain.STATES.REQUEST_CREATED,
          step: "CREATE",
          label:
            occurrence === 1
              ? "Request created from monitoring plan"
              : "Next occurrence scheduled (visit " + occurrence + ")",
          actor: plan.requestingClinician.name,
          actorRole: domain.ROLES.HOSPITAL,
          note: ""
        }
      ]
    };
  }

  domain.dueDateFor = dueDateFor;
  domain.hasNextOccurrence = hasNextOccurrence;
  domain.requestFromPlan = requestFromPlan;
})(typeof window !== "undefined" ? window : globalThis);
