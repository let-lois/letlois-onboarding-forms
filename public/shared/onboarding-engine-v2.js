/* ==========================================================================
   LetLois Onboarding — shared form engine, v2
   ==========================================================================
   Used by the Part 2 (Website) form. Parts 1 and 3 still run on
   onboarding-engine.js. This file does everything that one does (text,
   email, tel, textarea, select, multiselect, address, file, consent,
   checklist-detail, repeater, welcome, end) plus:

     list        N required bulleted fields plus an "Add another" button
     rows        rows of inputs (price lists, tiers), can start pre-filled
                 from an earlier list answer
     cards       pick one option from preview cards. An option marked
                 other:true becomes a slim "Something else" row that opens a
                 one-line box. Set shape:"phone" for tall phone previews.
     colors      brand color slots filled from a color scale (drag in the
                 square, slide the hue), quick colors, a code box, or by
                 clicking the client's uploaded logo
     radius-map  ZIP code plus a radius slider drawn on a map
     file        now takes accept / multiple / maxSizeMB / dropText

   And these step options:

     showIf: { id, equals }      only show this step when an earlier answer
                                 matches. { id, path, equals } looks inside
                                 an object answer (e.g. a cards choice).
     skippable: true             adds a "skip" link. A skipped step is sent
                                 as { skipped: true }.

   Submission contract (same as v1):
     - POSTs a FormData to CONFIG.apiEndpoint
     - field "data": JSON string of every non-file answer, keyed by step id
       (steps that are hidden by showIf are sent as null)
     - each "file" step's uploads go under a field named after the step id
     - expects JSON back: { ok: true, ... } or { ok: false, error }
     - if location.protocol is "file:", runs in DEMO MODE: nothing is sent.
   ========================================================================== */

