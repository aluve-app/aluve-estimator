/**
 * helper.js — shared, side-effect-free utility functions used across every
 * other module. Nothing in this file touches LocalStorage, the DOM state,
 * or pricing rules — pure helpers only, so it's safe to depend on from
 * anywhere without creating circular concerns.
 *
 * Public API: window.ALUVE.Helper
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.Helper = (function () {
  'use strict';

  /**
   * Shared label map for project.leadSource keys — used by both the
   * New/Edit Project form's <select> and anywhere a lead source needs a
   * human-readable label (Project Detail, Excel exports).
   */
  const LEAD_SOURCE_LABELS = {
    ads: 'Ads (Meta/Google)',
    canvasing: 'Canvasing',
    referral: 'Referral',
    organic: 'Website/Organic',
    event: 'Pameran (IBT, dll)',
    walkin: 'Showroom Walk-in',
    other: 'Lainnya'
  };

  /**
   * Resolves a project's stored leadSource key (+ optional free-text
   * leadSourceOther) into a human-readable label. Falls back to '-' when
   * no lead source has been recorded.
   * @param {{leadSource?:string, leadSourceOther?:string}} project
   * @returns {string}
   */
  function formatLeadSource(project) {
    if (!project || !project.leadSource) return '-';
    if (project.leadSource === 'other') return project.leadSourceOther || 'Lainnya';
    return LEAD_SOURCE_LABELS[project.leadSource] || project.leadSource;
  }

  /**
   * Formats a number as Indonesian Rupiah, e.g. 1250000 -> "Rp 1.250.000".
   * Always rounds to the nearest whole Rupiah (no cents in this business).
   * @param {number} value
   * @returns {string}
   */
  function formatCurrency(value) {
    const safeValue = Number.isFinite(value) ? value : 0;
    const rounded = Math.round(safeValue);
    const formatted = rounded
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return 'Rp ' + (rounded < 0 ? '-' + formatted.replace('-', '') : formatted);
  }

  /**
   * Internal, unexported parsing core shared by parseCurrencyInput and
   * toNumber. Both public functions ultimately need the same thing —
   * "take a string a human typed and get a real number out of it" — they
   * only differ in which characters count as noise to strip first.
   * @param {string} value
   * @param {RegExp} [noisePattern] - characters to strip before parsing; omit if there's none
   * @returns {number} NaN if unparseable
   */
  function parseNumericString(value, noisePattern) {
    let cleaned = value.trim();
    if (noisePattern) cleaned = cleaned.replace(noisePattern, '');
    cleaned = cleaned.replace(',', '.');
    if (cleaned === '') return NaN;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  /**
   * Parses a user-typed currency/number string back into a plain number.
   * Strips "Rp", thousands separators ("."), and whitespace.
   * Accepts a comma as a decimal separator (Indonesian convention) and
   * converts it to a JS-parseable dot.
   * Returns NaN (not 0) on unparseable input, so callers can distinguish
   * "empty/invalid" from "genuinely zero" — critical for validation.js.
   * @param {string} input
   * @returns {number}
   */
  function parseCurrencyInput(input) {
    if (typeof input === 'number') return input;
    if (typeof input !== 'string' || input.trim() === '') return NaN;
    return parseNumericString(input.replace(/rp/gi, ''), /\./g);
  }

  /**
   * Generates a reasonably-unique id for projects/items/SKUs.
   * Uses crypto.randomUUID when available (modern browsers), falls back
   * to a timestamp+random string otherwise — never blocks execution.
   * @param {string} [prefix]
   * @returns {string}
   */
  function generateId(prefix) {
    const base = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    return prefix ? prefix + '_' + base : base;
  }

  /**
   * Formats an ISO date string / Date object into "DD MMM YYYY" (Indonesian
   * short month names), e.g. "16 Jul 2026".
   * @param {string|Date} dateInput
   * @returns {string}
   */
  function formatDate(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(date.getTime())) return '-';

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return date.getDate() + ' ' + months[date.getMonth()] + ' ' + date.getFullYear();
  }

  /**
   * Returns a human-friendly relative time string ("2 hari lalu", "hari ini")
   * for project card footers.
   * @param {string|Date} dateInput
   * @returns {string}
   */
  function formatRelativeTime(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(date.getTime())) return '-';

    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Diperbarui hari ini';
    if (diffDays === 1) return 'Diperbarui kemarin';
    if (diffDays < 30) return 'Diperbarui ' + diffDays + ' hari lalu';
    return 'Diperbarui ' + formatDate(date);
  }

  /**
   * Debounces a function so rapid-fire calls (e.g. every keystroke in a
   * qty field) only actually execute once input has paused — used by
   * ui.js for autosave and live recalculation.
   * @param {Function} fn
   * @param {number} waitMs
   * @returns {Function}
   */
  function debounce(fn, waitMs) {
    let timeoutId = null;
    return function debounced() {
      const context = this;
      const args = arguments;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(function () {
        fn.apply(context, args);
      }, waitMs);
    };
  }

  /**
   * Escapes a string for safe insertion into innerHTML, preventing any
   * user-typed project/item/note text from being interpreted as markup.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, function (ch) { return map[ch]; });
  }

  /** Shorthand querySelector, scoped optionally to a parent element. */
  function qs(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  /** Shorthand querySelectorAll returning a real Array (not a NodeList). */
  function qsa(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  /**
   * Deep-clones a plain JSON-serializable object/array. Used whenever a
   * module needs to mutate a working copy without touching the stored
   * original (e.g. editing an item before the user confirms Save).
   * @param {*} value
   * @returns {*}
   */
  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * Safely coerces a value that SHOULD be numeric — but, coming from a
   * real <input type="text"> field, arrives as a string — into an actual
   * number. Accepts a comma as an Indonesian-style decimal separator.
   * Returns NaN (never 0) for genuinely unparseable input, so validation
   * can still distinguish "bad input" from "legitimately zero".
   *
   * QA NOTE: this exists because Calculator/Validation were found, during
   * the Phase 7 QA pass, to silently treat every string-typed qty/price
   * from a real form field as 0 (Number.isFinite("4.2") === false). Every
   * qty/price/discount value coming from the DOM MUST be run through this
   * before reaching calculator.js or validation.js.
   * @param {number|string} value
   * @returns {number}
   */
  function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return NaN;
    return parseNumericString(value);
  }

  /**
   * Caches a set of descendant elements from a root element in one call,
   * keyed by whatever name each entry asks for. Every page-level module
   * (settingsPage.js, priceManagerPage.js, and future ones) was
   * hand-rolling the same "find my root, then querySelector each field"
   * boilerplate — this is that pattern, written once.
   *
   * @param {HTMLElement|null} root - the page's container element; if null, returns an empty object (module simply won't wire up, matching each page module's existing "not on this page" guard)
   * @param {Object<string,string>} selectorMap - { fieldName: cssSelector }
   * @returns {Object<string,HTMLElement>} same keys, resolved elements (root itself is not included — callers keep their own root reference)
   */
  function cacheElements(root, selectorMap) {
    const result = {};
    if (!root) return result;
    Object.keys(selectorMap).forEach(function (key) {
      result[key] = root.querySelector(selectorMap[key]);
    });
    return result;
  }

  /**
   * Validates and reads an uploaded image file as a base64 data URL.
   * Shared by the Settings logo upload and the Item Editor photo upload —
   * both need identical guards (real image, size-capped to protect the
   * shared LocalStorage quota).
   * @param {File} file
   * @param {number} [maxBytes] - default 800KB
   * @returns {Promise<{success:boolean, message:string, dataUrl?:string}>}
   */
  /**
   * Compresses/resizes an image file by drawing it onto a canvas at a
   * capped pixel resolution and re-encoding as JPEG. This is the real
   * fix for the PDF-file-size bug reported: jsPDF's addImage() embeds a
   * source image at its ORIGINAL pixel resolution — the width/height you
   * pass to addImage only controls its DISPLAY size on the page, not how
   * much image data gets embedded. An 8000×8000px logo at 520KB (well
   * under any reasonable file-size upload gate) still produces a
   * multi-hundred-MB PDF once embedded, because the byte-size check
   * never limited pixel dimensions. Capping dimensions at upload time is
   * the only fix that actually addresses this.
   * @param {File} file
   * @param {number} maxWidth
   * @param {number} maxHeight
   * @param {number} quality - 0–1 JPEG quality
   * @returns {Promise<string>} a small, resolution-capped JPEG data URL
   */
  function compressImageFile(file, maxWidth, maxHeight, quality) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
          const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
          const width = Math.max(1, Math.round(img.width * ratio));
          const height = Math.max(1, Math.round(img.height * ratio));

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          // JPEG has no alpha channel — flatten any transparent PNG onto
          // white first, or transparent areas would render solid black.
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          try {
            resolve(canvas.toDataURL('image/jpeg', quality || 0.75));
          } catch (encodeErr) {
            reject(encodeErr);
          }
        };
        img.onerror = function () { reject(new Error('Gagal memuat gambar untuk dikompres.')); };
        img.src = event.target.result;
      };
      reader.onerror = function () { reject(new Error('Gagal membaca file gambar.')); };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Validates an uploaded image file, then compresses/resizes it before
   * returning a data URL — every image entering the app (logo, item
   * photo) goes through this single choke point, so nothing oversized
   * can ever reach LocalStorage or an exported PDF again.
   * @param {File} file
   * @param {{maxInputBytes?:number, maxWidth?:number, maxHeight?:number, quality?:number}} [options]
   * @returns {Promise<{success:boolean, message:string, dataUrl?:string}>}
   */
  function validateAndReadImageFile(file, options) {
    const opts = options || {};
    const maxInputBytes = opts.maxInputBytes || 8 * 1024 * 1024; // generous — compression handles the real size problem
    const maxWidth = opts.maxWidth || 800;
    const maxHeight = opts.maxHeight || 800;
    const quality = opts.quality || 0.75;

    return new Promise(function (resolve) {
      if (!file) { resolve({ success: false, message: 'Tidak ada file dipilih.' }); return; }
      if (!file.type || file.type.indexOf('image/') !== 0) {
        resolve({ success: false, message: 'File harus berupa gambar (PNG/JPG).' });
        return;
      }
      if (file.size > maxInputBytes) {
        resolve({ success: false, message: 'Ukuran file maksimal ' + Math.round(maxInputBytes / (1024 * 1024)) + 'MB.' });
        return;
      }
      compressImageFile(file, maxWidth, maxHeight, quality)
        .then(function (dataUrl) { resolve({ success: true, message: '', dataUrl: dataUrl }); })
        .catch(function (err) { resolve({ success: false, message: err.message || 'Gagal memproses gambar.' }); });
    });
  }

  return {
    formatCurrency: formatCurrency,
    parseCurrencyInput: parseCurrencyInput,
    toNumber: toNumber,
    generateId: generateId,
    formatDate: formatDate,
    formatRelativeTime: formatRelativeTime,
    debounce: debounce,
    escapeHtml: escapeHtml,
    qs: qs,
    qsa: qsa,
    deepClone: deepClone,
    cacheElements: cacheElements,
    validateAndReadImageFile: validateAndReadImageFile,
    compressImageFile: compressImageFile,
    formatLeadSource: formatLeadSource
  };
})();
