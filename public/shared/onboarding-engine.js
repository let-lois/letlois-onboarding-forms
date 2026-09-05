/* ==========================================================================
   LetLois Onboarding — shared form engine
   ==========================================================================
   Every onboarding form (every part, every plan) includes this file and
   then calls OnboardingForm.init(CONFIG) with its own business name and
   question list. This file owns: rendering, validation, keyboard/click
   handling, step transitions, and submission. Fix a bug or tweak an
   animation here once and it applies to every form built on this engine.

   Supported step types: welcome, text, email, tel, textarea, select,
   multiselect, address, file, consent, checklist-detail, repeater, end.

   Submission contract:
     - POSTs a FormData to CONFIG.apiEndpoint
     - field "data": JSON string of all non-file answers, keyed by step id
     - field "photos": zero or more File objects (from any "file"-type steps)
     - expects JSON back: { ok: true, ... } or { ok: false, error }
     - if location.protocol is "file:", runs in DEMO MODE — no network
       call is made, so the design can be previewed by opening the HTML
       file directly before it's deployed.
   ========================================================================== */

(function (global) {

  function init(CONFIG) {
    const answers = {};
    let currentIndex = 0;
    let submitState = "idle"; // idle | submitting | success | error

    const questionSteps = CONFIG.steps.filter(s => s.type !== "welcome" && s.type !== "end");
    const totalQuestions = questionSteps.length;

    const cardEl = document.getElementById("card");
    const liveRegion = document.getElementById("liveRegion");
    const footerEl = document.getElementById("footerCredit");
    if (footerEl) footerEl.textContent = CONFIG.businessName || "";

    /* ---------------------------------------------------------------------
       Validation
       --------------------------------------------------------------------- */
    function isValid(step) {
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
    function questionNumber(step) { return questionSteps.indexOf(step) + 1; }

    function renderTabs(step) {
      if (step.type === "welcome" || step.type === "end") return "";
      const qNum = questionNumber(step);
      let html = '<div class="tabs" role="progressbar" aria-valuemin="1" aria-valuemax="' + totalQuestions + '" aria-valuenow="' + qNum + '">';
      for (let i = 1; i <= totalQuestions; i++) {
        const frac = totalQuestions > 1 ? (i - 1) / (totalQuestions - 1) : 0;
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

    function renderContext(text) {
      return '<details class="context"><summary>Why we ask</summary><p>' + escapeHtml(text) + "</p></details>";
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
        let rows = files.map((f, i) =>
          '<div class="file-row"><span>' + escapeHtml(f.name) + " (" + formatBytes(f.size) + ')</span>' +
          '<button type="button" data-remove-file="' + i + '" aria-label="Remove ' + escapeAttr(f.name) + '">&times;</button></div>'
        ).join("");
        return '<div class="answer-area">' +
          '<div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Upload files"><div>Drop images here, or click to browse</div></div>' +
          '<input type="file" id="fileInput" accept="image/*" multiple style="display:none;">' +
          '<div class="file-list" id="fileList">' + rows + "</div>" +
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

    function renderStage() {
      const step = CONFIG.steps[currentIndex];
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
        const valid = isValid(step);
        const enterHint = ["text", "email", "tel"].includes(step.type);
        inner =
          '<div class="stage">' +
            renderTabs(step) +
            '<div class="eyebrow">' + escapeHtml(CONFIG.partLabel || "") + " &middot; Question " +
              String(questionNumber(step)).padStart(2, "0") + " / " + String(totalQuestions).padStart(2, "0") + "</div>" +
            '<h1 class="question">' + escapeHtml(step.question) + "</h1>" +
            (step.subtitle ? '<p class="subtitle">' + escapeHtml(step.subtitle) + "</p>" : "") +
            (step.context ? renderContext(step.context) : "") +
            renderAnswerArea(step) +
            '<div class="nav-row">' +
              '<button class="btn-back" id="backBtn" ' + (currentIndex === 0 ? "disabled" : "") + ">&larr; Back</button>" +
              (enterHint ? '<span class="hint">press Enter &crarr;</span>' : "<span></span>") +
              '<button class="btn-primary" id="continueBtn" ' + (valid ? "" : "disabled") + ">Continue &rarr;</button>" +
            "</div>" +
          "</div>";
      }

      cardEl.innerHTML = inner;
      attachStageHandlers(step);
      if (liveRegion) {
        liveRegion.textContent = (step.type === "welcome" || step.type === "end")
          ? "" : "Question " + questionNumber(step) + " of " + totalQuestions;
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
      const step = CONFIG.steps[currentIndex];
      return '<div class="stage end">' +
        '<div class="completion-badge"><svg viewBox="0 0 24 24" fill="none"><path d="M4 12.5L9.5 18L20 6" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
        '<h1 class="question">' + escapeHtml(step.title) + "</h1>" +
        '<p class="subtitle" style="margin-left:auto;margin-right:auto;">' + escapeHtml(step.subtitle || "") + "</p>" +
      "</div>";
    }

    /* ---------------------------------------------------------------------
       Event handling
       --------------------------------------------------------------------- */
    function attachStageHandlers(step) {
      const startBtn = document.getElementById("startBtn");
      if (startBtn) startBtn.addEventListener("click", () => goTo(currentIndex + 1, "forward"));

      const backBtn = document.getElementById("backBtn");
      if (backBtn) backBtn.addEventListener("click", () => { if (currentIndex > 0) goTo(currentIndex - 1, "back"); });

      const continueBtn = document.getElementById("continueBtn");
      if (continueBtn) continueBtn.addEventListener("click", () => tryAdvance(step));

      const retryBtn = document.getElementById("retryBtn");
      if (retryBtn) retryBtn.addEventListener("click", () => { submitState = "submitting"; renderStage(); submitForm(); });

      const fieldInput = document.getElementById("fieldInput");
      if (fieldInput) {
        fieldInput.focus();
        if (fieldInput.value) fieldInput.setSelectionRange(fieldInput.value.length, fieldInput.value.length);
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
          const btn = document.getElementById("continueBtn");
          if (btn) btn.disabled = !isValid(step);
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
            setTimeout(() => goTo(currentIndex + 1, "forward"), 300);
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
      document.querySelectorAll('.address-grid [data-field]').forEach(input => {
        input.addEventListener("input", e => {
          const a = answers[step.id] ? Object.assign({}, answers[step.id]) : {};
          a[e.target.getAttribute("data-field")] = e.target.value;
          answers[step.id] = a;
          const btn = document.getElementById("continueBtn");
          if (btn) btn.disabled = !isValid(step);
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
          const btn = document.getElementById("continueBtn");
          if (btn) btn.disabled = !isValid(step);
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
          const btn = document.getElementById("continueBtn");
          if (btn) btn.disabled = !isValid(step);
        });
      });
    }

    function addFiles(step, fileList) {
      const existing = answers[step.id] || [];
      const incoming = Array.from(fileList).filter(f =>
        !existing.some(e => e.name === f.name && e.size === f.size && e.lastModified === f.lastModified)
      );
      answers[step.id] = existing.concat(incoming);
      renderStage();
    }

    function tryAdvance(step) {
      if (!isValid(step)) return;
      if (step.type === "consent") {
        const c = answers[step.id];
        c.signed_at = new Date().toISOString();
        answers[step.id] = c;
      }
      goTo(currentIndex + 1, "forward");
    }

    function goTo(newIndex, direction) {
      const stageEl = cardEl.querySelector(".stage");
      if (stageEl) stageEl.classList.add(direction === "forward" ? "leaving-forward" : "leaving-back");
      setTimeout(() => {
        currentIndex = newIndex;
        renderStage();
        const newStageEl = cardEl.querySelector(".stage");
        if (newStageEl) {
          newStageEl.classList.add(direction === "forward" ? "entering-forward" : "entering-back");
          requestAnimationFrame(() => requestAnimationFrame(() => {
            newStageEl.classList.remove("entering-forward", "entering-back");
          }));
        }
        if (CONFIG.steps[currentIndex].type === "end") {
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
      CONFIG.steps.forEach(step => {
        if (step.type === "welcome" || step.type === "end" || step.type === "file") return;
        let val = answers[step.id];
        if (step.type === "repeater") {
          val = (val || []).filter(row => Object.values(row).some(v => v && String(v).trim().length > 0));
        }
        out[step.id] = (val === undefined) ? null : val;
      });
      return out;
    }

    async function submitForm() {
      const DEMO = global.location.protocol === "file:";
      const payload = buildJsonPayload();
      const fileSteps = CONFIG.steps.filter(s => s.type === "file");

      try {
        if (DEMO) {
          console.warn("[OnboardingForm] DEMO MODE (opened as a local file) \u2014 nothing was sent. Payload that would have been submitted:", payload, fileSteps.map(s => (answers[s.id] || []).map(f => f.name)));
          await new Promise(r => setTimeout(r, 650));
        } else {
          const fd = new FormData();
          fd.append("data", JSON.stringify(payload));
          fileSteps.forEach(s => {
            (answers[s.id] || []).forEach(f => fd.append("photos", f, f.name));
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

    /* ---------------------------------------------------------------------
       Utilities
       --------------------------------------------------------------------- */
    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }
    function escapeAttr(str) { return escapeHtml(str); }
    function formatBytes(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    // Input masking (e.g. mask: "XX-XXXXXXX" for an EIN) — "X" is a digit
    // slot, any other character is a literal that gets auto-inserted once
    // enough digits exist to reach it.
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

    renderStage();
  }

  global.OnboardingForm = { init };

})(window);
