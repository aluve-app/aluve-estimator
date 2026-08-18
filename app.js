/**
 * app.js — the application's real entry point. Initializes every module
 * in dependency order and wires the Export modal's buttons to whichever
 * project is actually open in Project Detail.
 *
 * This replaces demoBootstrap.js, which existed only as a stand-in while
 * project.js (real Project/Item CRUD) didn't exist yet. Now that it does,
 * every button in the app operates on real, persisted data — there is no
 * more fixed demo project anywhere in the codebase.
 */
(function () {
  'use strict';

  function wireExportButtons() {
    const ExportEngine = window.ALUVE.ExportEngine;
    const UiFeedback = window.ALUVE.UiFeedback;
    const Storage = window.ALUVE.Storage;
    const ProjectDetailPage = window.ALUVE.ProjectDetailPage;

    const btnPdf = document.getElementById('btnExportPdf');
    const btnExcel = document.getElementById('btnExportExcel');
    const btnPrint = document.getElementById('btnPrintQuotation');
    const modalExportEl = document.getElementById('modalExport');
    const exportTermsOverride = document.getElementById('exportTermsOverride');

    // Pre-fill the per-export terms textarea from Settings every time the
    // modal opens, so it always starts from the current default rather
    // than whatever was left over from a previous edit.
    if (modalExportEl && exportTermsOverride) {
      modalExportEl.addEventListener('show.bs.modal', function () {
        exportTermsOverride.value = Storage.getSettings().termsAndConditions || '';
      });
    }

    /**
     * Settings, but with termsAndConditions swapped for whatever Anto
     * edited in the Export modal for THIS export only — never written
     * back to Storage, so the Settings default stays untouched.
     * @returns {Object}
     */
    function getSettingsWithTermsOverride() {
      const settings = Storage.getSettings();
      if (!exportTermsOverride) return settings;
      return Object.assign({}, settings, { termsAndConditions: exportTermsOverride.value });
    }

    /** Fetches the project currently open in Project Detail, or null with a user-facing message if none is open yet. */
    function getExportableProject() {
      const project = ProjectDetailPage.getOpenProject();
      if (!project) {
        UiFeedback.showToast('Buka sebuah project terlebih dahulu sebelum export.', 'danger');
        return null;
      }
      return project;
    }

    if (btnPdf) {
      btnPdf.addEventListener('click', function () {
        const project = getExportableProject();
        if (!project) return;
        const settings = getSettingsWithTermsOverride();
        btnPdf.disabled = true;
        btnPdf.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Membuat PDF...';
        ExportEngine.exportToPdf(project, settings).then(function (result) {
          UiFeedback.showToast(result.message, result.success ? 'success' : 'danger');
          btnPdf.disabled = false;
          btnPdf.innerHTML = '<i class="bi bi-file-earmark-pdf"></i> Export PDF';
        });
      });
    }

    if (btnExcel) {
      btnExcel.addEventListener('click', function () {
        const project = getExportableProject();
        if (!project) return;
        const result = ExportEngine.exportToExcel(project, getSettingsWithTermsOverride());
        UiFeedback.showToast(result.message, result.success ? 'success' : 'danger');
      });
    }

    if (btnPrint) {
      btnPrint.addEventListener('click', function () {
        const project = getExportableProject();
        if (!project) return;
        const result = ExportEngine.printQuotation(project, getSettingsWithTermsOverride());
        if (!result.success) UiFeedback.showToast(result.message, 'danger');
      });
    }
  }

  /**
   * PATCH MULTI-USER: dulu ini langsung jalan begitu HTML selesai dimuat
   * (document.addEventListener('DOMContentLoaded', ...)). Sekarang
   * ditunda sampai user berhasil login DAN data (project/katalog/settings)
   * sudah selesai di-bootstrap dari server — dipanggil oleh bootstrap.js
   * lewat window.__startEstimatorApp().
   */
  window.__startEstimatorApp = function () {
    // Dependency order matches the load order already established in
    // index.html and documented in ARCHITECTURE.md.
    window.ALUVE.PriceManager.init();
    window.ALUVE.PhotoCropper.init();
    window.ALUVE.SettingsPage.init();
    window.ALUVE.PriceManagerPage.init();
    window.ALUVE.ProjectDetailPage.init();
    window.ALUVE.DashboardPage.init();
    window.ALUVE.TrashPage.init();
    window.ALUVE.DrawingPage.init();
    window.ALUVE.ProfilePage.init();
    wireExportButtons();

    // PATCH PERBAIKAN: sebelumnya applyNavbarLogo() cuma dipanggil 1x saat
    // ui.js pertama kali dimuat — jauh SEBELUM login & sebelum data
    // Pengaturan (termasuk logo) selesai diambil dari server, jadi logo
    // yang sudah diupload Super Admin tidak pernah kelihatan (selalu
    // fallback ke kotak placeholder). Sekarang dipanggil ULANG di sini,
    // setelah bootstrapData() pasti sudah selesai.
    if (window.ALUVE.Nav) window.ALUVE.Nav.applyNavbarLogo();

    // Retry any Sheet syncs left queued from a previous offline session.
    if (window.ALUVE.GSheetSync) window.ALUVE.GSheetSync.flushQueue();
  };
})();
