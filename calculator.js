/**
 * ============================================================
 * CALCULATOR.JS — port 1:1 dari calculator.js app Estimator lama
 * ============================================================
 * SEMUA rumus di sini SAMA PERSIS dengan app lama, supaya angka
 * yang keluar tidak pernah beda:
 *   - subtotal baris = harga_satuan x qty
 *   - Sealant per ITEM (bukan global): qty sealant = (total meter
 *     lari semua baris aluminium dalam 1 item) / 7, dikali harga
 *     satuan sealant (default Rp 50.000)
 *   - Grand Total = Aluminium + Kaca + Lain-lain + Sealant, per item
 *   - Diskon bisa bertingkat, contoh "20+10" (20% lalu 10% dari sisa)
 * ============================================================
 */
const Calculator = (function () {
  'use strict';

  function toNumber(v) {
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }

  function calcLineSubtotal(unitPrice, qty) {
    const safePrice = Number.isFinite(toNumber(unitPrice)) ? toNumber(unitPrice) : 0;
    const numericQty = toNumber(qty);
    const safeQty = Number.isFinite(numericQty) && numericQty > 0 ? numericQty : 0;
    return safePrice * safeQty;
  }

  function calcLinesTotal(lines) {
    if (!Array.isArray(lines)) return 0;
    return lines.reduce((sum, line) => sum + calcLineSubtotal(line.unit_price, line.qty), 0);
  }

  function calcAutoSealantQty(aluminiumLines) {
    const totalMeterLari = (aluminiumLines || [])
      .filter((line) => line.uom === 'meter_lari')
      .reduce((sum, line) => {
        const qty = toNumber(line.qty);
        return sum + (Number.isFinite(qty) ? qty : 0);
      }, 0);
    return totalMeterLari / 7;
  }

  function parseCompoundDiscountParts(value) {
    return String(value == null ? '' : value)
      .split('+')
      .map((part) => toNumber(part))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  function calcDiscountAmount(baseAmount, discount) {
    if (!discount || !Number.isFinite(baseAmount) || baseAmount <= 0) return 0;
    const parts = parseCompoundDiscountParts(discount.value);
    if (!parts.length) return 0;

    if (discount.type === 'percent') {
      let remaining = baseAmount;
      parts.forEach((pct) => {
        const safePct = Math.min(Math.max(pct, 0), 100);
        remaining -= remaining * (safePct / 100);
      });
      return Math.round(baseAmount - remaining);
    }
    if (discount.type === 'nominal') {
      const total = parts.reduce((sum, n) => sum + n, 0);
      return Math.round(Math.min(Math.max(total, 0), baseAmount));
    }
    return 0;
  }

  function calcItemTotals(item) {
    const aluminiumTotal = calcLinesTotal(item && item.aluminium_lines);
    const glassTotal = calcLinesTotal(item && item.glass_lines);
    const otherTotal = calcLinesTotal(item && item.other_lines);

    const sealantUnitPrice = (item && item.sealant_unit_price) || 50000;
    const sealantQty = calcAutoSealantQty(item && item.aluminium_lines);
    const sealantTotal = calcLineSubtotal(sealantUnitPrice, sealantQty);

    const subtotalBeforeDiscount = Math.round(aluminiumTotal + glassTotal + otherTotal + sealantTotal);
    const discountAmount = calcDiscountAmount(subtotalBeforeDiscount, item && item.discount);
    const perUnitTotal = subtotalBeforeDiscount - discountAmount;
    const qty = Math.max(1, Math.round(toNumber(item && item.qty)) || 1);
    const itemTotal = perUnitTotal * qty;

    return {
      aluminiumTotal, glassTotal, otherTotal,
      sealantQty, sealantTotal,
      subtotalBeforeDiscount, discountAmount,
      qty, perUnitTotal, itemTotal
    };
  }

  function calcProjectSummary(items, projectDiscount) {
    const safeItems = Array.isArray(items) ? items : [];

    let grandTotalNormal = 0;
    let itemLevelDiscountTotal = 0;
    let aluminiumSubtotal = 0;
    let glassSubtotal = 0;
    let accessorySubtotal = 0;

    safeItems.forEach((item) => {
      const totals = calcItemTotals(item);
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
      grandTotalNormal, itemLevelDiscountTotal, projectLevelDiscount, totalDiscount,
      grandTotalAfterDiscount,
      aluminiumSubtotal: Math.round(aluminiumSubtotal),
      glassSubtotal: Math.round(glassSubtotal),
      accessorySubtotal: Math.round(accessorySubtotal)
    };
  }

  function formatDiscountLabel(discount) {
    if (!discount || !discount.value) return '';
    const parts = parseCompoundDiscountParts(discount.value);
    if (!parts.length) return '';
    if (discount.type === 'nominal') return parts.map((n) => 'Rp ' + n.toLocaleString('id-ID')).join(' + ');
    return parts.map((n) => n + '%').join(' + ');
  }

  return {
    calcLineSubtotal, calcLinesTotal, calcAutoSealantQty, calcDiscountAmount,
    parseCompoundDiscountParts, formatDiscountLabel, calcItemTotals, calcProjectSummary
  };
})();
