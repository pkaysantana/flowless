/* =========================================================================
 * ui/nhsAppMock.js — #/nhsapp/<token>
 *
 * Plan §7. A CONCEPT MOCKUP, and labelled as one on screen. There is no NHS
 * App integration here and none is implied — this exists so the pitch can show
 * where the access code would naturally live for a patient who already has the
 * app, instead of asking them to keep a piece of paper for four months.
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});
  var ui = (FL.ui = FL.ui || {});
  var el = ui.el;
  var d = FL.domain;
  var store = FL.store;

  function daysUntil(iso) {
    var target = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
    var now = new Date();
    var todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target.getTime() - todayUtc) / 86400000);
  }

  function reminderText(request) {
    var days = daysUntil(request.dueDate);
    if (days > 1) return "Due in " + days + " days";
    if (days === 1) return "Due tomorrow";
    if (days === 0) return "Due today";
    return Math.abs(days) + " days overdue";
  }

  function render(route) {
    var request = route.token ? store.findByToken(route.token) : null;

    if (!request) {
      return el(
        "div",
        { class: "page page--actor page--patient" },
        ui.panel("Nothing to show", null, [
          el("p", { text: "Open this screen from a request on the hospital console." }),
          el("a", { class: "btn", href: "#/console", text: "Back to console" })
        ])
      );
    }

    var overdue = daysUntil(request.dueDate) < 0;
    var done = d.isTerminal(request.state) || request.state !== d.STATES.QR_ISSUED;

    return el(
      "div",
      { class: "page page--actor page--patient" },
      el(
        "header",
        { class: "page__head" },
        el("p", { class: "page__eyebrow", text: "Patient" }),
        el("h1", { class: "page__title", text: "NHS App — concept mockup" }),
        el("p", {
          class: "page__lede",
          text:
            "Not a real integration. This is a sketch of where the access code would sit for a " +
            "patient who already uses the app."
        })
      ),

      el(
        "div",
        { class: "phone-wrap" },
        el(
          "div",
          { class: "phone" },
          el("div", { class: "phone__notch" }),
          el(
            "div",
            { class: "phone__screen" },
            el(
              "div",
              { class: "nhsapp__bar" },
              el("span", { class: "nhsapp__logo", text: "NHS" }),
              el("span", { class: "nhsapp__bar-title", text: "Your health" })
            ),
            el(
              "div",
              { class: "nhsapp__body" },
              el(
                "div",
                { class: "nhsapp__reminder" + (overdue ? " nhsapp__reminder--overdue" : "") },
                el("span", { class: "nhsapp__reminder-dot" }),
                el("span", { text: reminderText(request) })
              ),
              el("h2", { class: "nhsapp__title", text: "Blood test" }),
              el(
                "p",
                { class: "nhsapp__tests", text: request.tests.map(function (t) { return t.name; }).join(", ") }
              ),
              el(
                "div",
                { class: "nhsapp__card" },
                el("p", { class: "nhsapp__card-label", text: "Show this at any collection unit" }),
                ui.svg(
                  FL.qr.toSvg(ui.absoluteUrl({ view: "present", token: request.token }), {
                    size: 150,
                    margin: 2,
                    title: "Your access code"
                  }),
                  "nhsapp__qr"
                ),
                el("code", { class: "nhsapp__token", text: request.token })
              ),
              el(
                "dl",
                { class: "nhsapp__facts" },
                el("dt", { text: "Due" }),
                el("dd", { text: d.formatDate(request.dueDate) }),
                el("dt", { text: "Requested by" }),
                el("dd", { text: request.requestingClinician.name }),
                el("dt", { text: "Appointment" }),
                el("dd", { text: "Not needed — walk in" })
              ),
              request.reasonableAdjustments.length
                ? el(
                    "div",
                    { class: "nhsapp__adjust" },
                    el("p", { class: "nhsapp__card-label", text: "The unit will already know" }),
                    el(
                      "ul",
                      {},
                      request.reasonableAdjustments.map(function (item) {
                        return el("li", { text: item });
                      })
                    )
                  )
                : null,
              done
                ? el("p", {
                    class: "nhsapp__status",
                    text: "Status: " + d.stateLabel(request.state)
                  })
                : null
            )
          )
        ),
        el(
          "aside",
          { class: "phone-notes" },
          el("h2", { class: "phone-notes__title", text: "What this is pitching" }),
          el(
            "ul",
            { class: "phone-notes__list" },
            el("li", { text: "The code lives somewhere the patient already looks, not on a letter they will lose." }),
            el("li", { text: "A reminder can fire from the due date the plan already holds." }),
            el("li", { text: "Reasonable adjustments are visible to the patient, so they can check they are right." }),
            el("li", { text: "Nothing identifying is in the code itself — the app is just a nicer wallet for it." })
          ),
          el("p", {
            class: "notice notice--warn",
            text:
              "Concept only. No NHS App API is called, and this screen is not affiliated with or " +
              "endorsed by the NHS App."
          }),
          el("a", {
            class: "btn btn--secondary",
            href: ui.toHash({ view: "request", id: request.id }),
            text: "Back to the request"
          })
        )
      )
    );
  }

  ui.nhsAppMock = { render: render };
})(typeof window !== "undefined" ? window : globalThis);
