/* =========================================================================
 * domain/routing.js — where a finished result is sent, and why it sometimes
 * cannot be sent anywhere.
 *
 * This is the step that stays automatic (plan §2). It resolves the requesting
 * site's ODS code against a results-distribution directory and the requesting
 * clinician's ESR number against the trust's staff record. Both have to
 * resolve, or the result has arrived with nowhere to go — which is exactly the
 * real-world failure mode this project exists to remove, so the demo shows it
 * rather than hiding it.
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});
  var domain = (FL.domain = FL.domain || {});

  /**
   * Sites the results-distribution directory knows about. Populated at boot
   * from js/data/odsDirectory.js; a real deployment would resolve this against
   * NHS ODS and the trust's own endpoint registry.
   */
  var directory = [];

  function setDirectory(entries) {
    directory = (entries || []).slice();
  }

  function findSite(odsSiteCode) {
    for (var i = 0; i < directory.length; i++) {
      if (directory[i].odsSiteCode === odsSiteCode) return directory[i];
    }
    return null;
  }

  /**
   * @returns {{ routable: boolean, reason: string, destination: object|null }}
   */
  function routeOutcome(request) {
    var site = request.requestingSite || null;
    var clinicianRecord = request.requestingClinician || null;

    if (!site || !site.odsSiteCode) {
      return {
        routable: false,
        reason: "No ODS site code on the request — there is no address to deliver to.",
        destination: null
      };
    }

    var entry = findSite(site.odsSiteCode);
    if (!entry) {
      return {
        routable: false,
        reason:
          "ODS site " + site.odsSiteCode + " (" + site.siteName + ") is not in the " +
          "results-distribution directory, so the result has no electronic destination.",
        destination: null
      };
    }

    if (!clinicianRecord || !clinicianRecord.esrNumber) {
      return {
        routable: false,
        reason: "No ESR number for the requesting clinician — the result cannot be addressed to a named recipient.",
        destination: null
      };
    }

    return {
      routable: true,
      reason:
        "Resolved to " + entry.siteName + " (" + entry.odsSiteCode + "), ward " +
        site.wardCode + ", for " + clinicianRecord.name + " (ESR " +
        clinicianRecord.esrNumber + ").",
      destination: {
        odsSiteCode: entry.odsSiteCode,
        siteName: entry.siteName,
        endpoint: entry.endpoint,
        wardCode: site.wardCode,
        wardName: site.wardName,
        clinician: clinicianRecord.name,
        esrNumber: clinicianRecord.esrNumber
      }
    };
  }

  function canRoute(request) {
    return routeOutcome(request).routable;
  }

  domain.setRoutingDirectory = setDirectory;
  domain.routingDirectory = function () { return directory.slice(); };
  domain.routeOutcome = routeOutcome;
  domain.canRoute = canRoute;
})(typeof window !== "undefined" ? window : globalThis);
