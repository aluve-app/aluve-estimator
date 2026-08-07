/**
 * validation.js — every validation rule from Phase 1 SRS §20, centralized
 * so no two modules can silently disagree on what "valid" means.
 *
 * Every function here returns either `true`/`false` (simple checks) or a
 * result object `{ valid: boolean, message: string }` (checks that need to
 * explain *why* to the user) — never throws, never touches the DOM.
 *
 * Public API: window.ALUVE.Validation
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.Validation = (function () {
  'use strict';

  const Helper = window.ALUVE.Helper;

  /**
   * A quantity is valid only if it's a finite number strictly greater than
   * zero — per Phase 1 §20, a qty of 0/blank must block export, not
   * silently produce a Rp 0 line.
   * QA FIX: coerces via Helper.toNumber first, since a real <input
   * type="text"> field hands this a string ("4.2"), not a number — the
   * previous version rejected every real form value.
   * @param {number|string} qty
   * @returns {boolean}
   */
  function isValidQty(qty) {
    const numeric = Helper.toNumber(qty);
    return Number.isFinite(numeric) && numeric > 0;
  }

  /**
   * A discount percentage must fall within 0–100 inclusive. Also accepts
   * a compound value like "20+10" (per Anto's request) — each '+'
   * separated part must individually fall within 0–100; the cascading
   * math itself lives in calculator.js's calcDiscountAmount.
   * @param {number|string} percent
   * @returns {boolean}
   */
  function isValidDiscountPercent(percent) {
    const raw = String(percent == null ? '' : percent).trim();
    if (raw === '') return true; // empty = no discount, valid
    const parts = raw.split('+').map(function (p) { return Helper.toNumber(p); });
    return parts.every(function (n) { return Number.isFinite(n) && n >= 0 && n <= 100; });
  }

  /**
   * A nominal (Rupiah) discount can never exceed the amount it's being
   * applied against — prevents a negative item/project total. Also
   * accepts a compound value like "50000+20000", summed as a plain total.
   * @param {number|string} nominal
   * @param {number} baseAmount
   * @returns {boolean}
   */
  function isValidDiscountNominal(nominal, baseAmount) {
    const raw = String(nominal == null ? '' : nominal).trim();
    if (raw === '') return true;
    const parts = raw.split('+').map(function (p) { return Helper.toNumber(p); });
    if (!parts.every(function (n) { return Number.isFinite(n) && n >= 0; })) return false;
    const total = parts.reduce(function (sum, n) { return sum + n; }, 0);
    return total <= baseAmount;
  }

  /**
   * Validates a single discount object as stored on an item/project.
   * @param {{type: 'percent'|'nominal', value: number}} discount
   * @param {number} baseAmount - required only when type === 'nominal'
   * @returns {{valid: boolean, message: string}}
   */
  function validateDiscount(discount, baseAmount) {
    if (!discount || (discount.type !== 'percent' && discount.type !== 'nominal')) {
      return { valid: false, message: 'Jenis diskon tidak valid.' };
    }
    if (discount.type === 'percent' && !isValidDiscountPercent(discount.value)) {
      return { valid: false, message: 'Diskon persen harus antara 0–100.' };
    }
    if (discount.type === 'nominal' && !isValidDiscountNominal(discount.value, baseAmount)) {
      return { valid: false, message: 'Diskon nominal tidak boleh melebihi total.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * A single price-manager price entry must be a positive, finite number.
   * Zero and negative prices are rejected (§20: "must be a positive number").
   * QA FIX: coerces via Helper.toNumber (Price Manager's inline-edit cell
   * hands this a string read from `.textContent`).
   * @param {number|string} price
   * @returns {boolean}
   */
  function isValidPrice(price) {
    const numeric = Helper.toNumber(price);
    return Number.isFinite(numeric) && numeric > 0;
  }

  /** A non-empty, trimmed string check used for required text fields. */
  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  /**
   * Validates project metadata before it can be created or exported.
   * Client name is the only hard requirement (§20: "cannot export an
   * anonymous quote").
   * @param {{clientName: string}} project
   * @returns {{valid: boolean, message: string}}
   */
  function validateProjectMeta(project) {
    if (!project || !isNonEmptyString(project.clientName)) {
      return { valid: false, message: 'Nama klien wajib diisi.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Validates a single component/glass/sealant line before it can count
   * toward a total. A line with qty <= 0 is treated as "not yet ready",
   * not silently zero.
   * @param {{qty: number, unitPrice: number}} line
   * @returns {{valid: boolean, message: string}}
   */
  function validateLine(line) {
    if (!line) return { valid: false, message: 'Baris tidak valid.' };
    if (!isValidQty(line.qty)) {
      return { valid: false, message: 'Kuantitas harus lebih besar dari 0.' };
    }
    const numericPrice = Helper.toNumber(line.unitPrice);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return { valid: false, message: 'Harga satuan tidak valid.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * An Item must contain at least one valid line (aluminium or glass) to
   * be considered complete — an "empty" item cannot be saved (§20).
   * @param {{aluminiumLines: Array, glassLines: Array}} item
   * @returns {{valid: boolean, message: string}}
   */
  /**
   * An Item must contain at least one valid line (aluminium, glass, or
   * "Lain-lain") to be considered complete — an "empty" item cannot be
   * saved (§20).
   * @param {{aluminiumLines: Array, glassLines: Array, otherLines?: Array}} item
   * @returns {{valid: boolean, message: string}}
   */
  function validateItemHasLines(item) {
    const alu = (item && item.aluminiumLines) || [];
    const glass = (item && item.glassLines) || [];
    const other = (item && item.otherLines) || [];
    const validLineCount = alu.concat(glass).concat(other).filter(function (line) {
      return validateLine(line).valid;
    }).length;

    if (validLineCount === 0) {
      return { valid: false, message: 'Item harus memiliki minimal satu baris komponen, kaca, atau lain-lain yang valid.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Runs every export-blocking check on a full project (all items +
   * metadata) and returns a flat list of human-readable problems. An
   * empty array means the project is exportable.
   * @param {Object} project
   * @returns {string[]}
   */
  function collectExportBlockers(project) {
    const problems = [];
    const metaCheck = validateProjectMeta(project);
    if (!metaCheck.valid) problems.push(metaCheck.message);

    if (!project || !Array.isArray(project.items) || project.items.length === 0) {
      problems.push('Project harus memiliki minimal satu item.');
      return problems;
    }

    project.items.forEach(function (item, index) {
      const itemLabel = item.label || ('Item ' + (index + 1));
      const linesCheck = validateItemHasLines(item);
      if (!linesCheck.valid) {
        problems.push(itemLabel + ': ' + linesCheck.message);
      }
    });

    return problems;
  }

  return {
    isValidQty: isValidQty,
    isValidDiscountPercent: isValidDiscountPercent,
    isValidDiscountNominal: isValidDiscountNominal,
    validateDiscount: validateDiscount,
    isValidPrice: isValidPrice,
    isNonEmptyString: isNonEmptyString,
    validateProjectMeta: validateProjectMeta,
    validateLine: validateLine,
    validateItemHasLines: validateItemHasLines,
    collectExportBlockers: collectExportBlockers
  };
})();
