/**
 * storage.js — the ONLY module allowed to touch `window.localStorage`.
 * Every other module goes through this abstraction, which is deliberate:
 * per Phase 1 SRS §16, migrating to Laravel/MySQL or Firebase later means
 * rewriting the *inside* of these functions to call an API instead of
 * LocalStorage — no other file should ever need to change.
 *
 * Storage keys (Phase 1 SRS §12):
 *   aluve_projects        -> array of Project objects
 *   aluve_master_prices   -> priceManager's working copy of the catalog
 *   aluve_settings        -> app-wide settings object
 *   aluve_price_history   -> append-only audit log of price changes
 *
 * Public API: window.ALUVE.Storage
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.Storage = (function () {
  'use strict';

  const KEYS = {
    PROJECTS: 'aluve_projects',
    MASTER_PRICES: 'aluve_master_prices',
    SETTINGS: 'aluve_settings',
    PRICE_HISTORY: 'aluve_price_history'
  };

  const DEFAULT_SETTINGS = {
    companyName: 'PT Global Buana Perkasa',
    companyAddress: 'WTC Mangga Dua, Jakarta',
    companyPhone: '',
    logoDataUrl: null,
    defaultSalesRep: 'Anto Sastra',
    discountCeilingPercent: 10,
    stalePriceThresholdDays: 90,
    lastBackupAt: null,
    // Quotation letterhead extras (Anto's revision — matches the
    // PT. Bangun Rupa Indah reference quotation format)
    bankAccountInfo: '',           // e.g. "BCA an PT Global Buana Perkasa ac 000-000-0000"
    paymentTerms: '',              // e.g. "DP 50%, MOS 40%, 10% AFTER INSTALASI"
    quotationValidityDays: 14,     // "Harga berlaku N hari sejak diterbitkannya penawaran"
    termsAndConditions: '',        // multi-line, one condition per line, numbered automatically on export
    sheetWebhookUrl: ''            // Google Apps Script Web App URL for syncing projects to Google Sheets
  };

  /**
   * Reads and JSON-parses a key, returning a fallback value (rather than
   * throwing) if the key is missing, empty, or corrupted — a malformed
   * LocalStorage entry must never crash the app on load.
   * @param {string} key
   * @param {*} fallback
   * @returns {*}
   */
  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.error('[Storage] Failed to read key "' + key + '":', err);
      return fallback;
    }
  }

  /**
   * Writes a value as JSON. Returns true/false so callers (per the
   * Phase 1 error-handling strategy) can surface a visible warning on
   * quota-exceeded or private-browsing failures instead of losing data
   * silently.
   * @param {string} key
   * @param {*} value
   * @returns {boolean}
   */
  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('[Storage] Failed to write key "' + key + '":', err);
      return false;
    }
  }

  /* ----------------------------------------------------------
     Projects
     ============================================================
     PATCH MULTI-USER (Firebase/Cloudflare): dulu semua fungsi di
     bawah ini baca-tulis langsung ke localStorage (artinya data
     cuma ada di 1 device). Sekarang mereka baca-tulis ke
     window.__EST.projects — sebuah cache di memori yang:
       - diisi SEKALI saat app dibuka, dari server (lihat bootstrap.js)
       - setiap kali ditulis (saveProject/deleteProject), SELAIN
         update cache, juga fire-and-forget kirim ke server lewat
         Api.call(), persis pola GSheetSync yang sudah ada di app
         ini — jadi Niken/Delvy/siapa pun melihat data yang sama.
     TIDAK ADA fungsi lain di file ini yang perlu tahu perubahan
     ini — project.js, ui.js, dashboardPage.js, dst semua tetap
     manggil Storage.getProjects()/saveProject() persis seperti
     sebelumnya.
     ============================================================ */

  function ensureEstCache() {
    window.__EST = window.__EST || {};
    window.__EST.projects = window.__EST.projects || [];
    return window.__EST;
  }

  /** @returns {Array<Object>} every saved project, most-recently-updated first */
  function getProjects() {
    const projects = ensureEstCache().projects;
    return projects.slice().sort(function (a, b) {
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0);
    });
  }

  /**
   * @param {string} projectId
   * @returns {Object|null}
   */
  function getProject(projectId) {
    const projects = ensureEstCache().projects;
    return projects.find(function (p) { return p.projectId === projectId; }) || null;
  }

  /**
   * Upserts a project (insert if new, replace if `projectId` already
   * exists). Always stamps `updatedAt` so "last updated" sorting and the
   * stale/follow-up indicator stay accurate.
   * @param {Object} project
   * @returns {boolean} success
   */
  function saveProject(project) {
    if (!project || !project.projectId) return false;

    const cache = ensureEstCache();
    const index = cache.projects.findIndex(function (p) { return p.projectId === project.projectId; });
    project.updatedAt = new Date().toISOString();

    if (index === -1) {
      cache.projects.push(project);
    } else {
      cache.projects[index] = project;
    }

    // Fire-and-forget sync ke server — sama semangatnya dengan GSheetSync
    // di bawah (tidak memblokir UI, tidak menggagalkan save lokal kalau
    // jaringan lambat).
    if (window.EstApi) {
      window.EstApi.call('saveLegacyProject', { project: project }).then(function (result) {
        if (!result || !result.success) {
          console.error('[Storage] Gagal sinkron project ke server:', result && result.message);
        }
      });
    }

    // Tetap panggil GSheetSync kalau memang dikonfigurasi (Settings > Integrasi
    // Google Sheet) — perilaku asli app ini dibiarkan apa adanya.
    if (window.ALUVE && window.ALUVE.GSheetSync) {
      window.ALUVE.GSheetSync.pushProject(project);
    }

    return true;
  }

  /**
   * @param {string} projectId
   * @returns {boolean} success
   */
  function deleteProject(projectId) {
    const cache = ensureEstCache();
    cache.projects = cache.projects.filter(function (p) { return p.projectId !== projectId; });

    if (window.EstApi) {
      window.EstApi.call('deleteLegacyProject', { project_id: projectId }).then(function (result) {
        if (!result || !result.success) {
          console.error('[Storage] Gagal hapus project di server:', result && result.message);
        }
      });
    }
    return true;
  }

  /* ----------------------------------------------------------
     Master prices (priceManager's persisted working copy)
  ---------------------------------------------------------- */

  /**
   * @returns {Object|null} the persisted master price catalog, or null if never seeded
   * PATCH MULTI-USER: sekarang baca dari window.__EST.catalog (diisi saat
   * bootstrap dari endpoint readPriceCatalog) — bukan localStorage lagi,
   * supaya semua user (estimator mana pun) lihat katalog harga yang sama.
   */
  function getMasterPrices() {
    ensureEstCache();
    return window.__EST.catalog || null;
  }

  /**
   * @param {Object} catalog @returns {boolean} success
   * PATCH MULTI-USER: update cache + kirim ke server (updatePriceCatalog).
   * Backend HANYA mengizinkan role super_admin — kalau user Estimator
   * biasa yang mencoba edit di Price Manager, server akan menolak
   * (403) dan perubahan tidak benar-benar tersimpan, meski tampilan
   * sempat berubah sesaat. UI Price Manager sebaiknya dibuat read-only
   * untuk role selain super_admin (lihat bootstrap.js).
   */
  function saveMasterPrices(catalog) {
    ensureEstCache();
    window.__EST.catalog = catalog;
    if (window.EstApi) {
      window.EstApi.call('updatePriceCatalog', {
        business_id: window.EstApi.businessId(),
        catalog: catalog,
        change_summary: 'Diperbarui dari Price Manager'
      }).then(function (result) {
        if (!result || !result.success) {
          console.error('[Storage] Gagal sinkron katalog harga ke server:', result && result.message);
        }
      });
    }
    return true;
  }

  /* ----------------------------------------------------------
     Settings
     PATCH MULTI-USER: sama seperti di atas — settings (nama
     perusahaan, dst) sekarang dibagi bersama lewat server, bukan
     per-device lagi, supaya kop surat PDF konsisten siapa pun yang
     export.
  ---------------------------------------------------------- */

  /** @returns {Object} settings, merged with defaults for any missing key */
  function getSettings() {
    ensureEstCache();
    return Object.assign({}, DEFAULT_SETTINGS, window.__EST.settings || {});
  }

  /** @param {Object} settings @returns {boolean} success */
  function saveSettings(settings) {
    ensureEstCache();
    const merged = Object.assign({}, getSettings(), settings);
    window.__EST.settings = merged;
    if (window.EstApi) {
      window.EstApi.call('updateEstimatorSettings', {
        business_id: window.EstApi.businessId(),
        settings: merged
      }).then(function (result) {
        if (!result || !result.success) {
          console.error('[Storage] Gagal sinkron settings ke server:', result && result.message);
        }
      });
    }
    return true;
  }

  /* ----------------------------------------------------------
     Price change audit log
  ---------------------------------------------------------- */

  /** @returns {Array<Object>} full price-change history, newest first */
  function getPriceHistory() {
    const history = readJson(KEYS.PRICE_HISTORY, []);
    return history.slice().reverse();
  }

  /**
   * Appends one entry to the price-change audit log. Never mutates or
   * removes past entries — this log exists specifically so a price
   * change is always traceable to a person and a date (Phase 1 §14).
   * @param {{skuId:string, skuName:string, oldValue:number, newValue:number, changedBy:string}} entry
   * @returns {boolean} success
   */
  function appendPriceHistory(entry) {
    const history = readJson(KEYS.PRICE_HISTORY, []);
    history.push(Object.assign({}, entry, { changedAt: new Date().toISOString() }));
    return writeJson(KEYS.PRICE_HISTORY, history);
  }

  /* ----------------------------------------------------------
     Backup / restore (manual JSON export-import of everything)
  ---------------------------------------------------------- */

  /**
   * Bundles every stored key into one JSON-serializable snapshot for
   * manual backup — used by Settings > "Backup Semua Project".
   * @returns {Object}
   */
  function exportBackup() {
    return {
      exportedAt: new Date().toISOString(),
      projects: (window.__EST && window.__EST.projects) || [],
      masterPrices: (window.__EST && window.__EST.catalog) || null,
      settings: (window.__EST && window.__EST.settings) || {},
      priceHistory: readJson(KEYS.PRICE_HISTORY, [])
    };
  }

  /**
   * Restores a previously exported backup snapshot, overwriting current
   * data. Validates the shape minimally before writing anything, so a
   * malformed file can't half-overwrite the app's data.
   * @param {Object} backup
   * @returns {boolean} success
   */
  function importBackup(backup) {
    if (!backup || !Array.isArray(backup.projects)) {
      console.error('[Storage] Invalid backup file — missing projects array.');
      return false;
    }
    writeJson(KEYS.PROJECTS, backup.projects);

    const masterPricesLookValid = backup.masterPrices
      && typeof backup.masterPrices === 'object'
      && typeof backup.masterPrices.brand_tiers === 'object';
    if (masterPricesLookValid) {
      writeJson(KEYS.MASTER_PRICES, backup.masterPrices);
    } else if (backup.masterPrices) {
      console.warn('[Storage] Skipped restoring masterPrices — unexpected shape, keeping current catalog.');
    }

    if (backup.settings) writeJson(KEYS.SETTINGS, backup.settings);
    if (Array.isArray(backup.priceHistory)) writeJson(KEYS.PRICE_HISTORY, backup.priceHistory);

    saveSettings({ lastBackupAt: new Date().toISOString() });
    return true;
  }

  return {
    KEYS: KEYS,
    getProjects: getProjects,
    getProject: getProject,
    saveProject: saveProject,
    deleteProject: deleteProject,
    getMasterPrices: getMasterPrices,
    saveMasterPrices: saveMasterPrices,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getPriceHistory: getPriceHistory,
    appendPriceHistory: appendPriceHistory,
    exportBackup: exportBackup,
    importBackup: importBackup
  };
})();
