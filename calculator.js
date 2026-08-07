/**
 * calculator.js — every pricing calculation in the app lives here, and
 * ONLY here. Pure functions only: same input always produces the same
 * output, no DOM access, no LocalStorage access, no side effects. This
 * makes every formula independently testable and is what lets
 * itemEditor/ui.js stay "dumb" (display + orchestration only).
 *
 * Business rules encoded here (per Phase 1 SRS, confirmed direction):
 *   - line subtotal   = unitPrice × qty                     (matches legacy Excel's `F = D*E`)
 *   - Sealant is PER ITEM, never global — deliberately different from the
 *     legacy Excel's cross-item average formula (see masterData.js notes).
 *   - Grand Total = Aluminium + Glass + Sealant, summed exactly ONCE per
 *     item — deliberately does NOT reproduce the legacy Excel's
 *     Ornamen/Sealant double-count bug flagged in Phase 1.
 *
 * Public API: window.ALUVE.Calculator
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.Calculator = (function () {
  'use strict';

  const Helper = window.ALUVE.Helper;

  /**
   * Subtotal for a single priced line (one aluminium component line, one
   * glass line, or the sealant line). Never trusts an invalid qty/price —
   * returns 0 rather than NaN so a bad line doesn't poison the whole total,
   * but validation.js is what actually blocks export on such a line.
   *
   * QA FIX: coerces via Helper.toNumber first — a real <input type="text">
   * field hands this function a STRING ("4.2"), and the previous version
   * silently treated any string as invalid and returned 0, breaking every
   * calculation the moment real form fields were wired up.
   * @param {number|string} unitPrice - harga_modal for this SKU
   * @param {number|string} qty
   * @returns {number}
   */
  function calcLineSubtotal(unitPrice, qty) {
    const safePrice = Number.isFinite(Helper.toNumber(unitPrice)) ? Helper.toNumber(unitPrice) : 0;
    const numericQty = Helper.toNumber(qty);
    const safeQty = Number.isFinite(numericQty) && numericQty > 0 ? numericQty : 0;
    return safePrice * safeQty;
  }

  /**
   * Sealant quantity auto-calculation — confirmed business formula
   * (previously an open question since Phase 1; confirmed by Anto):
   *
   *   sealant_qty = (total meter lari of every aluminium line in the
   *                  item — Kusen, Daun, Tiang Tengah, all of them) ÷ 7
   *
   * Only lines measured in running meter (`uom === 'meter_lari'`) count
   * toward the total — an m²-priced panel or a unit-priced accessory
   * isn't a "meter lari" quantity and would corrupt the sum if included.
   * The result is a QUANTITY, not a Rupiah amount — it's multiplied by
   * the fixed Rp 50.000 sealant unit price via the normal
   * calcLineSubtotal() path, so this never becomes a second, divergent
   * way of computing a subtotal.
   * @param {Array<{uom:string, qty:number|string}>} aluminiumLines
   * @returns {number}
   */
  function calcAutoSealantQty(aluminiumLines) {
    const totalMeterLari = (aluminiumLines || [])
      .filter(function (line) { return line.uom === 'meter_lari'; })
      .reduce(function (sum, line) {
        const qty = Helper.toNumber(line.qty);
        return sum + (Number.isFinite(qty) ? qty : 0);
      }, 0);
    return totalMeterLari / 7;
  }

  /**
   * Sums an array of lines, each shaped { unitPrice, qty }, recomputing
   * subtotal live rather than trusting a possibly-stale cached value.
   * @param {Array<{unitPrice:number, qty:number}>} lines
   * @returns {number}
   */
  function calcLinesTotal(lines) {
    if (!Array.isArray(lines)) return 0;
    return lines.reduce(function (sum, line) {
      return sum + calcLineSubtotal(line.unitPrice, line.qty);
    }, 0);
  }

  /**
   * Splits a discount value like "20+10" into its numeric parts. Also
   * accepts a plain number/numeric string ("20") as a single-part case,
   * so every existing caller keeps working unchanged.
   * @param {number|string} value
   * @returns {number[]}
   */
  function parseCompoundDiscountParts(value) {
    return String(value == null ? '' : value)
      .split('+')
      .map(function (part) { return Helper.toNumber(part); })
      .filter(function (n) { return Number.isFinite(n) && n > 0; });
  }

  /**
   * Computes the discount amount for a given base amount and discount rule.
   * QA FIX: coerces discount.value via Helper.toNumber (same string-input
   * issue as calcLineSubtotal), and rounds the result to the nearest whole
   * Rupiah — IDR has no sub-unit, so a discount of "Rp 183.887,5" reaching
   * an export/Excel file is a rounding artifact, not a real amount.
   *
   * Supports compound/successive discounts written as "20+10" (per
   * Anto's request): for percent-type, each part is applied in sequence
   * to what's LEFT after the previous part — 20% off, then 10% off the
   * remainder — not simply added as 30%. For nominal-type, "+" is a
   * plain sum (Rp 20.000 + Rp 10.000 = Rp 30.000 off).
   * @param {number} baseAmount
   * @param {{type: 'percent'|'nominal', value: number|string}} discount
   * @returns {number}
   */
  function calcDiscountAmount(baseAmount, discount) {
    if (!discount || !Number.isFinite(baseAmount) || baseAmount <= 0) return 0;
    const parts = parseCompoundDiscountParts(discount.value);
    if (!parts.length) return 0;

    if (discount.type === 'percent') {
      let remaining = baseAmount;
      parts.forEach(function (pct) {
        const safePct = Math.min(Math.max(pct, 0), 100);
        remaining -= remaining * (safePct / 100);
      });
      return Math.round(baseAmount - remaining);
    }
    if (discount.type === 'nominal') {
      const total = parts.reduce(function (sum, n) { return sum + n; }, 0);
      return Math.round(Math.min(Math.max(total, 0), baseAmount));
    }
    return 0;
  }

  /**
   * Computes the full breakdown for a single Item: aluminium/glass/sealant
   * subtotals, the pre-discount item subtotal, the discount amount, and
   * the final item total. This is the one function every part of the UI
   * (Item Card footer, Project Summary, Export) should call — never
   * re-derive these numbers independently.
   * @param {Object} item
   * @param {Array} item.aluminiumLines
   * @param {Array} item.glassLines
   * @param {{qty:number, unitPrice:number}} item.sealant
   * @param {{type:string, value:number}} [item.discount]
   * @returns {{aluminiumTotal:number, glassTotal:number, sealantTotal:number, subtotalBeforeDiscount:number, discountAmount:number, itemTotal:number}}
   */
  /**
   * @param {Object} item
   * @param {Array} item.aluminiumLines
   * @param {Array} item.glassLines
   * @param {Array} [item.otherLines] - "Lain-lain" lines (e.g. Ornamen)
   * @param {{unitPrice:number}} [item.sealant] - only unitPrice is read; qty is ALWAYS
   *   recomputed here via calcAutoSealantQty, never trusted from stored data — this
   *   guarantees the confirmed formula is enforced even for items saved before it existed.
   * @param {{type:string, value:number}} [item.discount]
   * @param {number} [item.qty] - how many identical units of this item (default 1)
   * @returns {{aluminiumTotal:number, glassTotal:number, otherTotal:number, sealantQty:number, sealantTotal:number, subtotalBeforeDiscount:number, discountAmount:number, qty:number, perUnitTotal:number, itemTotal:number}}
   */
  function calcItemTotals(item) {
    const aluminiumTotal = calcLinesTotal(item && item.aluminiumLines);
    const glassTotal = calcLinesTotal(item && item.glassLines);
    const otherTotal = calcLinesTotal(item && item.otherLines);

    const sealantUnitPrice = (item && item.sealant && item.sealant.unitPrice) || 50000;
    const sealantQty = calcAutoSealantQty(item && item.aluminiumLines);
    const sealantTotal = calcLineSubtotal(sealantUnitPrice, sealantQty);

    const subtotalBeforeDiscount = Math.round(aluminiumTotal + glassTotal + otherTotal + sealantTotal);
    const discountAmount = calcDiscountAmount(subtotalBeforeDiscount, item && item.discount);
    // perUnitTotal = cost of ONE unit of this item after its own item-level
    // discount. itemTotal multiplies that by qty — the item-level quantity
    // multiplier (per Anto's request), so a single Item row can represent
    // "5x identical Jendela Swing YN70" instead of needing 5 separate rows.
    const perUnitTotal = subtotalBeforeDiscount - discountAmount;
    const qty = Math.max(1, Math.round(Helper.toNumber(item && item.qty)) || 1);
    const itemTotal = perUnitTotal * qty;

    return {
      aluminiumTotal: aluminiumTotal,
      glassTotal: glassTotal,
      otherTotal: otherTotal,
      sealantQty: sealantQty,
      sealantTotal: sealantTotal,
      subtotalBeforeDiscount: subtotalBeforeDiscount,
      discountAmount: discountAmount,
      qty: qty,
      perUnitTotal: perUnitTotal,
      itemTotal: itemTotal
    };
  }

  /**
   * Computes the whole-project summary from a list of items plus an
   * optional project-level discount layered on top of the sum of item
   * totals. This is the single source of truth for the Project Summary
   * panel (desktop sidebar and mobile sticky bar alike).
   *
   * Also returns a category-level breakdown (Aluminium / Kaca /
   * Aksesoris) summed BEFORE any discount — Anto's internal-facing
   * "where is the money going" view (item #6). Aksesoris here combines
   * otherTotal (Lain-lain / Ornamen) and sealantTotal, matching how
   * Anto refers to them together in conversation; this breakdown is
   * intentionally never sent to the customer-facing PDF/print (per
   * Anto's earlier confirmation that cost breakdown stays internal).
   * @param {Array<Object>} items
   * @param {{type:string, value:number}} [projectDiscount]
   * @returns {{grandTotalNormal:number, itemLevelDiscountTotal:number, projectLevelDiscount:number, totalDiscount:number, grandTotalAfterDiscount:number, aluminiumSubtotal:number, glassSubtotal:number, accessorySubtotal:number}}
   */
  function calcProjectSummary(items, projectDiscount) {
    const safeItems = Array.isArray(items) ? items : [];

    let grandTotalNormal = 0;
    let itemLevelDiscountTotal = 0;
    let aluminiumSubtotal = 0;
    let glassSubtotal = 0;
    let accessorySubtotal = 0;

    safeItems.forEach(function (item) {
      const totals = calcItemTotals(item);
      // QA FIX: these previously summed the PER-UNIT figures without
      // multiplying by totals.qty, so any item with qty > 1 silently
      // under-counted the project's real total (introduced when the
      // item-level qty multiplier was added — itemTotal was correctly
      // scaled, but the running grandTotalNormal/itemLevelDiscountTotal
      // used in the sidebar, PDF, and dashboard pipeline value were not).
      grandTotalNormal += totals.subtotalBeforeDiscount * totals.qty;
      itemLevelDiscountTotal += totals.discountAmount * totals.qty;
      aluminiumSubtotal += totals.aluminiumTotal * totals.qty;
      glassSubtotal += totals.glassTotal * totals.qty;
      accessorySubtotal += (totals.otherTotal + totals.sealantTotal) * totals.qty;
    });

    const afterItemDiscounts = grandTotalNormal - itemLevelDiscountTotal;
    const projectLevelDiscount = calcDiscountAmount(afterItemDiscounts, projectDiscount);
    const totalDiscount = itemLevelDiscountTotal + projectLevelDiscount;
    const grandTotalAfterDiscount = grandTotalNormal - totalDiscount;

    return {
      grandTotalNormal: grandTotalNormal,
      itemLevelDiscountTotal: itemLevelDiscountTotal,
      projectLevelDiscount: projectLevelDiscount,
      totalDiscount: totalDiscount,
      grandTotalAfterDiscount: grandTotalAfterDiscount,
      aluminiumSubtotal: Math.round(aluminiumSubtotal),
      glassSubtotal: Math.round(glassSubtotal),
      accessorySubtotal: Math.round(accessorySubtotal)
    };
  }

  /**
   * Quick Mode calculation: a single combined line (one representative
   * qty × unit price for the whole opening) used when a rep needs a fast
   * ballpark figure without breaking the item into full component lines.
   * Deliberately reuses calcLineSubtotal so Quick Mode and Detail Mode
   * never drift into two different formulas for the same math.
   * @param {number} unitPrice
   * @param {number} qty
   * @returns {number}
   */
  function calcQuickModeTotal(unitPrice, qty) {
    return calcLineSubtotal(unitPrice, qty);
  }

  /**
   * Formats a discount rule into a display string — handles compound
   * values like "20+10" as "20% + 10%" instead of showing the raw
   * unparsed string.
   * @param {{type:string, value:number|string}} discount
   * @returns {string}
   */
  function formatDiscountLabel(discount) {
    if (!discount || !discount.value) return '';
    const parts = parseCompoundDiscountParts(discount.value);
    if (!parts.length) return '';
    if (discount.type === 'nominal') {
      return parts.map(function (n) { return Helper.formatCurrency(n); }).join(' + ');
    }
    return parts.map(function (n) { return n + '%'; }).join(' + ');
  }

  return {
    calcLineSubtotal: calcLineSubtotal,
    calcLinesTotal: calcLinesTotal,
    calcAutoSealantQty: calcAutoSealantQty,
    calcDiscountAmount: calcDiscountAmount,
    parseCompoundDiscountParts: parseCompoundDiscountParts,
    formatDiscountLabel: formatDiscountLabel,
    calcItemTotals: calcItemTotals,
    calcProjectSummary: calcProjectSummary,
    calcQuickModeTotal: calcQuickModeTotal
  };
})();
