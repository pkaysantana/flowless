/* =========================================================================
 * qrcode.js — self-contained QR Code generator (byte mode, ECC level M).
 *
 * Why this is hand-rolled rather than a CDN import: the demo runs from the
 * presenter's laptop, opened straight off the filesystem, with no guarantee of
 * WiFi in the room. A <script src="https://cdn..."> that fails to load is a
 * dead QR code in front of judges. Nothing here touches the network.
 *
 * Supports versions 1–10 at ECC level M, which is far more than the ~50-byte
 * hash URLs this app encodes. Implements the ISO/IEC 18004 pipeline:
 * byte-mode encoding → Reed-Solomon over GF(256) → block interleaving →
 * function-pattern placement → all 8 data masks scored by the standard
 * penalty rules → BCH format/version information.
 *
 * Exposes FL.qr.encode(text) -> { size, modules } and FL.qr.toSvg(text, opts).
 * ========================================================================= */

(function (global) {
  "use strict";

  var FL = (global.FL = global.FL || {});

  // ----------------------------------------------------------- GF(256)
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function buildTables() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d; // primitive polynomial x^8+x^4+x^3+x^2+1
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /** Generator polynomial for `degree` error-correction codewords. */
  function rsGenerator(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1);
      for (var k = 0; k < next.length; k++) next[k] = 0;
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsRemainder(data, degree) {
    var gen = rsGenerator(degree);
    var rem = new Array(degree);
    for (var i = 0; i < degree; i++) rem[i] = 0;
    for (var d = 0; d < data.length; d++) {
      var factor = data[d] ^ rem[0];
      rem.shift();
      rem.push(0);
      for (var j = 0; j < degree; j++) rem[j] ^= gfMul(gen[j + 1], factor);
    }
    return rem;
  }

  // ------------------------------------------------- version block tables
  // ECC level M only. { ec: EC codewords per block, g1/d1, g2/d2: block groups }
  var BLOCKS_M = [
    null,
    { ec: 10, g1: 1, d1: 16, g2: 0, d2: 0 },
    { ec: 16, g1: 1, d1: 28, g2: 0, d2: 0 },
    { ec: 26, g1: 1, d1: 44, g2: 0, d2: 0 },
    { ec: 18, g1: 2, d1: 32, g2: 0, d2: 0 },
    { ec: 24, g1: 2, d1: 43, g2: 0, d2: 0 },
    { ec: 16, g1: 4, d1: 27, g2: 0, d2: 0 },
    { ec: 18, g1: 4, d1: 31, g2: 0, d2: 0 },
    { ec: 22, g1: 2, d1: 38, g2: 2, d2: 39 },
    { ec: 22, g1: 3, d1: 36, g2: 2, d2: 37 },
    { ec: 26, g1: 4, d1: 43, g2: 1, d2: 44 }
  ];

  var ALIGNMENT = [
    null, [], [6, 18], [6, 22], [6, 26], [6, 30],
    [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
  ];

  // Remainder bits appended after the final codeword, by version.
  var REMAINDER_BITS = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

  var MAX_VERSION = 10;
  var ECL_M_BITS = 0; // L=1, M=0, Q=3, H=2

  function dataCapacity(version) {
    var b = BLOCKS_M[version];
    return b.g1 * b.d1 + b.g2 * b.d2;
  }

  // ------------------------------------------------------------ encoding
  function toUtf8Bytes(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
        var full = 0x10000 + ((c - 0xd800) << 10) + (text.charCodeAt(++i) - 0xdc00);
        out.push(
          0xf0 | (full >> 18),
          0x80 | ((full >> 12) & 0x3f),
          0x80 | ((full >> 6) & 0x3f),
          0x80 | (full & 0x3f)
        );
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return out;
  }

  function chooseVersion(byteLen) {
    for (var v = 1; v <= MAX_VERSION; v++) {
      var countBits = v < 10 ? 8 : 16;
      var needed = 4 + countBits + 8 * byteLen;
      if (dataCapacity(v) * 8 >= needed) return v;
    }
    throw new Error(
      "QR payload too long for this generator (" + byteLen + " bytes, max version " +
        MAX_VERSION + ")."
    );
  }

  function buildCodewords(bytes, version) {
    var bits = [];
    function push(value, length) {
      for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }

    push(0b0100, 4); // byte mode
    push(bytes.length, version < 10 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);

    var capacityBits = dataCapacity(version) * 8;
    push(0, Math.min(4, capacityBits - bits.length)); // terminator
    while (bits.length % 8 !== 0) bits.push(0);

    var data = [];
    for (var b = 0; b < bits.length; b += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[b + k];
      data.push(byte);
    }
    var pad = [0xec, 0x11];
    for (var p = 0; data.length < dataCapacity(version); p++) {
      data.push(pad[p % 2]);
    }
    return data;
  }

  /** Split into blocks, add Reed-Solomon, then interleave as the spec requires. */
  function interleave(data, version) {
    var spec = BLOCKS_M[version];
    var blocks = [];
    var ecBlocks = [];
    var offset = 0;
    var g, i;

    for (g = 0; g < spec.g1; g++) {
      var b1 = data.slice(offset, offset + spec.d1);
      offset += spec.d1;
      blocks.push(b1);
      ecBlocks.push(rsRemainder(b1, spec.ec));
    }
    for (g = 0; g < spec.g2; g++) {
      var b2 = data.slice(offset, offset + spec.d2);
      offset += spec.d2;
      blocks.push(b2);
      ecBlocks.push(rsRemainder(b2, spec.ec));
    }

    var result = [];
    var maxData = Math.max(spec.d1, spec.d2 || 0);
    for (i = 0; i < maxData; i++) {
      for (var b = 0; b < blocks.length; b++) {
        if (i < blocks[b].length) result.push(blocks[b][i]);
      }
    }
    for (i = 0; i < spec.ec; i++) {
      for (var e = 0; e < ecBlocks.length; e++) result.push(ecBlocks[e][i]);
    }
    return result;
  }

  // -------------------------------------------------------- module layout
  function newGrid(size, value) {
    var grid = [];
    for (var r = 0; r < size; r++) {
      var row = [];
      for (var c = 0; c < size; c++) row.push(value);
      grid.push(row);
    }
    return grid;
  }

  function drawFunctionPatterns(modules, reserved, version) {
    var size = modules.length;
    var i, j;

    function setFn(r, c, dark) {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      modules[r][c] = dark;
      reserved[r][c] = true;
    }

    // Finder patterns plus their separators.
    function finder(r0, c0) {
      for (i = -1; i <= 7; i++) {
        for (j = -1; j <= 7; j++) {
          var dist = Math.max(Math.abs(i - 3), Math.abs(j - 3));
          setFn(r0 + i, c0 + j, dist !== 2 && dist <= 3);
        }
      }
    }
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);

    // Timing patterns.
    for (i = 8; i < size - 8; i++) {
      setFn(6, i, i % 2 === 0);
      setFn(i, 6, i % 2 === 0);
    }

    // Alignment patterns, skipping the three finder corners.
    var centres = ALIGNMENT[version];
    for (i = 0; i < centres.length; i++) {
      for (j = 0; j < centres.length; j++) {
        var r = centres[i];
        var c = centres[j];
        if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) {
          continue;
        }
        for (var dr = -2; dr <= 2; dr++) {
          for (var dc = -2; dc <= 2; dc++) {
            setFn(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
          }
        }
      }
    }

    // Reserve the format-information strips (written later, per mask).
    for (i = 0; i <= 8; i++) {
      if (i !== 6) {
        reserved[8][i] = true;
        reserved[i][8] = true;
      }
    }
    for (i = 0; i < 8; i++) {
      reserved[8][size - 1 - i] = true;
      reserved[size - 1 - i][8] = true;
    }
    reserved[8][6] = true;
    reserved[6][8] = true;

    // The always-dark module.
    setFn(size - 8, 8, true);

    // Version information (versions 7 and up).
    if (version >= 7) {
      var rem = version;
      for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      var bits = (version << 12) | rem;
      for (i = 0; i < 18; i++) {
        var bit = ((bits >>> i) & 1) === 1;
        var a = size - 11 + (i % 3);
        var b = Math.floor(i / 3);
        setFn(a, b, bit);
        setFn(b, a, bit);
      }
    }
  }

  function drawFormatBits(modules, size, mask) {
    var data = (ECL_M_BITS << 3) | mask;
    var rem = data;
    for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;

    function bitAt(i) {
      return ((bits >>> i) & 1) === 1;
    }

    // First copy: down the left of the top-left finder, then along its bottom.
    // (Indices below are [row][col] — the spec's diagrams are drawn x-first,
    // which is an easy way to end up with a transposed, undecodable symbol.)
    for (var i = 0; i <= 5; i++) modules[i][8] = bitAt(i);
    modules[7][8] = bitAt(6);
    modules[8][8] = bitAt(7);
    modules[8][7] = bitAt(8);
    for (var j = 9; j < 15; j++) modules[8][14 - j] = bitAt(j);

    // Second copy: along the bottom of the top-right finder, then down the
    // right of the bottom-left one.
    for (var a = 0; a < 8; a++) modules[8][size - 1 - a] = bitAt(a);
    for (var b = 8; b < 15; b++) modules[size - 15 + b][8] = bitAt(b);
  }

  function drawCodewords(modules, reserved, codewords) {
    var size = modules.length;
    var bitIndex = 0;
    var totalBits = codewords.length * 8;

    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // the vertical timing column is skipped
      for (var vert = 0; vert < size; vert++) {
        for (var k = 0; k < 2; k++) {
          var x = right - k;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!reserved[y][x] && bitIndex < totalBits) {
            var byte = codewords[bitIndex >>> 3];
            modules[y][x] = ((byte >>> (7 - (bitIndex & 7))) & 1) === 1;
            bitIndex++;
          }
        }
      }
    }
  }

  function maskFn(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
      default: throw new Error("bad mask " + mask);
    }
  }

  function applyMask(modules, reserved, mask) {
    var size = modules.length;
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (!reserved[r][c] && maskFn(mask, r, c)) modules[r][c] = !modules[r][c];
      }
    }
  }

  /** The four penalty rules from the specification. Lower is better. */
  function penalty(modules) {
    var size = modules.length;
    var score = 0;
    var r, c, run, dark = 0;

    // Rule 1 — runs of five or more identical modules in a line.
    function scoreLine(get) {
      var total = 0;
      for (var i = 0; i < size; i++) {
        run = 1;
        for (var j = 1; j < size; j++) {
          if (get(i, j) === get(i, j - 1)) {
            run++;
          } else {
            if (run >= 5) total += 3 + (run - 5);
            run = 1;
          }
        }
        if (run >= 5) total += 3 + (run - 5);
      }
      return total;
    }
    score += scoreLine(function (i, j) { return modules[i][j]; });
    score += scoreLine(function (i, j) { return modules[j][i]; });

    // Rule 2 — 2x2 blocks of one colour.
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var v = modules[r][c];
        if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
          score += 3;
        }
      }
    }

    // Rule 3 — finder-like 1:1:3:1:1 patterns with four light modules beside.
    var p1 = [true, false, true, true, true, false, true, false, false, false, false];
    var p2 = [false, false, false, false, true, false, true, true, true, false, true];
    function matches(pattern, get, i, j) {
      for (var k = 0; k < 11; k++) if (get(i, j + k) !== pattern[k]) return false;
      return true;
    }
    for (r = 0; r < size; r++) {
      for (c = 0; c <= size - 11; c++) {
        if (matches(p1, function (i, j) { return modules[i][j]; }, r, c)) score += 40;
        if (matches(p2, function (i, j) { return modules[i][j]; }, r, c)) score += 40;
      }
    }
    for (c = 0; c < size; c++) {
      for (r = 0; r <= size - 11; r++) {
        if (matches(p1, function (i, j) { return modules[j][i]; }, c, r)) score += 40;
        if (matches(p2, function (i, j) { return modules[j][i]; }, c, r)) score += 40;
      }
    }

    // Rule 4 — deviation from a 50% dark ratio.
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (modules[r][c]) dark++;
    var percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;

    return score;
  }

  // ------------------------------------------------------------- public
  /**
   * Encode `text` as a QR symbol.
   * @returns {{ size: number, version: number, mask: number, modules: boolean[][] }}
   */
  function encode(text) {
    var bytes = toUtf8Bytes(String(text));
    var version = chooseVersion(bytes.length);
    var codewords = interleave(buildCodewords(bytes, version), version);

    // Trailing remainder bits are always zero; padding a byte covers them.
    var padBits = REMAINDER_BITS[version];
    if (padBits > 0) codewords = codewords.concat([0]);

    var size = 17 + 4 * version;
    var best = null;

    for (var mask = 0; mask < 8; mask++) {
      var modules = newGrid(size, false);
      var reserved = newGrid(size, false);
      drawFunctionPatterns(modules, reserved, version);
      drawCodewords(modules, reserved, codewords);
      applyMask(modules, reserved, mask);
      drawFormatBits(modules, size, mask);
      var score = penalty(modules);
      if (best === null || score < best.score) {
        best = { score: score, modules: modules, mask: mask };
      }
    }

    return { size: size, version: version, mask: best.mask, modules: best.modules };
  }

  /**
   * Render `text` as an SVG string.
   * @param {object} [opts] { size: px, margin: modules, dark, light, title }
   */
  function toSvg(text, opts) {
    var o = opts || {};
    var qr = encode(text);
    var margin = o.margin === undefined ? 4 : o.margin;
    var total = qr.size + margin * 2;
    var px = o.size || 200;
    var dark = o.dark || "#0b1b2b";
    var light = o.light || "#ffffff";

    var path = [];
    for (var r = 0; r < qr.size; r++) {
      for (var c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) {
          path.push("M" + (c + margin) + " " + (r + margin) + "h1v1h-1z");
        }
      }
    }

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + " " + total +
      '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges" role="img" ' +
      'aria-label="' + (o.title || "QR code") + '">' +
      '<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>' +
      '<path d="' + path.join("") + '" fill="' + dark + '"/>' +
      "</svg>"
    );
  }

  FL.qr = { encode: encode, toSvg: toSvg, MAX_VERSION: MAX_VERSION };
})(typeof window !== "undefined" ? window : globalThis);
