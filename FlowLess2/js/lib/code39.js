/* =========================================================================
 * code39.js — Code 39 linear barcode, rendered as SVG.
 *
 * This is what goes on the specimen tube label the collection unit prints and
 * the lab scans. Code 39 rather than something denser because it is what
 * pathology specimen labels actually tend to carry, it needs no check digit,
 * and its character set (0-9, A-Z, and a few symbols) covers our token format
 * exactly.
 *
 * Each character is nine elements — five bars and four spaces, alternating,
 * three of the nine wide — plus a one-narrow-space gap between characters.
 * The symbol is delimited by '*' at each end.
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});

  // n = narrow, w = wide; order is bar, space, bar, space, ... bar.
  var PATTERNS = {
    "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
    "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
    "8": "wnnwnnwnn", "9": "nnwwnnwnn",
    "A": "wnnnnwnnw", "B": "nnwnnwnnw", "C": "wnwnnwnnn", "D": "nnnnwwnnw",
    "E": "wnnnwwnnn", "F": "nnwnwwnnn", "G": "nnnnnwwnw", "H": "wnnnnwwnn",
    "I": "nnwnnwwnn", "J": "nnnnwwwnn", "K": "wnnnnnnww", "L": "nnwnnnnww",
    "M": "wnwnnnnwn", "N": "nnnnwnnww", "O": "wnnnwnnwn", "P": "nnwnwnnwn",
    "Q": "nnnnnnwww", "R": "wnnnnnwwn", "S": "nnwnnnwwn", "T": "nnnnwnwwn",
    "U": "wwnnnnnnw", "V": "nwwnnnnnw", "W": "wwwnnnnnn", "X": "nwnnwnnnw",
    "Y": "wwnnwnnnn", "Z": "nwwnwnnnn",
    "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn",
    "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn"
  };

  /** Characters Code 39 can carry. Anything else must be rejected, not mangled. */
  function isEncodable(text) {
    var upper = String(text).toUpperCase();
    for (var i = 0; i < upper.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(PATTERNS, upper[i])) return false;
      if (upper[i] === "*") return false; // reserved as the delimiter
    }
    return upper.length > 0;
  }

  /**
   * Widths of the alternating bars and spaces, starting with a bar.
   * @returns {{ widths: number[], text: string }}
   */
  function widths(text, wideRatio) {
    var ratio = wideRatio || 3;
    var upper = String(text).toUpperCase();
    if (!isEncodable(upper)) {
      throw new Error("Code 39 cannot encode: " + text);
    }
    var chars = ("*" + upper + "*").split("");
    var out = [];
    for (var i = 0; i < chars.length; i++) {
      var pattern = PATTERNS[chars[i]];
      for (var j = 0; j < pattern.length; j++) {
        out.push(pattern[j] === "w" ? ratio : 1);
      }
      if (i < chars.length - 1) out.push(1); // inter-character gap (a space)
    }
    return { widths: out, text: upper };
  }

  /**
   * Render as an SVG string.
   * @param {object} [opts] { height, moduleWidth, showText, color, background }
   */
  function toSvg(text, opts) {
    var o = opts || {};
    var built = widths(text, o.wideRatio);
    var unit = o.moduleWidth || 2;
    var height = o.height || 60;
    var quiet = 10 * unit; // Code 39 requires a generous quiet zone
    var showText = o.showText !== false;
    var textHeight = showText ? 16 : 0;
    var color = o.color || "#0b1b2b";
    var background = o.background || "#ffffff";

    var total = built.widths.reduce(function (a, b) { return a + b; }, 0) * unit;
    var width = total + quiet * 2;
    var rects = [];
    var x = quiet;

    for (var i = 0; i < built.widths.length; i++) {
      var w = built.widths[i] * unit;
      if (i % 2 === 0) {
        rects.push('<rect x="' + x + '" y="0" width="' + w + '" height="' + height + '"/>');
      }
      x += w;
    }

    var label = showText
      ? '<text x="' + width / 2 + '" y="' + (height + 13) +
        '" text-anchor="middle" font-family="monospace" font-size="13" ' +
        'letter-spacing="1.5" fill="' + color + '">' + built.text + "</text>"
      : "";

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' +
      (height + textHeight) + '" viewBox="0 0 ' + width + " " + (height + textHeight) +
      '" shape-rendering="crispEdges" role="img" aria-label="Barcode ' + built.text + '">' +
      '<rect width="' + width + '" height="' + (height + textHeight) +
      '" fill="' + background + '"/>' +
      '<g fill="' + color + '">' + rects.join("") + "</g>" +
      label +
      "</svg>"
    );
  }

  FL.code39 = { toSvg: toSvg, widths: widths, isEncodable: isEncodable };
})(typeof window !== "undefined" ? window : globalThis);
