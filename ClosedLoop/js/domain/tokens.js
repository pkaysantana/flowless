/* =========================================================================
 * domain/tokens.js — opaque access tokens for the QR code.
 *
 * The whole privacy argument of this design rests on one property: the token
 * carries no patient information. It is a random handle; everything about the
 * patient sits behind it. A QR photographed over someone's shoulder, or a
 * label left on a bench, reveals nothing.
 *
 * The alphabet excludes I, O, 0 and 1 so a human reading a smudged label into
 * the lab screen cannot introduce an ambiguity, and stays inside the Code 39
 * character set so the same token can go on the specimen barcode.
 * ========================================================================= */

(function (global) {
  "use strict";

  var CR = (global.CR = global.CR || {});
  var domain = (CR.domain = CR.domain || {});

  var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var PREFIX = "CR";

  function randomValues(count) {
    var out = new Uint32Array(count);
    var cryptoObj =
      (typeof globalThis !== "undefined" && globalThis.crypto) ||
      (typeof window !== "undefined" && window.crypto) ||
      null;
    if (cryptoObj && cryptoObj.getRandomValues) {
      cryptoObj.getRandomValues(out);
      return out;
    }
    for (var i = 0; i < count; i++) out[i] = Math.floor(Math.random() * 0xffffffff);
    return out;
  }

  /**
   * @returns {string} e.g. "CR-7K3D-9QW2" — 8 random characters from a
   * 32-symbol alphabet, so 2^40 possibilities. Plenty for a demo; a real
   * deployment would want a longer token and a server-side rate limit.
   */
  function newToken() {
    var values = randomValues(8);
    var chars = [];
    for (var i = 0; i < 8; i++) chars.push(ALPHABET[values[i] % ALPHABET.length]);
    return PREFIX + "-" + chars.slice(0, 4).join("") + "-" + chars.slice(4).join("");
  }

  function isWellFormed(token) {
    return /^CR-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(String(token || "").toUpperCase());
  }

  /** Tolerate what a human types: lowercase, stray spaces, a pasted full URL. */
  function normalise(input) {
    var text = String(input || "").trim().toUpperCase();
    var match = text.match(/CR-[A-Z2-9]{4}-[A-Z2-9]{4}/);
    return match ? match[0] : text;
  }

  /**
   * The guard behind the privacy claim, used by the tests: assert that a token
   * leaks none of the patient's identifiers.
   */
  function leaksAnyOf(token, values) {
    var upper = String(token).toUpperCase().replace(/[^A-Z0-9]/g, "");
    for (var i = 0; i < values.length; i++) {
      var candidate = String(values[i] || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (candidate.length >= 3 && upper.indexOf(candidate) !== -1) return true;
    }
    return false;
  }

  domain.newToken = newToken;
  domain.isWellFormedToken = isWellFormed;
  domain.normaliseToken = normalise;
  domain.tokenLeaksAnyOf = leaksAnyOf;
  domain.TOKEN_ALPHABET = ALPHABET;
})(typeof window !== "undefined" ? window : globalThis);
