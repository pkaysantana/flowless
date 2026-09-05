/* =========================================================================
 * ui/route.js — hash routing.
 *
 * Plan §8. Each actor gets its own URL, so the same laptop can play hospital,
 * collection unit, lab and patient by navigating between hashes. Crucially a
 * hash change is not a page reload, so the in-memory store survives the whole
 * walkthrough — that is what makes the backend-free rescope work.
 *
 * Route = { view: 'console' }
 *       | { view: 'new' }
 *       | { view: 'request', id }
 *       | { view: 'present',  token }   collection unit
 *       | { view: 'lab',      token }   laboratory
 *       | { view: 'nhsapp',   token }   patient (concept mockup)
 *       | { view: 'letter',   token }   print
 *       | { view: 'label',    token }   print
 * ========================================================================= */

(function (global) {
  "use strict";

  var CR = (global.CR = global.CR || {});
  var ui = (CR.ui = CR.ui || {});

  var PRINT_VIEWS = ["letter", "label"];

  function parseRoute(hash) {
    var raw = String(hash || "").replace(/^#/, "").replace(/^\//, "");
    var parts = raw.split("/").filter(function (p) { return p.length > 0; });

    if (parts.length === 0 || parts[0] === "console") return { view: "console" };
    if (parts[0] === "new") return { view: "new" };
    if (parts[0] === "request") return { view: "request", id: decodeURIComponent(parts[1] || "") };

    if (["present", "lab", "nhsapp", "letter", "label"].indexOf(parts[0]) !== -1) {
      return {
        view: parts[0],
        token: parts[1] ? CR.domain.normaliseToken(decodeURIComponent(parts[1])) : null
      };
    }
    return { view: "console" };
  }

  function toHash(route) {
    switch (route.view) {
      case "new": return "#/new";
      case "request": return "#/request/" + encodeURIComponent(route.id);
      case "present":
      case "lab":
      case "nhsapp":
      case "letter":
      case "label":
        return "#/" + route.view + (route.token ? "/" + encodeURIComponent(route.token) : "");
      default: return "#/console";
    }
  }

  function current() {
    return parseRoute(global.location ? global.location.hash : "");
  }

  function navigate(route) {
    global.location.hash = toHash(route);
  }

  function isPrintView(route) {
    return PRINT_VIEWS.indexOf(route.view) !== -1;
  }

  /** Absolute URL for a route — what actually goes inside a QR code. */
  function absoluteUrl(route) {
    var base = global.location.href.split("#")[0];
    return base + toHash(route);
  }

  ui.parseRoute = parseRoute;
  ui.toHash = toHash;
  ui.currentRoute = current;
  ui.navigate = navigate;
  ui.isPrintView = isPrintView;
  ui.absoluteUrl = absoluteUrl;
})(typeof window !== "undefined" ? window : globalThis);
