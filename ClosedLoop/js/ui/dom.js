/* =========================================================================
 * ui/dom.js — a very small element builder.
 *
 * Everything is created with createElement and textContent. There is no
 * innerHTML anywhere that takes user input, so a patient name containing a
 * stray angle bracket stays a patient name.
 * ========================================================================= */

(function (global) {
  "use strict";

  var CR = (global.CR = global.CR || {});
  var ui = (CR.ui = CR.ui || {});

  function append(node, children) {
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child === null || child === undefined || child === false || child === "") continue;
      if (Array.isArray(child)) append(node, child);
      else if (child instanceof Node) node.appendChild(child);
      else node.appendChild(document.createTextNode(String(child)));
    }
  }

  function el(tag, props) {
    var node = document.createElement(tag);
    var attrs = props || {};
    Object.keys(attrs).forEach(function (key) {
      var value = attrs[key];
      if (value === null || value === undefined || value === false) return;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key === "html") node.innerHTML = value; // only ever for our own SVG
      else if (key.indexOf("on") === 0 && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else node.setAttribute(key, value === true ? "" : String(value));
    });
    append(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /** Wrap generated SVG markup (ours, never user input) in an element. */
  function svg(markup, className) {
    return el("span", { class: className || "svg-wrap", html: markup });
  }

  ui.el = el;
  ui.clear = clear;
  ui.append = append;
  ui.svg = svg;
})(typeof window !== "undefined" ? window : globalThis);
