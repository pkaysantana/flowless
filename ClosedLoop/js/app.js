/* =========================================================================
 * app.js — boot and render dispatch.
 *
 * One tab, four actors. The header is the demo's storytelling device: it says
 * which device you are pretending to be holding, and switching between them is
 * a hash change, so the in-memory store survives the whole walkthrough.
 * ========================================================================= */

(function (global) {
  "use strict";

  var CR = (global.CR = global.CR || {});
  var ui = CR.ui;
  var el = ui.el;
  var d = CR.domain;
  var store = CR.store;

  var root = null;

  var ACTORS = [
    { view: "console", label: "Hospital", sub: "Requesting team", accent: "hospital" },
    { view: "present", label: "Collection unit", sub: "Phlebotomy", accent: "unit" },
    { view: "lab", label: "Laboratory", sub: "Pathology", accent: "lab" },
    { view: "nhsapp", label: "Patient", sub: "NHS App mockup", accent: "patient" }
  ];

  function activeToken() {
    var open = store.requests().filter(function (r) { return !d.isTerminal(r.state); })[0];
    return open ? open.token : (store.requests()[0] || {}).token || null;
  }

  function hrefFor(actor, route) {
    if (actor.view === "console") return "#/console";
    if (actor.view === "present") {
      return route.view === "present" && route.token ? "#/present/" + route.token : "#/present";
    }
    if (actor.view === "lab") {
      return route.view === "lab" && route.token ? "#/lab/" + route.token : "#/lab";
    }
    var token = (route.token && route.view === "nhsapp") ? route.token : activeToken();
    return token ? "#/nhsapp/" + token : "#/console";
  }

  function isActive(actor, route) {
    if (actor.view === "console") {
      return route.view === "console" || route.view === "request" || route.view === "new";
    }
    if (actor.view === "present") return route.view === "present" || route.view === "label";
    if (actor.view === "lab") return route.view === "lab";
    return route.view === "nhsapp" || route.view === "letter";
  }

  function header(route) {
    return el(
      "header",
      { class: "app-header" },
      el(
        "a",
        { class: "brand", href: "#/console" },
        el("span", { class: "brand__mark", "aria-hidden": "true" }, "CR"),
        el(
          "span",
          {},
          el("span", { class: "brand__name", text: "Care Relay" }),
          el("span", { class: "brand__tag", text: "Monitoring bloods, without the paperwork" })
        )
      ),

      el(
        "nav",
        { class: "actor-nav", "aria-label": "Actor screens" },
        ACTORS.map(function (actor) {
          return el(
            "a",
            {
              class: "actor-tab actor-tab--" + actor.accent,
              href: hrefFor(actor, route),
              "aria-current": isActive(actor, route) ? "page" : "false"
            },
            el("span", { class: "actor-tab__label", text: actor.label }),
            el("span", { class: "actor-tab__sub", text: actor.sub })
          );
        })
      ),

      el(
        "div",
        { class: "app-header__actions" },
        el("button", {
          type: "button",
          class: "btn btn--quiet",
          text: "Reset demo",
          onClick: function () {
            store.reset();
            ui.navigate({ view: "console" });
            ui.toast("Demo reset to the seeded scenarios.", "success");
          }
        })
      )
    );
  }

  function fictionBanner() {
    return el(
      "p",
      { class: "fiction-banner", role: "note" },
      el("strong", { text: "All data is fictional. " }),
      "Prototype only — no patient data, no backend, nothing is sent anywhere. " +
        "The NHS App screen is a concept mockup, not an integration."
    );
  }

  function viewFor(route) {
    switch (route.view) {
      case "new": return ui.newRequestForm.render(route);
      case "present": return ui.providerView.render(route);
      case "lab": return ui.labView.render(route);
      case "nhsapp": return ui.nhsAppMock.render(route);
      case "letter": return ui.printViews.letter(route);
      case "label": return ui.printViews.label(route);
      default: return ui.consoleView.render(route);
    }
  }

  function render() {
    var route = ui.currentRoute();
    ui.clear(root);

    document.body.dataset.view = route.view;

    if (ui.isPrintView(route)) {
      ui.append(root, [viewFor(route)]);
      return;
    }

    ui.append(root, [header(route), fictionBanner(), el("main", { class: "app-main" }, viewFor(route))]);
  }

  function start() {
    root = document.getElementById("app");
    store.seedDemo();
    store.subscribe(render);
    global.addEventListener("hashchange", render);
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : globalThis);
