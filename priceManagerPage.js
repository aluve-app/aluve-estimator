/**
 * priceManagerPage.js — renders the Price Manager table from the real
 * catalog (ALUVE.PriceManager) and wires inline price editing, category
 * filtering, the stale-price banner, and the "Add SKU" flow. The static
 * HTML from Phase 4 is replaced entirely with data-driven rows here.
 *
 * Public API: window.ALUVE.PriceManagerPage
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.PriceManagerPage = (function () {
  'use strict';

  const Helper = window.ALUVE.Helper;
  const PriceManager = window.ALUVE.PriceManager;
  const Storage = window.ALUVE.Storage;
  const Validation = window.ALUVE.Validation;
  const UiFeedback = window.ALUVE.UiFeedback;

  const UOM_LABELS = { meter_lari: "Meter Lari", m2: 'm²', unit: 'Unit', tube_estimated: 'Tube (estimasi)' };

  let dom = {};
  let activeCategoryFilter = null; // null = "ALUVE Recta" tier by default per category rail

  /**
   * Thin wrapper around UiFeedback.showToast — see settingsPage.js for
   * the rationale; kept consistent across both page modules.
   * @param {string} message
   * @param {'success'|'danger'|'info'} variant
   */
  function notify(message, variant) {
    UiFeedback.showToast(message, variant);
  }

  function cacheElements() {
    const page = document.getElementById('page-price-manager');
    dom = Object.assign({ page: page }, Helper.cacheElements(page, {
      rail: '[data-pm="rail"]',
      tableBody: '[data-pm="tableBody"]',
      staleBanner: '[data-pm="staleBanner"]',
      staleText: '[data-pm="staleText"]'
    }));
  }

  /** Builds the left category rail from whatever tiers/categories actually exist in the catalog. */
  function renderRail() {
    const catalog = PriceManager.getCatalog();
    const railItems = [];

    Object.keys(catalog.brand_tiers || {}).forEach(function (tierKey) {
      railItems.push({ key: tierKey, label: catalog.brand_tiers[tierKey].label, count: countTierItems(tierKey) });
    });
    // QA: 'Kaca' and 'Lain-lain' were previously hardcoded strings with no
    // way to rename them (per Anto's request #8) — now read from the
    // catalog with the original text as a fallback for older saved data.
    railItems.push({ key: 'glass', label: (catalog.glass && catalog.glass.label) || 'Kaca', count: (catalog.glass.items || []).length });
    railItems.push({ key: 'other-sealant', label: (catalog.other && catalog.other.label) || 'Lain-lain', count: (catalog.other.items || []).length + (catalog.sealant && catalog.sealant.id ? 1 : 0) });

    if (!activeCategoryFilter && railItems.length) activeCategoryFilter = railItems[0].key;

    dom.rail.innerHTML = railItems.map(function (r) {
      const activeClass = r.key === activeCategoryFilter ? ' is-active' : '';
      return '<div class="price-rail__item' + activeClass + '">' +
        '<a href="#" class="price-rail__link" data-rail-key="' + r.key + '">' +
          Helper.escapeHtml(r.label) + ' <span class="pill pill--muted">' + r.count + '</span>' +
        '</a>' +
        '<button type="button" class="icon-btn icon-btn--sm price-rail__rename" data-rail-rename="' + r.key + '" data-rail-label="' + Helper.escapeHtml(r.label) + '" aria-label="Ubah nama kategori" title="Ubah nama kategori">' +
          '<i class="bi bi-pencil"></i>' +
        '</button>' +
      '</div>';
    }).join('');

    Helper.qsa('[data-rail-key]', dom.rail).forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        activeCategoryFilter = link.dataset.railKey;
        renderRail();
        renderTable();
      });
    });

    Helper.qsa('[data-rail-rename]', dom.rail).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const key = btn.dataset.railRename;
        const currentLabel = btn.dataset.railLabel;
        const newLabel = window.prompt('Nama kategori:', currentLabel);
        if (newLabel === null) return; // cancelled
        const result = PriceManager.updateCategoryLabel(key, newLabel);
        if (!result.success) {
          notify(result.message, 'danger');
          return;
        }
        notify('Nama kategori berhasil diperbarui.', 'success');
        renderRail();
        renderTable();
      });
    });
  }

  function countTierItems(tierKey) {
    const catalog = PriceManager.getCatalog();
    const tier = catalog.brand_tiers[tierKey];
    return (tier.groups || []).reduce(function (sum, g) { return sum + (g.items || []).length; }, 0);
  }

  /** Returns the flat item list scoped to whichever rail category is active. */
  function getItemsForActiveCategory() {
    if (activeCategoryFilter === 'glass') return PriceManager.searchCatalog('', 'glass');
    if (activeCategoryFilter === 'other-sealant') {
      return PriceManager.searchCatalog('', 'other').concat(PriceManager.searchCatalog('', 'sealant'));
    }
    return PriceManager.getFlatItemList().filter(function (item) { return item.tierKey === activeCategoryFilter; });
  }

  /** Renders every row in the price table for the active category, plus the "Add SKU" row. */
  function renderTable() {
    const items = getItemsForActiveCategory().filter(function (item) { return item.isActive !== false; });

    const rowsHtml = items.map(function (item) {
      const stale = PriceManager.isStale(item);
      const dateClass = stale ? 'text-warning-emphasis' : 'text-muted';
      return (
        '<tr data-sku-id="' + item.id + '">' +
          '<td class="price-table__name" contenteditable="true" data-pm="nameCell">' + Helper.escapeHtml(item.name) + '</td>' +
          '<td><span class="pill pill--muted">' + (UOM_LABELS[item.uom] || item.uom) + '</span></td>' +
          '<td class="text-end price-table__price mono" contenteditable="true" data-pm="priceCell">' + Helper.formatCurrency(item.harga_modal) + '</td>' +
          '<td class="' + dateClass + '">' + Helper.formatDate(item.lastUpdated) + '</td>' +
          '<td class="text-center"><div class="form-check form-switch d-inline-block">' +
            '<input class="form-check-input" type="checkbox" checked data-pm="deprecateToggle" data-sku-id="' + item.id + '"></div></td>' +
        '</tr>'
      );
    }).join('');

    const addRowHtml =
      '<tr class="price-table__add-row"><td colspan="5">' +
        '<button class="btn-add-line" type="button" data-pm="addSkuBtn"><i class="bi bi-plus"></i> Tambah SKU Baru</button>' +
      '</td></tr>';

    dom.tableBody.innerHTML = rowsHtml + addRowHtml;
    bindRowEvents();
    renderStaleBanner(items); // reuse the list just computed above instead of re-flattening the catalog again
  }

  /** Attaches inline-edit, deactivate-toggle, and add-SKU handlers to the just-rendered rows. */
  /**
   * Forces a contenteditable cell's paste behavior down to plain text —
   * a contenteditable element renders pasted rich HTML as real, live DOM
   * (a pasted `<img onerror="...">` would execute immediately). Shared by
   * both the price cell and the name cell.
   * @param {HTMLElement} cell
   */
  function forcePlainTextPaste(cell) {
    cell.addEventListener('paste', function (e) {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  }

  function bindRowEvents() {
    Helper.qsa('[data-pm="priceCell"]', dom.tableBody).forEach(function (cell) {
      cell.addEventListener('blur', function () { commitPriceEdit(cell); });
      cell.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); cell.blur(); }
      });
      forcePlainTextPaste(cell);
    });

    Helper.qsa('[data-pm="nameCell"]', dom.tableBody).forEach(function (cell) {
      cell.addEventListener('blur', function () { commitNameEdit(cell); });
      cell.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); cell.blur(); }
      });
      forcePlainTextPaste(cell);
    });

    Helper.qsa('[data-pm="deprecateToggle"]', dom.tableBody).forEach(function (toggle) {
      toggle.addEventListener('change', function () {
        if (!toggle.checked) {
          PriceManager.deprecateSku(toggle.dataset.skuId);
          notify('SKU dinonaktifkan', 'success');
          renderRail();
          renderTable();
        }
      });
    });

    const addBtn = dom.tableBody.querySelector('[data-pm="addSkuBtn"]');
    if (addBtn) addBtn.addEventListener('click', openAddSkuPrompt);
  }

  /**
   * Commits an inline price edit on blur/Enter. Validates first (never
   * silently accepts a bad number), reverts the cell text on failure, and
   * shows a brief inline "Saved" flash on success rather than a full
   * page-level toast, so rapid sequential edits don't spam notifications.
   *
   * QA FIXES applied during the Phase 7 review:
   *  1. Previously re-read `item.harga_modal` from a copy fetched BEFORE
   *     the update — since PriceManager.getFlatItemList() returns cloned
   *     objects, that copy never reflected the new price, so the cell
   *     briefly displayed the OLD price even after a successful save.
   *     Now uses `parsed` (the value that was actually just saved).
   *  2. Previously called the full renderTable() immediately after
   *     flashSaved(), which replaces the row's innerHTML and destroys the
   *     flash element before its 1.5s fade ever became visible. Now
   *     updates only the affected row's "last updated" cell in place.
   * @param {HTMLElement} cell
   */
  function commitPriceEdit(cell) {
    const row = cell.closest('tr');
    const skuId = row.dataset.skuId;
    const item = PriceManager.getItemById(skuId);
    if (!item) return;

    const parsed = Helper.parseCurrencyInput(cell.textContent);

    if (!Validation.isValidPrice(parsed)) {
      cell.textContent = Helper.formatCurrency(item.harga_modal);
      notify('Harga harus berupa angka positif.', 'danger');
      return;
    }

    if (parsed === item.harga_modal) {
      cell.textContent = Helper.formatCurrency(item.harga_modal);
      return; // no actual change, nothing to save
    }

    const settings = Storage.getSettings();
    const result = PriceManager.updatePrice(skuId, parsed, settings.defaultSalesRep || 'Unknown');

    if (result.success) {
      cell.textContent = Helper.formatCurrency(parsed);
      flashSaved(cell);

      const dateCell = row.children[3];
      if (dateCell) {
        dateCell.textContent = Helper.formatDate(new Date());
        dateCell.classList.remove('text-warning-emphasis');
        dateCell.classList.add('text-muted');
      }
      renderStaleBanner();
    } else {
      cell.textContent = Helper.formatCurrency(item.harga_modal);
      notify(result.message, 'danger');
    }
  }

  /**
   * Commits an inline name edit on blur/Enter — same validate-then-save
   * pattern as commitPriceEdit, so a rep can fix a typo'd component name
   * without needing to deprecate and recreate the SKU.
   * @param {HTMLElement} cell
   */
  function commitNameEdit(cell) {
    const row = cell.closest('tr');
    const skuId = row.dataset.skuId;
    const item = PriceManager.getItemById(skuId);
    if (!item) return;

    const newName = cell.textContent.trim();

    if (!Validation.isNonEmptyString(newName)) {
      cell.textContent = item.name;
      notify('Nama tidak boleh kosong.', 'danger');
      return;
    }
    if (newName === item.name) {
      cell.textContent = item.name;
      return; // no actual change, nothing to save
    }

    const settings = Storage.getSettings();
    const result = PriceManager.updateName(skuId, newName, settings.defaultSalesRep || 'Unknown');

    if (result.success) {
      cell.textContent = newName;
      flashSaved(cell);
    } else {
      cell.textContent = item.name;
      notify(result.message, 'danger');
    }
  }

  /** Brief inline "Saved ✓" flash on a cell, per the Phase 3 interaction spec — not a page-level toast. */
  function flashSaved(cell) {
    const original = cell.textContent;
    const flash = document.createElement('span');
    flash.textContent = ' ✓';
    flash.style.color = 'var(--accent-success)';
    cell.appendChild(flash);
    setTimeout(function () {
      if (cell.contains(flash)) cell.removeChild(flash);
    }, 1500);
  }

  /**
   * Renders (or hides) the informational stale-price banner for the
   * active category.
   * @param {Array<Object>} [precomputedItems] - pass the list already
   *   computed by the caller (e.g. renderTable) to avoid re-flattening
   *   the whole catalog a second time in the same render pass; omit to
   *   have this function compute it itself (e.g. when called standalone
   *   from commitPriceEdit, which only touched one row).
   */
  function renderStaleBanner(precomputedItems) {
    const items = precomputedItems || getItemsForActiveCategory().filter(function (item) { return item.isActive !== false; });
    const staleItems = items.filter(function (item) { return PriceManager.isStale(item); });

    if (staleItems.length === 0) {
      dom.staleBanner.classList.add('d-none');
      return;
    }
    dom.staleBanner.classList.remove('d-none');
    dom.staleText.textContent = staleItems.length + ' harga belum ditinjau dalam ' +
      (Storage.getSettings().stalePriceThresholdDays || 90) + '+ hari terakhir.';
  }

  /**
   * Minimal "Add SKU" flow using window.prompt for now (a full modal form
   * belongs to the item.js/ui.js pass that builds proper form components
   * for every entity — this keeps Add SKU genuinely functional today
   * without duplicating that form-building work ahead of schedule).
   */
  function openAddSkuPrompt() {
    const name = window.prompt('Nama SKU baru:');
    if (!name) return;
    const priceRaw = window.prompt('Harga modal (Rp):');
    const price = Helper.parseCurrencyInput(priceRaw);
    if (!Validation.isValidPrice(price)) {
      notify('Harga tidak valid — SKU tidak ditambahkan.', 'danger');
      return;
    }

    const ALLOWED_UOM = ['meter_lari', 'm2', 'unit'];
    let uom = (window.prompt('Satuan (meter_lari / m2 / unit):', 'meter_lari') || '').trim();
    if (ALLOWED_UOM.indexOf(uom) === -1) {
      notify('Satuan tidak dikenali — menggunakan "unit" sebagai default.', 'info');
      uom = 'unit';
    }

    let category = 'other';
    let tierKey = null;
    let groupCode = null;

    if (activeCategoryFilter === 'glass') {
      category = 'glass';
    } else if (activeCategoryFilter !== 'other-sealant') {
      category = 'aluminium';
      tierKey = activeCategoryFilter;
      const catalog = PriceManager.getCatalog();
      const firstGroup = catalog.brand_tiers[tierKey] && catalog.brand_tiers[tierKey].groups[0];
      groupCode = firstGroup ? firstGroup.code : null;
    }

    const result = PriceManager.addSku({ category: category, tierKey: tierKey, groupCode: groupCode, name: name, harga_modal: price, uom: uom });
    notify(result.message, result.success ? 'success' : 'danger');
    if (result.success) { renderRail(); renderTable(); }
  }

  /** Entry point — call once during app bootstrap, after PriceManager.init(). */
  function init() {
    cacheElements();
    if (!dom.page) return;
    renderRail();
    renderTable();
  }

  return { init: init, renderTable: renderTable };
})();
