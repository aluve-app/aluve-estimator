/**
 * dashboardPage.js — wires the Dashboard and All Projects screens to
 * ALUVE.Project, and owns the New Project modal / project-level
 * Duplicate & Delete actions used from both screens' project cards.
 *
 * Public API: window.ALUVE.DashboardPage
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.DashboardPage = (function () {
  'use strict';

  const Helper = window.ALUVE.Helper;
  const Calculator = window.ALUVE.Calculator;
  const Project = window.ALUVE.Project;
  const UiFeedback = window.ALUVE.UiFeedback;

  const STATUS_LABELS = { draft: 'Draft', sent: 'Terkirim', won: 'Deal', lost: 'Batal' };
  const STATUS_CLASSES = { draft: 'status-chip--draft', sent: 'status-chip--sent', won: 'status-chip--won', lost: 'status-chip--lost' };
  const STALE_DAYS_THRESHOLD = 7; // matches the business's own documented 1-week escalation pattern

  let dom = {};
  let pendingDeleteProjectId = null; // set right before the confirm-delete dialog opens
  let editingProjectId = null; // non-null while #modalNewProject is being reused as "Edit Project"

  function notify(message, variant) {
    UiFeedback.showToast(message, variant);
  }

  function cacheElements() {
    dom.dashboardGrid = document.getElementById('dashboardRecentProjects');
    dom.allProjectsGrid = document.getElementById('allProjectsGrid');
    dom.searchInput = document.getElementById('allProjectsSearchInput');
    dom.statusFilter = document.getElementById('allProjectsStatusFilter');
    dom.followupSection = document.getElementById('followupSection');
    dom.followupList = document.getElementById('followupList');
    dom.staleStatCard = document.getElementById('staleStatCard');

    dom.stat = {
      activeCount: document.querySelector('[data-stat="activeCount"]'),
      sentCount: document.querySelector('[data-stat="sentCount"]'),
      pipelineValue: document.querySelector('[data-stat="pipelineValue"]'),
      wonCount: document.querySelector('[data-stat="wonCount"]'),
      lostCount: document.querySelector('[data-stat="lostCount"]'),
      staleCount: document.querySelector('[data-stat="staleCount"]')
    };

    dom.modalNewProjectEl = document.getElementById('modalNewProject');
    dom.modalNewProjectLabel = document.getElementById('modalNewProjectLabel');
    dom.newProjectClientName = document.getElementById('newProjectClientName');
    dom.newProjectQuotationNumber = document.getElementById('newProjectQuotationNumber');
    dom.newProjectDate = document.getElementById('newProjectDate');
    dom.newProjectName = document.getElementById('newProjectName');
    dom.newProjectLocation = document.getElementById('newProjectLocation');
    dom.newProjectCustomerPhone = document.getElementById('newProjectCustomerPhone');
    dom.newProjectSalesRep = document.getElementById('newProjectSalesRep');
    dom.newProjectLeadSource = document.getElementById('newProjectLeadSource');
    dom.newProjectLeadSourceOther = document.getElementById('newProjectLeadSourceOther');
    dom.newProjectSubmitBtn = document.getElementById('newProjectSubmitBtn');

    dom.modalConfirmDeleteEl = document.getElementById('modalConfirmDelete');
    dom.confirmDeleteBtn = dom.modalConfirmDeleteEl.querySelector('.btn-danger');
  }

  /** Days since a project's updatedAt — used for both the stale-count stat and the follow-up list. */
  function daysSinceUpdate(project) {
    const updated = new Date(project.updatedAt).getTime();
    if (!Number.isFinite(updated)) return 0;
    return Math.floor((Date.now() - updated) / (1000 * 60 * 60 * 24));
  }

  /** Days since a project's createdAt — powers the "sejak kapan dibuat" line on each card. */
  function daysSinceCreated(project) {
    const created = new Date(project.createdAt).getTime();
    if (!Number.isFinite(created)) return 0;
    return Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
  }

  function daysSinceCreatedLabel(project) {
    const days = daysSinceCreated(project);
    if (days <= 0) return 'Dibuat hari ini';
    if (days === 1) return 'Dibuat 1 hari lalu';
    return 'Dibuat ' + days + ' hari lalu';
  }

  function isStaleLead(project) {
    return project.status === 'sent' && daysSinceUpdate(project) >= STALE_DAYS_THRESHOLD;
  }

  function renderStats(projects) {
    const activeCount = projects.filter(function (p) { return p.status === 'draft' || p.status === 'sent'; }).length;
    const sentCount = projects.filter(function (p) { return p.status === 'sent'; }).length;
    const wonCount = projects.filter(function (p) { return p.status === 'won'; }).length;
    const lostCount = projects.filter(function (p) { return p.status === 'lost'; }).length;
    const staleProjects = projects.filter(isStaleLead);

    const pipelineValue = projects
      .filter(function (p) { return p.status !== 'lost'; })
      .reduce(function (sum, p) { return sum + Calculator.calcProjectSummary(p.items, p.projectDiscount).grandTotalAfterDiscount; }, 0);

    dom.stat.activeCount.textContent = String(activeCount);
    dom.stat.sentCount.textContent = String(sentCount);
    dom.stat.pipelineValue.textContent = Helper.formatCurrency(pipelineValue);
    dom.stat.wonCount.textContent = String(wonCount);
    dom.stat.lostCount.textContent = String(lostCount);
    dom.stat.staleCount.textContent = String(staleProjects.length);

    renderFollowupSection(staleProjects);
  }

  function renderFollowupSection(staleProjects) {
    if (staleProjects.length === 0) {
      dom.followupSection.classList.add('d-none');
      return;
    }
    dom.followupSection.classList.remove('d-none');

    dom.followupList.innerHTML = staleProjects.map(function (project) {
      return (
        '<div class="followup-banner" style="margin-bottom:8px;">' +
          '<div class="followup-banner__row">' +
            '<div><strong>' + Helper.escapeHtml(project.clientName) + '</strong>' +
              '<span class="text-muted"> &middot; ' + Helper.escapeHtml(project.projectName) + '</span></div>' +
            '<span class="text-muted small">Terkirim ' + daysSinceUpdate(project) + ' hari lalu &middot; belum ada respons</span>' +
            '<button class="btn btn-outline-primary btn-sm" data-action="open-project" data-project-id="' + project.projectId + '">Follow Up Sekarang</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  /** Shared card renderer for both the Dashboard's "recent" grid and the All Projects grid. */
  function projectCardHtml(project) {
    const summary = Calculator.calcProjectSummary(project.items, project.projectDiscount);
    const statusLabel = STATUS_LABELS[project.status] || project.status;
    const statusClass = STATUS_CLASSES[project.status] || 'status-chip--draft';

    return (
      '<article class="project-card" data-project-id="' + project.projectId + '">' +
        '<div class="project-card__top">' +
          '<h3 class="project-card__client">' + Helper.escapeHtml(project.clientName) + '</h3>' +
          '<span class="status-chip ' + statusClass + '">' + statusLabel + (isStaleLead(project) ? ' <span class="status-chip__dot" aria-hidden="true"></span>' : '') + '</span>' +
        '</div>' +
        '<p class="project-card__meta">' + Helper.escapeHtml(project.projectName) + ' &middot; ' + Helper.escapeHtml(project.location || '-') + '</p>' +
        '<div class="project-card__bottom">' +
          '<span class="pill">' + project.items.length + ' item</span>' +
          '<span class="project-card__total">' + Helper.formatCurrency(summary.grandTotalAfterDiscount) + '</span>' +
        '</div>' +
        '<div class="project-card__created">' +
          '<span>Dibuat: ' + Helper.formatDate(project.createdAt) + '</span>' +
          '<span class="project-card__created-days">' + daysSinceCreatedLabel(project) + '</span>' +
        '</div>' +
        '<div class="project-card__footer">' +
          '<time>' + Helper.formatRelativeTime(project.updatedAt) + '</time>' +
          '<div class="project-card__actions">' +
            '<button class="icon-btn icon-btn--sm" type="button" data-action="duplicate-project" data-project-id="' + project.projectId + '" aria-label="Duplikat project" title="Duplikat"><i class="bi bi-copy"></i></button>' +
            '<button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-action="request-delete-project" data-project-id="' + project.projectId + '" aria-label="Hapus project" title="Hapus"><i class="bi bi-trash3"></i></button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderEmptyOrGrid(gridEl, projects) {
    if (projects.length === 0) {
      gridEl.innerHTML = '<p class="text-muted small">Belum ada project yang cocok.</p>';
      return;
    }
    gridEl.innerHTML = projects.map(projectCardHtml).join('');
  }

  function renderAll() {
    const allProjects = Project.getAllProjects();
    renderStats(allProjects);
    renderEmptyOrGrid(dom.dashboardGrid, allProjects.slice(0, 6));
    renderProjectsPage();
  }

  function renderProjectsPage() {
    let projects = Project.searchProjects(dom.searchInput.value);
    const statusValue = dom.statusFilter.value;
    if (statusValue) projects = projects.filter(function (p) { return p.status === statusValue; });
    renderEmptyOrGrid(dom.allProjectsGrid, projects);
  }

  /* ----------------------------------------------------------
     New Project / Edit Project modal — #modalNewProject is shared
     between both flows. When editingProjectId is set, the modal opens
     pre-filled with that project's full data (per Anto's request that
     the rename pencil should allow editing every field, not just the
     name) and submit calls Project.updateProjectMeta() instead of
     Project.createProject().
  ---------------------------------------------------------- */
  function readProjectFormFields() {
    return {
      quotationNumber: dom.newProjectQuotationNumber.value,
      projectDate: dom.newProjectDate.value,
      clientName: dom.newProjectClientName.value,
      projectName: dom.newProjectName.value,
      location: dom.newProjectLocation.value,
      customerPhone: dom.newProjectCustomerPhone.value,
      salesRep: dom.newProjectSalesRep.value,
      leadSource: dom.newProjectLeadSource.value,
      leadSourceOther: dom.newProjectLeadSourceOther.value
    };
  }

  function clearProjectForm() {
    dom.newProjectQuotationNumber.value = '';
    dom.newProjectClientName.value = '';
    dom.newProjectName.value = '';
    dom.newProjectLocation.value = '';
    dom.newProjectCustomerPhone.value = '';
    dom.newProjectSalesRep.value = '';
    dom.newProjectLeadSource.value = '';
    dom.newProjectLeadSourceOther.value = '';
    dom.newProjectLeadSourceOther.classList.add('d-none');
  }

  /**
   * Opens #modalNewProject pre-filled with an existing project's data,
   * in "edit" mode. Called from ProjectDetailPage's title-pencil button.
   * @param {Object} project
   */
  function openEditProjectModal(project) {
    if (!project) return;
    editingProjectId = project.projectId;

    dom.modalNewProjectLabel.textContent = 'Edit Project';
    dom.newProjectSubmitBtn.textContent = 'Simpan Perubahan';

    dom.newProjectQuotationNumber.value = project.quotationNumber || '';
    dom.newProjectDate.value = project.projectDate || '';
    dom.newProjectClientName.value = project.clientName || '';
    dom.newProjectName.value = project.projectName || '';
    dom.newProjectLocation.value = project.location || '';
    dom.newProjectCustomerPhone.value = project.customerPhone || '';
    dom.newProjectSalesRep.value = project.salesRep || '';
    dom.newProjectLeadSource.value = project.leadSource || '';
    dom.newProjectLeadSourceOther.value = project.leadSourceOther || '';
    dom.newProjectLeadSourceOther.classList.toggle('d-none', project.leadSource !== 'other');

    new window.bootstrap.Modal(dom.modalNewProjectEl).show();
  }

  function resetModalToCreateMode() {
    editingProjectId = null;
    dom.modalNewProjectLabel.textContent = 'Project Baru';
    dom.newProjectSubmitBtn.textContent = 'Buat Project & Tambah Item Pertama \u2192';
    clearProjectForm();
  }

  function handleCreateProject() {
    const fields = readProjectFormFields();

    if (editingProjectId) {
      const projectId = editingProjectId;
      const result = Project.updateProjectMeta(projectId, fields);
      if (!result.success) {
        notify(result.message, 'danger');
        return;
      }

      const modalInstance = window.bootstrap.Modal.getInstance(dom.modalNewProjectEl);
      if (modalInstance) modalInstance.hide();

      notify('Project berhasil diperbarui', 'success');
      renderAll();
      // Refresh Project Detail's own header/summary if that's the project open right now
      if (window.ALUVE.ProjectDetailPage.getOpenProject() && window.ALUVE.ProjectDetailPage.getOpenProject().projectId === projectId) {
        window.ALUVE.ProjectDetailPage.open(projectId);
      }
      return;
    }

    const result = Project.createProject(fields);

    if (!result.success) {
      notify(result.message, 'danger');
      return;
    }

    const modalInstance = window.bootstrap.Modal.getInstance(dom.modalNewProjectEl);
    if (modalInstance) modalInstance.hide();

    clearProjectForm();

    notify('Project berhasil dibuat', 'success');
    renderAll();
    window.ALUVE.ProjectDetailPage.open(result.project.projectId);
  }

  /* ----------------------------------------------------------
     Project-card actions (event delegation on both grids)
  ---------------------------------------------------------- */
  function handleGridClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
      event.preventDefault();
      const projectId = actionTarget.dataset.projectId;
      const action = actionTarget.dataset.action;

      if (action === 'duplicate-project') {
        const result = Project.duplicateProject(projectId);
        notify(result.message, result.success ? 'success' : 'danger');
        if (result.success) renderAll();
        return;
      }
      if (action === 'request-delete-project') {
        pendingDeleteProjectId = projectId;
        new window.bootstrap.Modal(dom.modalConfirmDeleteEl).show();
        return;
      }
      if (action === 'open-project') {
        window.ALUVE.ProjectDetailPage.open(projectId);
        return;
      }
    }

    // Clicking the card body itself (not an action button) opens the project
    const card = event.target.closest('.project-card');
    if (card) window.ALUVE.ProjectDetailPage.open(card.dataset.projectId);
  }

  function handleConfirmDelete() {
    if (!pendingDeleteProjectId) return;
    const result = Project.deleteProject(pendingDeleteProjectId);
    notify(result.message, result.success ? 'success' : 'danger');
    pendingDeleteProjectId = null;
    if (result.success) renderAll();
  }

  function bindEvents() {
    dom.dashboardGrid.addEventListener('click', handleGridClick);
    dom.allProjectsGrid.addEventListener('click', handleGridClick);
    dom.followupList.addEventListener('click', handleGridClick);

    dom.newProjectSubmitBtn.addEventListener('click', handleCreateProject);
    dom.confirmDeleteBtn.addEventListener('click', handleConfirmDelete);
    dom.modalNewProjectEl.addEventListener('show.bs.modal', function () {
      if (!editingProjectId) dom.newProjectDate.value = new Date().toISOString().slice(0, 10);
    });
    // Always return the shared modal to "create" mode once it's fully closed —
    // covers both a completed submit and the user cancelling out.
    dom.modalNewProjectEl.addEventListener('hidden.bs.modal', resetModalToCreateMode);
    dom.newProjectLeadSource.addEventListener('change', function () {
      dom.newProjectLeadSourceOther.classList.toggle('d-none', dom.newProjectLeadSource.value !== 'other');
    });

    dom.searchInput.addEventListener('input', Helper.debounce(renderProjectsPage, 200));
    dom.statusFilter.addEventListener('change', renderProjectsPage);

    // "Perlu Ditindaklanjuti" stat card jumps straight to the list of
    // stale leads right below it, so the number is never just a number.
    if (dom.staleStatCard) {
      dom.staleStatCard.addEventListener('click', function () {
        if (dom.followupSection.classList.contains('d-none')) {
          notify('Tidak ada project yang perlu ditindaklanjuti saat ini.', 'info');
          return;
        }
        dom.followupSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function init() {
    cacheElements();
    bindEvents();
    renderAll();
  }

  return { init: init, renderAll: renderAll, openEditProjectModal: openEditProjectModal };
})();
