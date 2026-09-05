/* =========================================================================
 * ui/labView.js — the laboratory's screen (#/lab/<token>).
 *
 * Plan §6. This is the actor that did not exist before: the lab was previously
 * two "Simulate" buttons on the hospital console. Now the lab receives the
 * specimen by scanning the barcode label on the tube, and enters the result
 * itself — both are `requiresHuman` steps pinned to the lab role (plan §2), so
 * no other screen can take them.
 *
 * It answers the "how does the token reach the lab when the patient isn't
 * there" question: it travels on the tube, as a printed barcode.
 * ========================================================================= */

(function (global) {
  "use strict";

  var CR = (global.CR = global.CR || {});
  var ui = (CR.ui = CR.ui || {});
  var el = ui.el;
  var d = CR.domain;
  var store = CR.store;

  var LAB = d.ROLES.LAB;
  var labName = "UHB Demo Pathology Laboratory";

  function labNameField() {
    var input = el("input", {
      type: "text",
      class: "actor-input",
      value: labName,
      "aria-label": "Laboratory name",
      onInput: function (event) { labName = event.target.value; }
    });
    return el("label", { class: "actor-field" }, el("span", { text: "Laboratory" }), input);
  }

  function landing() {
    var awaiting = store.requests().filter(function (r) {
      return r.state === d.STATES.SAMPLE_COLLECTED || r.state === d.STATES.LAB_PROCESSING;
    });

    return el(
      "div",
      { class: "page page--actor page--lab" },
      el(
        "header",
        { class: "page__head" },
        el("p", { class: "page__eyebrow", text: "Laboratory" }),
        el("h1", { class: "page__title", text: "Scan the specimen label" }),
        el("p", {
          class: "page__lede",
          text:
            "The tube arrives with a barcode carrying the same access code. The patient is long " +
            "gone — the label is the hand-off."
        })
      ),
      ui.panel(
        null,
        null,
        ui.tokenEntry({
          hint: "Scan the barcode on the tube, or type the code printed beneath it.",
          action: "Open specimen",
          onSubmit: function (token) { ui.navigate({ view: "lab", token: token }); },
          suggestions: awaiting.map(function (r) {
            return { label: r.token + " — " + d.stateLabel(r.state), token: r.token };
          })
        })
      ),
      awaiting.length === 0
        ? el("p", {
            class: "empty",
            text: "No specimens are with the lab right now. Collect one at the collection unit first."
          })
        : null
    );
  }

  /** Result entry — the lab's own form, not a button on someone else's screen. */
  function resultForm(request) {
    var summary = el("input", {
      type: "text",
      id: "result-summary",
      placeholder: "e.g. INR 2.6 — within therapeutic range",
      autocomplete: "off"
    });
    var detail = el("textarea", {
      id: "result-detail",
      rows: "4",
      placeholder: "Optional detail, values, or comment for the requesting clinician."
    });

    function submit() {
      var outcome = store.receiveResult(request.id, summary.value, labName, detail.value);
      if (!outcome.ok) {
        ui.toast(outcome.error, "error");
        return;
      }
      var updated = store.findRequest(request.id);
      if (updated.state === d.STATES.ROUTING_FAILED) {
        ui.toast("Result entered — but it could not be routed. See the requesting hospital.", "error");
      } else {
        ui.toast("Result entered and routed to the requesting clinician.", "success");
      }
    }

    return ui.panel("Enter the result", "Entering a result routes it automatically — the lab does not choose the destination.", [
      el(
        "div",
        { class: "form-row" },
        el("label", { class: "form-label", for: "result-summary", text: "Result summary *" }),
        summary
      ),
      el(
        "div",
        { class: "form-row" },
        el("label", { class: "form-label", for: "result-detail", text: "Detail" }),
        detail
      ),
      el(
        "div",
        { class: "actions__row" },
        el("button", { type: "button", class: "btn", text: "Enter result", onClick: submit })
      )
    ]);
  }

  function tooEarly(request) {
    return ui.panel(
      "Specimen not collected yet",
      null,
      [
        el("p", {
          text:
            "This request exists, but no sample has been taken. Its current state is " +
            d.stateLabel(request.state) + "."
        }),
        el("p", {
          class: "muted",
          text: "The lab only sees a request once the collection unit has confirmed collection."
        }),
        el("a", { class: "btn btn--secondary", href: ui.toHash({ view: "present", token: request.token }), text: "Open the collection unit screen" })
      ]
    );
  }

  function render(route) {
    if (!route.token) return landing();
    var request = store.findByToken(route.token);
    if (!request) {
      return el(
        "div",
        { class: "page page--actor page--lab" },
        ui.panel("Code not recognised", null, [
          el("p", { text: "No specimen matches " + route.token + "." }),
          el("a", { class: "btn", href: "#/lab", text: "Try another code" })
        ])
      );
    }

    var beforeCollection =
      [d.STATES.REQUEST_CREATED, d.STATES.QR_ISSUED, d.STATES.PRESENTED_AT_COLLECTION]
        .indexOf(request.state) !== -1;

    function step(transitionDef) {
      var outcome = store.applyStep(request.id, transitionDef.step, {
        actorRole: LAB,
        actorName: labName,
        note: transitionDef.step === d.STEPS.LAB_RECEIVE_SPECIMEN ? "Barcode label scanned on receipt." : ""
      });
      if (!outcome.ok) ui.toast(outcome.error, "error");
      else ui.toast(transitionDef.label + ".", "success");
    }

    return el(
      "div",
      { class: "page page--actor page--lab" },
      el(
        "header",
        { class: "page__head" },
        el("p", { class: "page__eyebrow", text: "Laboratory · " + labName }),
        el("h1", { class: "page__title", text: request.id }),
        el(
          "div",
          { class: "detail__meta" },
          ui.stateBadge(request.state),
          ui.pill(request.token, "code"),
          request.collectionUnit ? ui.pill("from " + request.collectionUnit) : null
        )
      ),

      beforeCollection ? tooEarly(request) : null,

      beforeCollection ? null : ui.actionBar(request, LAB, step),

      request.state === d.STATES.LAB_PROCESSING ? resultForm(request) : null,

      request.result
        ? ui.panel("Result on file", null, [
            el("p", { class: "result__summary", text: request.result.summary }),
            request.result.detail ? el("p", { class: "result__detail", text: request.result.detail }) : null,
            el("p", {
              class: "muted",
              text: "Entered by " + request.result.enteredBy + " at " + d.formatDateTime(request.result.enteredAt)
            }),
            request.routing
              ? el(
                  "p",
                  { class: "notice " + (request.routing.routable ? "notice--ok" : "notice--alert") },
                  request.routing.routable ? "Routed. " : "Routing failed. ",
                  request.routing.reason
                )
              : null
          ])
        : null,

      beforeCollection
        ? null
        : el(
            "div",
            { class: "grid grid--2" },
            ui.panel("Specimen", null, [
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
                    el("span", { class: "specimen__tube", text: panel ? panel.specimen : "—" })
                  );
                })
              )
            ]),
            ui.panel("Patient", "Visible to the lab once the specimen is received — never on the label itself.", ui.patientSummary(request, { contact: false }))
          ),

      ui.panel("History", null, ui.timeline(request)),
      el("div", { class: "actor-footer" }, labNameField())
    );
  }

  ui.labView = { render: render };
})(typeof window !== "undefined" ? window : globalThis);
