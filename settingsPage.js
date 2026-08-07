/**
 * settingsPage.js — wires the static Settings markup (#page-settings) in
 * index.html to real persistence via ALUVE.Storage. Handles: company
 * info (used as the PDF/print letterhead), logo upload, operational
 * defaults, theme preference, and backup/restore.
 *
 * Public API: window.ALUVE.SettingsPage
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.SettingsPage = (function () {
  'use strict';

  const Helper = window.ALUVE.Helper;
  const Storage = window.ALUVE.Storage;
  const UiFeedback = window.ALUVE.UiFeedback;

  let dom = {};

  /**
   * Thin wrapper around UiFeedback.showToast — exists purely so call
   * sites in this file read `notify('...')` instead of the longer
   * `UiFeedback.showToast('...')`, matching the shorter, more readable
   * call-site style already established elsewhere in this module.
   * @param {string} message
   * @param {'success'|'danger'|'info'} variant
   */
  function notify(message, variant) {
    UiFeedback.showToast(message, variant);
  }

  /** Caches every DOM node this module touches, once, at init time. */
  function cacheElements() {
    const page = document.getElementById('page-settings');
    dom = Object.assign({ page: page }, Helper.cacheElements(page, {
      logoInput: '[data-settings="logoFile"]',
      logoPreview: '[data-settings="logoPreview"]',
      companyName: '[data-settings="companyName"]',
      companyPhone: '[data-settings="companyPhone"]',
      companyAddress: '[data-settings="companyAddress"]',
      defaultSalesRep: '[data-settings="defaultSalesRep"]',
      discountCeiling: '[data-settings="discountCeiling"]',
      staleThreshold: '[data-settings="staleThreshold"]',
      themeSelect: '[data-settings="themeSelect"]',
      bankAccountInfo: '[data-settings="bankAccountInfo"]',
      paymentTerms: '[data-settings="paymentTerms"]',
      quotationValidityDays: '[data-settings="quotationValidityDays"]',
      termsAndConditions: '[data-settings="termsAndConditions"]',
      sheetWebhookUrl: '[data-settings="sheetWebhookUrl"]',
      sheetSyncQueueLabel: '[data-settings="sheetSyncQueueLabel"]',
      backupBtn: '[data-settings="backupBtn"]',
      restoreInput: '[data-settings="restoreInput"]',
      lastBackupLabel: '[data-settings="lastBackupLabel"]',
      exportAllProjectsBtn: '[data-settings="exportAllProjectsBtn"]',
      saveBtn: '[data-settings="saveBtn"]'
    }));
  }

  /** Populates every form field from the currently persisted settings. */
  function renderFromSettings() {
    const settings = Storage.getSettings();

    if (dom.companyName) dom.companyName.value = settings.companyName || '';
    if (dom.companyPhone) dom.companyPhone.value = settings.companyPhone || '';
    if (dom.companyAddress) dom.companyAddress.value = settings.companyAddress || '';
    if (dom.defaultSalesRep) dom.defaultSalesRep.value = settings.defaultSalesRep || '';
    if (dom.discountCeiling) dom.discountCeiling.value = settings.discountCeilingPercent != null ? settings.discountCeilingPercent : 10;
    if (dom.staleThreshold) dom.staleThreshold.value = settings.stalePriceThresholdDays != null ? settings.stalePriceThresholdDays : 90;
    if (dom.themeSelect) dom.themeSelect.value = settings.themePreference || 'system';
    if (dom.bankAccountInfo) dom.bankAccountInfo.value = settings.bankAccountInfo || '';
    if (dom.paymentTerms) dom.paymentTerms.value = settings.paymentTerms || '';
    if (dom.quotationValidityDays) dom.quotationValidityDays.value = settings.quotationValidityDays != null ? settings.quotationValidityDays : 14;
    if (dom.termsAndConditions) dom.termsAndConditions.value = settings.termsAndConditions || '';
    if (dom.sheetWebhookUrl) dom.sheetWebhookUrl.value = settings.sheetWebhookUrl || '';
    if (dom.sheetSyncQueueLabel && window.ALUVE.GSheetSync) {
      const pending = window.ALUVE.GSheetSync.getQueueCount();
      dom.sheetSyncQueueLabel.textContent = pending > 0
        ? pending + ' project menunggu sinkronisasi ke Sheet'
        : (settings.sheetWebhookUrl ? 'Sinkronisasi Sheet aktif' : '');
    }

    if (dom.logoPreview) {
      if (settings.logoDataUrl) {
        dom.logoPreview.src = settings.logoDataUrl;
        dom.logoPreview.classList.remove('d-none');
      } else {
        dom.logoPreview.classList.add('d-none');
      }
    }

    if (dom.lastBackupLabel) {
      dom.lastBackupLabel.textContent = settings.lastBackupAt
        ? 'Backup terakhir: ' + Helper.formatDate(settings.lastBackupAt)
        : 'Belum pernah backup';
    }
  }

  /**
   * Reads the selected logo file, converts it to a base64 data URL (so it
   * can be embedded directly into the PDF/print letterhead and the app's
   * own navbar header), and updates the live preview immediately.
   */
  function handleLogoUpload() {
    const file = dom.logoInput.files && dom.logoInput.files[0];
    if (!file) return;

    window.ALUVE.PhotoCropper.open(file, {
      maxWidth: 320,
      maxHeight: 320,
      quality: 0.85,
      onDone: function (dataUrl) {
        const saved = Storage.saveSettings({ logoDataUrl: dataUrl });
        if (!saved) {
          notify('Gagal menyimpan logo — penyimpanan lokal penuh.', 'danger');
          return;
        }
        if (dom.logoPreview) {
          dom.logoPreview.src = dataUrl;
          dom.logoPreview.classList.remove('d-none');
        }
        notify('Logo berhasil diperbarui', 'success');
        if (window.ALUVE.Nav) window.ALUVE.Nav.applyNavbarLogo();
      }
    });
    dom.logoInput.value = '';
  }

  /** Persists every editable field on the form in one write. */
  function saveForm() {
    Storage.saveSettings({
      companyName: dom.companyName ? dom.companyName.value.trim() : '',
      companyPhone: dom.companyPhone ? dom.companyPhone.value.trim() : '',
      companyAddress: dom.companyAddress ? dom.companyAddress.value.trim() : '',
      defaultSalesRep: dom.defaultSalesRep ? dom.defaultSalesRep.value.trim() : '',
      discountCeilingPercent: dom.discountCeiling ? Number(dom.discountCeiling.value) || 0 : 10,
      stalePriceThresholdDays: dom.staleThreshold ? Number(dom.staleThreshold.value) || 90 : 90,
      bankAccountInfo: dom.bankAccountInfo ? dom.bankAccountInfo.value.trim() : '',
      paymentTerms: dom.paymentTerms ? dom.paymentTerms.value.trim() : '',
      quotationValidityDays: dom.quotationValidityDays ? Number(dom.quotationValidityDays.value) || 14 : 14,
      termsAndConditions: dom.termsAndConditions ? dom.termsAndConditions.value : '',
      sheetWebhookUrl: dom.sheetWebhookUrl ? dom.sheetWebhookUrl.value.trim() : ''
    });
    notify('Pengaturan berhasil disimpan', 'success');
    if (window.ALUVE.GSheetSync) window.ALUVE.GSheetSync.flushQueue();
  }

  /**
   * Applies a theme preference immediately (light/dark/system) and
   * persists it to Storage — the single source of truth for theme is
   * now Settings, not the navbar toggle's own LocalStorage key, so both
   * controls stay in sync.
   * @param {string} preference - 'light'|'dark'|'system'
   */
  function applyThemePreference(preference) {
    let resolved = preference;
    if (preference === 'system') {
      resolved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    Storage.saveSettings({ themePreference: preference });

    const navIcon = document.getElementById('themeToggleIcon');
    if (navIcon) navIcon.className = resolved === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
  }

  /** Triggers a full backup download as a JSON file the user can store anywhere. */
  function handleBackup() {
    const backup = Storage.exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aluve-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    Storage.saveSettings({ lastBackupAt: new Date().toISOString() });
    renderFromSettings();
    notify('Backup berhasil diunduh', 'success');
  }

  /** Reads a chosen backup .json file and restores it, with a confirm step since this overwrites current data. */
  function handleRestore() {
    const file = dom.restoreInput.files && dom.restoreInput.files[0];
    if (!file) return;

    const confirmed = window.confirm('Restore akan menimpa semua data project, harga, dan pengaturan saat ini. Lanjutkan?');
    if (!confirmed) {
      dom.restoreInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
      try {
        const backup = JSON.parse(event.target.result);
        const result = Storage.importBackup(backup);
        if (result) {
          notify('Restore berhasil. Memuat ulang halaman...', 'success');
          setTimeout(function () { window.location.reload(); }, 1200);
        } else {
          notify('File backup tidak valid.', 'danger');
        }
      } catch (err) {
        console.error('[SettingsPage] Restore failed:', err);
        notify('Gagal membaca file backup.', 'danger');
      }
      dom.restoreInput.value = '';
    };
    reader.readAsText(file);
  }

  function bindEvents() {
    if (dom.logoInput) dom.logoInput.addEventListener('change', handleLogoUpload);
    if (dom.saveBtn) dom.saveBtn.addEventListener('click', saveForm);
    if (dom.themeSelect) dom.themeSelect.addEventListener('change', function () {
      applyThemePreference(dom.themeSelect.value);
    });
    if (dom.backupBtn) dom.backupBtn.addEventListener('click', handleBackup);
    if (dom.restoreInput) dom.restoreInput.addEventListener('change', handleRestore);
    if (dom.exportAllProjectsBtn) dom.exportAllProjectsBtn.addEventListener('click', function () {
      const result = window.ALUVE.ExportEngine.exportAllProjectsToExcel(window.ALUVE.Project.getAllProjects());
      notify(result.message, result.success ? 'success' : 'danger');
    });
  }

  /** Entry point — call once during app bootstrap. */
  function init() {
    cacheElements();
    if (!dom.page) return; // settings page markup not present, nothing to wire
    renderFromSettings();
    bindEvents();

    // Apply the persisted theme preference on every load (not just when
    // the Settings page happens to be open), so the choice sticks app-wide.
    const settings = Storage.getSettings();
    if (settings.themePreference) applyThemePreference(settings.themePreference);
  }

  return {
    init: init,
    applyThemePreference: applyThemePreference
  };
})();
