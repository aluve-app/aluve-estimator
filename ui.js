/**
 * ui.js — presentation-only interaction wiring for the ALUVE Project Estimator shell.
 *
 * IMPORTANT: This file intentionally contains ZERO business/calculation logic
 * (no pricing math, no totals, no discount rules). It only handles:
 *   - theme (light/dark) toggling + persistence
 *   - sidebar nav → page section switching
 *   - item card expand/collapse
 *   - mobile sticky summary sheet expand/collapse
 *
 * Calculation logic (calculator.js, priceManager.js, storage.js) is built in
 * Phase 5 per the approved architecture — this file will be refactored into
 * proper modules (per the folder structure in the Phase 1 SRS) at that point.
 */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     Theme toggle (dark mode preparation)
  ---------------------------------------------------------- */
  const THEME_STORAGE_KEY = 'aluve_theme_preference';
  const rootEl = document.documentElement;
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeToggleIcon = document.getElementById('themeToggleIcon');

  function applyTheme(theme) {
    rootEl.setAttribute('data-theme', theme);
    if (themeToggleIcon) {
      themeToggleIcon.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
    }
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved) {
      applyTheme(saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function () {
      const current = rootEl.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem(THEME_STORAGE_KEY, next);
    });
  }

  initTheme();

  /* ----------------------------------------------------------
     Sidebar offcanvas — safety net (QA fix)
     Belt-and-suspenders alongside the #appSidebar CSS overrides above:
     forces the sidebar visible via inline styles (which always win over
     any stylesheet rule) the moment Bootstrap's own Offcanvas component
     fires its show/hide events, so the visual state can never depend on
     a CSS specificity contest with Bootstrap's bundled rules.
  ---------------------------------------------------------- */
  const appSidebarEl = document.getElementById('appSidebar');
  if (appSidebarEl) {
    appSidebarEl.addEventListener('show.bs.offcanvas', function () {
      appSidebarEl.style.transform = 'none';
      appSidebarEl.style.visibility = 'visible';
      appSidebarEl.style.zIndex = '1046';
    });
    appSidebarEl.addEventListener('hidden.bs.offcanvas', function () {
      appSidebarEl.style.transform = '';
      appSidebarEl.style.visibility = '';
      appSidebarEl.style.zIndex = '';
    });
  }

  /* ----------------------------------------------------------
     Mobile search toggle (QA fix — see css/style.css §6 note)
  ---------------------------------------------------------- */
  const navbar = document.querySelector('.app-navbar');
  const searchToggleBtn = document.getElementById('navbarSearchToggle');
  const navbarSearchInput = document.querySelector('#navbarSearch input');

  if (searchToggleBtn && navbar) {
    searchToggleBtn.addEventListener('click', function () {
      const isOpen = navbar.classList.toggle('is-search-open');
      searchToggleBtn.setAttribute('aria-expanded', String(isOpen));
      if (isOpen && navbarSearchInput) navbarSearchInput.focus();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && navbar.classList.contains('is-search-open')) {
        navbar.classList.remove('is-search-open');
        searchToggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ----------------------------------------------------------
     Sidebar navigation → page section switching
  ---------------------------------------------------------- */
  const navLinks = document.querySelectorAll('[data-page]');
  const pageSections = document.querySelectorAll('[data-page-section]');

  function showPage(pageKey) {
    pageSections.forEach(function (section) {
      section.classList.toggle('is-active', section.dataset.pageSection === pageKey);
    });
    navLinks.forEach(function (link) {
      link.classList.toggle('is-active', link.dataset.page === pageKey);
    });
    // Close the mobile off-canvas sidebar after navigating, if open
    const offcanvasEl = document.getElementById('appSidebar');
    if (offcanvasEl && window.bootstrap) {
      const instance = window.bootstrap.Offcanvas.getInstance(offcanvasEl);
      if (instance) instance.hide();
    }
  }

  navLinks.forEach(function (link) {
    link.addEventListener('click', function (event) {
      if (!link.dataset.page) return;
      event.preventDefault();
      showPage(link.dataset.page);
    });
  });

  /* ----------------------------------------------------------
     "Semua Project" sidebar group — collapse/expand toggle only.
     Which sublink is highlighted, and which data gets shown, is
     handled by dashboardPage.js (business logic for scope filtering).
  ---------------------------------------------------------- */
  const projectsGroupToggle = document.getElementById('sidebarProjectsGroupToggle');
  const projectsSubmenu = document.getElementById('sidebarProjectsSubmenu');
  if (projectsGroupToggle && projectsSubmenu) {
    projectsGroupToggle.addEventListener('click', function () {
      const collapsed = projectsSubmenu.classList.toggle('is-collapsed');
      projectsGroupToggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  // Exposed so other modules (dashboardPage.js opening a project, etc.)
  // can navigate between screens without duplicating this logic.
  /* ----------------------------------------------------------
     Navbar logo — reflects whatever logo is saved in Settings
     (used both for the exported PDF letterhead and the app's own
     header, per Anto's request).
  ---------------------------------------------------------- */
  function applyNavbarLogo() {
    const settings = window.ALUVE.Storage.getSettings();
    const logoImg = document.getElementById('navbarBrandLogo');
    const fallbackMark = document.getElementById('navbarBrandMark');
    if (!logoImg || !fallbackMark) return;

    if (settings.logoDataUrl) {
      logoImg.src = settings.logoDataUrl;
      logoImg.classList.remove('d-none');
      fallbackMark.classList.add('d-none');
    } else {
      logoImg.classList.add('d-none');
      fallbackMark.classList.remove('d-none');
    }
  }
  applyNavbarLogo();

  window.ALUVE.Nav = { showPage: showPage, applyNavbarLogo: applyNavbarLogo };

  /* ----------------------------------------------------------
     Item card expand/collapse
     QA FIX: the previous version bound listeners with
     querySelectorAll('[data-toggle-item]').forEach(...) at load time
     only. Once project.js starts adding/removing Item Cards dynamically,
     any card created after this script ran would silently have no
     click handler at all. Event delegation on a stable ancestor fixes
     this permanently — no rebinding is ever needed again.
  ---------------------------------------------------------- */
  document.addEventListener('click', function (event) {
    const trigger = event.target.closest('[data-toggle-item]');
    if (!trigger) return;
    if (event.target.closest('.item-card__overflow')) return;

    const card = trigger.closest('.item-card');
    if (!card) return;
    card.classList.toggle('is-expanded');

    const chevron = card.querySelector('.item-card__chevron');
    if (chevron) chevron.classList.toggle('is-open');
  });

  /* ----------------------------------------------------------
     Mobile sticky summary sheet
  ---------------------------------------------------------- */
  const mobileSummary = document.getElementById('mobileSummary');
  const mobileSummaryToggle = document.getElementById('mobileSummaryToggle');

  if (mobileSummaryToggle && mobileSummary) {
    mobileSummaryToggle.addEventListener('click', function () {
      const isOpen = mobileSummary.classList.toggle('is-open');
      mobileSummaryToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }
})();
