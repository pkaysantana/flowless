/* =========================================================================
 * ui/consoleView.js — the requesting hospital's screen.
 *
 * Lists every monitoring plan and its live request, and drills into one.
 * This is also where plan §7's patient-delivery actions live: print a letter,
 * or simulate an email/SMS (no real provider is contacted — the point is to
 * show the channel exists and gets recorded in the request history).
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});
  var ui = (FL.ui = FL.ui || {});
  var el = ui.el;
  var d = FL.domain;
  var store = FL.store;

  var HOSPITAL = d.ROLES.HOSPITAL;

  function actorName(request) {
    return request.requestingClinician.name;
  }

  // -------------------------------------------------------------- listing
  function requestCard(request, selectedId) {
    var plan = store.findPlan(request.planId);
    var recurring = plan && plan.recurrence && plan.recurrence.mode === "RECURRING";

    return el(
      "li",
      {},
      el(
        "a",
        {
          class: "case-card",
          href: ui.toHash({ view: "request", id: request.id }),
          "aria-current": request.id === selectedId ? "true" : "false"
        },
        el(
          "div",
          { class: "case-card__top" },
          el("span", { class: "case-card__id", text: request.id }),
          recurring
            ? ui.pill("visit " + request.occurrence, "info")
            : ui.pill("one-off")
        ),
        el("div", { class: "case-card__name", text: request.patient.name }),
        el(
          "div",
          { class: "case-card__tests", text: request.tests.map(function (t) { return t.code; }).join(" · ") }
        ),
        el("div", { class: "case-card__meta" }, ui.stateBadge(request.state)),
        el("div", { class: "case-card__due", text: "Due " + d.formatDate(request.dueDate) })
      )
    );
  }

  function listPanel(requests, selectedId) {
    var live = requests.filter(function (r) { return !d.isTerminal(r.state); });
    var closed = requests.filter(function (r) { return d.isTerminal(r.state); });

    return el(
      "nav",
      { class: "case-list", "aria-label": "Monitoring requests" },
      el(
        "div",
        { class: "case-list__head" },
        el("h2", { class: "case-list__title", text: "Monitoring requests" }),
        el("a", { class: "btn btn--small", href: "#/new", text: "+ New plan" })
      ),
      el("h3", { class: "case-list__group", text: "Open (" + live.length + ")" }),
      el("ul", { class: "case-list__items" }, live.map(function (r) { return requestCard(r, selectedId); })),
      closed.length
        ? [
            el("h3", { class: "case-list__group", text: "Closed (" + closed.length + ")" }),
            el("ul", { class: "case-list__items" }, closed.map(function (r) { return requestCard(r, selectedId); }))
          ]
        : null
    );
  }

  // ------------------------------------------------------- notify modal
  function notifyDialog(request) {
    var patient = request.patient;
    var url = ui.absoluteUrl({ view: "present", token: request.token });
    var testNames = request.tests.map(function (t) { return t.name; }).join(", ");

    var emailBody =
      "Dear " + patient.name + ",\n\n" +
      "Your " + testNames + " blood test is due on " + d.formatDate(request.dueDate) + ".\n\n" +
      "You can go to any participating collection unit. Show them this link or the QR code " +
      "in your letter — you do not need an appointment and you do not need to bring a form.\n\n" +
      url + "\n\n" +
      "Access code: " + request.token + "\n\n" +
      request.requestingSite.siteName + "\n" +
      request.requestingClinician.name + ", " + request.requestingClinician.role;

    var smsBody =
      "NHS: your " + request.tests.map(function (t) { return t.code; }).join("/") +
      " test is due " + d.formatDate(request.dueDate) + ". Go to any collection unit and show " +
      "code " + request.token + ". " + url;

    var dialog = el("dialog", { class: "modal" });
    var channel = patient.email ? "email" : patient.phone ? "sms" : null;

    function preview(kind) {
      return el(
        "div",
        { class: "preview" },
        el(
          "div",
          { class: "preview__head" },
          el("span", { class: "preview__to", text: kind === "email" ? "To: " + patient.email : "To: " + patient.phone }),
          ui.badge(kind === "email" ? "Email" : "SMS", "info")
        ),
        kind === "email"
          ? el("div", { class: "preview__subject", text: "Subject: Your blood test is due" })
          : null,
        el("pre", { class: "preview__body", text: kind === "email" ? emailBody : smsBody })
      );
    }

    function send(kind) {
      var target = kind === "email" ? patient.email : patient.phone;
      store.addNote(
        request.id,
        "Simulated " + (kind === "email" ? "email" : "SMS") + " sent to " + target +
          " with access code " + request.token + ".",
        actorName(request),
        HOSPITAL
      );
      dialog.close();
      ui.toast("Simulated " + kind + " recorded in the request history.", "success");
    }

    ui.append(dialog, [
      el(
        "form",
        { method: "dialog", class: "modal__inner" },
        el(
          "header",
          { class: "modal__head" },
          el("h2", { class: "modal__title", text: "Notify patient" }),
          el("button", { class: "modal__close", type: "submit", "aria-label": "Close", text: "×" })
        ),
        el(
          "div",
          { class: "modal__body" },
          el("p", {
            class: "notice notice--warn",
            text:
              "Simulated only. No email or SMS provider is contacted — sending records a note " +
              "in the request history so the demo can show the channel."
          }),
          channel === null
            ? el("p", {
                class: "empty",
                text:
                  "No email address or mobile number on file for this patient. " +
                  "Printing the patient letter is the only delivery route here."
              })
            : null,
          patient.email ? preview("email") : null,
          patient.phone ? preview("sms") : null
        ),
        el(
          "footer",
          { class: "modal__foot" },
          patient.email
            ? el("button", {
                type: "button",
                class: "btn",
                text: "Send email (simulated)",
                onClick: function () { send("email"); }
              })
            : null,
          patient.phone
            ? el("button", {
                type: "button",
                class: "btn btn--secondary",
                text: "Send SMS (simulated)",
                onClick: function () { send("sms"); }
              })
            : null,
          el("button", { type: "submit", class: "btn btn--quiet", text: "Close" })
        )
      )
    ]);

    return dialog;
  }

  // ------------------------------------------------------- result modal
  function routingPanel(request) {
    var outcome = request.routing || d.routeOutcome(request);
    var failed = request.state === d.STATES.ROUTING_FAILED;

    return ui.panel(
      "Result routing",
      "Automatic — the system resolves the destination, nobody picks it.",
      [
        el(
          "div",
          { class: "notice " + (outcome.routable ? "notice--ok" : "notice--alert") },
          el("strong", { text: outcome.routable ? "Resolved. " : "No destination. " }),
          outcome.reason
        ),
        outcome.destination
          ? ui.fieldList([
              ui.field("Destination site", outcome.destination.siteName, {
                note: "ODS " + outcome.destination.odsSiteCode
              }),
              ui.field("Ward", outcome.destination.wardName, { note: outcome.destination.wardCode }),
              ui.field("Named recipient", outcome.destination.clinician, {
                note: "ESR " + outcome.destination.esrNumber
              }),
              ui.field("Endpoint", outcome.destination.endpoint)
            ])
          : null,
        failed
          ? el("p", {
              class: "muted",
              text:
                "This is the failure the project exists to remove: the sample was taken, the lab " +
                "produced a result, and it has arrived with nowhere to go. Someone has to chase it."
            })
          : null
      ]
    );
  }

  function resultPanel(request) {
    if (!request.result) return null;
    return ui.panel("Result", null, [
      el("p", { class: "result__summary", text: request.result.summary }),
      request.result.detail ? el("p", { class: "result__detail", text: request.result.detail }) : null,
      el("p", {
        class: "muted",
        text: "Entered by " + request.result.enteredBy + " at " + d.formatDateTime(request.result.enteredAt)
      })
    ]);
  }

  // ------------------------------------------------------------- detail
  function detailPanel(request) {
    var plan = store.findPlan(request.planId);
    var recurrence = plan && plan.recurrence;

    function step(transitionDef) {
      var note = "";
      if (transitionDef.step === d.STEPS.RETRY_ROUTING) {
        note = "Routed manually by the requesting team after automatic routing failed.";
      }
      var outcome = store.applyStep(request.id, transitionDef.step, {
        actorRole: HOSPITAL,
        actorName: actorName(request),
        note: note
      });
      if (!outcome.ok) ui.toast(outcome.error, "error");
      else ui.toast(transitionDef.label + " — now " + d.stateLabel(outcome.request.state) + ".", "success");
    }

    var deliveryActions = el(
      "div",
      { class: "actions__row actions__row--secondary" },
      // NO target="_blank" — see the note in providerView.js. A new tab reloads
      // the page, which re-seeds the store, and the token stops resolving.
      el("a", {
        class: "btn btn--secondary",
        href: ui.toHash({ view: "letter", token: request.token }),
        text: "Print patient letter"
      }),
      el("button", {
        type: "button",
        class: "btn btn--secondary",
        text: "Notify patient",
        onClick: function () {
          var dialog = notifyDialog(request);
          document.body.appendChild(dialog);
          dialog.addEventListener("close", function () { dialog.remove(); });
          dialog.showModal();
        }
      }),
      el("a", {
        class: "btn btn--secondary",
        href: ui.toHash({ view: "nhsapp", token: request.token }),
        text: "Open NHS App mockup"
      })
    );

    return el(
      "div",
      { class: "detail" },
      el(
        "header",
        { class: "detail__head" },
        el(
          "div",
          {},
          el("div", { class: "detail__id", text: request.id + " · " + request.planId }),
          el("h1", { class: "detail__title", text: request.patient.name }),
          el(
            "div",
            { class: "detail__meta" },
            ui.stateBadge(request.state),
            ui.pill("Due " + d.formatDate(request.dueDate)),
            recurrence && recurrence.mode === "RECURRING"
              ? ui.pill("every " + recurrence.intervalDays + " days until " + d.formatDate(recurrence.endDate), "info")
              : ui.pill("one-off")
          )
        )
      ),
      plan && plan.clinicalReason
        ? el("p", { class: "detail__reason", text: plan.clinicalReason })
        : null,

      ui.actionBar(request, HOSPITAL, step, { extra: deliveryActions }),

      el(
        "div",
        { class: "grid grid--2" },
        ui.panel("Patient", null, ui.patientSummary(request)),
        ui.panel(
          "Access code",
          "The QR carries this code and nothing else — no name, no NHS number, no date of birth.",
          ui.qrBlock(
            { view: "present", token: request.token },
            { caption: "Scanning this opens the collection unit screen.", size: 170 }
          )
        )
      ),

      el(
        "div",
        { class: "grid grid--2" },
        ui.panel("Requested by", "ODS trust and site codes are real NHS identifiers; the ward code is trust-local.", ui.requesterSummary(request)),
        ui.panel("Tests requested", "Ordered with SNOMED CT procedure concepts.", ui.testList(request.tests))
      ),

      ui.panel(
        "Reasonable adjustments",
        "Travels with the request so the patient does not have to explain twice.",
        ui.adjustments(request.reasonableAdjustments)
      ),

      resultPanel(request),
      request.state === d.STATES.ROUTING_FAILED ||
      request.state === d.STATES.AWAITING_CLINICIAN_REVIEW ||
      request.state === d.STATES.REVIEWED
        ? routingPanel(request)
        : null,

      ui.panel("History", "Every step, with the actor who took it.", ui.timeline(request))
    );
  }

  // --------------------------------------------------------------- render
  function render(route) {
    var requests = store.requests();
    var selected = null;

    if (route.view === "request" && route.id) selected = store.findRequest(route.id);
    if (!selected) {
      selected = requests.filter(function (r) { return !d.isTerminal(r.state); })[0] || requests[0] || null;
    }

    return el(
      "div",
      { class: "layout" },
      listPanel(requests, selected ? selected.id : null),
      el(
        "div",
        { class: "layout__main" },
        selected
          ? detailPanel(selected)
          : el(
              "div",
              { class: "empty-state" },
              el("h1", { text: "No requests yet" }),
              el("p", { text: "Create a monitoring plan to get started." }),
              el("a", { class: "btn", href: "#/new", text: "+ New monitoring plan" })
            )
      )
    );
  }

  ui.consoleView = { render: render };
})(typeof window !== "undefined" ? window : globalThis);
