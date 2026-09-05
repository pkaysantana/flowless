/* =========================================================================
 * ui/providerView.js — the collection unit's screen (#/present/<token>).
 *
 * What a phlebotomist sees when a patient walks in and shows their QR. The
 * reasonable adjustments are the first thing on the page, deliberately: the
 * point of carrying them on the request is that nobody has to ask the patient
 * to explain themselves again at the door.
 *
 * Plan §6 adds "Print specimen label" here once collection is confirmed.
 * ========================================================================= */

(function (global) {
  "use strict";

  var CR = (global.CR = global.CR || {});
  var ui = (CR.ui = CR.ui || {});
  var el = ui.el;
  var d = CR.domain;
  var store = CR.store;

  var UNIT = d.ROLES.COLLECTION_UNIT;
  var unitName = "Selly Oak Phlebotomy (demo unit)";

  function unitNameField() {
    var input = el("input", {
      type: "text",
      class: "actor-input",
      value: unitName,
      "aria-label": "Collection unit name",
      onInput: function (event) { unitName = event.target.value; }
    });
    return el("label", { class: "actor-field" }, el("span", { text: "Collection unit" }), input);
  }

  function landing() {
    var open = store.requests().filter(function (r) {
      return r.state === d.STATES.QR_ISSUED || r.state === d.STATES.PRESENTED_AT_COLLECTION;
    });

    return el(
      "div",
      { class: "page page--actor page--unit" },
      el(
        "header",
        { class: "page__head" },
        el("p", { class: "page__eyebrow", text: "Collection unit" }),
        el("h1", { class: "page__title", text: "Scan the patient's code" }),
        el("p", {
          class: "page__lede",
          text: "No appointment, no paper form. The code is all the patient needs to bring."
        })
      ),
      ui.panel(
        null,
        null,
        ui.tokenEntry({
          onSubmit: function (token) { ui.navigate({ view: "present", token: token }); },
          action: "Open request",
          suggestions: open.map(function (r) {
            return { label: r.token + " — awaiting", token: r.token };
          })
        })
      )
    );
  }

  function notFound(token) {
    return el(
      "div",
      { class: "page page--actor page--unit" },
      ui.panel(
        "Code not recognised",
        null,
        [
          el("p", { text: "No open request matches " + (token || "that code") + "." }),
          el("p", {
            class: "muted",
            text: "Check the code with the patient, or ask the requesting team to re-issue it."
          }),
          el("a", { class: "btn", href: "#/present", text: "Try another code" })
        ]
      )
    );
  }

  function render(route) {
    if (!route.token) return landing();
    var request = store.findByToken(route.token);
    if (!request) return notFound(route.token);

    function step(transitionDef) {
      var outcome = store.applyStep(request.id, transitionDef.step, {
        actorRole: UNIT,
        actorName: unitName
      });
      if (!outcome.ok) ui.toast(outcome.error, "error");
      else ui.toast(transitionDef.label + ".", "success");
    }

    var collected =
      request.state === d.STATES.SAMPLE_COLLECTED ||
      [d.STATES.LAB_PROCESSING, d.STATES.RESULT_AVAILABLE, d.STATES.AWAITING_CLINICIAN_REVIEW,
       d.STATES.ROUTING_FAILED, d.STATES.REVIEWED].indexOf(request.state) !== -1;

    var labelAction = collected
      ? el(
          "div",
          { class: "actions__row actions__row--secondary" },
          el("a", {
            class: "btn btn--secondary",
            href: ui.toHash({ view: "label", token: request.token }),
            target: "_blank",
            rel: "noopener",
            text: "Print specimen label"
          }),
          el("span", {
            class: "muted",
            text: "The label carries the barcode and the request id — no name, no NHS number."
          })
        )
      : null;

    return el(
      "div",
      { class: "page page--actor page--unit" },
      el(
        "header",
        { class: "page__head" },
        el("p", { class: "page__eyebrow", text: "Collection unit · " + unitName }),
        el("h1", { class: "page__title", text: request.patient.name }),
        el(
          "div",
          { class: "detail__meta" },
          ui.stateBadge(request.state),
          ui.pill("Due " + d.formatDate(request.dueDate)),
          ui.pill(request.token, "code")
        )
      ),

      ui.panel(
        "Before you start",
        "Recorded by the requesting team and carried with the request.",
        ui.adjustments(request.reasonableAdjustments, { large: true })
      ),

      ui.actionBar(request, UNIT, step, { extra: labelAction }),

      el(
        "div",
        { class: "grid grid--2" },
        ui.panel("Check identity", null, ui.patientSummary(request, { contact: false })),
        ui.panel("Take these samples", null, [
          ui.testList(request.tests),
          el(
            "ul",
            { class: "specimens" },
            request.tests.map(function (test) {
              var panel = CR.data.testPanelByCode(test.code);
              return el(
                "li",
                { class: "specimen" },
                el("span", { class: "specimen__test", text: test.code }),
                el("span", { class: "specimen__tube", text: panel ? panel.specimen : "See local guidance" })
              );
            })
          )
        ])
      ),

      ui.panel("Requested by", null, ui.requesterSummary(request)),
      ui.panel("History", null, ui.timeline(request)),

      el("div", { class: "actor-footer" }, unitNameField())
    );
  }

  ui.providerView = { render: render };
})(typeof window !== "undefined" ? window : globalThis);
