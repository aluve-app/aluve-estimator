/**
 * project.js — Project and Item management. This is the module every
 * previous phase's temporary demoBootstrap.js was standing in for.
 *
 * Like calculator.js and validation.js, the functions here operate on
 * plain data and Storage — no DOM access — so they're independently
 * testable with a plain Node harness (see the Phase 9 test suite).
 * PriceManager is used only to *enrich* a line from a chosen SKU id;
 * this module still never computes a price itself — that's
 * Calculator's job, always called on demand, never cached into a
 * project object as a stale derived value.
 *
 * Public API: window.ALUVE.Project
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.Project = (function () {
  'use strict';

  const Helper = window.ALUVE.Helper;
  const Storage = window.ALUVE.Storage;
  const Validation = window.ALUVE.Validation;
  const PriceManager = window.ALUVE.PriceManager;

  const VALID_STATUSES = ['draft', 'sent', 'won', 'lost'];

  /* ----------------------------------------------------------
     Projects
  ---------------------------------------------------------- */

  /**
   * Creates a new, empty Project and persists it immediately (an empty
   * project is a valid draft state — validation only blocks *export*,
   * per Phase 1 §20, not creation).
   * @param {{clientName:string, projectName?:string, location?:string, salesRep?:string}} meta
   * @returns {{success:boolean, message:string, project?:Object}}
   */
  /**
   * @param {{clientName:string, projectName?:string, location?:string, salesRep?:string, customerPhone?:string}} meta
   * @returns {{success:boolean, message:string, project?:Object}}
   */
  /**
   * @param {{clientName:string, quotationNumber:string, projectName?:string, location?:string, salesRep?:string, customerPhone?:string}} meta
   * @returns {{success:boolean, message:string, project?:Object}}
   */
  function createProject(meta) {
    const metaCheck = Validation.validateProjectMeta(meta);
    if (!metaCheck.valid) {
      return { success: false, message: metaCheck.message };
    }
    if (!Validation.isNonEmptyString(meta.quotationNumber)) {
      return { success: false, message: 'Nomor Quotation wajib diisi.' };
    }

    const settings = Storage.getSettings();
    const project = {
      projectId: Helper.generateId('project'),
      quotationNumber: meta.quotationNumber.trim(),
      projectDate: (meta.projectDate && meta.projectDate.trim()) || new Date().toISOString().slice(0, 10),
      clientName: meta.clientName.trim(),
      projectName: (meta.projectName && meta.projectName.trim()) || ('Untitled — ' + meta.clientName.trim()),
      location: (meta.location || '').trim(),
      customerPhone: (meta.customerPhone || '').trim(),
      salesRep: (meta.salesRep || settings.defaultSalesRep || '').trim(),
      leadSource: meta.leadSource || '',
      leadSourceOther: (meta.leadSourceOther || '').trim(),
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [],
      projectDiscount: { type: 'percent', value: 0 }
    };

    const saved = Storage.saveProject(project);
    if (!saved) {
      return { success: false, message: 'Gagal menyimpan project — penyimpanan lokal penuh atau tidak tersedia.' };
    }
    return { success: true, message: 'Project berhasil dibuat.', project: project };
  }

  /** @returns {Array<Object>} every saved project, most-recently-updated first */
  function getAllProjects() {
    return Storage.getProjects();
  }

  /** @param {string} projectId @returns {Object|null} */
  function getProject(projectId) {
    return Storage.getProject(projectId);
  }

  /**
   * Case-insensitive search over client name and project name — powers
   * the Dashboard/Project List search box.
   * @param {string} query
   * @returns {Array<Object>}
   */
  function searchProjects(query) {
    const needle = (query || '').trim().toLowerCase();
    const all = getAllProjects();
    if (!needle) return all;
    return all.filter(function (p) {
      return (p.clientName || '').toLowerCase().indexOf(needle) !== -1
        || (p.projectName || '').toLowerCase().indexOf(needle) !== -1;
    });
  }

  /**
   * Updates a project's metadata fields (client/project name, location,
   * sales rep) without touching its items.
   * @param {string} projectId
   * @param {Object} updates
   * @returns {{success:boolean, message:string}}
   */
  function updateProjectMeta(projectId, updates) {
    const project = getProject(projectId);
    if (!project) return { success: false, message: 'Project tidak ditemukan.' };

    const merged = Object.assign({}, project, updates);
    const metaCheck = Validation.validateProjectMeta(merged);
    if (!metaCheck.valid) return { success: false, message: metaCheck.message };

    Object.assign(project, updates);
    const saved = Storage.saveProject(project);
    return saved
      ? { success: true, message: 'Project berhasil diperbarui.' }
      : { success: false, message: 'Gagal menyimpan perubahan.' };
  }

  /**
   * Sets a project's sales-pipeline status. Rejects anything outside the
   * known set rather than silently accepting a typo'd status string that
   * would then never match any status-chip styling.
   * @param {string} projectId
   * @param {'draft'|'sent'|'won'|'lost'} status
   * @returns {{success:boolean, message:string}}
   */
  function setProjectStatus(projectId, status) {
    if (VALID_STATUSES.indexOf(status) === -1) {
      return { success: false, message: 'Status tidak dikenali: ' + status };
    }
    const project = getProject(projectId);
    if (!project) return { success: false, message: 'Project tidak ditemukan.' };

    project.status = status;
    Storage.saveProject(project);

    // PATCH INTEGRASI SALES APP: kalau quotation ini otomatis dibuat dari
    // Sales App (project._salesProjectId ada, diisi bootstrap.js) dan
    // statusnya baru saja diubah jadi 'sent', beri tahu Sales App supaya
    // Pipeline Stage project itu otomatis update jadi "Penawaran Siap" —
    // SEKALIAN kirim Grand Total (setelah diskon) supaya field "Nilai
    // Estimasi Project" di Sales App otomatis terisi angka yang benar,
    // tidak perlu sales ketik manual lagi.
    if (status === 'sent' && project._salesProjectId && window.EstApi) {
      const summary = window.ALUVE.Calculator.calcProjectSummary(project.items, project.projectDiscount);
      window.EstApi.call('notifySalesQuotationSent', {
        project_id: project.projectId,
        estimated_value: summary.grandTotalAfterDiscount
      }).then(function (result) {
        if (result && result.success && window.ALUVE.UiFeedback) {
          window.ALUVE.UiFeedback.showToast('Sales App sudah diberi tahu quotation ini terkirim.', 'success');
        }
      });
    }

    return { success: true, message: 'Status diperbarui.' };
  }

  /** @param {string} projectId @returns {{success:boolean, message:string}} */
  function deleteProject(projectId) {
    const deleted = Storage.deleteProject(projectId);
    return deleted
      ? { success: true, message: 'Project berhasil dihapus.' }
      : { success: false, message: 'Gagal menghapus project.' };
  }

  /**
   * Duplicates an entire project — metadata and every item, each item
   * getting a fresh itemId so edits to the copy never touch the
   * original. Used for the Dashboard/Project List "Duplicate" action.
   * @param {string} projectId
   * @returns {{success:boolean, message:string, project?:Object}}
   */
  function duplicateProject(projectId) {
    const original = getProject(projectId);
    if (!original) return { success: false, message: 'Project tidak ditemukan.' };

    const copy = Helper.deepClone(original);
    copy.projectId = Helper.generateId('project');
    copy.projectName = (copy.projectName || '') + ' (copy)';
    copy.status = 'draft';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = new Date().toISOString();
    copy.items = copy.items.map(function (item) {
      item.itemId = Helper.generateId('item');
      return item;
    });

    const saved = Storage.saveProject(copy);
    return saved
      ? { success: true, message: 'Project berhasil diduplikat.', project: copy }
      : { success: false, message: 'Gagal menduplikat project.' };
  }

  /* ----------------------------------------------------------
     Items
  ---------------------------------------------------------- */

  /**
   * Builds a priced line from a chosen catalog SKU + quantity. This is
   * the one place a SKU id becomes a concrete, immutable price snapshot
   * — the unitPrice is copied in at this moment and never re-read live
   * from the catalog afterward, so a later Price Manager edit can never
   * silently change what an already-quoted project shows (see the
   * Architecture doc's note on price immutability-after-save).
   * @param {string} skuId
   * @param {number|string} qty
   * @returns {{skuId:string, skuName:string, unitPrice:number, qty:number, uom:string}|null} null if the SKU doesn't exist
   */
  function buildLineFromSku(skuId, qty) {
    const sku = PriceManager.getItemById(skuId);
    if (!sku) return null;
    return {
      skuId: sku.id,
      skuName: sku.name,
      unitPrice: sku.harga_modal,
      qty: Helper.toNumber(qty),
      uom: sku.uom
    };
  }

  /**
   * Assembles a full Item object from the Item Editor's input shape.
   *
   * Confirmed business rules (previously open questions, now resolved):
   *  - One item = one Tier + one Series for ALL its aluminium component
   *    lines (Kusen, Daun, Tiang Tengah, etc. all share the same series —
   *    confirmed: a single physical opening is always one product line).
   *  - Sealant is auto-computed (see calculator.js's calcAutoSealantQty),
   *    never taken from user input — any sealantQty-like field in older
   *    call sites is simply ignored now.
   *
   * @param {{label:string, tierKey:string, seriesCode:string, aluminiumSelections:Array<{skuId:string, qty:number|string}>, glassSkuId:string, glassQty:number|string, otherSelections:Array<{skuId:string, qty:number|string}>, discountType:string, discountValue:number|string, notes:string}} input
   * @returns {{success:boolean, message:string, item?:Object}}
   */
  function buildItemFromInput(input) {
    const aluminiumLines = (input.aluminiumSelections || [])
      .filter(function (sel) { return sel.skuId && Helper.toNumber(sel.qty) > 0; })
      .map(function (sel) { return buildLineFromSku(sel.skuId, sel.qty); })
      .filter(Boolean);

    const glassLines = [];
    if (input.glassSkuId && Helper.toNumber(input.glassQty) > 0) {
      const line = buildLineFromSku(input.glassSkuId, input.glassQty);
      if (line) glassLines.push(line);
    }

    const otherLines = (input.otherSelections || [])
      .filter(function (sel) { return sel.skuId && Helper.toNumber(sel.qty) > 0; })
      .map(function (sel) { return buildLineFromSku(sel.skuId, sel.qty); })
      .filter(Boolean);

    const draftItem = {
      itemId: Helper.generateId('item'),
      label: (input.label || '').trim(),
      tierKey: input.tierKey || null,
      seriesCode: input.seriesCode || null,
      // Display-only dimensions (confirmed by Anto: informational, do NOT
      // feed into any calculation — the existing meter-lari/m² model is
      // already correct and stays authoritative for pricing).
      widthMm: input.widthMm ? Helper.toNumber(input.widthMm) : null,
      heightMm: input.heightMm ? Helper.toNumber(input.heightMm) : null,
      photoDataUrl: input.photoDataUrl || null,
      // Item-level quantity multiplier — how many identical units of this
      // exact item (same BOM/spec) the customer wants. Defaults to 1;
      // Calculator.calcItemTotals() multiplies the per-unit total by this.
      qty: Math.max(1, Math.round(Helper.toNumber(input.qty)) || 1),
      aluminiumLines: aluminiumLines,
      glassLines: glassLines,
      otherLines: otherLines,
      // qty is intentionally NOT taken from input — always auto-derived
      // from aluminiumLines at calculation time (calculator.js). Storing
      // unitPrice here only for display; Calculator recomputes qty fresh
      // every time regardless of what's saved, so this can never go stale.
      sealant: { unitPrice: 50000, qty: 0 },
      // QA FIX: was Helper.toNumber(input.discountValue) || 0, which
      // mangled a compound value like "20+10" down to just 20. Keep the
      // raw text — Validation and Calculator both understand "+".
      discount: { type: input.discountType || 'percent', value: (input.discountValue == null ? '' : String(input.discountValue).trim()) || 0 },
      notes: (input.notes || '').trim()
    };

    const linesCheck = Validation.validateItemHasLines(draftItem);
    if (!linesCheck.valid) {
      return { success: false, message: linesCheck.message };
    }

    if (!draftItem.label) {
      draftItem.label = (aluminiumLines[0] && aluminiumLines[0].skuName) || (glassLines[0] && glassLines[0].skuName) || (otherLines[0] && otherLines[0].skuName) || 'Item';
    }

    return { success: true, message: '', item: draftItem };
  }

  /**
   * Adds a new Item to a project.
   * @param {string} projectId
   * @param {Object} itemInput - see buildItemFromInput
   * @returns {{success:boolean, message:string, item?:Object}}
   */
  function addItem(projectId, itemInput) {
    const project = getProject(projectId);
    if (!project) return { success: false, message: 'Project tidak ditemukan.' };

    const built = buildItemFromInput(itemInput);
    if (!built.success) return built;

    project.items.push(built.item);
    const saved = Storage.saveProject(project);
    return saved
      ? { success: true, message: 'Item berhasil ditambahkan.', item: built.item }
      : { success: false, message: 'Gagal menyimpan item.' };
  }

  /**
   * Replaces an existing Item's content (used when the Item Editor is
   * reopened on an already-saved item).
   * @param {string} projectId
   * @param {string} itemId
   * @param {Object} itemInput
   * @returns {{success:boolean, message:string}}
   */
  function updateItem(projectId, itemId, itemInput) {
    const project = getProject(projectId);
    if (!project) return { success: false, message: 'Project tidak ditemukan.' };

    const index = project.items.findIndex(function (i) { return i.itemId === itemId; });
    if (index === -1) return { success: false, message: 'Item tidak ditemukan.' };

    const built = buildItemFromInput(itemInput);
    if (!built.success) return built;

    built.item.itemId = itemId; // preserve identity — this is an edit, not a new item
    project.items[index] = built.item;

    const saved = Storage.saveProject(project);
    return saved
      ? { success: true, message: 'Item berhasil diperbarui.' }
      : { success: false, message: 'Gagal menyimpan perubahan.' };
  }

  /**
   * @param {string} projectId
   * @param {string} itemId
   * @returns {{success:boolean, message:string}}
   */
  function deleteItem(projectId, itemId) {
    const project = getProject(projectId);
    if (!project) return { success: false, message: 'Project tidak ditemukan.' };

    const before = project.items.length;
    project.items = project.items.filter(function (i) { return i.itemId !== itemId; });
    if (project.items.length === before) return { success: false, message: 'Item tidak ditemukan.' };

    Storage.saveProject(project);
    return { success: true, message: 'Item berhasil dihapus.' };
  }

  /**
   * Duplicates a single item within the same project — the direct fix
   * for the Pak Syarudin-style "60 identical units" workflow flagged in
   * the Phase 8 Product Review (bulk multiplier is still a Roadmap v2.0
   * item; single-duplicate is the V1 mechanism).
   * @param {string} projectId
   * @param {string} itemId
   * @returns {{success:boolean, message:string, item?:Object}}
   */
  function duplicateItem(projectId, itemId) {
    const project = getProject(projectId);
    if (!project) return { success: false, message: 'Project tidak ditemukan.' };

    const original = project.items.find(function (i) { return i.itemId === itemId; });
    if (!original) return { success: false, message: 'Item tidak ditemukan.' };

    const copy = Helper.deepClone(original);
    copy.itemId = Helper.generateId('item');
    copy.label = copy.label + ' (copy)';

    project.items.push(copy);
    const saved = Storage.saveProject(project);
    return saved
      ? { success: true, message: 'Item berhasil diduplikat.', item: copy }
      : { success: false, message: 'Gagal menduplikat item.' };
  }

  /**
   * Persists a change to the project-level discount (layered on top of
   * every item's own discount — see calculator.js's calcProjectSummary).
   * @param {string} projectId
   * @param {{type:string, value:number|string}} discount
   * @returns {{success:boolean, message:string}}
   */
  function setProjectDiscount(projectId, discount) {
    const project = getProject(projectId);
    if (!project) return { success: false, message: 'Project tidak ditemukan.' };

    // QA FIX: was Helper.toNumber(discount.value) — collapsed a compound
    // value like "20+10" down to just 20, silently dropping the second
    // discount tier. Validation already accepts compound strings; keep
    // the value exactly as entered and let calcDiscountAmount interpret it.
    const rawValue = (discount.value === '' || discount.value == null) ? 0 : discount.value;
    const check = discount.type === 'percent'
      ? Validation.isValidDiscountPercent(rawValue)
      : Validation.isValidDiscountNominal(rawValue, window.ALUVE.Calculator.calcProjectSummary(project.items).grandTotalNormal);
    if (!check) return { success: false, message: 'Nilai diskon project tidak valid.' };

    project.projectDiscount = { type: discount.type, value: rawValue };
    Storage.saveProject(project);
    return { success: true, message: 'Diskon project diperbarui.' };
  }

  return {
    createProject: createProject,
    getAllProjects: getAllProjects,
    getProject: getProject,
    searchProjects: searchProjects,
    updateProjectMeta: updateProjectMeta,
    setProjectStatus: setProjectStatus,
    deleteProject: deleteProject,
    duplicateProject: duplicateProject,
    addItem: addItem,
    updateItem: updateItem,
    deleteItem: deleteItem,
    duplicateItem: duplicateItem,
    setProjectDiscount: setProjectDiscount,
    buildLineFromSku: buildLineFromSku
  };
})();
