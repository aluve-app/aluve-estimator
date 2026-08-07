/**
 * priceManager.js — owns the in-memory + persisted master price catalog.
 * Every SKU in the app (aluminium components, glass, ornamen, sealant) is
 * read through this module — nothing else should reach into
 * `window.ALUVE_MASTER_DATA` or `Storage.getMasterPrices()` directly.
 *
 * Seeding behaviour: on first run (no `aluve_master_prices` in
 * LocalStorage yet), this module imports the seed data from
 * data/masterData.js, assigns a stable `id` and `lastUpdated` to every
 * item, and persists that as the new working copy. From then on, the
 * LocalStorage copy is authoritative — masterData.js is never read again
 * until/unless the app is reset.
 *
 * Public API: window.ALUVE.PriceManager
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.PriceManager = (function () {
  'use strict';

  const Helper = window.ALUVE.Helper;
  const Storage = window.ALUVE.Storage;
  const Validation = window.ALUVE.Validation;

  /** In-memory working catalog, kept in sync with LocalStorage on every mutation. */
  let catalog = null;

  /**
   * Private accessors for the catalog's three "flat" (non-tiered)
   * sections. Centralizing the `catalog.X && catalog.X.items || []`
   * defensive guard here — instead of repeating it at every call site —
   * means a corrupted/partial persisted catalog only needs to be
   * defended against in ONE place, not three.
   */
  function getGlassItems(catalogRef) {
    return (catalogRef.glass && catalogRef.glass.items) || [];
  }
  function getOtherItems(catalogRef) {
    return (catalogRef.other && catalogRef.other.items) || [];
  }

  /**
   * Walks the seed data's nested { brand_tiers: { groups: { items } } }
   * shape and assigns each leaf item a stable `id` and `lastUpdated`
   * timestamp, since the raw Excel-derived seed has neither.
   * @param {Object} seed - window.ALUVE_MASTER_DATA
   * @returns {Object} enriched catalog, same shape, ready to persist
   */
  function buildCatalogFromSeed(seed) {
    const now = new Date().toISOString();
    const enriched = Helper.deepClone(seed);

    function enrichItem(item) {
      item.id = Helper.generateId('sku');
      item.lastUpdated = now;
      item.isActive = true;
      return item;
    }

    Object.keys(enriched.brand_tiers || {}).forEach(function (tierKey) {
      (enriched.brand_tiers[tierKey].groups || []).forEach(function (group) {
        group.items = (group.items || []).map(enrichItem);
      });
    });

    getGlassItems(enriched).forEach(enrichItem);
    getOtherItems(enriched).forEach(enrichItem);
    if (enriched.sealant && enriched.sealant.name) enrichItem(enriched.sealant);

    return enriched;
  }

  /**
   * Loads the catalog: persisted LocalStorage copy if it exists, otherwise
   * seeds fresh from masterData.js and persists that as the starting
   * point. Must be called once during app bootstrap (app.js) before any
   * other module asks for prices.
   * @returns {Object} the active catalog
   */
  function init() {
    const persisted = Storage.getMasterPrices();
    if (persisted) {
      catalog = persisted;
      return catalog;
    }

    if (!window.ALUVE_MASTER_DATA) {
      console.error('[PriceManager] No seed data found (data/masterData.js not loaded).');
      catalog = { brand_tiers: {}, glass: { items: [] }, other: { items: [] }, sealant: {} };
      return catalog;
    }

    catalog = buildCatalogFromSeed(window.ALUVE_MASTER_DATA);
    Storage.saveMasterPrices(catalog);
    return catalog;
  }

  /** Ensures init() has run, for any module that might call in before app.js's bootstrap order. */
  function ensureLoaded() {
    if (!catalog) init();
    return catalog;
  }

  /** @returns {Object} the full catalog structure (tiers/groups/glass/other/sealant) */
  function getCatalog() {
    return ensureLoaded();
  }

  /**
   * Flattens the whole catalog into a single array of items, each
   * annotated with its category/group context — the shape the Item
   * Editor's SKU picker actually needs.
   * @returns {Array<Object>}
   */
  function getFlatItemList() {
    ensureLoaded();
    const flat = [];

    Object.keys(catalog.brand_tiers || {}).forEach(function (tierKey) {
      const tier = catalog.brand_tiers[tierKey];
      (tier.groups || []).forEach(function (group) {
        (group.items || []).forEach(function (item) {
          flat.push(Object.assign({}, item, {
            tierKey: tierKey,
            tierLabel: tier.label,
            groupCode: group.code,
            groupName: group.name,
            category: 'aluminium'
          }));
        });
      });
    });

    getGlassItems(catalog).forEach(function (item) {
      flat.push(Object.assign({}, item, { category: 'glass', groupName: 'Kaca' }));
    });

    getOtherItems(catalog).forEach(function (item) {
      flat.push(Object.assign({}, item, { category: 'other', groupName: 'Lain-lain' }));
    });

    if (catalog.sealant && catalog.sealant.id) {
      flat.push(Object.assign({}, catalog.sealant, { category: 'sealant', groupName: 'Sealant' }));
    }

    return flat;
  }

  /**
   * Finds a single SKU by its generated id, across every category.
   * @param {string} skuId
   * @returns {Object|null}
   */
  function getItemById(skuId) {
    return getFlatItemList().find(function (item) { return item.id === skuId; }) || null;
  }

  /**
   * Case-insensitive substring search over SKU names — powers the Item
   * Editor's searchable component/glass picker.
   * @param {string} query
   * @param {string} [category] - optional filter: 'aluminium'|'glass'|'other'|'sealant'
   * @returns {Array<Object>}
   */
  function searchCatalog(query, category) {
    const needle = (query || '').trim().toLowerCase();
    return getFlatItemList().filter(function (item) {
      const matchesCategory = !category || item.category === category;
      const matchesQuery = !needle || item.name.toLowerCase().indexOf(needle) !== -1;
      return matchesCategory && matchesQuery;
    });
  }

  /**
   * Renames a top-level catalog category label — either a brand tier
   * ("ALUVE Recta", "ALUVE Nexa") or one of the two flat sections
   * ("Kaca", "Lain-lain"). Per Anto's request #8, these rail labels
   * should be just as editable as an individual SKU's name/price.
   * @param {string} categoryKey - a brand_tiers key, or 'glass' / 'other-sealant'
   * @param {string} newLabel
   * @returns {{success:boolean, message:string}}
   */
  function updateCategoryLabel(categoryKey, newLabel) {
    if (!Validation.isNonEmptyString(newLabel)) {
      return { success: false, message: 'Nama kategori tidak boleh kosong.' };
    }
    const trimmed = newLabel.trim();

    if (categoryKey === 'glass') {
      catalog.glass = catalog.glass || { items: [] };
      catalog.glass.label = trimmed;
    } else if (categoryKey === 'other-sealant') {
      catalog.other = catalog.other || { items: [] };
      catalog.other.label = trimmed;
    } else if (catalog.brand_tiers && catalog.brand_tiers[categoryKey]) {
      catalog.brand_tiers[categoryKey].label = trimmed;
    } else {
      return { success: false, message: 'Kategori tidak ditemukan.' };
    }

    Storage.saveMasterPrices(catalog);
    return { success: true, message: 'Nama kategori berhasil diperbarui.' };
  }

  /**
   * Renames a group (component group) within a brand tier — e.g. "Kusen
   * Pintu dan Kaca Mati YN70", "Daun Pintu YN70". Per Anto's request #8.
   * @param {string} tierKey
   * @param {string} groupCode
   * @param {string} newLabel
   * @returns {{success:boolean, message:string}}
   */
  function updateGroupLabel(tierKey, groupCode, newLabel) {
    if (!Validation.isNonEmptyString(newLabel)) {
      return { success: false, message: 'Nama komponen tidak boleh kosong.' };
    }
    const tier = catalog.brand_tiers && catalog.brand_tiers[tierKey];
    const group = tier && (tier.groups || []).find(function (g) { return g.code === groupCode; });
    if (!group) {
      return { success: false, message: 'Komponen tidak ditemukan.' };
    }
    group.label = newLabel.trim();
    Storage.saveMasterPrices(catalog);
    return { success: true, message: 'Nama komponen berhasil diperbarui.' };
  }


  /**
   * Updates a SKU's display name — logged to the same audit trail as
   * price changes, since a name correction is still a change worth
   * tracing to a person and date.
   * @param {string} skuId
   * @param {string} newName
   * @param {string} changedBy
   * @returns {{success:boolean, message:string}}
   */
  function updateName(skuId, newName, changedBy) {
    if (!Validation.isNonEmptyString(newName)) {
      return { success: false, message: 'Nama tidak boleh kosong.' };
    }
    const item = getItemById(skuId);
    if (!item) {
      return { success: false, message: 'SKU tidak ditemukan.' };
    }

    const oldName = item.name;
    const trimmedName = newName.trim();
    mutateItemInCatalog(skuId, function (target) {
      target.name = trimmedName;
      target.lastUpdated = new Date().toISOString();
    });

    Storage.appendPriceHistory({
      skuId: skuId,
      skuName: trimmedName,
      oldValue: oldName,
      newValue: trimmedName,
      changedBy: changedBy || 'Unknown'
    });

    Storage.saveMasterPrices(catalog);
    return { success: true, message: 'Nama berhasil diperbarui.' };
  }

  /**
   * Updates a SKU's harga_modal, logging the change to the audit trail
   * (Storage.appendPriceHistory) before overwriting — every price change
   * must be traceable to a person and a date (Phase 1 §14).
   * @param {string} skuId
   * @param {number} newPrice
   * @param {string} changedBy - name of the person making the change
   * @returns {{success:boolean, message:string}}
   */
  function updatePrice(skuId, newPrice, changedBy) {
    if (!Validation.isValidPrice(newPrice)) {
      return { success: false, message: 'Harga harus berupa angka positif.' };
    }

    const item = getItemById(skuId);
    if (!item) {
      return { success: false, message: 'SKU tidak ditemukan.' };
    }

    const oldPrice = item.harga_modal;
    mutateItemInCatalog(skuId, function (target) {
      target.harga_modal = newPrice;
      target.lastUpdated = new Date().toISOString();
    });

    Storage.appendPriceHistory({
      skuId: skuId,
      skuName: item.name,
      oldValue: oldPrice,
      newValue: newPrice,
      changedBy: changedBy || 'Unknown'
    });

    Storage.saveMasterPrices(catalog);
    return { success: true, message: 'Harga berhasil diperbarui.' };
  }

  /**
   * Adds a brand-new SKU to a given tier/group (aluminium) or to
   * glass/other (no group needed). Rejects incomplete entries outright —
   * "no partial/blank entries allowed to save" (Phase 1 §14).
   * @param {{category:string, tierKey?:string, groupCode?:string, name:string, harga_modal:number, uom:string}} newItem
   * @returns {{success:boolean, message:string, item?:Object}}
   */
  function addSku(newItem) {
    if (!Validation.isNonEmptyString(newItem.name) || !Validation.isValidPrice(newItem.harga_modal) || !Validation.isNonEmptyString(newItem.uom)) {
      return { success: false, message: 'Nama, harga modal, dan satuan wajib diisi dengan benar.' };
    }

    ensureLoaded();
    const record = {
      id: Helper.generateId('sku'),
      name: newItem.name.trim(),
      harga_modal: newItem.harga_modal,
      uom: newItem.uom,
      isActive: true,
      lastUpdated: new Date().toISOString()
    };

    if (newItem.category === 'aluminium' && newItem.tierKey && newItem.groupCode) {
      const tier = catalog.brand_tiers[newItem.tierKey];
      const group = tier && (tier.groups || []).find(function (g) { return g.code === newItem.groupCode; });
      if (!group) return { success: false, message: 'Tier/Series tujuan tidak ditemukan.' };
      group.items.push(record);
    } else if (newItem.category === 'glass') {
      catalog.glass = catalog.glass || { items: [] };
      catalog.glass.items = catalog.glass.items || [];
      catalog.glass.items.push(record);
    } else if (newItem.category === 'other') {
      catalog.other = catalog.other || { items: [] };
      catalog.other.items = catalog.other.items || [];
      catalog.other.items.push(record);
    } else {
      return { success: false, message: 'Kategori SKU tidak valid.' };
    }

    Storage.saveMasterPrices(catalog);
    return { success: true, message: 'SKU baru berhasil ditambahkan.', item: record };
  }

  /**
   * Soft-deletes a SKU (isActive = false) rather than removing it, so
   * historical projects that already reference it still render correctly
   * (Phase 1 §14).
   * @param {string} skuId
   * @returns {{success:boolean, message:string}}
   */
  function deprecateSku(skuId) {
    const found = mutateItemInCatalog(skuId, function (target) { target.isActive = false; });
    if (!found) return { success: false, message: 'SKU tidak ditemukan.' };
    Storage.saveMasterPrices(catalog);
    return { success: true, message: 'SKU dinonaktifkan.' };
  }

  /**
   * Internal helper: finds an item by id anywhere in the nested catalog
   * structure and applies a mutator function to it in place. Centralizing
   * this traversal avoids writing the same nested-loop lookup three times
   * (updatePrice, deprecateSku, and any future per-item edit).
   * @param {string} skuId
   * @param {Function} mutatorFn
   * @returns {boolean} whether a matching item was found and mutated
   */
  function mutateItemInCatalog(skuId, mutatorFn) {
    ensureLoaded();
    let found = false;

    Object.keys(catalog.brand_tiers || {}).forEach(function (tierKey) {
      (catalog.brand_tiers[tierKey].groups || []).forEach(function (group) {
        (group.items || []).forEach(function (item) {
          if (item.id === skuId) { mutatorFn(item); found = true; }
        });
      });
    });

    getGlassItems(catalog).forEach(function (item) {
      if (item.id === skuId) { mutatorFn(item); found = true; }
    });
    getOtherItems(catalog).forEach(function (item) {
      if (item.id === skuId) { mutatorFn(item); found = true; }
    });
    if (catalog.sealant && catalog.sealant.id === skuId) { mutatorFn(catalog.sealant); found = true; }

    return found;
  }

  /**
   * Checks whether a SKU's price hasn't been reviewed within the
   * configured threshold (Settings > stalePriceThresholdDays, default 90)
   * — informational only, per Phase 1 NFR "warn, not block".
   * @param {Object} item - must have `lastUpdated`
   * @param {number} [thresholdDays]
   * @returns {boolean}
   */
  function isStale(item, thresholdDays) {
    if (!item || !item.lastUpdated) return false;
    const threshold = thresholdDays || Storage.getSettings().stalePriceThresholdDays || 90;
    const ageDays = (Date.now() - new Date(item.lastUpdated).getTime()) / (1000 * 60 * 60 * 24);
    return ageDays > threshold;
  }

  /** @returns {Array<Object>} every active SKU currently flagged as stale */
  function getStaleItems() {
    return getFlatItemList().filter(function (item) {
      return item.isActive !== false && isStale(item);
    });
  }

  return {
    init: init,
    getCatalog: getCatalog,
    getFlatItemList: getFlatItemList,
    getItemById: getItemById,
    searchCatalog: searchCatalog,
    updateName: updateName,
    updatePrice: updatePrice,
    updateCategoryLabel: updateCategoryLabel,
    updateGroupLabel: updateGroupLabel,
    addSku: addSku,
    deprecateSku: deprecateSku,
    isStale: isStale,
    getStaleItems: getStaleItems
  };
})();
