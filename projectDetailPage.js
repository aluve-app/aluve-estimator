/**
 * projectDetailPage.js — wires the Project Detail screen (#page-project-detail)
 * to ALUVE.Project for real Item CRUD, and to ALUVE.ExportEngine for the
 * currently-open project instead of a fixed demo project.
 *
 * Item Editor design (confirmed business rules, this revision):
 *  - One Item = one Tier + one Series for ALL its aluminium lines. The
 *    Tier/Series selects lock (disable) the moment the first component
 *    line is added, and unlock again only if the list is emptied back out.
 *  - Multiple aluminium component lines per item (Kusen, Daun, Tiang
 *    Tengah, etc.) — added one at a time via "+ Tambah" into a running
 *    list, each removable.
 *  - "Lain-lain" (e.g. Ornamen) follows the same repeatable-line pattern,
 *    independent of Tier/Series.
 *  - Sealant is NEVER user-entered — it's a live, read-only preview
 *    computed from calculator.js's calcAutoSealantQty() as aluminium
 *    lines are added/removed, per the confirmed formula: (total meter
 *    lari of every aluminium line ÷ 7) × Rp 50.000.
 *
 * The Item Card itself, once an item is saved, renders a READ-ONLY
 * breakdown when expanded — clicking "Edit" reopens the modal pre-filled.
 *
 * Public API: window.ALUVE.ProjectDetailPage
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.ProjectDetailPage = (function () {
  'use strict';

  const Helper = window.ALUVE.Helper;
  const Calculator = window.ALUVE.Calculator;
  const Project = window.ALUVE.Project;
  const PriceManager = window.ALUVE.PriceManager;
  const UiFeedback = window.ALUVE.UiFeedback;
  const Validation = window.ALUVE.Validation;

  const UOM_LABELS = { meter_lari: "m'", m2: 'm²', unit: 'unit' };
  const SEALANT_UNIT_PRICE = 50000;

  let dom = {};
  let currentProjectId = null;
  let editingItemId = null; // null while adding a new item; set while editing an existing one
  let itemEditorDiscountType = 'percent';
  let projectDiscountType = 'percent';

  // In-memory state for the Item Editor modal while it's open — committed
  // to a real Item only when "Simpan Item" is clicked.
  let pendingAluminiumLines = []; // [{skuId, qty}]
  let pendingOtherLines = [];     // [{skuId, qty}]
  let pendingPhotoDataUrl = null;
  let lockedTierKey = null;
  let lockedSeriesCode = null;

  function notify(message, variant) {
    UiFeedback.showToast(message, variant);
  }

  function cacheElements() {
    const page = document.getElementById('page-project-detail');
    dom = Object.assign({ page: page }, Helper.cacheElements(page, {
      title: '#projectDetailTitle',
      editTitleBtn: '#projectDetailEditBtn',
      subtitle: '#projectDetailSubtitle',
      quotationNumberDisplay: '#projectDetailQuotationNumber',
      editQuotationBtn: '#projectDetailEditQuotationBtn',
      statusChip: '#projectDetailStatusChip',
      statusMenu: '#projectDetailStatusBtn',
      itemCardList: '#itemCardList',
      emptyState: '#itemListEmptyState',
      summarySubtotalAluminium: '#summarySubtotalAluminium',
      summarySubtotalKaca: '#summarySubtotalKaca',
      summarySubtotalAksesoris: '#summarySubtotalAksesoris',
      summaryNormal: '#summaryGrandTotalNormal',
      summaryDiscount: '#summaryTotalDiscount',
      summaryGrandTotal: '#summaryGrandTotalAfterDiscount',
      projectDiscountType: '#projectDiscountType',
      projectDiscountValue: '#projectDiscountValue',
      projectDiscountApplyBtn: '#projectDiscountApplyBtn',
      revisionBadge: '#projectDetailRevisionBadge',
      historyWrap: '#projectDetailHistoryWrap',
      historyBtn: '#projectDetailHistoryBtn',
      historyList: '#projectDetailHistoryList',
      createRevisionBtn: '#projectDetailCreateRevisionBtn',
      lockedBanner: '#projectDetailLockedBanner',
      layout: '#projectDetailLayout'
    }));

    dom.modalItemEditorEl = document.getElementById('modalItemEditor');
    dom.modalItemEditorLabel = document.getElementById('modalItemEditorLabel');
    dom.itemEditorLabel = document.getElementById('itemEditorLabel');
    dom.itemEditorWidth = document.getElementById('itemEditorWidth');
    dom.itemEditorHeight = document.getElementById('itemEditorHeight');
    dom.itemEditorPhoto = document.getElementById('itemEditorPhoto');
    dom.itemEditorPhotoPreview = document.getElementById('itemEditorPhotoPreview');
    dom.itemEditorQty = document.getElementById('itemEditorQty');

    dom.itemEditorTier = document.getElementById('itemEditorTier');
    dom.itemEditorSeries = document.getElementById('itemEditorSeries');
    dom.itemEditorComponent = document.getElementById('itemEditorComponent');
    dom.itemEditorAluQty = document.getElementById('itemEditorAluQty');
    dom.itemEditorAluUom = document.getElementById('itemEditorAluUom');
    dom.addAluminiumLineBtn = document.getElementById('addAluminiumLineBtn');
    dom.aluminiumLineList = document.getElementById('aluminiumLineList');

    dom.itemEditorGlass = document.getElementById('itemEditorGlass');
    dom.itemEditorGlassQty = document.getElementById('itemEditorGlassQty');

    dom.itemEditorOther = document.getElementById('itemEditorOther');
    dom.itemEditorOtherQty = document.getElementById('itemEditorOtherQty');
    dom.addOtherLineBtn = document.getElementById('addOtherLineBtn');
    dom.otherLineList = document.getElementById('otherLineList');

    dom.sealantAutoDisplay = document.getElementById('sealantAutoDisplay');

    dom.itemEditorDiscountType = document.getElementById('itemEditorDiscountType');
    dom.itemEditorDiscountValue = document.getElementById('itemEditorDiscountValue');
    dom.itemEditorNotes = document.getElementById('itemEditorNotes');
    dom.itemEditorSaveBtn = document.getElementById('itemEditorSaveBtn');

    dom.mobileSummaryGrandTotal = document.getElementById('mobileSummaryGrandTotal');
    dom.mobileSummaryNormal = document.getElementById('mobileSummaryNormal');
    dom.mobileSummaryDiscount = document.getElementById('mobileSummaryDiscount');
    dom.mobileSummaryGrandTotal2 = document.getElementById('mobileSummaryGrandTotal2');
  }

  /**
   * Opens a project in the Project Detail screen. Called by
   * dashboardPage.js when a project card is clicked, or right after a
   * new project is created.
   * @param {string} projectId
   */
  function open(projectId) {
    currentProjectId = projectId;
    render();
    window.ALUVE.Nav.showPage('project-detail');
  }

  function getCurrentProject() {
    return currentProjectId ? Project.getProject(currentProjectId) : null;
  }

  function getOpenProject() {
    return getCurrentProject();
  }

  const STATUS_LABELS = { draft: 'Draft', sent: 'Terkirim', won: 'Deal', lost: 'Batal' };
  const STATUS_CLASSES = { draft: 'status-chip--draft', sent: 'status-chip--sent', won: 'status-chip--won', lost: 'status-chip--lost' };

  /* ============================================================
     Project Detail rendering (item list + summary)
  ============================================================ */

  function render() {
    const project = getCurrentProject();
    if (!project) return;

    dom.title.textContent = project.clientName;
    const statusLabel = STATUS_LABELS[project.status] || project.status;
    const statusClass = STATUS_CLASSES[project.status] || 'status-chip--draft';
    dom.subtitle.innerHTML = Helper.escapeHtml(project.projectName) + ' &middot; ' +
      Helper.escapeHtml(project.location || '-') +
      (project.leadSource ? ' &middot; ' + Helper.escapeHtml(Helper.formatLeadSource(project)) : '') +
      ' &middot; <span class="status-chip ' + statusClass + '">' + statusLabel + '</span>';
    dom.quotationNumberDisplay.textContent = project.quotationNumber || 'Belum diisi';
    if (dom.statusChip) {
      dom.statusChip.textContent = statusLabel;
      dom.statusChip.className = 'status-chip ' + statusClass;
    }

    renderRevisionUi(project);
    renderItemList(project);
    renderSummary(project);
  }

  /**
   * FITUR REVISI: badge nomor revisi, banner + kunci tampilan kalau ini
   * revisi LAMA (isLocked), dan daftar dropdown "Riwayat Revisi" berisi
   * semua revisi dari quotation yang sama (bisa loncat lihat yang lain).
   */
  function renderRevisionUi(project) {
    const revisionNumber = project.revisionNumber || 1;
    const isLocked = !!project.isLocked;

    if (dom.revisionBadge) {
      dom.revisionBadge.innerHTML = ' &middot; <span class="revision-badge' + (isLocked ? ' revision-badge--locked' : '') + '">' +
        (isLocked ? '<i class="bi bi-lock-fill"></i> ' : '') + 'Revisi ' + revisionNumber + '</span>';
    }

    if (dom.lockedBanner) dom.lockedBanner.hidden = !isLocked;
    if (dom.layout) dom.layout.classList.toggle('est-locked-readonly', isLocked);
    if (dom.createRevisionBtn) dom.createRevisionBtn.hidden = isLocked;
    if (dom.statusChip && dom.statusChip.closest('.dropdown')) {
      dom.statusChip.closest('.dropdown').classList.toggle('est-locked-readonly', isLocked);
    }

    const history = Project.getRevisionHistory(project.projectId);
    if (dom.historyWrap) dom.historyWrap.hidden = history.length <= 1;
    if (dom.historyList) {
      dom.historyList.innerHTML = history.map(function (p) {
        const active = p.projectId === project.projectId ? ' active' : '';
        const lockIcon = p.isLocked ? '<i class="bi bi-lock-fill text-muted"></i> ' : '<i class="bi bi-pencil-fill text-primary"></i> ';
        return '<li><a class="dropdown-item' + active + '" href="#" data-open-revision="' + p.projectId + '">' +
          lockIcon + 'Revisi ' + (p.revisionNumber || 1) + (p.isLocked ? ' (Riwayat)' : ' (Aktif)') + '</a></li>';
      }).join('');
    }
  }

  function renderItemList(project) {
    if (project.items.length === 0) {
      dom.itemCardList.innerHTML = '';
      dom.emptyState.classList.remove('d-none');
      return;
    }
    dom.emptyState.classList.add('d-none');
    dom.itemCardList.innerHTML = project.items.map(renderItemCard).join('');
  }

  function renderItemCard(item) {
    const totals = Calculator.calcItemTotals(item);
    const lineCount = item.aluminiumLines.length + item.glassLines.length + (item.otherLines || []).length;
    const tierLabel = (item.aluminiumLines[0] && guessTierLabel(item.aluminiumLines[0].skuId)) || 'Custom';

    const breakdownRows = []
      .concat(item.aluminiumLines.map(lineRowHtml))
      .concat(item.glassLines.map(lineRowHtml))
      .concat((item.otherLines || []).map(lineRowHtml))
      .concat(totals.sealantQty > 0 ? [lineRowHtml({ skuName: 'Sealant (otomatis)', unitPrice: SEALANT_UNIT_PRICE, qty: Math.round(totals.sealantQty * 100) / 100, uom: 'unit' })] : [])
      .join('');

    const thumbHtml = item.photoDataUrl
      ? '<img src="' + item.photoDataUrl + '" alt="" class="item-card__thumb">'
      : '';

    return (
      '<article class="item-card" data-item-id="' + item.itemId + '">' +
        '<header class="item-card__header" data-toggle-item>' +
          '<span class="item-card__drag" aria-hidden="true"><i class="bi bi-grip-vertical"></i></span>' +
          thumbHtml +
          '<div class="item-card__heading">' +
            '<span class="item-card__label">' + Helper.escapeHtml(item.label) + '</span>' +
            '<span class="item-card__meta">' + Helper.escapeHtml(tierLabel) + ' &middot; ' + lineCount + ' baris' + (totals.qty > 1 ? ' &middot; Qty ' + totals.qty + 'x' : '') + '</span>' +
          '</div>' +
          '<span class="item-card__total">' + Helper.formatCurrency(totals.itemTotal) + '</span>' +
          '<div class="dropdown item-card__overflow">' +
            '<button class="icon-btn icon-btn--sm" type="button" data-bs-toggle="dropdown" aria-label="Menu item"><i class="bi bi-three-dots-vertical"></i></button>' +
            '<ul class="dropdown-menu dropdown-menu-end">' +
              '<li><a class="dropdown-item" href="#" data-action="edit-item" data-item-id="' + item.itemId + '"><i class="bi bi-pencil me-2"></i>Edit</a></li>' +
              '<li><a class="dropdown-item" href="#" data-action="duplicate-item" data-item-id="' + item.itemId + '"><i class="bi bi-copy me-2"></i>Duplikat</a></li>' +
              '<li><a class="dropdown-item dropdown-item--danger" href="#" data-action="delete-item" data-item-id="' + item.itemId + '"><i class="bi bi-trash3 me-2"></i>Hapus</a></li>' +
            '</ul>' +
          '</div>' +
          '<button class="icon-btn item-card__chevron" type="button" aria-label="Buka/tutup item" data-toggle-item><i class="bi bi-chevron-down"></i></button>' +
        '</header>' +
        '<div class="item-card__body">' +
          '<div class="item-card__summary">' + breakdownRows +
            (item.notes ? '<div class="print-doc__notes" style="margin:6px 0;">Catatan: ' + Helper.escapeHtml(item.notes) + '</div>' : '') +
            '<div class="item-card__summary-row"><span>Aluminium</span><span class="mono">' + Helper.formatCurrency(totals.aluminiumTotal) + '</span></div>' +
            '<div class="item-card__summary-row"><span>Kaca</span><span class="mono">' + Helper.formatCurrency(totals.glassTotal) + '</span></div>' +
            '<div class="item-card__summary-row"><span>Lain-lain</span><span class="mono">' + Helper.formatCurrency(totals.otherTotal) + '</span></div>' +
            '<div class="item-card__summary-row"><span>Sealant</span><span class="mono">' + Helper.formatCurrency(totals.sealantTotal) + '</span></div>' +
            (totals.discountAmount > 0 ? '<div class="item-card__summary-row"><span>Diskon</span><span class="mono">- ' + Helper.formatCurrency(totals.discountAmount) + '</span></div>' : '') +
            (totals.qty > 1 ? '<div class="item-card__summary-row"><span>Harga / Unit</span><span class="mono">' + Helper.formatCurrency(totals.perUnitTotal) + '</span></div>' +
              '<div class="item-card__summary-row"><span>Qty</span><span class="mono">' + totals.qty + ' unit</span></div>' : '') +
            '<div class="item-card__summary-row item-card__summary-row--total"><span>Total Item</span><span class="mono">' + Helper.formatCurrency(totals.itemTotal) + '</span></div>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function lineRowHtml(line) {
    return '<div class="component-line"><span class="component-line__name">' + Helper.escapeHtml(line.skuName) + '</span>' +
      '<div class="calc-mode-group"><span class="text-muted small">' + line.qty + ' ' + (UOM_LABELS[line.uom] || line.uom) + ' &times; ' + Helper.formatCurrency(line.unitPrice) + '</span>' +
      '<span class="component-line__subtotal">' + Helper.formatCurrency(Calculator.calcLineSubtotal(line.unitPrice, line.qty)) + '</span></div></div>';
  }

  function guessTierLabel(skuId) {
    const sku = PriceManager.getItemById(skuId);
    return sku ? sku.tierLabel : null;
  }

  function renderSummary(project) {
    const summary = Calculator.calcProjectSummary(project.items, project.projectDiscount);
    if (dom.summarySubtotalAluminium) dom.summarySubtotalAluminium.textContent = Helper.formatCurrency(summary.aluminiumSubtotal);
    if (dom.summarySubtotalKaca) dom.summarySubtotalKaca.textContent = Helper.formatCurrency(summary.glassSubtotal);
    if (dom.summarySubtotalAksesoris) dom.summarySubtotalAksesoris.textContent = Helper.formatCurrency(summary.accessorySubtotal);
    dom.summaryNormal.textContent = Helper.formatCurrency(summary.grandTotalNormal);
    dom.summaryDiscount.textContent = '- ' + Helper.formatCurrency(summary.totalDiscount);
    dom.summaryGrandTotal.textContent = Helper.formatCurrency(summary.grandTotalAfterDiscount);

    // Only sync the form's values when it's not the field the user is
    // actively typing in — avoids clobbering an in-progress edit every
    // time render() runs (e.g. right after adding/removing an item).
    if (dom.projectDiscountValue && document.activeElement !== dom.projectDiscountValue) {
      const discount = project.projectDiscount || { type: 'percent', value: 0 };
      projectDiscountType = discount.type === 'nominal' ? 'nominal' : 'percent';
      setProjectDiscountTypeButtons(projectDiscountType);
      dom.projectDiscountValue.value = discount.value || '';
    }

    if (dom.mobileSummaryGrandTotal) dom.mobileSummaryGrandTotal.textContent = Helper.formatCurrency(summary.grandTotalAfterDiscount);
    if (dom.mobileSummaryNormal) dom.mobileSummaryNormal.textContent = Helper.formatCurrency(summary.grandTotalNormal);
    if (dom.mobileSummaryDiscount) dom.mobileSummaryDiscount.textContent = '- ' + Helper.formatCurrency(summary.totalDiscount);
    if (dom.mobileSummaryGrandTotal2) dom.mobileSummaryGrandTotal2.textContent = Helper.formatCurrency(summary.grandTotalAfterDiscount);
  }

  /* ============================================================
     Item Editor modal — Tier/Series (locked per item) → repeatable
     Component lines, Glass, repeatable Lain-lain lines, auto Sealant.
  ============================================================ */

  function populateTierOptions() {
    const catalog = PriceManager.getCatalog();
    const options = ['<option value="">Pilih tier&hellip;</option>'];
    Object.keys(catalog.brand_tiers || {}).forEach(function (tierKey) {
      options.push('<option value="' + tierKey + '">' + Helper.escapeHtml(catalog.brand_tiers[tierKey].label) + '</option>');
    });
    dom.itemEditorTier.innerHTML = options.join('');
  }

  function populateSeriesOptions(tierKey) {
    if (!tierKey) {
      dom.itemEditorSeries.innerHTML = '<option value="">Pilih tier dulu&hellip;</option>';
      dom.itemEditorSeries.disabled = true;
      populateComponentOptions(null);
      return;
    }
    const catalog = PriceManager.getCatalog();
    const tier = catalog.brand_tiers[tierKey];
    const options = ['<option value="">Pilih series&hellip;</option>'].concat(
      (tier.groups || []).map(function (g) { return '<option value="' + g.code + '">' + Helper.escapeHtml(g.name) + '</option>'; })
    );
    dom.itemEditorSeries.innerHTML = options.join('');
    dom.itemEditorSeries.disabled = false;
    populateComponentOptions(null, tierKey);
  }

  function populateComponentOptions(seriesCode, tierKey) {
    if (!seriesCode) {
      dom.itemEditorComponent.innerHTML = '<option value="">Pilih series dulu&hellip;</option>';
      dom.itemEditorComponent.disabled = true;
      dom.addAluminiumLineBtn.disabled = true;
      return;
    }
    const catalog = PriceManager.getCatalog();
    const tier = catalog.brand_tiers[tierKey || dom.itemEditorTier.value];
    const group = tier && (tier.groups || []).find(function (g) { return g.code === seriesCode; });
    const items = (group && group.items || []).filter(function (i) { return i.isActive !== false; });

    dom.itemEditorComponent.innerHTML = ['<option value="">Pilih komponen&hellip;</option>'].concat(
      items.map(function (i) { return '<option value="' + i.id + '" data-uom="' + i.uom + '">' + Helper.escapeHtml(i.name) + ' — ' + Helper.formatCurrency(i.harga_modal) + '</option>'; })
    ).join('');
    dom.itemEditorComponent.disabled = false;
    dom.addAluminiumLineBtn.disabled = false;
  }

  function populateGlassOptions() {
    const glassItems = PriceManager.searchCatalog('', 'glass').filter(function (i) { return i.isActive !== false; });
    dom.itemEditorGlass.innerHTML = ['<option value="">Pilih kaca&hellip;</option>'].concat(
      glassItems.map(function (i) { return '<option value="' + i.id + '">' + Helper.escapeHtml(i.name) + ' — ' + Helper.formatCurrency(i.harga_modal) + '</option>'; })
    ).join('');
  }

  function populateOtherOptions() {
    const otherItems = PriceManager.searchCatalog('', 'other').filter(function (i) { return i.isActive !== false; });
    dom.itemEditorOther.innerHTML = ['<option value="">Pilih item&hellip;</option>'].concat(
      otherItems.map(function (i) { return '<option value="' + i.id + '">' + Helper.escapeHtml(i.name) + ' — ' + Helper.formatCurrency(i.harga_modal) + '</option>'; })
    ).join('');
  }

  /** Locks Tier/Series selects once the first aluminium line is added — enforces "one series per item". */
  function setTierSeriesLocked(locked) {
    dom.itemEditorTier.disabled = locked;
    dom.itemEditorSeries.disabled = locked || !dom.itemEditorTier.value;
  }

  /** Renders the running list of added aluminium component lines, each with a remove button. */
  function renderAluminiumLineList() {
    dom.aluminiumLineList.innerHTML = pendingAluminiumLines.map(function (line, index) {
      const sku = PriceManager.getItemById(line.skuId);
      const name = sku ? sku.name : 'Komponen';
      const uom = sku ? (UOM_LABELS[sku.uom] || sku.uom) : '';
      const price = sku ? sku.harga_modal : 0;
      return (
        '<div class="component-line">' +
          '<span class="component-line__name">' + Helper.escapeHtml(name) + '</span>' +
          '<div class="calc-mode-group">' +
            '<span class="text-muted small">' + line.qty + ' ' + uom + ' &times; ' + Helper.formatCurrency(price) + '</span>' +
            '<span class="component-line__subtotal">' + Helper.formatCurrency(Calculator.calcLineSubtotal(price, line.qty)) + '</span>' +
            '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-remove-alu-line="' + index + '" aria-label="Hapus baris"><i class="bi bi-x-lg"></i></button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    setTierSeriesLocked(pendingAluminiumLines.length > 0);
    updateSealantPreview();
  }

  function renderOtherLineList() {
    dom.otherLineList.innerHTML = pendingOtherLines.map(function (line, index) {
      const sku = PriceManager.getItemById(line.skuId);
      const name = sku ? sku.name : 'Item';
      const uom = sku ? (UOM_LABELS[sku.uom] || sku.uom) : '';
      const price = sku ? sku.harga_modal : 0;
      return (
        '<div class="component-line">' +
          '<span class="component-line__name">' + Helper.escapeHtml(name) + '</span>' +
          '<div class="calc-mode-group">' +
            '<span class="text-muted small">' + line.qty + ' ' + uom + ' &times; ' + Helper.formatCurrency(price) + '</span>' +
            '<span class="component-line__subtotal">' + Helper.formatCurrency(Calculator.calcLineSubtotal(price, line.qty)) + '</span>' +
            '<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-remove-other-line="' + index + '" aria-label="Hapus baris"><i class="bi bi-x-lg"></i></button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  /** Live preview of the auto-computed Sealant total, per the confirmed formula. */
  function updateSealantPreview() {
    const resolvedLines = pendingAluminiumLines.map(function (line) {
      const sku = PriceManager.getItemById(line.skuId);
      return { uom: sku ? sku.uom : null, qty: line.qty };
    });
    const sealantQty = Calculator.calcAutoSealantQty(resolvedLines);
    const sealantTotal = Calculator.calcLineSubtotal(SEALANT_UNIT_PRICE, sealantQty);
    const roundedQty = Math.round(sealantQty * 100) / 100;
    dom.sealantAutoDisplay.innerHTML = roundedQty + ' m&prime; &divide; 7 &times; Rp 50.000 = <strong>' + Helper.formatCurrency(sealantTotal) + '</strong>';
  }

  /** Reads and validates the selected item photo, storing it as a pending base64 data URL until Save. */
  function handleItemPhotoUpload() {
    const file = dom.itemEditorPhoto.files && dom.itemEditorPhoto.files[0];
    if (!file) return;

    // QA addition: photo now goes through the shared crop modal (Cropper.js)
    // before being resized/compressed — lets Anto pick exactly which part
    // of the photo to keep instead of always using the full frame.
    window.ALUVE.PhotoCropper.open(file, {
      maxWidth: 500,
      maxHeight: 500,
      quality: 0.75,
      onDone: function (dataUrl) {
        pendingPhotoDataUrl = dataUrl;
        dom.itemEditorPhotoPreview.src = dataUrl;
        dom.itemEditorPhotoPreview.classList.remove('d-none');
      }
    });
    dom.itemEditorPhoto.value = ''; // allow re-selecting the same file later
  }

  /** Resets the Item Editor modal to a blank "add new item" state. */
  function resetItemEditorForm() {
    editingItemId = null;
    lockedTierKey = null;
    lockedSeriesCode = null;
    pendingAluminiumLines = [];
    pendingOtherLines = [];

    dom.modalItemEditorLabel.textContent = 'Tambah Item';
    dom.itemEditorLabel.value = '';
    dom.itemEditorQty.value = '1';
    dom.itemEditorWidth.value = '';
    dom.itemEditorHeight.value = '';
    dom.itemEditorPhoto.value = '';
    dom.itemEditorPhotoPreview.classList.add('d-none');
    pendingPhotoDataUrl = null;

    populateTierOptions();
    populateSeriesOptions(null);
    setTierSeriesLocked(false);
    dom.itemEditorAluQty.value = '';
    dom.itemEditorAluUom.textContent = '';
    renderAluminiumLineList();

    populateGlassOptions();
    dom.itemEditorGlassQty.value = '';

    populateOtherOptions();
    dom.itemEditorOtherQty.value = '';
    renderOtherLineList();

    itemEditorDiscountType = 'percent';
    setDiscountTypeButtons('percent');
    dom.itemEditorDiscountValue.value = '';
    dom.itemEditorNotes.value = '';
  }

  /** Pre-fills the Item Editor modal from an already-saved item, for the "Edit" action. */
  function fillItemEditorForm(item) {
    editingItemId = item.itemId;
    dom.modalItemEditorLabel.textContent = 'Edit Item';
    dom.itemEditorLabel.value = item.label || '';
    dom.itemEditorQty.value = item.qty || 1;
    dom.itemEditorWidth.value = item.widthMm || '';
    dom.itemEditorHeight.value = item.heightMm || '';
    dom.itemEditorPhoto.value = '';
    pendingPhotoDataUrl = item.photoDataUrl || null;
    if (pendingPhotoDataUrl) {
      dom.itemEditorPhotoPreview.src = pendingPhotoDataUrl;
      dom.itemEditorPhotoPreview.classList.remove('d-none');
    } else {
      dom.itemEditorPhotoPreview.classList.add('d-none');
    }

    pendingAluminiumLines = item.aluminiumLines.map(function (l) { return { skuId: l.skuId, qty: l.qty }; });
    pendingOtherLines = (item.otherLines || []).map(function (l) { return { skuId: l.skuId, qty: l.qty }; });

    populateTierOptions();
    const firstSku = item.aluminiumLines[0] && PriceManager.getItemById(item.aluminiumLines[0].skuId);
    if (firstSku) {
      lockedTierKey = firstSku.tierKey;
      lockedSeriesCode = firstSku.groupCode;
      dom.itemEditorTier.value = lockedTierKey;
      populateSeriesOptions(lockedTierKey);
      dom.itemEditorSeries.value = lockedSeriesCode;
      populateComponentOptions(lockedSeriesCode, lockedTierKey);
    } else {
      populateSeriesOptions(null);
    }
    renderAluminiumLineList(); // also applies the lock via setTierSeriesLocked

    populateGlassOptions();
    const glassLine = item.glassLines[0];
    dom.itemEditorGlass.value = glassLine ? glassLine.skuId : '';
    dom.itemEditorGlassQty.value = glassLine ? glassLine.qty : '';

    populateOtherOptions();
    dom.itemEditorOtherQty.value = '';
    renderOtherLineList();

    itemEditorDiscountType = item.discount.type;
    setDiscountTypeButtons(item.discount.type);
    dom.itemEditorDiscountValue.value = item.discount.value || '';
    dom.itemEditorNotes.value = item.notes || '';
  }

  function setDiscountTypeButtons(type) {
    Helper.qsa('button', dom.itemEditorDiscountType).forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.value === type);
    });
  }

  function setProjectDiscountTypeButtons(type) {
    if (!dom.projectDiscountType) return;
    Helper.qsa('button', dom.projectDiscountType).forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.value === type);
    });
  }

  /** Adds the currently-selected component + qty into the pending aluminium line list. */
  function handleAddAluminiumLine() {
    const skuId = dom.itemEditorComponent.value;
    const qty = Helper.toNumber(dom.itemEditorAluQty.value);

    if (!skuId) { notify('Pilih komponen terlebih dahulu.', 'danger'); return; }
    if (!Number.isFinite(qty) || qty <= 0) { notify('Kuantitas harus lebih besar dari 0.', 'danger'); return; }

    if (pendingAluminiumLines.length === 0) {
      lockedTierKey = dom.itemEditorTier.value;
      lockedSeriesCode = dom.itemEditorSeries.value;
    }

    pendingAluminiumLines.push({ skuId: skuId, qty: qty });
    dom.itemEditorAluQty.value = '';
    renderAluminiumLineList();
  }

  function handleAddOtherLine() {
    const skuId = dom.itemEditorOther.value;
    const qty = Helper.toNumber(dom.itemEditorOtherQty.value);

    if (!skuId) { notify('Pilih item Lain-lain terlebih dahulu.', 'danger'); return; }
    if (!Number.isFinite(qty) || qty <= 0) { notify('Kuantitas harus lebih besar dari 0.', 'danger'); return; }

    pendingOtherLines.push({ skuId: skuId, qty: qty });
    dom.itemEditorOtherQty.value = '';
    renderOtherLineList();
  }

  function handleSaveItem() {
    const project = getCurrentProject();
    if (!project) return;

    const input = {
      label: dom.itemEditorLabel.value,
      tierKey: lockedTierKey,
      seriesCode: lockedSeriesCode,
      qty: dom.itemEditorQty.value,
      widthMm: dom.itemEditorWidth.value,
      heightMm: dom.itemEditorHeight.value,
      photoDataUrl: pendingPhotoDataUrl,
      aluminiumSelections: pendingAluminiumLines.slice(),
      glassSkuId: dom.itemEditorGlass.value,
      glassQty: dom.itemEditorGlassQty.value,
      otherSelections: pendingOtherLines.slice(),
      discountType: itemEditorDiscountType,
      discountValue: dom.itemEditorDiscountValue.value,
      notes: dom.itemEditorNotes.value
    };

    const result = editingItemId
      ? Project.updateItem(project.projectId, editingItemId, input)
      : Project.addItem(project.projectId, input);

    if (!result.success) {
      notify(result.message, 'danger');
      return;
    }

    notify(editingItemId ? 'Item berhasil diperbarui' : 'Item berhasil ditambahkan', 'success');
    render();

    const modalInstance = window.bootstrap.Modal.getInstance(dom.modalItemEditorEl);
    if (modalInstance) modalInstance.hide();
  }

  /* ----------------------------------------------------------
     Item list actions: edit / duplicate / delete
  ---------------------------------------------------------- */
  function bindItemListActions() {
    dom.itemCardList.addEventListener('click', function (event) {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      event.preventDefault();

      const action = target.dataset.action;
      const itemId = target.dataset.itemId;
      const project = getCurrentProject();
      if (!project) return;

      if (action === 'edit-item') {
        const item = project.items.find(function (i) { return i.itemId === itemId; });
        if (item) {
          fillItemEditorForm(item);
          new window.bootstrap.Modal(dom.modalItemEditorEl).show();
        }
      } else if (action === 'duplicate-item') {
        const result = Project.duplicateItem(project.projectId, itemId);
        notify(result.message, result.success ? 'success' : 'danger');
        if (result.success) render();
      } else if (action === 'delete-item') {
        const item = project.items.find(function (i) { return i.itemId === itemId; });
        const confirmed = window.confirm('Hapus item "' + (item ? item.label : 'ini') + '"? Tindakan ini tidak bisa dibatalkan.');
        if (!confirmed) return;
        const result = Project.deleteItem(project.projectId, itemId);
        notify(result.message, result.success ? 'success' : 'danger');
        if (result.success) render();
      }
    });
  }

  function bindProjectDiscountForm() {
    if (!dom.projectDiscountType || !dom.projectDiscountApplyBtn) return;

    Helper.qsa('button', dom.projectDiscountType).forEach(function (btn) {
      btn.addEventListener('click', function () {
        projectDiscountType = btn.dataset.value;
        setProjectDiscountTypeButtons(projectDiscountType);
      });
    });

    function applyDiscount() {
      const project = getCurrentProject();
      if (!project) return;
      // QA FIX: was Helper.toNumber(...), which mangled a compound value
      // like "20+10" down to just 20. Keep the raw text; validation and
      // calcDiscountAmount both understand the "+"-separated format.
      const rawValue = dom.projectDiscountValue.value.trim();
      const discount = { type: projectDiscountType, value: rawValue };
      const check = Validation.validateDiscount(discount, Calculator.calcProjectSummary(project.items, null).grandTotalNormal);
      if (!check.valid) {
        notify(check.message, 'danger');
        return;
      }
      const result = Project.updateProjectMeta(project.projectId, { projectDiscount: discount });
      if (!result.success) {
        notify(result.message, 'danger');
        return;
      }
      render();
      notify('Diskon project diterapkan.', 'success');
    }

    dom.projectDiscountApplyBtn.addEventListener('click', applyDiscount);
    dom.projectDiscountValue.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); applyDiscount(); }
    });
  }

  function bindItemEditorEvents() {
    dom.itemEditorTier.addEventListener('change', function () {
      populateSeriesOptions(dom.itemEditorTier.value);
    });
    dom.itemEditorSeries.addEventListener('change', function () {
      populateComponentOptions(dom.itemEditorSeries.value);
    });
    dom.itemEditorComponent.addEventListener('change', function () {
      const selected = dom.itemEditorComponent.options[dom.itemEditorComponent.selectedIndex];
      const uom = selected ? selected.dataset.uom : '';
      dom.itemEditorAluUom.textContent = uom ? ('(' + (UOM_LABELS[uom] || uom) + ')') : '';
    });
    dom.addAluminiumLineBtn.addEventListener('click', handleAddAluminiumLine);
    dom.addOtherLineBtn.addEventListener('click', handleAddOtherLine);
    dom.itemEditorPhoto.addEventListener('change', handleItemPhotoUpload);

    dom.aluminiumLineList.addEventListener('click', function (event) {
      const btn = event.target.closest('[data-remove-alu-line]');
      if (!btn) return;
      pendingAluminiumLines.splice(Number(btn.dataset.removeAluLine), 1);
      renderAluminiumLineList();
    });
    dom.otherLineList.addEventListener('click', function (event) {
      const btn = event.target.closest('[data-remove-other-line]');
      if (!btn) return;
      pendingOtherLines.splice(Number(btn.dataset.removeOtherLine), 1);
      renderOtherLineList();
    });

    Helper.qsa('button', dom.itemEditorDiscountType).forEach(function (btn) {
      btn.addEventListener('click', function () {
        itemEditorDiscountType = btn.dataset.value;
        setDiscountTypeButtons(itemEditorDiscountType);
      });
    });

    dom.itemEditorSaveBtn.addEventListener('click', handleSaveItem);

    document.getElementById('addItemBtn').addEventListener('click', resetItemEditorForm);

    dom.editQuotationBtn.addEventListener('click', function () {
      const project = getCurrentProject();
      if (!project) return;
      const input = window.prompt('Nomor Quotation:', project.quotationNumber || '');
      if (input === null) return; // cancelled
      if (!input.trim()) {
        notify('Nomor Quotation tidak boleh kosong.', 'danger');
        return;
      }
      Project.updateProjectMeta(project.projectId, { quotationNumber: input.trim() });
      render();
      notify('Nomor Quotation berhasil diperbarui.', 'success');
    });

    dom.editTitleBtn.addEventListener('click', function () {
      const project = getCurrentProject();
      if (!project) return;
      // QA FIX: previously only let Anto rename the client name via a bare
      // window.prompt(); now reuses the same modal as "Project Baru" (in
      // edit mode) so every field — quotation no., tanggal, nama project,
      // lokasi, no. telepon, sales rep — can be edited, not just the name.
      window.ALUVE.DashboardPage.openEditProjectModal(project);
    });

    // Deal Won / follow-up status dropdown in the header — feeds straight
    // into Dashboard's activeCount/wonCount stats via project.status.
    Helper.qsa('[data-set-status]', dom.page).forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        const project = getCurrentProject();
        if (!project) return;
        const result = Project.setProjectStatus(project.projectId, link.dataset.setStatus);
        if (!result.success) {
          notify(result.message, 'danger');
          return;
        }
        render();
        notify('Status project diperbarui.', 'success');
      });
    });
  }

  function bindRevisionActions() {
    if (dom.createRevisionBtn) {
      dom.createRevisionBtn.addEventListener('click', async function () {
        const project = getCurrentProject();
        if (!project) return;
        const confirmed = window.confirm('Buat revisi baru dari quotation ini? Revisi sekarang akan DIKUNCI jadi riwayat (tidak bisa diedit lagi), dan Anda akan lanjut kerja di revisi baru.');
        if (!confirmed) return;

        dom.createRevisionBtn.disabled = true;
        const result = await Project.createRevision(project.projectId);
        dom.createRevisionBtn.disabled = false;

        if (!result.success) { notify(result.message, 'danger'); return; }
        notify(result.message, 'success');
        if (window.ALUVE.DashboardPage) window.ALUVE.DashboardPage.renderAll();
        open(result.data.project_id);
      });
    }

    if (dom.historyList) {
      dom.historyList.addEventListener('click', function (event) {
        const link = event.target.closest('[data-open-revision]');
        if (!link) return;
        event.preventDefault();
        open(link.dataset.openRevision);
      });
    }
  }

  function init() {
    cacheElements();
    if (!dom.page) return;
    bindItemListActions();
    bindItemEditorEvents();
    bindProjectDiscountForm();
    bindRevisionActions();
  }

  return {
    init: init,
    open: open,
    getOpenProject: getOpenProject
  };
})();
