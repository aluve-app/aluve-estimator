/**
 * uiFeedback.js — a tiny shared helper for showing toast notifications
 * from any module (settingsPage.js, priceManagerPage.js, and later
 * project.js) without each one reinventing Bootstrap's toast API.
 *
 * Public API: window.ALUVE.UiFeedback
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.UiFeedback = (function () {
  'use strict';

  const Helper = window.ALUVE.Helper;

  /**
   * Shows a transient toast message using Bootstrap's Toast component.
   * Creates and destroys its own DOM node each time so callers never need
   * to manage toast lifecycle themselves.
   * @param {string} message
   * @param {'success'|'danger'|'info'} [variant]
   * @param {number} [delayMs]
   */
  function showToast(message, variant, delayMs) {
    const container = document.getElementById('toastContainer');
    if (!container || !window.bootstrap) {
      console.log('[Toast:' + (variant || 'info') + ']', message);
      return;
    }

    const icon = variant === 'danger' ? 'bi-exclamation-circle' : (variant === 'success' ? 'bi-check-circle' : 'bi-info-circle');
    const el = document.createElement('div');
    el.className = 'toast app-toast app-toast--' + (variant || 'success');
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<i class="bi ' + icon + '"></i>' +
      '<div class="app-toast__body">' + Helper.escapeHtml(message) + '</div>' +
      '<button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Tutup"></button>';

    container.appendChild(el);
    const toast = new window.bootstrap.Toast(el, { delay: delayMs || 3000 });
    el.addEventListener('hidden.bs.toast', function () { el.remove(); });
    toast.show();
  }

  return { showToast: showToast };
})();
