/* =========================================================================
 * ui/printViews.js — the two things that actually get printed.
 *
 * §7 Patient letter (#/letter/<token>) — what goes in the post or the hand of
 *    someone with no smartphone. Carries the QR and the code in plain type.
 *
 * §6 Specimen label (#/label/<token>) — the tube label the collection unit
 *    prints and the lab scans. This is the lab hand-off: no digital "send to
 *    lab" step is needed because the token travels on the sample.
 *
 *    The label carries the access code and the request id and nothing else.
 *    No name, no NHS number, no date of birth — consistent with the no-PII
 *    rule for the QR. A label found on a bench identifies nobody.
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});
  var ui = (FL.ui = FL.ui || {});
  var el = ui.el;
  var d = FL.domain;
  var store = FL.store;

  /**
   * Shown when the token in the URL resolves to nothing.
   *
   * In practice this means the page was reloaded, or the print view was opened
   * in a new tab: the store lives in the tab's memory, so a fresh page load
   * re-seeds it and every previous access code stops existing. Worth explaining
   * rather than just saying "not found" — it is the one way to get stuck
   * mid-demo, and the way out is one click.
   */
  function missing(what, token) {
    return el(
      "div",
      { class: "page" },
      ui.panel("Nothing to print", null, [
        el("p", { text: "No open request matches " + (token || "that code") + ", so there is no " + what + " to produce." }),
        el(
          "p",
          { class: "notice notice--warn" },
          el("strong", { text: "Most likely cause: the page was reloaded. " }),
          "This prototype keeps everything in the tab's memory — no backend. Reloading, or opening " +
            "a screen in a new tab, starts a fresh demo, and access codes from the previous run no " +
            "longer exist. Pick the request again and the new code will work."
        ),
        el(
          "div",
          { class: "actions__row" },
          el("a", { class: "btn", href: "#/console", text: "Back to console" }),
          el("a", { class: "btn btn--secondary", href: "#/present", text: "Collection unit" })
        )
      ])
    );
  }

  function printBar(label, back) {
    return el(
      "div",
      { class: "print-bar" },
      el("button", {
        type: "button",
        class: "btn",
        text: "Print " + label,
        onClick: function () { global.print(); }
      }),
      back
        ? el("a", { class: "btn btn--secondary", href: back.href, text: back.label })
        : null,
      el("a", { class: "btn btn--quiet", href: "#/console", text: "Back to console" }),
      el("span", { class: "muted", text: "This bar is hidden when printed." })
    );
  }

  // ------------------------------------------------------- patient letter
  function letter(route) {
    var request = route.token ? store.findByToken(route.token) : null;
    if (!request) return missing("letter", route.token);

    var testNames = request.tests.map(function (t) { return t.name; }).join(", ");
    var site = request.requestingSite;

    return el(
      "div",
      { class: "print-page" },
      printBar("letter", {
        href: ui.toHash({ view: "request", id: request.id }),
        label: "Back to the request"
      }),
      el(
        "article",
        { class: "letter" },
        el(
          "header",
          { class: "letter__head" },
          el(
            "div",
            {},
            el("p", { class: "letter__org", text: request.requestingOrganisation.name }),
            el("p", { class: "letter__site", text: site.siteName }),
            el("p", { class: "letter__ward", text: site.wardName })
          ),
          el("p", { class: "letter__date", text: d.formatDate(d.today()) })
        ),

        el(
          "div",
          { class: "letter__address" },
          el("p", { text: request.patient.name }),
          el("p", { class: "muted", text: "NHS number " + d.formatNhsNumber(request.patient.nhsNumber) })
        ),

        el("h1", { class: "letter__title", text: "Your blood test is due" }),

        el("p", { text: "Dear " + request.patient.name + "," }),
        el("p", {
          text:
            "You are due a " + testNames + " blood test on or around " +
            d.formatDate(request.dueDate) + ". You do not need an appointment, and you do not " +
            "need to bring a form."
        }),
        el("p", {
          text:
            "Go to any participating collection unit and show them the code below. They will " +
            "already have everything they need, including any adjustments we have recorded for you."
        }),

        el(
          "div",
          { class: "letter__code" },
          ui.svg(
            FL.qr.toSvg(ui.absoluteUrl({ view: "present", token: request.token }), {
              size: 180,
              margin: 2,
              title: "Your access code"
            }),
            "letter__qr"
          ),
          el(
            "div",
            {},
            el("p", { class: "letter__code-label", text: "Your access code" }),
            el("p", { class: "letter__code-value", text: request.token }),
            el("p", {
              class: "letter__code-note",
              text: "If the QR code will not scan, the unit can type this code instead."
            })
          )
        ),

        request.reasonableAdjustments.length
          ? el(
              "div",
              { class: "letter__adjust" },
              el("h2", { text: "What we have told the unit about your needs" }),
              el(
                "ul",
                {},
                request.reasonableAdjustments.map(function (item) {
                  return el("li", { text: item });
                })
              ),
              el("p", {
                class: "muted",
                text: "If any of this is wrong or has changed, please contact us before you go."
              })
            )
          : null,

        el(
          "footer",
          { class: "letter__foot" },
          el("p", { text: "Yours sincerely," }),
          el("p", { class: "letter__signature", text: request.requestingClinician.name }),
          el("p", { class: "muted", text: request.requestingClinician.role }),
          el("p", { class: "letter__ref", text: "Our reference: " + request.id })
        ),

        el("p", { class: "letter__fiction", text: "DEMONSTRATION ONLY — fictional patient, not a real NHS letter." })
      )
    );
  }

  // ------------------------------------------------------ specimen label
  function label(route) {
    var request = route.token ? store.findByToken(route.token) : null;
    if (!request) return missing("label", route.token);

    var codes = request.tests.map(function (t) { return t.code; }).join("  ");

    return el(
      "div",
      { class: "print-page print-page--label" },
      printBar("label", {
        href: ui.toHash({ view: "present", token: request.token }),
        label: "Back to the collection unit"
      }),
      el(
        "div",
        { class: "label-sheet" },
        el(
          "div",
          { class: "tube-label" },
          el(
            "div",
            { class: "tube-label__top" },
            el("span", { class: "tube-label__ref", text: request.id }),
            el("span", { class: "tube-label__date", text: d.formatDate(request.dueDate) })
          ),
          ui.svg(
            FL.code39.toSvg(request.token, { height: 54, moduleWidth: 2, showText: true }),
            "tube-label__barcode"
          ),
          el(
            "div",
            { class: "tube-label__tests" },
            el("span", { class: "tube-label__tests-label", text: "TESTS" }),
            el("span", { class: "tube-label__tests-value", text: codes })
          ),
          el(
            "div",
            { class: "tube-label__foot" },
            el("span", { text: "Flow Less" }),
            el("span", { text: request.requestingOrganisation.odsOrgCode + " · " + request.requestingSite.odsSiteCode })
          )
        ),

        el(
          "aside",
          { class: "label-notes" },
          el("h2", { text: "What is — and is not — on this label" }),
          el(
            "ul",
            {},
            el("li", { text: "The access code, as a Code 39 barcode the lab scans." }),
            el("li", { text: "The request id, so a human can cross-reference it." }),
            el("li", { text: "The ODS trust and site codes the sample came from." })
          ),
          el(
            "p",
            { class: "notice notice--ok" },
            el("strong", { text: "No patient identifiers. " }),
            "No name, NHS number or date of birth. A label found on a bench, or photographed in " +
              "transit, identifies nobody — the same rule the QR code follows."
          ),
          el("p", {
            class: "muted",
            text:
              "This is the lab hand-off. The patient has gone home; the token travels to the lab " +
              "on the tube, so no digital 'send to lab' step is needed."
          }),
          el("a", {
            class: "btn btn--secondary",
            href: ui.toHash({ view: "lab", token: request.token }),
            text: "Open the lab screen for this specimen"
          })
        )
      )
    );
  }

  ui.printViews = { letter: letter, label: label };
})(typeof window !== "undefined" ? window : globalThis);
