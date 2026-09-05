/* =========================================================================
 * ui/components.js — pieces shared across the four actor screens.
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});
  var ui = (FL.ui = FL.ui || {});
  var el = ui.el;
  var d = FL.domain;

  // ------------------------------------------------------------- badges
  function stateBadge(state) {
    var tone = "state";
    if (d.isTerminal(state)) tone = state === d.STATES.CANCELLED ? "muted" : "done";
    if (d.ATTENTION_STATES.indexOf(state) !== -1) tone = "alert";
    return el("span", { class: "badge badge--" + tone, text: d.stateLabel(state) });
  }

  function badge(text, tone) {
    return el("span", { class: "badge badge--" + (tone || "muted"), text: text });
  }

  function pill(text, tone) {
    return el("span", { class: "pill" + (tone ? " pill--" + tone : ""), text: text });
  }

  // ---------------------------------------------------------------- panels
  function panel(title, hint, body, extra) {
    return el(
      "section",
      { class: "panel" },
      title
        ? el(
            "header",
            { class: "panel__head" },
            el("h2", { class: "panel__title", text: title }),
            hint ? el("p", { class: "panel__hint", text: hint }) : null,
            extra || null
          )
        : null,
      el("div", { class: "panel__body" }, body)
    );
  }

  function field(label, value, opts) {
    var o = opts || {};
    var known = value !== null && value !== undefined && String(value).trim() !== "";
    return el(
      "div",
      { class: "field" },
      el("dt", { class: "field__label", text: label }),
      el(
        "dd",
        { class: "field__value" + (known ? "" : " field__value--missing") },
        known ? String(value) : "Not recorded",
        o.note ? el("span", { class: "field__note", text: o.note }) : null
      )
    );
  }

  function fieldList(children) {
    return el("dl", { class: "fields" }, children);
  }

  // ------------------------------------------------------------------ QR
  /**
   * A QR block. `route` is where scanning it should land — the token is the
   * only thing in the payload, never a patient identifier.
   */
  function qrBlock(route, opts) {
    var o = opts || {};
    var url = ui.absoluteUrl(route);
    return el(
      "div",
      { class: "qr" + (o.compact ? " qr--compact" : "") },
      ui.svg(FL.qr.toSvg(url, { size: o.size || 190, margin: 3, title: "Access QR code" }), "qr__code"),
      el(
        "div",
        { class: "qr__meta" },
        el("code", { class: "qr__token", text: route.token }),
        o.caption ? el("p", { class: "qr__caption", text: o.caption }) : null,
        o.showLink === false
          ? null
          : el("a", { class: "qr__link", href: ui.toHash(route), text: "Open this screen →" })
      )
    );
  }

  // ------------------------------------------------------------ timeline
  function timeline(request) {
    return el(
      "ol",
      { class: "timeline" },
      request.history
        .slice()
        .reverse()
        .map(function (entry) {
          return el(
            "li",
            { class: "timeline__item", dataset: { role: entry.actorRole } },
            el("div", { class: "timeline__time", text: d.formatDateTime(entry.at) }),
            el(
              "div",
              { class: "timeline__body" },
              el(
                "div",
                { class: "timeline__label" },
                entry.label,
                el("span", { class: "timeline__actor", text: " — " + entry.actor })
              ),
              entry.from && entry.from !== entry.to
                ? el("div", { class: "timeline__states", text: entry.from + " → " + entry.to })
                : null,
              entry.note ? el("div", { class: "timeline__note", text: entry.note }) : null
            )
          );
        })
    );
  }

  // ------------------------------------------------------------- content
  function testList(tests, opts) {
    var o = opts || {};
    return el(
      "ul",
      { class: "tests" },
      tests.map(function (test) {
        return el(
          "li",
          { class: "test" },
          el(
            "div",
            { class: "test__head" },
            el("span", { class: "test__code", text: test.code }),
            el("span", { class: "test__name", text: test.name })
          ),
          o.hideSnomed
            ? null
            : el(
                "div",
                { class: "test__snomed" },
                el("span", { class: "test__snomed-label", text: "SNOMED CT " }),
                el("code", { text: test.snomedCode }),
                test.snomedTerm ? el("span", { class: "test__term", text: test.snomedTerm }) : null
              )
        );
      })
    );
  }

  /**
   * Reasonable adjustments, rendered prominently rather than buried — they are
   * the reason the collection unit knows how to treat this person before the
   * person has to explain themselves again.
   */
  function adjustments(list, opts) {
    var o = opts || {};
    if (!list || list.length === 0) {
      return el("p", { class: "empty", text: "No reasonable adjustments recorded." });
    }
    return el(
      "ul",
      { class: "adjustments" + (o.large ? " adjustments--large" : "") },
      list.map(function (item) {
        return el("li", { class: "adjustment", text: item });
      })
    );
  }

  function patientSummary(request, opts) {
    var o = opts || {};
    return fieldList([
      field("Name", request.patient.name),
      field("Date of birth", d.formatDate(request.patient.dateOfBirth)),
      field("NHS number", d.formatNhsNumber(request.patient.nhsNumber)),
      o.contact !== false ? field("Email", request.patient.email) : null,
      o.contact !== false ? field("Mobile", request.patient.phone) : null
    ]);
  }

  function requesterSummary(request) {
    var site = request.requestingSite;
    return fieldList([
      field(
        "Requesting trust",
        request.requestingOrganisation.name,
        { note: "ODS " + request.requestingOrganisation.odsOrgCode }
      ),
      field("Site", site.siteName, { note: "ODS site " + site.odsSiteCode }),
      field(
        "Ward / department",
        site.wardName,
        { note: site.wardCode + " — trust-local code, no national registry" }
      ),
      field(
        "Requesting clinician",
        request.requestingClinician.name + " · " + request.requestingClinician.role,
        { note: "ESR " + request.requestingClinician.esrNumber }
      )
    ]);
  }

  // ------------------------------------------------------------- actions
  /** Buttons for the steps this actor can take, plus why the others are blocked. */
  function actionBar(request, actorRole, onStep, opts) {
    var o = opts || {};
    var snapshot = d.snapshotOf(request);
    var available = d.availableSteps(snapshot, actorRole);
    var blocked = d.blockedSteps(snapshot, actorRole);

    var buttons = available
      .filter(function (t) { return !o.exclude || o.exclude.indexOf(t.step) === -1; })
      .map(function (t) {
        return el("button", {
          type: "button",
          class: "btn" + (t.step === d.STEPS.CANCEL ? " btn--quiet" : ""),
          text: t.label,
          onClick: function () { onStep(t); }
        });
      });

    return el(
      "div",
      { class: "actions" },
      buttons.length ? el("div", { class: "actions__row" }, buttons) : null,
      o.extra || null,
      blocked.length
        ? el(
            "ul",
            { class: "blocked" },
            blocked.map(function (b) {
              return el(
                "li",
                { class: "blocked__item" },
                el("span", { class: "blocked__step", text: b.label }),
                el("span", { class: "blocked__reason", text: b.reason })
              );
            })
          )
        : null,
      !buttons.length && !blocked.length && d.isTerminal(request.state)
        ? el("p", { class: "empty", text: "This request is closed." })
        : null
    );
  }

  // --------------------------------------------------------------- token
  /** The "scan or type the code" entry used by the collection unit and lab. */
  function tokenEntry(opts) {
    var o = opts || {};
    var input = el("input", {
      type: "text",
      class: "token-input",
      placeholder: d.TOKEN_PLACEHOLDER,
      "aria-label": "Access code",
      autocomplete: "off",
      spellcheck: "false"
    });

    function submit() {
      var token = d.normaliseToken(input.value);
      if (!token) return;
      o.onSubmit(token);
    }

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") submit();
    });

    return el(
      "div",
      { class: "token-entry" },
      el("p", { class: "token-entry__hint", text: o.hint || "Scan the patient's QR code, or type the access code." }),
      el(
        "div",
        { class: "token-entry__row" },
        input,
        el("button", { type: "button", class: "btn", text: o.action || "Open", onClick: submit })
      ),
      o.suggestions && o.suggestions.length
        ? el(
            "div",
            { class: "token-entry__suggestions" },
            el("span", { class: "token-entry__suggestions-label", text: "Demo shortcut:" }),
            o.suggestions.map(function (s) {
              return el("button", {
                type: "button",
                class: "chip",
                text: s.label,
                onClick: function () { o.onSubmit(s.token); }
              });
            })
          )
        : null
    );
  }

  function toast(message, tone) {
    var stack = document.getElementById("toasts");
    if (!stack) return;
    var node = el(
      "div",
      { class: "toast toast--" + (tone || "info"), role: "status" },
      el("span", { text: message })
    );
    stack.appendChild(node);
    while (stack.childElementCount > 3) stack.firstElementChild.remove();
    setTimeout(function () { node.remove(); }, tone === "error" ? 8000 : 4200);
  }

  ui.stateBadge = stateBadge;
  ui.badge = badge;
  ui.pill = pill;
  ui.panel = panel;
  ui.field = field;
  ui.fieldList = fieldList;
  ui.qrBlock = qrBlock;
  ui.timeline = timeline;
  ui.testList = testList;
  ui.adjustments = adjustments;
  ui.patientSummary = patientSummary;
  ui.requesterSummary = requesterSummary;
  ui.actionBar = actionBar;
  ui.tokenEntry = tokenEntry;
  ui.toast = toast;
})(typeof window !== "undefined" ? window : globalThis);