(function (global) {

  const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
  const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
  const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  const ZIP_API = "https://api.zippopotam.us/us/";

  // Grayscale row, then vivid, light, and dark versions of eight hues.
  const PALETTE = [
    "#FFFFFF", "#E5E5E5", "#BFBFBF", "#999999", "#737373", "#4D4D4D", "#262626", "#000000",
    "#E53935", "#FB8C00", "#FDD835", "#43A047", "#00ACC1", "#1E88E5", "#8E24AA", "#D81B60",
    "#EF9A9A", "#FFCC80", "#FFF59D", "#A5D6A7", "#80DEEA", "#90CAF9", "#CE93D8", "#F48FB1",
    "#B71C1C", "#E65100", "#F9A825", "#1B5E20", "#006064", "#0D47A1", "#4A148C", "#880E4F"
  ];

  /* -------------------------------------------------------------------------
     Small helpers (no form state)
     ------------------------------------------------------------------------- */
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  // Input masking (e.g. mask: "XX-XXXXXXX") — "X" is a digit slot, any other
  // character is a literal that gets auto-inserted once enough digits exist.
  function digitsOnly(str) { return (str || "").replace(/\D/g, ""); }
  function maskDigitCount(mask) { return (mask.match(/X/g) || []).length; }
  function applyMask(mask, rawDigits) {
    let out = "", di = 0;
    for (let i = 0; i < mask.length && di < rawDigits.length; i++) {
      if (mask[i] === "X") { out += rawDigits[di]; di++; }
      else { out += mask[i]; }
    }
    return out;
  }

  function mixHex(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return "rgb(" + r + "," + g + "," + bl + ")";
  }
  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
  }

  // "#0f7" / "0F75BC" / "#0f75bc" -> "#0F75BC", or null if it isn't a color.
  function normHex(raw) {
    let s = String(raw || "").trim().replace(/^#/, "").toUpperCase();
    if (/^[0-9A-F]{3}$/.test(s)) s = s.split("").map(ch => ch + ch).join("");
    return /^[0-9A-F]{6}$/.test(s) ? "#" + s : null;
  }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  // Color scale math. h is 0-360, s and v are 0-1.
  function hsvToHex(h, s, v) {
    const hn = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs((hn / 60) % 2 - 1)), m = v - c;
    const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hn / 60)];
    return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
  }
  function hexToHsv(hex) {
    const c = hexToRgb(hex);
    const R = c.r / 255, G = c.g / 255, B = c.b / 255;
    const max = Math.max(R, G, B), d = max - Math.min(R, G, B);
    let h = null;                       // grays have no hue
    if (d !== 0) {
      if (max === R) h = 60 * (((G - B) / d) % 6);
      else if (max === G) h = 60 * ((B - R) / d + 2);
      else h = 60 * ((R - G) / d + 4);
      if (h < 0) h += 360;
    }
    return { h: h, s: max === 0 ? 0 : d / max, v: max };
  }

  // accept works like the HTML attribute: "image/*,.pdf,.ai"
  function isAcceptedFile(file, accept) {
    const tokens = String(accept || "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    if (!tokens.length) return true;
    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    return tokens.some(t => {
      if (t.endsWith("/*")) return type.startsWith(t.slice(0, -1));
      if (t.startsWith(".")) return name.endsWith(t);
      return type === t;
    });
  }

  // Loads the map library the first time a radius-map step needs it. If it
  // can't load (blocked, offline) the step still works without the map.
  let leafletPromise = null;
  function loadLeaflet() {
    if (global.L && global.L.map) return Promise.resolve(global.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = LEAFLET_CSS;
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = LEAFLET_JS;
      js.onload = () => (global.L && global.L.map ? resolve(global.L) : reject(new Error("Map library missing")));
      js.onerror = () => { leafletPromise = null; reject(new Error("Map library failed to load")); };
      document.head.appendChild(js);
    });
    return leafletPromise;
  }

  function init(CONFIG) {
    const answers = {};
    const rowSigs = {};           // remembers what a pre-filled rows step was built from
    const rowRemoved = {};        // pre-filled rows the client removed on purpose, so they stay removed
    const ALL = CONFIG.steps;
    let currentIndex = 0;
    let submitState = "idle";     // idle | submitting | success | error
    let activeMap = null;         // the Leaflet map on the current stage, if any
    let pendingFocus = null;      // CSS selector to focus after the next render
    let fileError = "";           // message shown under a file dropzone

    const cardEl = document.getElementById("card");
    const liveRegion = document.getElementById("liveRegion");
    const footerEl = document.getElementById("footerCredit");
    if (footerEl) footerEl.textContent = CONFIG.businessName || "";

    /* ---------------------------------------------------------------------
       Which steps are showing (showIf), and moving between them
       --------------------------------------------------------------------- */
    const isQuestion = s => s.type !== "welcome" && s.type !== "end";

    function depValue(c) {
      let v = answers[c.id];
      if (c.path !== undefined) v = (v && typeof v === "object") ? v[c.path] : undefined;
      return v;
    }
    function isVisible(step) {
      const c = step.showIf;
      if (!c) return true;
      const dep = ALL.find(s => s.id === c.id);
      if (dep && !isVisible(dep)) return false;     // hidden parent hides its children
      return depValue(c) === c.equals;
    }
    const visibleQuestions = () => ALL.filter(s => isQuestion(s) && isVisible(s));
    const questionNumber = step => visibleQuestions().indexOf(step) + 1;

    function nextIndex(from) {
      for (let i = from + 1; i < ALL.length; i++) if (isVisible(ALL[i])) return i;
      return ALL.length - 1;
    }
    function prevIndex(from) {
      for (let i = from - 1; i >= 0; i--) if (isVisible(ALL[i])) return i;
      return 0;
    }
    const isSkipped = step => !!(step.skippable && answers[step.id] && answers[step.id].skipped === true);

    /* ---------------------------------------------------------------------
       Starting values for the newer step types
       --------------------------------------------------------------------- */
    function prepareAnswer(step) {
      if (isSkipped(step)) return;
      if (step.type === "list") {
        const min = step.minItems || 1;
        const items = Array.isArray(answers[step.id]) ? answers[step.id] : [];
        while (items.length < min) items.push("");
        answers[step.id] = items;
      } else if (step.type === "rows") {
        syncRows(step);
      } else if (step.type === "colors") {
        if (!answers[step.id] || typeof answers[step.id] !== "object") answers[step.id] = {};
      } else if (step.type === "radius-map") {
        if (!answers[step.id] || typeof answers[step.id] !== "object") answers[step.id] = { zip: "", miles: step.defaultMiles || 25 };
      } else if (step.type === "cards") {
        if (!answers[step.id] || typeof answers[step.id] !== "object") answers[step.id] = {};
      }
    }

    // Builds (or rebuilds) the rows for a rows step. Rows can start pre-filled
    // from an earlier list answer (prefillFrom) or from fixed labels
    // (prefillLabels). If the earlier list changes, the rows follow it, and any
    // prices already typed for a label that still exists are kept. Rows the
    // client removed stay removed, and rows they added by hand stay too.
    function syncRows(step) {
      const cur = answers[step.id];
      if (cur && cur.skipped) return;
      const key = step.labelKey || step.columns[0].key;
      const existing = Array.isArray(cur) ? cur : null;
      let src = null;
      if (step.prefillFrom) {
        const v = answers[step.prefillFrom];
        const gone = rowRemoved[step.id] || [];
        src = (Array.isArray(v) ? v : []).map(s => String(s || "").trim()).filter(l => l && !gone.includes(l));
      } else if (step.prefillLabels) {
        src = step.prefillLabels.slice();
      }
      const sig = src ? JSON.stringify(src) : "";
      if (existing && rowSigs[step.id] === sig) return;
      rowSigs[step.id] = sig;
      if (src) {
        const kept = src.map(label => {
          const old = existing && existing.find(r => !r._extra && (r[key] || "") === label);
          return old || { [key]: label };
        });
        answers[step.id] = kept.concat(existing ? existing.filter(r => r._extra) : []);   // rows the client added by hand stay
      } else if (!existing) {
        answers[step.id] = Array.from({ length: step.minRows || 1 }, () => ({}));
      }
    }

    /* ---------------------------------------------------------------------
       Validation
       --------------------------------------------------------------------- */
    function isValid(step) {
      if (isSkipped(step)) return true;
      const val = answers[step.id];
      switch (step.type) {
        case "welcome":
        case "end":
          return true;
        case "repeater": {
          const rows = val || [];
          return rows.every(row => isRepeaterRowValid(step, row));
        }
        case "text":
        case "textarea":
          if (step.mask) {
            const digitCount = digitsOnly(val).length;
            const needed = maskDigitCount(step.mask);
            return step.required ? digitCount === needed : (digitCount === 0 || digitCount === needed);
          }
          {
            const trimmed = (val || "").trim();
            if (trimmed.length === 0) return !step.required;
            if (step.minWords) return trimmed.split(/\s+/).filter(Boolean).length >= step.minWords;
            return true;
          }
        case "email":
          if (!val || !val.trim()) return !step.required;
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
        case "tel":
          if (step.mask) {
            const digitCount = digitsOnly(val).length;
            const needed = maskDigitCount(step.mask);
            return step.required ? digitCount === needed : (digitCount === 0 || digitCount === needed);
          }
          if (!val || !val.trim()) return !step.required;
          return val.replace(/\D/g, "").length >= 7;
        case "select":
          return step.required ? !!val : true;
        case "multiselect":
          return step.required ? !!(val && val.length > 0) : true;
        case "address": {
          const a = val || {};
          return !!(a.street && a.city && a.state && a.zip);
        }
        case "file":
          return step.required ? !!(val && val.length > 0) : true;
        case "consent": {
          const c = val || {};
          return !!c.agreed;
        }
        case "checklist-detail":
          return step.required ? !!(val && val.selected && val.selected.length > 0) : true;
        case "list": {
          const items = val || [];
          const min = step.minItems || 1;
          for (let i = 0; i < min; i++) if (!String(items[i] || "").trim()) return false;
          return true;
        }
        case "rows": {
          const rows = Array.isArray(val) ? val : [];
          const cols = step.columns;
          const touched = r => cols.some(c => String(r[c.key] || "").trim());
          if (rows.filter(touched).length < Math.max(step.minRows || 1, 1)) return false;
          // every row someone started has to be finished; untouched extras are ignored
          return rows.every(r => !touched(r) || cols.every(c => c.optional || String(r[c.key] || "").trim()));
        }
        case "cards": {
          const v = val || {};
          const opt = step.options.find(o => o.id === v.choice);
          if (!opt) return false;
          return opt.other ? !!String(v.other || "").trim() : true;
        }
        case "colors": {
          const v = val || {};
          return step.slots.every(s => !s.required || !!normHex(v[s.id]));
        }
        case "radius-map": {
          const v = val || {};
          return /^\d{5}$/.test(v.zip || "") && !!v.miles && !v.invalid;
        }
        default:
          return true;
      }
    }

    function isRepeaterRowValid(step, row) {
      const fields = step.fields || [];
      for (const f of fields) {
        const v = (row[f.key] || "").trim();
        if (!v) continue; // an empty field within a started row is fine
        if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return false;
        if (f.minWords && v.split(/\s+/).filter(Boolean).length < f.minWords) return false;
        if (f.mask && digitsOnly(v).length !== maskDigitCount(f.mask)) return false;
      }
      return true;
    }

    /* ---------------------------------------------------------------------
       Rendering
       --------------------------------------------------------------------- */
    function renderTabs(step) {
      if (!isQuestion(step)) return "";
      const total = visibleQuestions().length;
      const qNum = questionNumber(step);
      let html = '<div class="tabs" role="progressbar" aria-valuemin="1" aria-valuemax="' + total + '" aria-valuenow="' + qNum + '">';
      for (let i = 1; i <= total; i++) {
        const frac = total > 1 ? (i - 1) / (total - 1) : 0;
        const color = mixHex("#0F75BC", "#47B7E8", frac);
        if (i < qNum) {
          html += '<div class="tab done" style="background:' + color + '"></div>';
        } else if (i === qNum) {
          html += '<div class="tab current" style="background:' + color + '"></div>';
        } else {
          html += '<div class="tab"></div>';
        }
      }
      html += "</div>";
      return html;
    }

    function renderContext(text) {
      return '<details class="context"><summary>Why we ask</summary><p>' + escapeHtml(text) + "</p></details>";
    }

    function renderSkippedNote() {
      return '<div class="answer-area skipped-note"><p>You skipped this one. We\'ll follow up with you for it later.</p>' +
        '<button type="button" class="btn-add-row" id="unskipBtn">Answer it now</button></div>';
    }

    function renderAnswerArea(step) {
      const type = step.type;

      if (type === "text" || type === "email" || type === "tel") {
        const val = answers[step.id] || "";
        const maskAttrs = step.mask ? ' inputmode="numeric" maxlength="' + step.mask.length + '"' : "";
        return '<div class="answer-area"><input class="text-input" type="' + type + '" id="fieldInput" ' +
          'placeholder="' + escapeAttr(step.placeholder || "") + '" value="' + escapeAttr(val) + '" autocomplete="on"' + maskAttrs + '></div>';
      }

      if (type === "textarea") {
        const val = answers[step.id] || "";
        return '<div class="answer-area"><textarea class="text-input" id="fieldInput" placeholder="' +
          escapeAttr(step.placeholder || "") + '" rows="4">' + escapeHtml(val) + "</textarea></div>";
      }

      if (type === "select") {
        const val = answers[step.id];
        let html = '<div class="answer-area options" role="listbox">';
        step.options.forEach(opt => {
          const selected = val === opt;
          html += '<button type="button" class="option ' + (selected ? "selected" : "") + '" data-value="' + escapeAttr(opt) + '" role="option" aria-selected="' + selected + '">' +
            '<span class="marker radio"></span><span>' + escapeHtml(opt) + "</span></button>";
        });
        html += "</div>";
        return html;
      }

      if (type === "multiselect") {
        const val = answers[step.id] || [];
        let html = '<div class="answer-area options" role="listbox" aria-multiselectable="true">';
        step.options.forEach(opt => {
          const selected = val.includes(opt);
          html += '<button type="button" class="option ' + (selected ? "selected" : "") + '" data-value="' + escapeAttr(opt) + '" role="option" aria-selected="' + selected + '">' +
            '<span class="marker checkbox"></span><span>' + escapeHtml(opt) + "</span></button>";
        });
        html += "</div>";
        return html;
      }

      if (type === "address") {
        const a = answers[step.id] || {};
        return '<div class="answer-area address-grid">' +
          '<input class="text-input" data-field="street" placeholder="Street address" value="' + escapeAttr(a.street || "") + '">' +
          '<input class="text-input" data-field="suite" placeholder="Suite / unit (optional)" value="' + escapeAttr(a.suite || "") + '">' +
          '<div class="row3">' +
            '<input class="text-input" data-field="city" placeholder="City" value="' + escapeAttr(a.city || "") + '">' +
            '<input class="text-input" data-field="state" placeholder="State" value="' + escapeAttr(a.state || "") + '">' +
            '<input class="text-input" data-field="zip" placeholder="ZIP code" value="' + escapeAttr(a.zip || "") + '">' +
          "</div></div>";
      }

      if (type === "file") {
        const files = answers[step.id] || [];
        const multiple = step.multiple !== false;
        const accept = step.accept || "image/*";
        const dropText = step.dropText || (multiple ? "Drop images here, or click to browse" : "Drop a file here, or click to browse");
        const rows = files.map((f, i) =>
          '<div class="file-row"><span>' + escapeHtml(f.name) + " (" + formatBytes(f.size) + ')</span>' +
          '<button type="button" data-remove-file="' + i + '" aria-label="Remove ' + escapeAttr(f.name) + '">&times;</button></div>'
        ).join("");
        return '<div class="answer-area">' +
          '<div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="' + escapeAttr(dropText) + '"><div>' + escapeHtml(dropText) + '</div></div>' +
          '<input type="file" id="fileInput" accept="' + escapeAttr(accept) + '"' + (multiple ? " multiple" : "") + ' style="display:none;">' +
          '<div class="file-list" id="fileList">' + rows + "</div>" +
          '<p class="file-error" id="fileError" role="alert">' + escapeHtml(fileError) + "</p>" +
          "</div>";
      }

      if (type === "consent") {
        const c = answers[step.id] || {};
        const box = step.consentHtml ? '<div class="consent-text">' + step.consentHtml + "</div>" : "";
        const labelHtml = step.consentLabel || "I've read this and agree.";
        return '<div class="answer-area">' +
          box +
          '<label class="consent-check"><input type="checkbox" id="consentCheck" ' + (c.agreed ? "checked" : "") + '> <span>' + labelHtml + "</span></label>" +
          "</div>";
      }

      if (type === "checklist-detail") {
        const val = answers[step.id] || { selected: [], notes: "" };
        let html = '<div class="answer-area"><div class="options" role="listbox" aria-multiselectable="true">';
        step.options.forEach(opt => {
          const selected = (val.selected || []).includes(opt);
          html += '<button type="button" class="option ' + (selected ? "selected" : "") + '" data-value="' + escapeAttr(opt) + '" role="option" aria-selected="' + selected + '">' +
            '<span class="marker checkbox"></span><span>' + escapeHtml(opt) + "</span></button>";
        });
        html += "</div>" +
          '<textarea class="text-input" id="notesInput" placeholder="' + escapeAttr(step.notesPlaceholder || "Anything else we should know?") + '" rows="3" style="margin-top:16px;">' +
          escapeHtml(val.notes || "") + "</textarea></div>";
        return html;
      }

      if (type === "repeater") {
        const rows = answers[step.id] || [];
        let html = '<div class="answer-area"><div id="repeaterList">';
        rows.forEach((row, i) => {
          html += renderRepeaterRow(step, row, i);
        });
        html += '</div><button type="button" class="btn-add-row" id="addRowBtn">+ ' + escapeHtml(step.addLabel || "Add another") + "</button></div>";
        return html;
      }

      if (type === "list") {
        const items = answers[step.id];
        const min = step.minItems || 1;
        let html = '<div class="answer-area list-area">';
        items.forEach((val, i) => {
          const ph = (step.placeholders && step.placeholders[i]) || step.placeholder || "";
          html += '<div class="list-row"><span class="bullet" aria-hidden="true">&bull;</span>' +
            '<input class="text-input" type="text" data-list-index="' + i + '" placeholder="' + escapeAttr(ph) + '" value="' + escapeAttr(val) + '" ' +
            'aria-label="' + escapeAttr((step.itemLabel || "Item") + " " + (i + 1)) + '" autocomplete="off">' +
            (i >= min ? '<button type="button" class="btn-remove-row" data-list-remove="' + i + '" aria-label="Remove">&times;</button>' : "") +
            "</div>";
        });
        if (!step.maxItems || items.length < step.maxItems) {
          html += '<button type="button" class="btn-add-row" id="addListBtn">+ ' + escapeHtml(step.addLabel || "Add another") + "</button>";
        }
        return html + "</div>";
      }

      if (type === "rows") {
        const rows = answers[step.id];
        const cols = step.columns;
        const grid = cols.map(c => c.width || "1fr").join(" ");
        const canRemove = step.allowRemove !== false && rows.length > (step.minRows || 1);
        let html = '<div class="answer-area rows-area">' +
          '<div class="rows-head" style="--cols:' + grid + '">' + cols.map(c => "<span>" + escapeHtml(c.label || "") + "</span>").join("") + "<span></span></div>";
        rows.forEach((row, i) => {
          html += '<div class="rows-row" style="--cols:' + grid + '">';
          cols.forEach(c => {
            const input = '<input class="text-input small" type="text" data-row="' + i + '" data-col="' + escapeAttr(c.key) + '" ' +
              'placeholder="' + escapeAttr(c.placeholder || "") + '" value="' + escapeAttr(row[c.key] || "") + '" ' +
              'aria-label="' + escapeAttr((c.label || c.key) + " " + (i + 1)) + '" autocomplete="off">';
            html += c.prefix ? '<span class="input-prefix"><span>' + escapeHtml(c.prefix) + "</span>" + input + "</span>" : input;
          });
          html += canRemove ? '<button type="button" class="btn-remove-row" data-rows-remove="' + i + '" aria-label="Remove row">&times;</button>' : "<span></span>";
          html += "</div>";
        });
        if (step.allowAdd) html += '<button type="button" class="btn-add-row" id="addRowsBtn">+ ' + escapeHtml(step.addLabel || "Add another") + "</button>";
        return html + "</div>";
      }

      if (type === "cards") {
        const cur = answers[step.id] || {};
        let html = '<div class="answer-area cards-grid cols-' + (step.columns || 3) + (step.shape ? " shape-" + step.shape : "") + '" role="radiogroup">';
        step.options.forEach(opt => {
          const sel = cur.choice === opt.id;
          const text = '<span class="card-text"><span class="card-title">' + escapeHtml(opt.title) + "</span>" +
            (opt.desc ? '<span class="card-desc">' + escapeHtml(opt.desc) + "</span>" : "") + "</span>";
          if (opt.other) {
            // "Something else" is a slim one-line row, and a one-line box opens right under it
            html += '<div class="card-wrap card-wrap-other"><button type="button" class="card-opt card-opt-other' + (sel ? " selected" : "") + '" data-card="' + escapeAttr(opt.id) + '" role="radio" aria-checked="' + sel + '">' +
              '<span class="other-mark" aria-hidden="true"></span>' + text + "</button>" +
              '<div class="card-other"' + (sel ? "" : " hidden") + '><input class="text-input" id="cardOther" type="text" maxlength="300" autocomplete="off" placeholder="' +
              escapeAttr(opt.placeholder || "Tell us what you have in mind") + '" value="' + escapeAttr(cur.other || "") + '"></div></div>';
          } else {
            html += '<div class="card-wrap"><button type="button" class="card-opt' + (sel ? " selected" : "") + '" data-card="' + escapeAttr(opt.id) + '" role="radio" aria-checked="' + sel + '">' +
              (opt.preview ? '<span class="card-preview">' + opt.preview + "</span>" : "") + text + "</button>" +
              (opt.demoUrl ? '<a class="card-link" href="' + escapeAttr(opt.demoUrl) + '" target="_blank" rel="noopener">View demo &rarr;</a>' : "") +
              "</div>";
          }
        });
        return html + "</div>";
      }

      if (type === "colors") {
        const v = answers[step.id];
        const hasLogo = !!(step.logoStepId && (answers[step.logoStepId] || []).length);
        let html = '<div class="answer-area colors-area"><div class="color-slots">';
        step.slots.forEach(s => {
          const hex = normHex(v[s.id]) || "";
          html += '<div class="color-slot">' +
            '<button type="button" class="slot-main" data-slot="' + escapeAttr(s.id) + '" aria-label="' + escapeAttr(s.label) + ' color">' +
              '<span class="slot-swatch"' + (hex ? ' style="background:' + hex + '"' : "") + "></span>" +
              '<span class="slot-meta"><span class="slot-label">' + escapeHtml(s.label) + (s.required ? "" : ' <span class="slot-opt">optional</span>') + "</span>" +
              '<span class="slot-hex">' + (hex || "Pick a color") + "</span></span></button>" +
            (s.required ? "" : '<button type="button" class="slot-clear" data-clear="' + escapeAttr(s.id) + '" aria-label="Clear ' + escapeAttr(s.label) + '"' + (hex ? "" : " hidden") + ">&times;</button>") +
            "</div>";
        });
        html += "</div>" +
          '<div class="scale-area">' +
            '<div class="scale-box" id="scaleBox" tabindex="0" role="application" aria-label="Color scale. Drag, or use the arrow keys, to choose a shade."><div class="scale-handle" id="scaleHandle" hidden></div></div>' +
            '<div class="scale-row"><span class="scale-preview" id="scalePreview"></span>' +
              '<input type="range" class="hue-range" id="hueRange" min="0" max="360" step="1" value="210" aria-label="Color hue"></div>' +
          "</div>" +
          '<div class="hex-field"><label class="cap" for="hexInput">Or type a color code</label>' +
            '<input class="text-input small hex-input" id="hexInput" type="text" maxlength="7" placeholder="#0F75BC" autocomplete="off" spellcheck="false"></div>' +
          '<div class="quick-colors"><p class="cap">Quick colors</p><div class="palette" role="group" aria-label="Quick colors">' +
            PALETTE.map(h => '<button type="button" class="pal-swatch" data-hex="' + h + '" style="background:' + h + '" aria-label="' + h + '"></button>').join("") +
          "</div></div>";
        if (hasLogo) html += '<div class="logo-pick" id="logoPick"><div class="logo-frame"></div><p class="logo-hint">Or tap a spot on your logo to use its color.</p></div>';
        return html + "</div>";
      }

      if (type === "radius-map") {
        const v = answers[step.id];
        return '<div class="answer-area radius-area">' +
          '<div class="radius-controls">' +
            '<label class="radius-field"><span class="cap">ZIP code</span>' +
              '<input class="text-input" id="zipInput" type="text" inputmode="numeric" maxlength="5" autocomplete="postal-code" placeholder="75201" value="' + escapeAttr(v.zip || "") + '"></label>' +
            '<label class="radius-field radius-grow"><span class="cap">Radius: <span id="milesOut">' + v.miles + ' miles</span></span>' +
              '<input type="range" id="milesInput" min="' + (step.minMiles || 5) + '" max="' + (step.maxMiles || 100) + '" step="' + (step.stepMiles || 5) + '" value="' + v.miles + '"></label>' +
          "</div>" +
          '<div class="map-box"><div class="map-canvas" id="mapCanvas" role="img" aria-label="Map of your service area"></div>' +
            '<p class="map-note" id="mapNote">Enter your ZIP code to see your service area.</p></div>' +
          '<p class="place-out" id="placeOut"></p></div>';
      }

      return "";
    }

    function renderRepeaterRow(step, row, i) {
      row = row || {};
      const fields = step.fields || [
        { key: "name", placeholder: "Name", type: "text" },
        { key: "email", placeholder: "Email", type: "email" },
        { key: "role", placeholder: "Role", type: "text" }
      ];
      let inputs = fields.map(f => {
        const maskAttrs = f.mask ? ' inputmode="numeric" maxlength="' + f.mask.length + '"' : "";
        const maskData = f.mask ? ' data-mask="' + escapeAttr(f.mask) + '"' : "";
        return '<input class="text-input small" type="' + (f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text") + '" data-row="' + i + '" data-field="' + f.key + '" data-type="' + (f.type || "text") + '"' + maskData + ' placeholder="' + escapeAttr(f.placeholder) + '" value="' + escapeAttr(row[f.key] || "") + '"' + maskAttrs + '>';
      }).join("");
      return '<div class="repeater-row" data-index="' + i + '">' + inputs +
        '<button type="button" class="btn-remove-row" data-remove-row="' + i + '" aria-label="Remove person">&times;</button></div>';
    }

    function destroyMap() {
      if (activeMap) { try { activeMap.remove(); } catch (e) { /* already gone */ } activeMap = null; }
    }

    function renderStage() {
      destroyMap();
      const step = ALL[currentIndex];
      let inner = "";

      if (step.type === "welcome") {
        inner =
          '<div class="stage welcome">' +
            (CONFIG.partLabel ? '<div class="part-badge">' + escapeHtml(CONFIG.partLabel) + "</div>" : "") +
            '<h1 class="question big">' + escapeHtml(step.title) + "</h1>" +
            '<p class="subtitle">' + escapeHtml(step.subtitle || "") + "</p>" +
            '<button class="btn-primary" id="startBtn">' + escapeHtml(step.cta || "Start") + " &rarr;</button>" +
          "</div>";
      } else if (step.type === "end") {
        inner = renderEndStage();
      } else {
        prepareAnswer(step);
        const skipped = isSkipped(step);
        const valid = isValid(step);
        const enterHint = ["text", "email", "tel"].includes(step.type);
        inner =
          '<div class="stage">' +
            renderTabs(step) +
            '<div class="eyebrow">' + escapeHtml(CONFIG.partLabel || "") + " &middot; Question " +
              String(questionNumber(step)).padStart(2, "0") + " / " + String(visibleQuestions().length).padStart(2, "0") + "</div>" +
            '<h1 class="question">' + escapeHtml(step.question) + "</h1>" +
            (step.subtitle ? '<p class="subtitle">' + escapeHtml(step.subtitle) + "</p>" : "") +
            (step.context ? renderContext(step.context) : "") +
            (skipped ? renderSkippedNote() : renderAnswerArea(step)) +
            '<div class="nav-row">' +
              '<button class="btn-back" id="backBtn" ' + (currentIndex === 0 ? "disabled" : "") + ">&larr; Back</button>" +
              (enterHint ? '<span class="hint">press Enter &crarr;</span>' : "<span></span>") +
              '<button class="btn-primary" id="continueBtn" ' + (valid ? "" : "disabled") + ">Continue &rarr;</button>" +
            "</div>" +
            (step.skippable && !skipped ? '<div class="skip-row"><button type="button" class="btn-skip" id="skipBtn">' + escapeHtml(step.skipLabel || "Skip for now") + "</button></div>" : "") +
          "</div>";
      }

      cardEl.innerHTML = inner;
      attachStageHandlers(step);
      if (pendingFocus) {
        const el = document.querySelector(pendingFocus);
        if (el && el.focus) el.focus();
        pendingFocus = null;
      }
      if (liveRegion) {
        liveRegion.textContent = !isQuestion(step) ? "" : "Question " + questionNumber(step) + " of " + visibleQuestions().length;
      }
    }

    function renderEndStage() {
      if (submitState === "submitting") {
        return '<div class="stage end"><div class="spinner-row"><span class="dot"></span><span class="dot"></span><span class="dot"></span>&nbsp; filing your details</div></div>';
      }
      if (submitState === "error") {
        return '<div class="stage end" style="text-align:left;">' +
          '<h1 class="question">One more try.</h1>' +
          "<p class=\"subtitle\">We couldn't file this automatically \u2014 nothing was lost.</p>" +
          '<div class="error-box"><p>Your answers are still here. You can retry, or reach us directly.</p>' +
            '<div class="error-actions">' +
              '<button class="btn-primary" id="retryBtn">Try again</button>' +
              '<a class="link-fallback" href="mailto:' + escapeAttr(CONFIG.fallbackEmail || "") + '">Email us instead &rarr;</a>' +
            "</div></div>" +
        "</div>";
      }
      const step = ALL[currentIndex];
      return '<div class="stage end">' +
        '<div class="completion-badge"><svg viewBox="0 0 24 24" fill="none"><path d="M4 12.5L9.5 18L20 6" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
        '<h1 class="question">' + escapeHtml(step.title) + "</h1>" +
        '<p class="subtitle" style="margin-left:auto;margin-right:auto;">' + escapeHtml(step.subtitle || "") + "</p>" +
      "</div>";
    }

    /* ---------------------------------------------------------------------
       Event handling
       --------------------------------------------------------------------- */
    // Re-checks the Continue button. Safe to call from async work: it does
    // nothing if the client has already moved to a different step.
    function refreshContinue(step) {
      if (ALL[currentIndex] !== step) return;
      const btn = document.getElementById("continueBtn");
      if (btn) btn.disabled = !isValid(step);
    }

    function attachStageHandlers(step) {
      const startBtn = document.getElementById("startBtn");
      if (startBtn) startBtn.addEventListener("click", () => goTo(nextIndex(currentIndex), "forward"));

      const backBtn = document.getElementById("backBtn");
      if (backBtn) backBtn.addEventListener("click", () => { if (currentIndex > 0) goTo(prevIndex(currentIndex), "back"); });

      const continueBtn = document.getElementById("continueBtn");
      if (continueBtn) continueBtn.addEventListener("click", () => tryAdvance(step));

      const retryBtn = document.getElementById("retryBtn");
      if (retryBtn) retryBtn.addEventListener("click", () => { submitState = "submitting"; renderStage(); submitForm(); });

      const skipBtn = document.getElementById("skipBtn");
      if (skipBtn) skipBtn.addEventListener("click", () => {
        answers[step.id] = { skipped: true };
        goTo(nextIndex(currentIndex), "forward");
      });
      const unskipBtn = document.getElementById("unskipBtn");
      if (unskipBtn) unskipBtn.addEventListener("click", () => { delete answers[step.id]; renderStage(); });
      if (isSkipped(step)) return;

      const fieldInput = document.getElementById("fieldInput");
      if (fieldInput) {
        fieldInput.focus();
        if (fieldInput.value) {
          // browsers refuse to place the cursor in email inputs, and that error must not stop the handlers below
          try { fieldInput.setSelectionRange(fieldInput.value.length, fieldInput.value.length); } catch (e) { /* not supported for this input type */ }
        }
        fieldInput.addEventListener("input", e => {
          if (step.mask) {
            const raw = digitsOnly(e.target.value).slice(0, maskDigitCount(step.mask));
            const formatted = applyMask(step.mask, raw);
            e.target.value = formatted;
            e.target.setSelectionRange(formatted.length, formatted.length);
            answers[step.id] = formatted;
          } else {
            answers[step.id] = e.target.value;
          }
          refreshContinue(step);
        });
        fieldInput.addEventListener("keydown", e => {
          if (e.key === "Enter") {
            if (step.type === "textarea" && !(e.metaKey || e.ctrlKey)) return;
            e.preventDefault();
            tryAdvance(step);
          }
        });
      }

      document.querySelectorAll(".option").forEach(btn => {
        btn.addEventListener("click", () => {
          const value = btn.getAttribute("data-value");
          if (step.type === "select") {
            answers[step.id] = value;
            renderStage();
            setTimeout(() => goTo(nextIndex(currentIndex), "forward"), 300);
          } else if (step.type === "multiselect") {
            const arr = answers[step.id] ? answers[step.id].slice() : [];
            const i = arr.indexOf(value);
            if (i === -1) arr.push(value); else arr.splice(i, 1);
            answers[step.id] = arr;
            renderStage();
          } else if (step.type === "checklist-detail") {
            const current = answers[step.id] || { selected: [], notes: "" };
            const arr = current.selected.slice();
            const i = arr.indexOf(value);
            if (i === -1) arr.push(value); else arr.splice(i, 1);
            answers[step.id] = { selected: arr, notes: current.notes };
            renderStage();
          }
        });
      });

      // address
      document.querySelectorAll(".address-grid [data-field]").forEach(input => {
        input.addEventListener("input", e => {
          const a = answers[step.id] ? Object.assign({}, answers[step.id]) : {};
          a[e.target.getAttribute("data-field")] = e.target.value;
          answers[step.id] = a;
          refreshContinue(step);
        });
      });

      // file upload
      const dropzone = document.getElementById("dropzone");
      const fileInput = document.getElementById("fileInput");
      if (dropzone && fileInput) {
        dropzone.addEventListener("click", () => fileInput.click());
        dropzone.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
        dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag-over"); });
        dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
        dropzone.addEventListener("drop", e => {
          e.preventDefault(); dropzone.classList.remove("drag-over");
          addFiles(step, e.dataTransfer.files);
        });
        fileInput.addEventListener("change", e => { addFiles(step, e.target.files); fileInput.value = ""; });
      }
      document.querySelectorAll("[data-remove-file]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-remove-file"), 10);
          const arr = (answers[step.id] || []).slice();
          arr.splice(idx, 1);
          answers[step.id] = arr;
          fileError = "";
          renderStage();
        });
      });

      // consent
      const consentCheck = document.getElementById("consentCheck");
      if (consentCheck) {
        consentCheck.addEventListener("change", () => {
          answers[step.id] = {
            agreed: consentCheck.checked,
            signed_at: answers[step.id] && answers[step.id].signed_at ? answers[step.id].signed_at : null
          };
          refreshContinue(step);
        });
      }

      // checklist-detail notes
      const notesInput = document.getElementById("notesInput");
      if (notesInput) {
        notesInput.addEventListener("input", e => {
          const current = answers[step.id] || { selected: [], notes: "" };
          answers[step.id] = { selected: current.selected, notes: e.target.value };
        });
      }

      // repeater
      const addRowBtn = document.getElementById("addRowBtn");
      if (addRowBtn) {
        addRowBtn.addEventListener("click", () => {
          const arr = (answers[step.id] || []).slice();
          arr.push({});
          answers[step.id] = arr;
          renderStage();
        });
      }
      document.querySelectorAll("[data-remove-row]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.getAttribute("data-remove-row"), 10);
          const arr = (answers[step.id] || []).slice();
          arr.splice(idx, 1);
          answers[step.id] = arr;
          renderStage();
        });
      });
      document.querySelectorAll(".repeater-row [data-field]").forEach(input => {
        input.addEventListener("input", e => {
          const rowIdx = parseInt(e.target.getAttribute("data-row"), 10);
          const field = e.target.getAttribute("data-field");
          const fieldType = e.target.getAttribute("data-type");
          const mask = e.target.getAttribute("data-mask");
          if (mask) {
            const raw = digitsOnly(e.target.value).slice(0, maskDigitCount(mask));
            const formatted = applyMask(mask, raw);
            e.target.value = formatted;
            e.target.setSelectionRange(formatted.length, formatted.length);
          } else if (fieldType === "tel") {
            const digits = digitsOnly(e.target.value);
            e.target.value = digits;
            e.target.setSelectionRange(digits.length, digits.length);
          }
          const arr = (answers[step.id] || []).slice();
          arr[rowIdx] = Object.assign({}, arr[rowIdx], { [field]: e.target.value });
          answers[step.id] = arr;
          refreshContinue(step);
        });
      });

      if (step.type === "list") bindList(step);
      if (step.type === "rows") bindRows(step);
      if (step.type === "cards") bindCards(step);
      if (step.type === "colors") bindColors(step);
      if (step.type === "radius-map") bindRadiusMap(step);
    }

    // list: bulleted fields. Enter moves to the next field, and from the
    // last field it continues (if everything required is filled in).
    function bindList(step) {
      const items = answers[step.id];
      const inputs = () => Array.from(document.querySelectorAll("[data-list-index]"));
      inputs().forEach(inp => {
        const i = parseInt(inp.dataset.listIndex, 10);
        inp.addEventListener("input", () => { items[i] = inp.value; refreshContinue(step); });
        inp.addEventListener("keydown", e => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const next = inputs()[i + 1];
          if (next) next.focus(); else tryAdvance(step);
        });
      });
      document.querySelectorAll("[data-list-remove]").forEach(btn => btn.addEventListener("click", () => {
        items.splice(parseInt(btn.dataset.listRemove, 10), 1);
        renderStage();
      }));
      const add = document.getElementById("addListBtn");
      if (add) add.addEventListener("click", () => {
        items.push("");
        pendingFocus = '[data-list-index="' + (items.length - 1) + '"]';
        renderStage();
      });
      const first = inputs().find(el => !el.value) || inputs()[0];
      if (first) first.focus();
    }

    // rows: price lists and tiers
    function bindRows(step) {
      const rows = answers[step.id];
      const inputs = () => Array.from(document.querySelectorAll("[data-row]"));
      inputs().forEach(inp => {
        const r = parseInt(inp.dataset.row, 10);
        const key = inp.dataset.col;
        const col = step.columns.find(c => c.key === key);
        inp.addEventListener("input", () => {
          let v = inp.value;
          // clients often type the "$" themselves; it's already shown beside the box
          if (col && col.prefix && v.trim().startsWith(col.prefix)) { v = v.trim().slice(col.prefix.length).trimStart(); inp.value = v; }
          rows[r][key] = v;
          refreshContinue(step);
        });
        inp.addEventListener("keydown", e => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const all = inputs();
          const next = all[all.indexOf(inp) + 1];
          if (next) next.focus(); else tryAdvance(step);
        });
      });
      document.querySelectorAll("[data-rows-remove]").forEach(btn => btn.addEventListener("click", () => {
        const gone = rows.splice(parseInt(btn.dataset.rowsRemove, 10), 1)[0];
        const label = String((gone && gone[step.labelKey || step.columns[0].key]) || "").trim();
        if (step.prefillFrom && label && !gone._extra) (rowRemoved[step.id] = rowRemoved[step.id] || []).push(label);
        renderStage();
      }));
      const add = document.getElementById("addRowsBtn");
      if (add) add.addEventListener("click", () => {
        rows.push({ _extra: true });
        pendingFocus = '[data-row="' + (rows.length - 1) + '"]';
        renderStage();
      });
      const first = inputs().find(el => !el.value) || inputs()[0];
      if (first) first.focus();
    }

    // cards: pick one preview card. Updated in place so the page doesn't jump.
    function bindCards(step) {
      const cur = answers[step.id];
      const otherEl = document.getElementById("cardOther");
      const otherWrap = otherEl ? otherEl.closest(".card-other") : null;
      const sync = () => {
        document.querySelectorAll("[data-card]").forEach(b => {
          const on = b.dataset.card === cur.choice;
          b.classList.toggle("selected", on);
          b.setAttribute("aria-checked", on ? "true" : "false");
        });
        const opt = step.options.find(o => o.id === cur.choice);
        if (otherWrap) otherWrap.hidden = !(opt && opt.other);
        refreshContinue(step);
      };
      document.querySelectorAll("[data-card]").forEach(b => b.addEventListener("click", () => {
        cur.choice = b.dataset.card;
        sync();
        const opt = step.options.find(o => o.id === cur.choice);
        if (opt && opt.other && otherEl) otherEl.focus();
      }));
      if (otherEl) {
        otherEl.addEventListener("input", () => { cur.other = otherEl.value; refreshContinue(step); });
        otherEl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); tryAdvance(step); } });
      }
    }

    // colors: three slots, filled from the color scale, a code box, the quick
    // colors, or by tapping the client's logo
    function bindColors(step) {
      const val = answers[step.id];
      const slots = step.slots;
      const hexEl = document.getElementById("hexInput");
      const box = document.getElementById("scaleBox");
      const handle = document.getElementById("scaleHandle");
      const hueEl = document.getElementById("hueRange");
      const previewEl = document.getElementById("scalePreview");
      let active = (slots.find(s => !normHex(val[s.id])) || slots[0]).id;
      let hsv = { h: 210, s: 0.85, v: 0.85 };   // where the scale is sitting; follows the active slot's color

      function paintSlots() {
        slots.forEach(s => {
          const main = document.querySelector('[data-slot="' + s.id + '"]');
          if (!main) return;
          const hex = normHex(val[s.id]) || "";
          main.classList.toggle("active", s.id === active);
          main.querySelector(".slot-swatch").style.background = hex;
          main.querySelector(".slot-hex").textContent = hex || "Pick a color";
          const clr = document.querySelector('[data-clear="' + s.id + '"]');
          if (clr) clr.hidden = !hex;
        });
      }
      function showHue() {
        box.style.backgroundColor = "hsl(" + Math.round(hsv.h) + ",100%,50%)";
        hueEl.value = String(Math.round(hsv.h));
      }
      function placeHandle() {
        handle.style.left = (hsv.s * 100) + "%";
        handle.style.top = ((1 - hsv.v) * 100) + "%";
      }
      // moves the scale to the active slot's color (and hides the handle if that slot is empty)
      function syncScale() {
        const hex = normHex(val[active]);
        if (hex) { const c = hexToHsv(hex); if (c.h !== null) hsv.h = c.h; hsv.s = c.s; hsv.v = c.v; }
        showHue();
        handle.hidden = !hex;
        if (hex) placeHandle();
        previewEl.style.background = hex || "";
      }
      function refresh() { paintSlots(); syncScale(); refreshContinue(step); }

      // palette, code box and logo picks fill the active slot, then move to the next empty one
      function setColor(raw) {
        const hex = normHex(raw);
        if (!hex) return false;
        val[active] = hex;
        const next = slots.find(s => s.required && !normHex(val[s.id])) || slots.find(s => !normHex(val[s.id]));
        if (next) active = next.id;
        if (hexEl) { hexEl.value = ""; hexEl.classList.remove("bad"); }
        refresh();
        return true;
      }
      // the color scale edits the active slot live and stays on it
      function applyScale(h, s, v) {
        hsv = { h: h, s: s, v: v };
        val[active] = hsvToHex(h, s, v);
        showHue(); placeHandle();
        handle.hidden = false;
        previewEl.style.background = val[active];
        paintSlots();
        refreshContinue(step);
      }

      document.querySelectorAll("[data-slot]").forEach(b => b.addEventListener("click", () => { active = b.dataset.slot; refresh(); }));
      document.querySelectorAll("[data-clear]").forEach(b => b.addEventListener("click", () => { delete val[b.dataset.clear]; active = b.dataset.clear; refresh(); }));
      document.querySelectorAll("[data-hex]").forEach(b => b.addEventListener("click", () => setColor(b.dataset.hex)));

      // the square: left to right is how vivid, bottom to top is how bright
      let dragging = false;
      const pick = e => {
        const r = box.getBoundingClientRect();
        const s = Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1)));
        const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1)));
        applyScale(hsv.h, s, v);
      };
      box.addEventListener("pointerdown", e => {
        dragging = true;
        try { box.setPointerCapture(e.pointerId); } catch (err) { /* not needed everywhere */ }
        e.preventDefault();
        box.focus();
        pick(e);
      });
      box.addEventListener("pointermove", e => { if (dragging) pick(e); });
      const stopDrag = () => { dragging = false; };
      box.addEventListener("pointerup", stopDrag);
      box.addEventListener("pointercancel", stopDrag);
      box.addEventListener("keydown", e => {
        const amount = e.shiftKey ? 0.1 : 0.02;
        let s = hsv.s, v = hsv.v;
        if (e.key === "ArrowLeft") s -= amount;
        else if (e.key === "ArrowRight") s += amount;
        else if (e.key === "ArrowUp") v += amount;
        else if (e.key === "ArrowDown") v -= amount;
        else return;
        e.preventDefault();
        applyScale(hsv.h, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, v)));
      });
      // the rainbow slider changes the hue and keeps the same vividness and brightness
      hueEl.addEventListener("input", () => applyScale(parseInt(hueEl.value, 10), hsv.s, hsv.v));

      if (hexEl) {
        hexEl.addEventListener("input", () => {
          hexEl.classList.remove("bad");
          if (/^#?[0-9a-fA-F]{6}$/.test(hexEl.value.trim())) setColor(hexEl.value);
        });
        const commit = () => { if (hexEl.value.trim() && !setColor(hexEl.value)) hexEl.classList.add("bad"); };
        hexEl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
        hexEl.addEventListener("blur", commit);
      }

      drawLogoPicker(step, setColor);
      refresh();
    }

    // Shows the uploaded logo, centered, and lets the client tap it to grab a
    // color. A ring marks the spot they tapped. Works in every browser (it
    // reads the pixels from a canvas).
    function drawLogoPicker(step, setColor) {
      const box = document.getElementById("logoPick");
      if (!box) return;
      const frame = box.querySelector(".logo-frame");
      const hint = box.querySelector(".logo-hint");
      const file = (answers[step.logoStepId] || [])[0];
      const base = "Or tap a spot on your logo to use its color.";
      const fallback = "use the quick colors or the color scale above.";
      if (!file) { box.hidden = true; return; }
      const isImage = /^image\//.test(file.type || "") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || "");
      if (!isImage) { hint.textContent = "We can't preview that kind of file here, so " + fallback; return; }
      let url;
      try { url = URL.createObjectURL(file); } catch (e) { hint.textContent = "We couldn't open that file, so " + fallback; return; }
      const img = new Image();
      img.onload = () => {
        try {
          const nw = img.naturalWidth || 300, nh = img.naturalHeight || 150;
          const scale = Math.min(320 / nw, 180 / nh);
          const cw = Math.max(1, Math.round(nw * scale)), ch = Math.max(1, Math.round(nh * scale));
          const show = document.createElement("canvas");
          show.width = cw; show.height = ch; show.className = "logo-canvas";
          show.setAttribute("aria-label", "Your logo. Tap a spot in it to use that color.");
          const off = document.createElement("canvas");   // same picture without the light backdrop, used for reading colors
          off.width = cw; off.height = ch;
          const sctx = show.getContext("2d");
          const octx = off.getContext("2d", { willReadFrequently: true });
          const redraw = (mx, my) => {
            sctx.fillStyle = "#F4F5F7"; sctx.fillRect(0, 0, cw, ch);
            sctx.drawImage(img, 0, 0, cw, ch);
            if (mx == null) return;
            try {   // a white ring with a dark edge, so it shows on any color
              sctx.beginPath(); sctx.arc(mx, my, 11, 0, Math.PI * 2); sctx.lineWidth = 5; sctx.strokeStyle = "#0B1220"; sctx.stroke();
              sctx.beginPath(); sctx.arc(mx, my, 11, 0, Math.PI * 2); sctx.lineWidth = 3; sctx.strokeStyle = "#FFFFFF"; sctx.stroke();
            } catch (e) { /* the ring is only decoration */ }
          };
          redraw();
          octx.drawImage(img, 0, 0, cw, ch);
          URL.revokeObjectURL(url);
          frame.appendChild(show);
          show.addEventListener("click", e => {
            try {
              const r = show.getBoundingClientRect();
              const x = Math.round((e.clientX - r.left) * cw / (r.width || cw));
              const y = Math.round((e.clientY - r.top) * ch / (r.height || ch));
              const x0 = Math.max(0, x - 2), y0 = Math.max(0, y - 2);
              const d = octx.getImageData(x0, y0, Math.min(cw - x0, 5), Math.min(ch - y0, 5)).data;
              let R = 0, G = 0, B = 0, n = 0;     // average a small patch so one noisy pixel doesn't win
              for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
              if (!n) { hint.textContent = "That spot is see-through. Tap a solid part of the logo."; return; }
              hint.textContent = base;
              redraw(x, y);
              setColor(rgbToHex(R / n, G / n, B / n));
            } catch (err) { hint.textContent = "We couldn't read colors from that file, so " + fallback; }
          });
        } catch (err) { hint.textContent = "We couldn't read colors from that file, so " + fallback; }
      };
      img.onerror = () => { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } hint.textContent = "We couldn't open that image, so " + fallback; };
      img.src = url;
    }

    // radius-map: ZIP + radius on a map. If the ZIP lookup or the map can't
    // load, the ZIP and radius are still saved.
    function bindRadiusMap(step) {
      const a = answers[step.id];
      const zipEl = document.getElementById("zipInput");
      const milesEl = document.getElementById("milesInput");
      const milesOut = document.getElementById("milesOut");
      const noteEl = document.getElementById("mapNote");
      const placeEl = document.getElementById("placeOut");
      const mapEl = document.getElementById("mapCanvas");
      let token = 0, circle = null, dot = null;
      const here = () => ALL[currentIndex] === step;

      function say(msg, kind) { noteEl.textContent = msg || ""; noteEl.className = "map-note" + (kind ? " " + kind : ""); noteEl.hidden = !msg; }
      function clearShapes() { if (circle) { circle.remove(); dot.remove(); circle = dot = null; } }
      function paint() {
        if (!activeMap || a.lat == null || !global.L) return;
        const L = global.L, ll = [a.lat, a.lon];
        if (!circle) {
          circle = L.circle(ll, { radius: 1, color: "#47B7E8", weight: 2, fillColor: "#47B7E8", fillOpacity: 0.18 }).addTo(activeMap);
          dot = L.circleMarker(ll, { radius: 5, color: "#FFFFFF", weight: 2, fillColor: "#0F75BC", fillOpacity: 1 }).addTo(activeMap);
        }
        circle.setLatLng(ll); dot.setLatLng(ll);
        circle.setRadius(a.miles * 1609.344);
        activeMap.fitBounds(circle.getBounds(), { padding: [12, 12] });
      }

      async function lookup(zip) {
        const mine = ++token;
        say("Finding that ZIP code...", "muted");
        try {
          const res = await fetch(ZIP_API + zip);
          if (mine !== token || !here()) return;
          if (res.status === 404) {
            a.invalid = true; a.place = null; a.lat = a.lon = null;
            clearShapes(); placeEl.textContent = "";
            say("We couldn't find that ZIP code. Check it and try again.", "warn");
            refreshContinue(step);
            return;
          }
          if (!res.ok) throw new Error("lookup failed");
          const j = await res.json();
          const p = j.places && j.places[0];
          if (!p) throw new Error("no place");
          if (mine !== token || !here()) return;
          a.invalid = false;
          a.place = p["place name"] + ", " + p["state abbreviation"];
          a.lat = parseFloat(p.latitude); a.lon = parseFloat(p.longitude);
          say("");
          placeEl.textContent = a.place;
          paint();
        } catch (e) {
          if (mine !== token || !here()) return;
          a.invalid = false; a.place = null; a.lat = a.lon = null;
          say("We couldn't load the map right now, but your ZIP code and radius are saved.", "muted");
        }
        refreshContinue(step);
      }

      zipEl.addEventListener("input", () => {
        const z = zipEl.value.replace(/\D/g, "").slice(0, 5);
        zipEl.value = z; a.zip = z; a.invalid = false;
        if (z.length === 5) {
          lookup(z);
        } else {
          token++; a.place = null; a.lat = a.lon = null;
          clearShapes(); placeEl.textContent = "";
          say(z ? "" : "Enter your ZIP code to see your service area.", "muted");
        }
        refreshContinue(step);
      });
      milesEl.addEventListener("input", () => {
        a.miles = parseInt(milesEl.value, 10);
        milesOut.textContent = a.miles + " miles";
        paint();
        refreshContinue(step);
      });

      // draw the map once the library is ready
      loadLeaflet().then(L => {
        if (!here() || !document.body.contains(mapEl)) return;
        activeMap = L.map(mapEl, { scrollWheelZoom: false }).setView([39.5, -98.35], 4);
        L.tileLayer(TILE_URL, { maxZoom: 18, attribution: TILE_ATTR }).addTo(activeMap);
        setTimeout(() => { if (activeMap) { activeMap.invalidateSize(); paint(); } }, 350);
      }).catch(() => { mapEl.classList.add("map-off"); });

      // coming back to this step: show what was already found, or look it up again
      if (a.zip && a.zip.length === 5) {
        if (a.invalid) { say("We couldn't find that ZIP code. Check it and try again.", "warn"); }
        else if (a.lat != null) { placeEl.textContent = a.place || ""; say(""); }
        else { lookup(a.zip); }
      }
      if (!a.zip) zipEl.focus();
    }

    function addFiles(step, fileList) {
      const accept = step.accept || "image/*";
      const maxBytes = (step.maxSizeMB || 0) * 1024 * 1024;
      const multiple = step.multiple !== false;
      const existing = multiple ? (answers[step.id] || []) : [];
      const problems = [];
      const incoming = Array.from(fileList).filter(f => {
        if (!isAcceptedFile(f, accept)) { problems.push(f.name + " isn't a supported file type"); return false; }
        if (maxBytes && f.size > maxBytes) { problems.push(f.name + " is over " + step.maxSizeMB + " MB"); return false; }
        return !existing.some(e => e.name === f.name && e.size === f.size && e.lastModified === f.lastModified);
      });
      answers[step.id] = multiple ? existing.concat(incoming) : (incoming.length ? [incoming[0]] : (answers[step.id] || []));
      fileError = problems.length ? "Couldn't add: " + problems.join("; ") + "." : "";
      renderStage();
    }

    function tryAdvance(step) {
      if (!isValid(step)) return;
      if (step.type === "consent") {
        const c = answers[step.id];
        c.signed_at = new Date().toISOString();
        answers[step.id] = c;
      }
      goTo(nextIndex(currentIndex), "forward");
    }

    function goTo(newIndex, direction) {
      const stageEl = cardEl.querySelector(".stage");
      if (stageEl) stageEl.classList.add(direction === "forward" ? "leaving-forward" : "leaving-back");
      setTimeout(() => {
        currentIndex = newIndex;
        fileError = "";
        renderStage();
        const newStageEl = cardEl.querySelector(".stage");
        if (newStageEl) {
          newStageEl.classList.add(direction === "forward" ? "entering-forward" : "entering-back");
          requestAnimationFrame(() => requestAnimationFrame(() => {
            newStageEl.classList.remove("entering-forward", "entering-back");
          }));
        }
        if (ALL[currentIndex].type === "end") {
          submitState = "submitting";
          renderStage();
          submitForm();
        }
      }, 180);
    }

    /* ---------------------------------------------------------------------
       Submission
       --------------------------------------------------------------------- */
    function buildJsonPayload() {
      const out = {};
      ALL.forEach(step => {
        if (!isQuestion(step) || step.type === "file") return;
        if (!isVisible(step)) { out[step.id] = null; return; }
        let val = answers[step.id];
        if (val && val.skipped === true) { out[step.id] = { skipped: true }; return; }

        if (typeof val === "string") val = val.trim();
        else if (step.type === "repeater") {
          val = (val || []).filter(row => Object.values(row).some(v => v && String(v).trim().length > 0));
        } else if (step.type === "list") {
          val = (val || []).map(s => String(s || "").trim()).filter(Boolean);
        } else if (step.type === "rows") {
          val = (val || [])
            .map(row => { const o = {}; step.columns.forEach(c => { o[c.key] = String(row[c.key] || "").trim(); }); return o; })
            .filter(row => Object.values(row).some(Boolean));
        } else if (step.type === "cards") {
          const opt = step.options.find(o => o.id === (val || {}).choice);
          val = !opt ? null : (opt.other ? { choice: opt.id, label: opt.title, other: String(val.other || "").trim() } : { choice: opt.id, label: opt.title });
        } else if (step.type === "colors") {
          const o = {};
          step.slots.forEach(s => { const h = normHex((val || {})[s.id]); if (h) o[s.id] = h; });
          val = o;
        } else if (step.type === "radius-map") {
          val = { zip: val.zip, miles: val.miles, place: val.place || null, lat: val.lat == null ? null : val.lat, lon: val.lon == null ? null : val.lon };
        }
        out[step.id] = (val === undefined) ? null : val;
      });
      return out;
    }

    async function submitForm() {
      const DEMO = global.location.protocol === "file:";
      const payload = buildJsonPayload();
      const fileSteps = ALL.filter(s => s.type === "file" && isVisible(s));

      try {
        if (DEMO) {
          console.warn("[OnboardingForm] DEMO MODE (opened as a local file) \u2014 nothing was sent. Payload that would have been submitted:", payload, fileSteps.map(s => (answers[s.id] || []).map(f => f.name)));
          await new Promise(r => setTimeout(r, 650));
        } else {
          const fd = new FormData();
          fd.append("data", JSON.stringify(payload));
          fileSteps.forEach(s => {
            (answers[s.id] || []).forEach(f => fd.append(s.id, f, f.name));
          });
          const res = await fetch(CONFIG.apiEndpoint, { method: "POST", body: fd });
          if (!res.ok) throw new Error("Server responded with status " + res.status);
        }
        submitState = "success";
      } catch (err) {
        console.error("[OnboardingForm] Submission failed:", err);
        submitState = "error";
      }
      renderStage();
    }

    renderStage();
  }

  global.OnboardingForm = { init };

})(window);
