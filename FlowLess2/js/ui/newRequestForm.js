/* =========================================================================
 * ui/newRequestForm.js — plan §5, the hospital intake form.
 *
 * Before this, nothing could create a plan except editing seed JSON. Captures
 * the full §1 data model: ODS trust + site codes, the trust-local ward code,
 * the clinician's ESR number, tests from the curated SNOMED picklist,
 * reasonable adjustments, and one-off vs recurring.
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});
  var ui = (FL.ui = FL.ui || {});
  var el = ui.el;
  var d = FL.domain;
  var data = FL.data;
  var store = FL.store;

  function inputRow(id, label, opts) {
    var o = opts || {};
    var input = el("input", {
      type: o.type || "text",
      id: id,
      value: o.value || "",
      placeholder: o.placeholder || "",
      autocomplete: "off",
      inputmode: o.inputmode || null
    });
    return {
      input: input,
      node: el(
        "div",
        { class: "form-row" },
        el("label", { class: "form-label", for: id, text: label + (o.required ? " *" : "") }),
        input,
        o.hint ? el("p", { class: "form-hint", text: o.hint }) : null,
        el("p", { class: "form-error", id: id + "-error", hidden: true })
      )
    };
  }

  function render() {
    var fields = {};
    var errors = {};

    function add(id, label, opts) {
      var row = inputRow(id, label, opts);
      fields[id] = row.input;
      return row.node;
    }

    function setError(id, message) {
      var node = document.getElementById(id + "-error");
      if (!node) return;
      node.textContent = message || "";
      node.hidden = !message;
      if (fields[id]) fields[id].classList.toggle("is-invalid", !!message);
    }

    // ---------------------------------------------------------- site select
    var siteSelect = el(
      "select",
      { id: "site", class: "select" },
      data.SELECTABLE_SITES.map(function (site) {
        return el("option", {
          value: site.odsSiteCode,
          text: site.odsSiteCode + " — " + site.siteName
        });
      })
    );
    var siteWarning = el("p", { class: "form-hint form-hint--warn", hidden: true });

    function refreshSiteWarning() {
      var chosen = data.SELECTABLE_SITES.filter(function (s) {
        return s.odsSiteCode === siteSelect.value;
      })[0];
      siteWarning.textContent = chosen && chosen.warning ? chosen.warning : "";
      siteWarning.hidden = !(chosen && chosen.warning);
    }
    siteSelect.addEventListener("change", refreshSiteWarning);

    // --------------------------------------------------------------- tests
    var testBoxes = data.TEST_PANELS.map(function (panel) {
      var box = el("input", { type: "checkbox", value: panel.code, id: "test-" + panel.code });
      return {
        code: panel.code,
        input: box,
        node: el(
          "label",
          { class: "check-card", for: "test-" + panel.code },
          box,
          el(
            "span",
            {},
            el(
              "span",
              { class: "check-card__head" },
              el("span", { class: "check-card__code", text: panel.code }),
              el("span", { class: "check-card__name", text: panel.name })
            ),
            el(
              "span",
              { class: "check-card__meta" },
              el("code", { text: panel.snomedCode }),
              " · " + panel.specimen
            ),
            el("span", { class: "check-card__hint", text: panel.hint })
          )
        )
      };
    });

    // ------------------------------------------------------- adjustments
    var adjustments = [];
    var adjustmentList = el("div", { class: "chips" });
    var adjustmentInput = el("input", {
      type: "text",
      id: "adjustment",
      placeholder: "e.g. Interpreter required — Punjabi",
      autocomplete: "off"
    });

    function renderAdjustments() {
      ui.clear(adjustmentList);
      adjustments.forEach(function (text, index) {
        adjustmentList.appendChild(
          el(
            "span",
            { class: "chip chip--removable" },
            text,
            el("button", {
              type: "button",
              class: "chip__remove",
              "aria-label": "Remove " + text,
              text: "×",
              onClick: function () {
                adjustments.splice(index, 1);
                renderAdjustments();
              }
            })
          )
        );
      });
      if (adjustments.length === 0) {
        adjustmentList.appendChild(el("span", { class: "empty", text: "None added yet." }));
      }
    }

    function addAdjustment() {
      var value = adjustmentInput.value.trim();
      if (!value) return;
      adjustments.push(value);
      adjustmentInput.value = "";
      renderAdjustments();
    }
    adjustmentInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        addAdjustment();
      }
    });
    renderAdjustments();

    // -------------------------------------------------------- recurrence
    var modeOneOff = el("input", { type: "radio", name: "mode", value: "ONE_OFF", checked: true, id: "mode-one" });
    var modeRecurring = el("input", { type: "radio", name: "mode", value: "RECURRING", id: "mode-rec" });
    var recurringFields = el("div", { class: "form-grid", hidden: true });

    var intervalRow = add("intervalDays", "Repeat every (days)", { type: "number", value: "28" });
    var endRow = add("endDate", "Until", { type: "date", value: "2026-12-18" });
    ui.append(recurringFields, [intervalRow, endRow]);

    function refreshMode() {
      recurringFields.hidden = !modeRecurring.checked;
    }
    modeOneOff.addEventListener("change", refreshMode);
    modeRecurring.addEventListener("change", refreshMode);

    // ------------------------------------------------------------ submit
    function submit() {
      var ok = true;
      ["patientName", "dob", "nhsNumber", "clinicianName", "esrNumber", "wardCode", "wardName", "startDate"]
        .forEach(function (id) { setError(id, ""); });
      setError("tests", "");

      function require(id, message) {
        if (!fields[id].value.trim()) {
          setError(id, message);
          ok = false;
        }
      }

      require("patientName", "The patient's name is required.");
      require("dob", "A date of birth is required.");
      require("clinicianName", "The requesting clinician is required.");
      require("wardCode", "A ward or department code is required.");
      require("wardName", "A ward or department name is required.");
      require("startDate", "A first-due date is required.");

      var nhs = fields.nhsNumber.value.replace(/\D/g, "");
      if (nhs.length !== 10) {
        setError("nhsNumber", "An NHS number is ten digits. Use the 999 range for demo data.");
        ok = false;
      }

      var esr = fields.esrNumber.value.trim();
      if (!esr) {
        setError("esrNumber", "Without an ESR number the result cannot be addressed to a named recipient.");
        ok = false;
      }

      var chosen = testBoxes.filter(function (t) { return t.input.checked; });
      if (chosen.length === 0) {
        setError("tests", "Choose at least one test.");
        ok = false;
      }

      if (!ok) {
        ui.toast("Some details are missing — see the highlighted fields.", "error");
        var firstError = document.querySelector(".form-error:not([hidden])");
        if (firstError) firstError.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }

      var site = data.SELECTABLE_SITES.filter(function (s) {
        return s.odsSiteCode === siteSelect.value;
      })[0];

      var plan = {
        startDate: fields.startDate.value,
        clinicalReason: fields.clinicalReason.value.trim(),
        patient: d.demographics({
          name: fields.patientName.value.trim(),
          dateOfBirth: fields.dob.value,
          nhsNumber: nhs,
          email: fields.email.value.trim() || null,
          phone: fields.phone.value.trim() || null
        }),
        requestingOrganisation: d.organisation({
          odsOrgCode: fields.odsOrgCode.value.trim().toUpperCase(),
          name: fields.orgName.value.trim()
        }),
        requestingSite: d.requestingSite({
          odsSiteCode: site.odsSiteCode,
          siteName: site.siteName,
          wardCode: fields.wardCode.value.trim().toUpperCase(),
          wardName: fields.wardName.value.trim()
        }),
        requestingClinician: d.clinician({
          name: fields.clinicianName.value.trim(),
          role: fields.clinicianRole.value.trim(),
          esrNumber: esr
        }),
        tests: chosen.map(function (t) {
          return data.toRequestedTest(data.testPanelByCode(t.code));
        }),
        reasonableAdjustments: adjustments.slice(),
        recurrence: modeRecurring.checked
          ? d.recurrence({
              mode: "RECURRING",
              intervalDays: Number(fields.intervalDays.value) || 28,
              endDate: fields.endDate.value || null
            })
          : d.recurrence({ mode: "ONE_OFF" })
      };

      var request = store.createPlan(plan);
      ui.toast("Monitoring plan created. Issue the QR to the patient next.", "success");
      ui.navigate({ view: "request", id: request.id });
    }

    // ------------------------------------------------------------ layout
    var form = el(
      "form",
      {
        class: "form",
        onSubmit: function (event) {
          event.preventDefault();
          submit();
        }
      },

      ui.panel("Patient", "Fictional data only. NHS numbers in the 999 range are reserved for testing.", [
        el(
          "div",
          { class: "form-grid" },
          add("patientName", "Full name", { required: true, placeholder: "Aisha Demo-Kaur" }),
          add("dob", "Date of birth", { required: true, type: "date" }),
          add("nhsNumber", "NHS number", { required: true, placeholder: "999 000 0012", inputmode: "numeric" })
        ),
        el(
          "div",
          { class: "form-grid" },
          add("email", "Email", { type: "email", hint: "Optional — enables the simulated email delivery." }),
          add("phone", "Mobile", { type: "tel", hint: "Optional — enables the simulated SMS delivery." })
        )
      ]),

      ui.panel(
        "Requesting organisation",
        "ODS trust and site codes are real, nationally standardised NHS identifiers. The ward code below is not — no national registry exists at that granularity, so trusts invent their own.",
        [
          el(
            "div",
            { class: "form-grid" },
            add("odsOrgCode", "ODS trust code", { value: data.ODS_TRUST.odsOrgCode, required: true }),
            add("orgName", "Trust name", { value: data.ODS_TRUST.name, required: true })
          ),
          el(
            "div",
            { class: "form-row" },
            el("label", { class: "form-label", for: "site", text: "ODS site *" }),
            siteSelect,
            siteWarning
          ),
          el(
            "div",
            { class: "form-grid" },
            add("wardCode", "Ward / department code", { required: true, value: "HAEM-OP-C", hint: "Trust-local." }),
            add("wardName", "Ward / department name", { required: true, value: "Haematology outpatients, clinic C" })
          )
        ]
      ),

      ui.panel("Requesting clinician", "ESR number, as specified. Note that real pathology order comms normally identifies the requester by GMC number — ESR is an HR and payroll identifier.", [
        el(
          "div",
          { class: "form-grid" },
          add("clinicianName", "Name", { required: true, placeholder: "Dr Priya Demo-Nair" }),
          add("clinicianRole", "Role", { value: "Consultant Haematologist" }),
          add("esrNumber", "ESR number", { required: true, placeholder: "12345678", inputmode: "numeric" })
        )
      ]),

      ui.panel("Tests", "Curated demo subset with real SNOMED CT procedure concepts — not the full NHS terminology.", [
        el("div", { class: "check-grid" }, testBoxes.map(function (t) { return t.node; })),
        el("p", { class: "form-error", id: "tests-error", hidden: true })
      ]),

      ui.panel("Reasonable adjustments", "These travel with the request to whichever collection unit the patient walks into.", [
        el(
          "div",
          { class: "form-row" },
          el("label", { class: "form-label", for: "adjustment", text: "Add an adjustment" }),
          el(
            "div",
            { class: "form-inline" },
            adjustmentInput,
            el("button", { type: "button", class: "btn btn--secondary", text: "Add", onClick: addAdjustment })
          ),
          el("p", { class: "form-hint", text: "Press Enter to add each one." })
        ),
        adjustmentList
      ]),

      ui.panel("Schedule", null, [
        el(
          "div",
          { class: "form-grid" },
          add("startDate", "First due", { required: true, type: "date", value: "2026-09-08" }),
          add("clinicalReason", "Clinical reason", { placeholder: "Warfarin monitoring following valve replacement" })
        ),
        el(
          "div",
          { class: "radio-row" },
          el("label", { class: "radio" }, modeOneOff, " One-off"),
          el("label", { class: "radio" }, modeRecurring, " Recurring")
        ),
        recurringFields
      ]),

      el(
        "div",
        { class: "form-actions" },
        el("button", { type: "submit", class: "btn btn--large", text: "Create monitoring plan" }),
        el("a", { class: "btn btn--quiet", href: "#/console", text: "Cancel" })
      )
    );

    refreshSiteWarning();
    refreshMode();

    return el(
      "div",
      { class: "page page--form" },
      el(
        "header",
        { class: "page__head" },
        el("a", { class: "back-link", href: "#/console", text: "← Back to console" }),
        el("h1", { class: "page__title", text: "New monitoring plan" }),
        el("p", {
          class: "page__lede",
          text:
            "Creates the plan and its first request. The patient gets an access code they can " +
            "take to any participating collection unit."
        })
      ),
      form
    );
  }

  ui.newRequestForm = { render: render };
})(typeof window !== "undefined" ? window : globalThis);
