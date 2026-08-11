/**
 * ============================================================
 * TRASHPAGE.JS
 * ============================================================
 * Halaman "Sampah" — menampilkan project yang sudah di-soft-delete
 * (Project.deleteProject sekarang cuma menandai isDeleted, bukan hapus
 * sungguhan — lihat project.js). Dari sini project bisa:
 *   - Dipulihkan (Project.restoreProject) — balik ke Dashboard/Semua Project
 *   - Dihapus PERMANEN (Project.permanentlyDeleteProject) — beneran hilang
 *     dari server, tidak bisa dibatalkan
 * ============================================================ */
window.ALUVE = window.ALUVE || {};

window.ALUVE.TrashPage = (function () {
  'use strict';

  const Project = window.ALUVE.Project;
  const Helper = window.ALUVE.Helper;
  const UiFeedback = window.ALUVE.UiFeedback;

  function notify(message, variant) {
    if (UiFeedback && UiFeedback.showToast) UiFeedback.showToast(message, variant);
  }

  function formatDate(iso) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '-'; }
  }

  function render() {
    const listEl = document.getElementById('trashList');
    if (!listEl) return;

    const trashed = Project.getTrashedProjects();

    if (trashed.length === 0) {
      listEl.innerHTML = '<p class="text-muted small">Sampah kosong — tidak ada project yang dihapus.</p>';
      return;
    }

    listEl.innerHTML = trashed.map(function (p) {
      return (
        '<div class="trash-row" data-project-id="' + p.projectId + '">' +
          '<div class="trash-row__main">' +
            '<h3 class="trash-row__client">' + Helper.escapeHtml(p.clientName || '(Tanpa nama)') + '</h3>' +
            '<p class="trash-row__meta">' + Helper.escapeHtml(p.projectName || '-') + ' &middot; Dihapus ' + formatDate(p.deletedAt) + '</p>' +
          '</div>' +
          '<div class="trash-row__actions">' +
            '<button class="btn-secondary" data-trash-action="restore" data-project-id="' + p.projectId + '"><i class="bi bi-arrow-counterclockwise"></i> Pulihkan</button>' +
            '<button class="btn-danger" data-trash-action="delete-permanent" data-project-id="' + p.projectId + '"><i class="bi bi-trash3"></i> Hapus Permanen</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function handleClick(event) {
    const btn = event.target.closest('[data-trash-action]');
    if (!btn) return;
    const action = btn.dataset.trashAction;
    const projectId = btn.dataset.projectId;

    if (action === 'restore') {
      const result = Project.restoreProject(projectId);
      notify(result.message, result.success ? 'success' : 'danger');
      if (result.success) {
        render();
        if (window.ALUVE.DashboardPage) window.ALUVE.DashboardPage.renderAll();
      }
      return;
    }

    if (action === 'delete-permanent') {
      const confirmed = window.confirm('Hapus project ini PERMANEN? Semua data quotation & itemnya akan hilang total dan TIDAK BISA dikembalikan lagi.');
      if (!confirmed) return;
      const result = Project.permanentlyDeleteProject(projectId);
      notify(result.message, result.success ? 'success' : 'danger');
      if (result.success) render();
      return;
    }
  }

  function init() {
    const listEl = document.getElementById('trashList');
    if (listEl) listEl.addEventListener('click', handleClick);
    render();
  }

  return { init: init, render: render };
})();
