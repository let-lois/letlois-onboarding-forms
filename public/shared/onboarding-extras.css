/* ==========================================================================
   LetLois Onboarding — shared form engine, v2
   ==========================================================================
   Used by all three forms (Parts 1, 2 and 3). It handles text, email, tel,
   textarea, select, multiselect, address, file, consent, repeater, welcome
   and end, plus:

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
     checklist-detail
                 tap-to-toggle options (otherLabel adds a "Something else"
                 box, noneLabel adds an exclusive "none of these"), plus a
                 notes box. notesRequired / notesMinChars make the notes
                 mandatory; noneNotesLabel / noneNotesPlaceholder swap the
                 notes question when "none" is picked.
     item-details
                 one titled section per item from an earlier list answer
                 (itemsFrom), each with textareas (fields). Items from
                 extraFromIndex on also get extraFields. {item} inside a
                 label is replaced with the item's name.
     list options: itemDetails:true adds an optional, collapsed "Add details"
                 box under every item (sent as <id>_details, one entry per
                 item). copyFrom:{url,label,businessFrom} adds a button that
                 fills the list from the same business's earlier answers
                 (GET url?business=...). checklist-detail option noNotes:true
                 hides the notes box.
     file        takes accept / multiple / maxSizeMB / dropText, and
                 allowLink:true adds a "paste a link instead" box that also
                 satisfies a required file step. CONFIG.maxTotalMB caps the
                 total size of every upload in the form (in MB; 20480 = 20 GB).

   Big uploads (Part 3): set chunkedUpload:true on the page's config and the
   files are sent ahead of the final submit, in 10 MB pieces, to
   /api/upload/*, with a progress bar, automatic retries and resume-on-retry.
   The final submit is then a small JSON message (the answers plus the list
   of uploaded files). Without chunkedUpload, files go inside the one
   FormData request exactly as before (Part 2's logo upload still does).

   And these step options:

     {{id}} / {{id|fallback}}    inside a question, subtitle or "why we ask"
                                 text becomes that earlier answer ("A, B and
                                 C"), or the fallback if it is empty.

     showIf: { id, equals }      only show this step when an earlier answer
                                 matches. { id, path, equals } looks inside
                                 an object answer (e.g. a cards choice).
     format: "url"               (text steps) checks it is a web address, adds https:// if
                                 it was left off, and sends the cleaned-up link.
     prefillParam: "business"    (text, email, tel steps) fills the answer from the page
                                 address, e.g. .../ads/website/?business=Acme%20Roofing,
                                 so a client can be sent straight to one part.
     skippedNote: "..."          replaces the default message shown after a skip.
     skippable: true             adds a "skip" link. A skipped step is sent
                                 as { skipped: true }.

   Submission contract (same as v1):
     - POSTs a FormData to CONFIG.apiEndpoint
     - field "data": JSON string of every non-file answer, keyed by step id
       (steps that are hidden by showIf are sent as null)
     - each "file" step's uploads go under a field named after the step id
     - expects JSON back: { ok: true, ... } or { ok: false, error }
     - if location.protocol is "file:", runs in DEMO MODE: nothing is sent.
     - save and resume: answers are kept in this browser (localStorage) as
       the client goes, so closing the tab and coming back offers "Continue
       where you left off" or "Start over". Chosen files can't be kept by a
       browser, so those are picked again. A step with noSave:true (such as
       the EIN) is never stored. The saved copy is deleted on submit, on
       "Start over", and after 30 days. Turn it off with saveProgress:false.
     - when the form is shown inside an iframe (the walkthrough site), it tells
       the page around it how the submit is going with
       window.parent.postMessage({ source: "letlois-onboarding", type }, "*"),
       where type is "busy" (uploading or filing), "done" or "error". The
       walkthrough site uses this to stop someone from leaving mid-upload.
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
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  // 60 -> "60 MB", 20480 -> "20 GB"
  function formatMB(mb) {
    if (mb >= 1024) return (mb % 1024 === 0 ? String(mb / 1024) : (mb / 1024).toFixed(1)) + " GB";
    return mb + " MB";
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

  // "drive.google.com/x" -> "https://drive.google.com/x", "" -> "", anything that
  // isn't a web address -> null.
  function normLink(raw) {
    const t = String(raw == null ? "" : raw).trim();
    if (!t) return "";
    if (/^https?:\/\/\S+\.\S+$/i.test(t)) return t;
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return "https://" + t;
    return null;
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
    let listNotice = "";          // message shown under a list's "copy earlier answers" button

    // Lets the page around us (the walkthrough site, when we're in an iframe) know how the submit is going.
    function tellParent(type) {
      try {
        if (global.parent && global.parent !== global) global.parent.postMessage({ source: "letlois-onboarding", type: type }, "*");
      } catch (e) { /* not embedded, nothing to tell */ }
    }

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

    // {{id}} or {{id|fallback}} in a question, subtitle or "why we ask" text becomes
    // that earlier answer, so a question can speak to what the client already told us.
    function fill(text) {
      return String(text == null ? "" : text).replace(/\{\{\s*([\w-]+)\s*(?:\|([^}]*))?\}\}/g, (m, id, fallback) => {
        const v = answers[id];
        const items = (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).map(x => String(x == null ? "" : x).trim()).filter(Boolean);
        if (!items.length) return fallback == null ? "" : fallback.trim();
        return items.length === 1 ? items[0] : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
      });
    }
    const subItem = (text, item) => String(text == null ? "" : text).replace(/\{item\}/g, item);

    // The fields one item-details section asks for. Items past extraFromIndex (the
    // optional extras) also get extraFields.
    function detailFields(step, i) {
      const extraFrom = step.extraFromIndex == null ? Infinity : step.extraFromIndex;
      return (step.fields || []).concat(i >= extraFrom ? (step.extraFields || []) : []);
    }

    // Total size of every file picked in the form (optionally leaving one step out).
    function totalFileBytes(exceptStepId) {
      let sum = 0;
      ALL.forEach(st => {
        if (st.type === "file" && isVisible(st) && st.id !== exceptStepId) (answers[st.id] || []).forEach(f => { sum += f.size || 0; });
      });
      return sum;
    }
    function totalNoteText() {
      const cap = CONFIG.maxTotalMB;
      if (!cap) return "";
      const used = totalFileBytes();
      return used ? formatBytes(used) + " of " + formatMB(cap) + " used across this whole form." : "Upload limit: " + formatMB(cap) + " in total across this whole form.";
    }

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
        if (step.itemDetails) {
          if (!Array.isArray(answers[step.id + "__details"])) answers[step.id + "__details"] = [];
          if (!Array.isArray(answers[step.id + "__open"])) answers[step.id + "__open"] = [];
        }
      } else if (step.type === "rows") {
        syncRows(step);
      } else if (step.type === "colors") {
        if (!answers[step.id] || typeof answers[step.id] !== "object") answers[step.id] = {};
      } else if (step.type === "radius-map") {
        if (!answers[step.id] || typeof answers[step.id] !== "object") answers[step.id] = { zip: "", miles: step.defaultMiles || 25 };
      } else if (step.type === "cards") {
        if (!answers[step.id] || typeof answers[step.id] !== "object") answers[step.id] = {};
      } else if (step.type === "checklist-detail") {
        const cur = answers[step.id];
        answers[step.id] = Object.assign({ selected: [], other: "", notes: "" }, cur && typeof cur === "object" ? cur : {});
      } else if (step.type === "item-details") {
        syncDetails(step);
      }
    }

    // Builds (or rebuilds) the sections of an item-details step from the earlier
    // list. What the client already wrote is kept for any service that is still
    // there, and also when a service was only renamed in place.
    function syncDetails(step) {
      const src = answers[step.itemsFrom];
      const labels = (Array.isArray(src) ? src : []).map(x => String(x || "").trim()).filter(Boolean);
      const old = Array.isArray(answers[step.id]) ? answers[step.id] : [];
      const lc = x => String(x || "").trim().toLowerCase();
      const newLc = labels.map(lc);
      answers[step.id] = labels.map((label, i) => {
        const same = old.find(r => lc(r.item) === lc(label));
        if (same) return Object.assign({}, same, { item: label });
        const atSlot = old[i];
        if (atSlot && !newLc.includes(lc(atSlot.item))) return Object.assign({}, atSlot, { item: label });
        return { item: label };
      });
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
            if (step.format === "url") return normLink(trimmed) !== null;
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
        case "file": {
          const hasFiles = !!(val && val.length > 0);
          if (step.allowLink) {
            const link = normLink(answers[step.id + "__link"]);
            if (link === null) return false;              // something was typed that isn't a web address
            return step.required ? (hasFiles || !!link) : true;
          }
          return step.required ? hasFiles : true;
        }
        case "consent": {
          const c = val || {};
          return !!c.agreed;
        }
        case "checklist-detail": {
          const v = val || {};
          const sel = v.selected || [];
          if (step.required && sel.length === 0) return false;
          if (step.otherLabel && sel.includes(step.otherLabel) && !String(v.other || "").trim()) return false;
          if (!step.noNotes && step.notesRequired && String(v.notes || "").trim().length < (step.notesMinChars || 1)) return false;
          return true;
        }
        case "item-details": {
          if (step.required === false) return true;
          const rows = Array.isArray(val) ? val : [];
          if (!rows.length) return false;
          return rows.every((row, i) => detailFields(step, i).every(f => String(row[f.key] || "").trim().length >= (f.minChars || 1)));
        }
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

    function renderSkippedNote(step) {
      return '<div class="answer-area skipped-note"><p>' + escapeHtml(step.skippedNote || "You skipped this one. We'll follow up with you for it later.") + '</p>' +
        '<button type="button" class="btn-add-row" id="unskipBtn">Answer it now</button></div>';
    }

    function renderAnswerArea(step) {
      const type = step.type;

      if (type === "text" || type === "email" || type === "tel") {
        const val = answers[step.id] || "";
        const maskAttrs = step.mask ? ' inputmode="numeric" maxlength="' + step.mask.length + '"' : "";
        const urlAttrs = step.format === "url" ? ' inputmode="url" autocapitalize="off" spellcheck="false"' : "";
        const urlHint = step.format === "url" ? '<p class="notes-hint" id="urlHint" role="status"></p>' : "";
        return '<div class="answer-area"><input class="text-input" type="' + type + '" id="fieldInput" ' +
          'placeholder="' + escapeAttr(step.placeholder || "") + '" value="' + escapeAttr(val) + '" autocomplete="on"' + maskAttrs + urlAttrs + '>' + urlHint + '</div>';
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
        const linkHtml = step.allowLink
          ? '<div class="file-link"><label class="cap" for="fileLink">' + escapeHtml(step.linkLabel || "Too big to upload? Paste a link instead.") + "</label>" +
            '<input class="text-input small" id="fileLink" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' +
            escapeAttr(step.linkPlaceholder || "Google Drive, Dropbox or WeTransfer link") + '" value="' + escapeAttr(answers[step.id + "__link"] || "") + '">' +
            '<p class="file-error" id="linkError" role="alert"></p></div>'
          : "";
        const totalHtml = CONFIG.maxTotalMB ? '<p class="file-total" id="fileTotal">' + escapeHtml(totalNoteText()) + "</p>" : "";
        return '<div class="answer-area">' +
          '<div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="' + escapeAttr(dropText) + '"><div>' + escapeHtml(dropText) + '</div></div>' +
          '<input type="file" id="fileInput" accept="' + escapeAttr(accept) + '"' + (multiple ? " multiple" : "") + ' style="display:none;">' +
          '<div class="file-list" id="fileList">' + rows + "</div>" +
          '<p class="file-error" id="fileError" role="alert">' + escapeHtml(fileError) + "</p>" +
          totalHtml + linkHtml +
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
        const val = answers[step.id];
        const sel = val.selected || [];
        const noneOn = !!(step.noneLabel && sel.includes(step.noneLabel));
        const chip = (label, extraClass) => {
          const on = sel.includes(label);
          return '<button type="button" class="chip' + (extraClass ? " " + extraClass : "") + (on ? " selected" : "") + '" data-chip="' + escapeAttr(label) + '" aria-pressed="' + on + '">' +
            '<span class="chip-box" aria-hidden="true"></span><span class="chip-text">' + escapeHtml(label) + "</span></button>";
        };
        let html = '<div class="answer-area checklist-area"><div class="chips" role="group" aria-label="' + escapeAttr(fill(step.question)) + '">';
        step.options.forEach(o => { html += chip(o); });
        if (step.otherLabel) html += chip(step.otherLabel);
        if (step.noneLabel) html += chip(step.noneLabel, "chip-wide");
        html += "</div>";
        if (step.otherLabel) {
          html += '<div class="checklist-other"' + (sel.includes(step.otherLabel) ? "" : " hidden") + '><label class="notes-label" for="checklistOther">' +
            escapeHtml(step.otherPrompt || "Which one?") + '</label><input class="text-input" id="checklistOther" type="text" maxlength="120" autocomplete="off" placeholder="' +
            escapeAttr(step.otherPlaceholder || "Type it here") + '" value="' + escapeAttr(val.other || "") + '"></div>';
        }
        if (step.noNotes) return html + "</div>";
        html += '<div class="checklist-notes"><label class="notes-label" id="notesLabel" for="notesInput">' +
          escapeHtml(noneOn && step.noneNotesLabel ? step.noneNotesLabel : (step.notesLabel || "Anything else we should know?")) + "</label>" +
          '<textarea class="text-input" id="notesInput" rows="3" placeholder="' +
          escapeAttr(noneOn && step.noneNotesPlaceholder ? step.noneNotesPlaceholder : (step.notesPlaceholder || "")) + '">' + escapeHtml(val.notes || "") + "</textarea>" +
          '<p class="notes-hint" id="notesHint"></p></div></div>';
        return html;
      }

      if (type === "item-details") {
        const rows = answers[step.id] || [];
        const extraFrom = step.extraFromIndex == null ? Infinity : step.extraFromIndex;
        let html = '<div class="answer-area details-area">';
        rows.forEach((row, i) => {
          html += '<section class="detail-card" aria-labelledby="detail-title-' + i + '">' +
            '<h2 class="detail-title" id="detail-title-' + i + '"><span class="detail-num">' + (i + 1) + "</span><span>" + escapeHtml(row.item) + "</span>" +
            (i >= extraFrom ? '<span class="detail-tag">Extra page</span>' : "") + "</h2>";
          detailFields(step, i).forEach(f => {
            const id = "detail-" + i + "-" + f.key;
            html += '<div class="detail-field"><label class="detail-label" for="' + id + '">' + escapeHtml(subItem(f.label, row.item)) + '<span class="req-tag">Required</span></label>' +
              '<textarea class="text-input detail-input" id="' + id + '" data-detail-row="' + i + '" data-detail-key="' + escapeAttr(f.key) + '" rows="' + (f.rows || 3) + '" placeholder="' +
              escapeAttr(subItem(f.placeholder || "", row.item)) + '">' + escapeHtml(row[f.key] || "") + "</textarea>" +
              '<p class="detail-hint" data-hint-for="' + id + '"></p></div>';
          });
          html += "</section>";
        });
        return html + "</div>";
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
        const det = answers[step.id + "__details"] || [];
        const open = answers[step.id + "__open"] || [];
        let html = '<div class="answer-area list-area">';
        if (step.copyFrom) {
          html += '<div class="list-copy"><button type="button" class="btn-copy-list" id="copyListBtn">' + escapeHtml(step.copyFrom.label || "Use my earlier answers") + "</button>" +
            '<p class="list-copy-note" id="copyListNote" role="status">' + escapeHtml(listNotice) + "</p></div>";
        }
        items.forEach((val, i) => {
          const ph = (step.placeholders && step.placeholders[i]) || step.placeholder || "";
          const row = '<div class="list-row"><span class="bullet" aria-hidden="true">&bull;</span>' +
            '<input class="text-input" type="text" data-list-index="' + i + '" placeholder="' + escapeAttr(ph) + '" value="' + escapeAttr(val) + '" ' +
            'aria-label="' + escapeAttr((step.itemLabel || "Item") + " " + (i + 1)) + '" autocomplete="off">' +
            (i >= min ? '<button type="button" class="btn-remove-row" data-list-remove="' + i + '" aria-label="Remove">&times;</button>' : "") +
            "</div>";
          if (!step.itemDetails) { html += row; return; }
          const isOpen = !!String(det[i] || "").trim() || !!open[i];
          html += '<div class="list-item">' + row +
            '<button type="button" class="btn-detail-toggle" data-detail-toggle="' + i + '" aria-expanded="' + isOpen + '">' +
              escapeHtml(isOpen ? "\u2212 Hide details" : "+ " + (step.detailsLabel || "Add details (optional)")) + "</button>" +
            '<textarea class="text-input list-detail-input" data-detail-index="' + i + '" rows="3" placeholder="' + escapeAttr(step.detailsPlaceholder || "Optional details") + '"' + (isOpen ? "" : " hidden") + ">" + escapeHtml(det[i] || "") + "</textarea>" +
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
        const logoFile = step.logoStepId ? (answers[step.logoStepId] || [])[0] : null;
        const hasLogo = !!logoFile;
        const canPreview = hasLogo && (/^image\//.test(logoFile.type || "") || /\.(png|jpe?g|gif|webp|svg)$/i.test(logoFile.name || ""));
        const start = canPreview ? "logo" : "scale";
        let html = '<div class="answer-area colors-area" data-start="' + start + '"><div class="color-slots">';
        step.slots.forEach(s => {
          const hex = normHex(v[s.id]) || "";
          html += '<div class="color-slot">' +
            '<button type="button" class="slot-main" data-slot="' + escapeAttr(s.id) + '" aria-label="' + escapeAttr(s.label) + ' color">' +
              '<span class="slot-swatch"' + (hex ? ' style="background:' + hex + '"' : "") + "></span>" +
              '<span class="slot-meta"><span class="slot-label">' + escapeHtml(s.label) + "</span>" +
              '<span class="slot-hex">' + (hex || (s.required ? "Choose" : "Optional")) + "</span></span></button>" +
            (s.required ? "" : '<button type="button" class="slot-clear" data-clear="' + escapeAttr(s.id) + '" aria-label="Clear ' + escapeAttr(s.label) + '"' + (hex ? "" : " hidden") + ">&times;</button>") +
            "</div>";
        });
        html += "</div>";

        // On phones only one way of picking shows at a time, chosen with these
        // tabs, so the whole step fits on screen. On wide screens every way
        // shows at once and the tabs are hidden (see onboarding-extras.css).
        const tab = (id, label) => '<button type="button" class="method-tab' + (id === start ? " active" : "") + '" data-method-btn="' + id + '" role="tab" aria-selected="' + (id === start) + '">' + label + "</button>";
        const panel = (id, inner) => '<div class="method-panel' + (id === start ? " is-active" : "") + '" data-panel="' + id + '">' + inner + "</div>";
        html += '<div class="method-tabs" role="tablist" aria-label="How to pick a color">' +
          (hasLogo ? tab("logo", "Your logo") : "") + tab("scale", "Color scale") + tab("quick", "Quick colors") + "</div>";

        html += panel("scale",
          '<div class="scale-area">' +
            '<div class="scale-box" id="scaleBox" tabindex="0" role="application" aria-label="Color scale. Drag, or use the arrow keys, to choose a shade."><div class="scale-handle" id="scaleHandle" hidden></div></div>' +
            '<div class="scale-row"><span class="scale-preview" id="scalePreview"></span>' +
              '<input type="range" class="hue-range" id="hueRange" min="0" max="360" step="1" value="210" aria-label="Color hue"></div>' +
          "</div>" +
          '<div class="hex-field"><label class="cap" for="hexInput">Or type a color code</label>' +
            '<input class="text-input small hex-input" id="hexInput" type="text" maxlength="7" placeholder="#0F75BC" autocomplete="off" spellcheck="false"></div>');
        html += panel("quick",
          '<div class="quick-colors"><p class="cap">Quick colors</p><div class="palette" role="group" aria-label="Quick colors">' +
            PALETTE.map(h => '<button type="button" class="pal-swatch" data-hex="' + h + '" style="background:' + h + '" aria-label="' + h + '"></button>').join("") +
          "</div></div>");
        if (hasLogo) html += panel("logo", '<div class="logo-pick" id="logoPick"><div class="logo-frame"></div><p class="logo-hint">Tap a spot on your logo to use its color.</p></div>');
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
            (savedDraft
              ? '<p class="subtitle resume-note">Welcome back! We saved your answers on this device' + savedWhen() + ".</p>" +
                '<div class="resume-actions"><button class="btn-primary" id="resumeBtn">Continue where you left off &rarr;</button>' +
                '<button class="btn-ghost" id="startOverBtn">Start over</button></div>'
              : '<button class="btn-primary" id="startBtn">' + escapeHtml(step.cta || "Start") + " &rarr;</button>") +
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
            '<h1 class="question">' + escapeHtml(fill(step.question)) + "</h1>" +
            (step.subtitle ? '<p class="subtitle">' + escapeHtml(fill(step.subtitle)) + "</p>" : "") +
            (step.context ? renderContext(fill(step.context)) : "") +
            (skipped ? renderSkippedNote(step) : renderAnswerArea(step)) +
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
        const bytes = totalFileBytes();
        let note = bytes > 0 ? '<p class="subtitle upload-note" style="margin-left:auto;margin-right:auto;">Uploading ' + formatBytes(bytes) + ". Please keep this page open. Large videos can take a few minutes.</p>" : "";
        if (CONFIG.chunkedUpload && bytes > 0) {
          note = '<div style="height:8px;border-radius:999px;background:#2a2a2a;overflow:hidden;margin:16px auto 0;max-width:320px;">' +
            '<div id="uploadBar" style="height:100%;width:' + uploadPercent() + '%;background:linear-gradient(90deg,#0F75BC,#47B7E8);transition:width .3s;"></div></div>' +
            '<p class="subtitle upload-note" id="uploadText" style="margin-left:auto;margin-right:auto;">' + escapeHtml(uploadText()) + "</p>" +
            '<p class="subtitle upload-note" style="margin-left:auto;margin-right:auto;">Please keep this page open until it finishes. Your original quality is kept.</p>';
        }
        return '<div class="stage end"><div class="spinner-row"><span class="dot"></span><span class="dot"></span><span class="dot"></span>&nbsp; ' + (CONFIG.chunkedUpload && bytes > 0 ? "uploading your files" : "filing your details") + "</div>" + note + "</div>";
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
      const resumeBtn = document.getElementById("resumeBtn");
      if (resumeBtn) resumeBtn.addEventListener("click", resumeDraft);
      const startOverBtn = document.getElementById("startOverBtn");
      if (startOverBtn) startOverBtn.addEventListener("click", () => {
        savedDraft = null;
        storeDel();
        goTo(nextIndex(currentIndex), "forward");
      });

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
        const urlHintEl = document.getElementById("urlHint");
        const paintUrlHint = () => {
          if (!urlHintEl) return;
          const v = String(answers[step.id] || "").trim();
          const bad = v.length > 0 && normLink(v) === null;
          urlHintEl.textContent = bad ? "That doesn't look like a web address. It should look like https://yourcompany.com" : "";
          urlHintEl.classList.toggle("warn", bad);
        };
        paintUrlHint();
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
          paintUrlHint();
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

      // "paste a link instead" box on a file step
      const fileLink = document.getElementById("fileLink");
      if (fileLink) {
        const linkErr = document.getElementById("linkError");
        fileLink.addEventListener("input", () => {
          answers[step.id + "__link"] = fileLink.value;
          if (linkErr) linkErr.textContent = "";
          refreshContinue(step);
        });
        fileLink.addEventListener("blur", () => {
          if (linkErr && normLink(fileLink.value) === null) linkErr.textContent = "That doesn't look like a web address. It should look like https://drive.google.com/...";
        });
        fileLink.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); tryAdvance(step); } });
      }

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
      if (step.type === "checklist-detail") bindChecklist(step);
      if (step.type === "item-details") bindDetails(step);
    }

    // checklist-detail: tap-to-toggle options, an optional "something else" box, and
    // a notes box that changes its question when "none of these" is picked. Updates
    // in place, so the page doesn't jump around while someone is choosing.
    function bindChecklist(step) {
      const val = answers[step.id];
      const otherEl = document.getElementById("checklistOther");
      const otherWrap = otherEl ? otherEl.closest(".checklist-other") : null;
      const notesEl = document.getElementById("notesInput");
      const labelEl = document.getElementById("notesLabel");
      const hintEl = document.getElementById("notesHint");
      const minChars = step.notesMinChars || 0;
      const noneOn = () => !!(step.noneLabel && val.selected.includes(step.noneLabel));
      const paint = () => {
        document.querySelectorAll("[data-chip]").forEach(b => {
          const on = val.selected.includes(b.dataset.chip);
          b.classList.toggle("selected", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        if (otherWrap) otherWrap.hidden = !(step.otherLabel && val.selected.includes(step.otherLabel));
        if (notesEl && labelEl && hintEl) {
          labelEl.textContent = noneOn() && step.noneNotesLabel ? step.noneNotesLabel : (step.notesLabel || "Anything else we should know?");
          notesEl.placeholder = noneOn() && step.noneNotesPlaceholder ? step.noneNotesPlaceholder : (step.notesPlaceholder || "");
          const t = String(val.notes || "").trim();
          hintEl.textContent = step.notesRequired && minChars && t.length > 0 && t.length < minChars
            ? "A little more detail helps. Aim for at least " + minChars + " characters (" + (minChars - t.length) + " to go)." : "";
          hintEl.classList.toggle("warn", !!hintEl.textContent);
        }
        refreshContinue(step);
      };
      document.querySelectorAll("[data-chip]").forEach(b => b.addEventListener("click", () => {
        const label = b.dataset.chip;
        const at = val.selected.indexOf(label);
        if (at !== -1) val.selected.splice(at, 1);
        else if (step.noneLabel && label === step.noneLabel) val.selected = [label];                       // "none" replaces everything else
        else { val.selected = val.selected.filter(x => x !== step.noneLabel); val.selected.push(label); }  // picking anything removes "none"
        paint();
        if (otherEl && step.otherLabel && label === step.otherLabel && val.selected.includes(label)) otherEl.focus();
      }));
      if (otherEl) otherEl.addEventListener("input", () => { val.other = otherEl.value; refreshContinue(step); });
      if (notesEl) notesEl.addEventListener("input", () => { val.notes = notesEl.value; paint(); });
      paint();
    }

    // item-details: one section per service, each with its own textareas. The boxes
    // grow as someone types, and a short hint appears if an answer is too thin.
    function bindDetails(step) {
      const rows = answers[step.id];
      const hintFor = (f, v) => {
        const t = String(v || "").trim();
        if (f.minChars && f.minChars > 3 && t.length > 0 && t.length < f.minChars) return { text: "A little more detail helps. Aim for at least " + f.minChars + " characters (" + (f.minChars - t.length) + " to go).", warn: true };
        return { text: f.help || "", warn: false };
      };
      const grow = el => { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight + 2, 340) + "px"; };
      const boxes = Array.from(document.querySelectorAll("[data-detail-row]"));
      boxes.forEach(el => {
        const i = parseInt(el.dataset.detailRow, 10), key = el.dataset.detailKey;
        const f = detailFields(step, i).find(x => x.key === key);
        const hint = document.querySelector('[data-hint-for="' + el.id + '"]');
        const showHint = () => { const h = hintFor(f, rows[i][key]); hint.textContent = h.text; hint.classList.toggle("warn", h.warn); };
        showHint();
        grow(el);
        el.addEventListener("input", () => { rows[i][key] = el.value; grow(el); showHint(); refreshContinue(step); });
      });
      const first = boxes.find(el => !el.value) || boxes[0];
      if (first) first.focus();
    }

    // list: bulleted fields. Enter moves to the next field, and from the
    // last field it continues (if everything required is filled in).
    function bindList(step) {
      const items = answers[step.id];
      const det = answers[step.id + "__details"] || [];
      const open = answers[step.id + "__open"] || [];
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
      // optional details under each item: tap to open, typing is saved as you go
      document.querySelectorAll("[data-detail-toggle]").forEach(btn => btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.detailToggle, 10);
        const box = document.querySelector('[data-detail-index="' + i + '"]');
        if (!box) return;
        const show = box.hidden;
        box.hidden = !show;
        open[i] = show;
        btn.setAttribute("aria-expanded", show ? "true" : "false");
        btn.textContent = show ? "\u2212 Hide details" : "+ " + (step.detailsLabel || "Add details (optional)");
        if (show) box.focus();
      }));
      document.querySelectorAll("[data-detail-index]").forEach(box => box.addEventListener("input", () => {
        det[parseInt(box.dataset.detailIndex, 10)] = box.value;
      }));
      document.querySelectorAll("[data-list-remove]").forEach(btn => btn.addEventListener("click", () => {
        const at = parseInt(btn.dataset.listRemove, 10);
        items.splice(at, 1);
        if (step.itemDetails) { det.splice(at, 1); open.splice(at, 1); }
        renderStage();
      }));
      const add = document.getElementById("addListBtn");
      if (add) add.addEventListener("click", () => {
        items.push("");
        if (step.itemDetails) { det.push(""); open.push(false); }
        pendingFocus = '[data-list-index="' + (items.length - 1) + '"]';
        renderStage();
      });
      // "use my earlier answers": fills the list from this business's saved answers
      const copyBtn = document.getElementById("copyListBtn");
      if (copyBtn) copyBtn.addEventListener("click", async () => {
        const cfg = step.copyFrom;
        const biz = String(answers[cfg.businessFrom || "business_name"] || "").trim();
        const noteEl = document.getElementById("copyListNote");
        const say = t => { listNotice = t; if (noteEl) noteEl.textContent = t; };
        if (!biz) { say("Fill in your business name on the earlier question first."); return; }
        copyBtn.disabled = true;
        say("Looking for your earlier answers...");
        try {
          const res = await fetch(cfg.url + "?business=" + encodeURIComponent(biz));
          const d = await res.json();
          const found = d && d.ok && Array.isArray(d.services) ? d.services.filter(Boolean) : [];
          if (!found.length) {
            copyBtn.disabled = false;
            say("We couldn't find earlier answers under that business name. Check that it matches Part 2, or type your services below.");
            return;
          }
          const max = step.maxItems || found.length;
          const next = found.slice(0, max);
          while (next.length < (step.minItems || 1)) next.push("");
          items.splice(0, items.length, ...next);
          listNotice = found.length > max ? "We copied the first " + max + " services. You can change them below." : "Copied from your earlier answers. You can change them below.";
          renderStage();
        } catch (e) {
          copyBtn.disabled = false;
          say("Something went wrong. Please type your services below.");
        }
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
          main.querySelector(".slot-hex").textContent = hex || (s.required ? "Choose" : "Optional");
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

      // phones: the tab bar picks which way of choosing a color is showing
      document.querySelectorAll("[data-method-btn]").forEach(b => b.addEventListener("click", () => {
        const m = b.dataset.methodBtn;
        document.querySelectorAll("[data-method-btn]").forEach(t => {
          const on = t.dataset.methodBtn === m;
          t.classList.toggle("active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        document.querySelectorAll("[data-panel]").forEach(p => p.classList.toggle("is-active", p.dataset.panel === m));
      }));
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
      const base = "Tap a spot on your logo to use its color.";
      const fallback = "use the color scale or the quick colors instead.";
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
      const capBytes = (CONFIG.maxTotalMB || 0) * 1024 * 1024;
      const multiple = step.multiple !== false;
      const existing = multiple ? (answers[step.id] || []) : [];
      // everything already picked in the other steps, plus what this step already holds
      let running = totalFileBytes(step.id) + existing.reduce((sum, f) => sum + (f.size || 0), 0);
      const problems = [];
      let sizeProblem = false;
      const incoming = Array.from(fileList).filter(f => {
        if (!isAcceptedFile(f, accept)) {
          problems.push(f.name + (/video/.test(accept) ? " isn't a video. This question only takes videos." : /image/.test(accept) ? " isn't a photo. This question only takes photos, and videos go on the video question." : " isn't a supported file type."));
          return false;
        }
        if (maxBytes && f.size > maxBytes) { sizeProblem = true; problems.push(f.name + " is over " + formatMB(step.maxSizeMB)); return false; }
        if (existing.some(e => e.name === f.name && e.size === f.size && e.lastModified === f.lastModified)) return false;
        if (capBytes && running + f.size > capBytes) { sizeProblem = true; problems.push(f.name + " would go over the " + formatMB(CONFIG.maxTotalMB) + " upload limit for this form"); return false; }
        running += f.size;
        return true;
      });
      answers[step.id] = multiple ? existing.concat(incoming) : (incoming.length ? [incoming[0]] : (answers[step.id] || []));
      fileError = problems.length
        ? "Couldn't add: " + problems.join(" ") + (step.allowLink && sizeProblem ? " Use the link box below for anything big." : "")
        : "";
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

    function goTo(newIndex, direction, fileNotice) {
      const stageEl = cardEl.querySelector(".stage");
      if (stageEl) stageEl.classList.add(direction === "forward" ? "leaving-forward" : "leaving-back");
      setTimeout(() => {
        currentIndex = newIndex;
        fileError = fileNotice || "";
        listNotice = "";
        saveDraft();
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
        if (step.type === "file") {
          if (step.allowLink && isVisible(step)) out[step.id + "_link"] = normLink(answers[step.id + "__link"]) || null;
          return;
        }
        if (!isQuestion(step)) return;
        if (!isVisible(step)) { out[step.id] = null; return; }
        let val = answers[step.id];
        if (val && val.skipped === true) { out[step.id] = { skipped: true }; return; }

        if (typeof val === "string") {
          val = val.trim();
          if (step.format === "url") val = normLink(val) || val;
        } else if (step.type === "repeater") {
          val = (val || []).filter(row => Object.values(row).some(v => v && String(v).trim().length > 0));
        } else if (step.type === "list") {
          const raw = (val || []).map(s => String(s || "").trim());
          if (step.itemDetails) {
            // details stay lined up with their item, even when blank rows are dropped
            const det = answers[step.id + "__details"] || [];
            const notes = [];
            raw.forEach((name, i) => { if (name) notes.push(String(det[i] || "").trim()); });
            out[step.id + "_details"] = notes;
          }
          val = raw.filter(Boolean);
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
        } else if (step.type === "checklist-detail") {
          const v = val || {};
          const sel = (v.selected || []).slice();
          const other = step.otherLabel && sel.includes(step.otherLabel) ? String(v.other || "").trim() : "";
          val = {
            selected: sel.map(x => (other && x === step.otherLabel) ? "Other: " + other : x),
            other: other,
            notes: String(v.notes || "").trim()
          };
        } else if (step.type === "item-details") {
          val = (val || []).map((row, i) => {
            const o = { item: String(row.item || "").trim() };
            detailFields(step, i).forEach(f => { o[f.key] = String(row[f.key] || "").trim(); });
            return o;
          });
        }
        out[step.id] = (val === undefined) ? null : val;
      });
      return out;
    }

    /* ---------------------------------------------------------------------
       Big uploads (CONFIG.chunkedUpload): files go up first, in 10 MB pieces,
       then one small JSON message files the answers.
       --------------------------------------------------------------------- */
    const CHUNK_BYTES = 10 * 1024 * 1024;
    const POOL_SIZE = 4;          // files worked on at the same time
    const PART_POOL = 4;          // pieces of one big file sent at the same time
    const MAX_INFLIGHT = 6;       // most requests in the air at once, so phones don't run out of memory
    let inflight = 0;
    const waiting = [];
    async function slot(fn) {
      if (inflight >= MAX_INFLIGHT) await new Promise(r => waiting.push(r)); else inflight++;
      try { return await fn(); }
      finally { const w = waiting.shift(); if (w) w(); else inflight--; }
    }
    const uploadedFiles = new WeakMap();   // File -> { key, name, size }; lets a retry skip finished files
    const up = { total: 0, done: 0, count: 0, finished: 0 };

    function uploadPercent() { return up.total > 0 ? Math.min(100, Math.floor((up.done / up.total) * 100)) : 0; }
    function uploadText() {
      if (up.total === 0) return "";
      return uploadPercent() + "% \u00b7 " + formatBytes(up.done) + " of " + formatBytes(up.total) + " \u00b7 " + up.finished + " of " + up.count + " files";
    }
    function paintUpload() {
      const bar = document.getElementById("uploadBar");
      const txt = document.getElementById("uploadText");
      if (bar) bar.style.width = uploadPercent() + "%";
      if (txt) txt.textContent = uploadText();
    }

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function sendJson(url, opts) {
      const res = await fetch(url, opts);
      let body = null;
      try { body = await res.json(); } catch (e) { /* not JSON */ }
      if (!res.ok || !body || body.ok === false) {
        const err = new Error((body && body.error) || ("Server responded with status " + res.status));
        // a 4xx means the server rejected the file itself, so retrying won't help
        err.fatal = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
        throw err;
      }
      return body;
    }

    async function withRetry(fn) {
      let last;
      for (let i = 0; i < 4; i++) {
        try { return await fn(); }
        catch (e) { last = e; if (e && e.fatal) throw e; await sleep(800 * Math.pow(2, i)); }
      }
      throw last;
    }

    // Uploads one file. report(n) says how many of its bytes are safely uploaded so far.
    async function uploadOne(file, field, business, report) {
      const name = file.name || "file";
      const type = file.type || "";
      if (file.size <= CHUNK_BYTES) {
        const q = "business=" + encodeURIComponent(business) + "&field=" + encodeURIComponent(field) + "&name=" + encodeURIComponent(name);
        const r = await withRetry(() => slot(() => sendJson("/api/upload/file?" + q, {
          method: "PUT", headers: { "Content-Type": type || "application/octet-stream" }, body: file
        })));
        report(file.size);
        return { key: r.key, name: name, size: file.size };
      }

      const start = await withRetry(() => sendJson("/api/upload/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_name: business, field: field, name: name, size: file.size, type: type })
      }));
      const totalParts = Math.ceil(file.size / CHUNK_BYTES);
      const parts = new Array(totalParts);
      let sent = 0, nextPart = 0, partFailure = null;
      try {
        const partWorker = async () => {
          while (!partFailure) {
            const idx = nextPart++;
            if (idx >= totalParts) return;
            const off = idx * CHUNK_BYTES;
            const piece = file.slice(off, Math.min(off + CHUNK_BYTES, file.size));
            const q = "key=" + encodeURIComponent(start.key) + "&uploadId=" + encodeURIComponent(start.uploadId) + "&partNumber=" + (idx + 1);
            try {
              const p = await withRetry(() => slot(() => sendJson("/api/upload/part?" + q, { method: "PUT", body: piece })));
              parts[idx] = { partNumber: p.partNumber, etag: p.etag };
              sent += piece.size;
              report(sent);
            } catch (e) { partFailure = partFailure || e; }
          }
        };
        await Promise.all(Array.from({ length: Math.min(PART_POOL, totalParts) }, partWorker));
        if (partFailure) throw partFailure;
        await withRetry(() => sendJson("/api/upload/complete", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: start.key, uploadId: start.uploadId, parts: parts })
        }));
      } catch (e) {
        try {
          await fetch("/api/upload/abort", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: start.key, uploadId: start.uploadId }) });
        } catch (e2) { /* the bucket cleans up unfinished uploads on its own */ }
        throw e;
      }
      return { key: start.key, name: name, size: file.size };
    }

    async function uploadAll(rawItems, business) {
      // biggest files first, so one huge video isn't left trailing alone at the end
      const items = rawItems.slice().sort((a, b) => (b.file.size || 0) - (a.file.size || 0));
      const progress = items.map(() => 0);
      const recount = () => { up.done = progress.reduce((a, b) => a + b, 0); up.finished = items.filter(it => uploadedFiles.has(it.file)).length; paintUpload(); };
      recount();
      let next = 0, failure = null;
      const worker = async () => {
        while (!failure) {
          const i = next++;
          if (i >= items.length) return;
          const it = items[i];
          if (uploadedFiles.has(it.file)) { progress[i] = it.file.size; recount(); continue; }
          try {
            const result = await uploadOne(it.file, it.field, business, n => { progress[i] = n; recount(); });
            uploadedFiles.set(it.file, result);
            progress[i] = it.file.size;
          } catch (e) {
            progress[i] = 0;
            failure = failure || e;
          }
          recount();
        }
      };
      await Promise.all(Array.from({ length: Math.min(POOL_SIZE, Math.max(items.length, 1)) }, worker));
      if (failure) throw failure;
    }

    async function submitChunked(payload, fileSteps) {
      const business = String(payload.business_name || "").trim();
      const items = [];
      fileSteps.forEach(s => (answers[s.id] || []).forEach(f => items.push({ file: f, field: s.id })));
      up.total = items.reduce((sum, it) => sum + (it.file.size || 0), 0);
      up.count = items.length;
      up.done = 0; up.finished = 0;
      paintUpload();

      const warn = e => { e.preventDefault(); e.returnValue = ""; };
      let lock = null;
      try { if (global.navigator && navigator.wakeLock) lock = await navigator.wakeLock.request("screen"); } catch (e) { /* optional */ }
      global.addEventListener("beforeunload", warn);
      try {
        await uploadAll(items, business);
        const uploaded = {};
        fileSteps.forEach(s => {
          uploaded[s.id] = (answers[s.id] || []).map(f => uploadedFiles.get(f)).filter(Boolean);
        });
        await sendJson(CONFIG.apiEndpoint, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({}, payload, { uploaded_files: uploaded }))
        });
      } finally {
        global.removeEventListener("beforeunload", warn);
        try { if (lock) await lock.release(); } catch (e) { /* ignore */ }
      }
    }

    async function submitForm() {
      const DEMO = global.location.protocol === "file:";
      const payload = buildJsonPayload();
      const fileSteps = ALL.filter(s => s.type === "file" && isVisible(s));

      tellParent("busy");
      try {
        if (DEMO) {
          console.warn("[OnboardingForm] DEMO MODE (opened as a local file) \u2014 nothing was sent. Payload that would have been submitted:", payload, fileSteps.map(s => (answers[s.id] || []).map(f => f.name)));
          await new Promise(r => setTimeout(r, 650));
        } else if (CONFIG.chunkedUpload) {
          await submitChunked(payload, fileSteps);
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
        clearTimeout(saveTimer);
        storeDel();
        tellParent("done");
      } catch (err) {
        console.error("[OnboardingForm] Submission failed:", err);
        submitState = "error";
        tellParent("error");
      }
      renderStage();
    }

    // Fill in answers from the page address (see prefillParam), e.g. ?business=Acme%20Roofing
    (function applyPrefills() {
      let params;
      try { params = new URLSearchParams(global.location.search); } catch (e) { return; }
      ALL.forEach(step => {
        if (!step.prefillParam || step.mask || !["text", "email", "tel"].includes(step.type)) return;
        const v = String(params.get(step.prefillParam) || "").trim().slice(0, 120);
        if (v && !answers[step.id]) answers[step.id] = v;
      });
    })();

    /* ---------------------------------------------------------------------
       Save and resume (see the notes at the top of this file)
       --------------------------------------------------------------------- */
    const SAVE_ON = CONFIG.saveProgress !== false && global.location.protocol !== "file:";
    const SAVE_KEY = "letlois-form:" + global.location.pathname.replace(/\/+$/, "");
    const SAVE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
    let savedDraft = null;       // what an earlier visit left behind, until the client picks continue or start over
    let saveTimer = null;
    let furthestIdx = 0;         // the furthest question they have reached, so going back to edit never loses their place

    function storeGet() { try { return global.localStorage.getItem(SAVE_KEY); } catch (e) { return null; } }
    function storeSet(v) { try { global.localStorage.setItem(SAVE_KEY, v); } catch (e) { /* private mode or full: just don't save */ } }
    function storeDel() { try { global.localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

    function savedWhen() {
      try {
        return " from " + new Date(savedDraft.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      } catch (e) { return ""; }
    }

    // Everything worth keeping: answers only. Chosen files can't be kept, only a pasted link; noSave steps are left out.
    function savableAnswers() {
      const out = {};
      Object.keys(answers).forEach(k => {
        const step = ALL.find(s => s.id === k.split("__")[0]);
        if (!step || step.noSave || !isQuestion(step)) return;
        if (step.type === "file" && k !== step.id + "__link") return;
        if (k.slice(-6) === "__open") return;
        out[k] = answers[k];
      });
      return out;
    }

    function saveDraft() {
      if (!SAVE_ON || submitState === "success") return;
      const step = ALL[currentIndex];
      if (!step || !isQuestion(step)) return;      // nothing to save on the welcome or end screens
      furthestIdx = Math.max(furthestIdx, currentIndex);
      if (furthestIdx <= ALL.findIndex(isQuestion)) return;      // still on the first question: nothing worth saving yet
      storeSet(JSON.stringify({ v: 1, savedAt: Date.now(), stepId: step.id, furthestId: ALL[furthestIdx].id, answers: savableAnswers(), rowSigs: rowSigs, rowRemoved: rowRemoved }));
    }

    function resumeDraft() {
      const d = savedDraft;
      savedDraft = null;
      if (!d) return;
      Object.keys(d.answers).forEach(k => { answers[k] = d.answers[k]; });
      Object.keys(d.rowSigs || {}).forEach(k => { rowSigs[k] = d.rowSigs[k]; });
      Object.keys(d.rowRemoved || {}).forEach(k => { rowRemoved[k] = d.rowRemoved[k]; });
      let target = ALL.findIndex(s => s.id === (d.furthestId || d.stepId));
      if (target < 0 || !isQuestion(ALL[target])) target = nextIndex(0);
      furthestIdx = target;
      // Start from the first question that still needs an answer (an upload, say), but never past where they stopped.
      for (let i = 0; i < target; i++) {
        const s = ALL[i];
        if (!isQuestion(s) || !isVisible(s)) continue;
        prepareAnswer(s);
        if (!isValid(s)) { target = i; break; }
      }
      const needsFiles = ALL[target].type === "file";
      goTo(target, "forward", needsFiles ? "Welcome back! Your answers were saved, but files can't be, so please choose your files again." : "");
    }

    (function loadDraft() {
      if (!SAVE_ON) return;
      const raw = storeGet();
      if (!raw) return;
      let d = null;
      try { d = JSON.parse(raw); } catch (e) { /* damaged copy */ }
      if (!d || d.v !== 1 || !d.answers || !(Date.now() - d.savedAt < SAVE_MAX_AGE)) { storeDel(); return; }
      // A link for a different business than the saved answers: don't offer someone else's answers.
      let params = null;
      try { params = new URLSearchParams(global.location.search); } catch (e) { /* no query */ }
      if (params) {
        for (let i = 0; i < ALL.length; i++) {
          const st = ALL[i];
          if (!st.prefillParam) continue;
          const fromLink = String(params.get(st.prefillParam) || "").trim().toLowerCase();
          const saved = String(d.answers[st.id] || "").trim().toLowerCase();
          if (fromLink && saved && fromLink !== saved) return;
        }
      }
      // Only offer it when they got past the first question.
      const first = ALL.findIndex(isQuestion);
      if (ALL.findIndex(st => st.id === (d.furthestId || d.stepId)) <= first) return;
      savedDraft = d;
    })();

    if (SAVE_ON) {
      const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 1000); };
      cardEl.addEventListener("input", saveSoon);
      cardEl.addEventListener("change", saveSoon);
      cardEl.addEventListener("click", saveSoon);
      global.addEventListener("pagehide", saveDraft);
      document.addEventListener("visibilitychange", () => { if (document.hidden) saveDraft(); });
    }

    renderStage();
  }

  global.OnboardingForm = { init };

})(window);
