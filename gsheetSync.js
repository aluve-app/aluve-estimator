/**
 * gsheetSync.js — pushes every created/updated project (including pure
 * status changes) to a Google Sheet via a Google Apps Script Web App,
 * as an off-device backup/database. Fire-and-forget: never blocks the
 * UI or the LocalStorage save in Storage.saveProject. Since the app must
 * keep working with no signal at a project site, failed/unconfirmed
 * pushes are queued in LocalStorage and retried when back online or on
 * the next save.
 *
 * Configure the target Web App URL in Pengaturan > Integrasi Google
 * Sheet. Leave it blank to disable sync entirely.
 *
 * Public API: window.ALUVE.GSheetSync
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.GSheetSync = (function () {
  'use strict';

  const QUEUE_KEY = 'aluve_sheet_sync_queue';

  // Mirrors the labels used elsewhere in the app (dashboard/project
  // detail) so the Sheet shows the same human-readable Indonesian text
  // instead of raw internal keys like "won" or "ads".
  const LEAD_SOURCE_LABELS = {
    ads: 'Ads (Meta/Google)',
    canvasing: 'Canvasing',
    referral: 'Referral',
    organic: 'Website/Organic',
    event: 'Pameran (IBT, dll)',
    walkin: 'Showroom Walk-in',
    other: 'Lainnya'
  };
  const STATUS_LABELS = { draft: 'Draft', sent: 'Terkirim', won: 'Deal / Won', lost: 'Batal' };

  function getWebhookUrl() {
    const settings = window.ALUVE.Storage.getSettings();
    return (settings && settings.sheetWebhookUrl || '').trim();
  }

  function resolveLeadSourceLabel(project) {
    if (!project || !project.leadSource) return '-';
    if (project.leadSource === 'other') return project.leadSourceOther || 'Lainnya';
    return LEAD_SOURCE_LABELS[project.leadSource] || project.leadSource;
  }

  /**
   * Builds the flat payload sent to Apps Script, matching the requested
   * column order: No | Tanggal | Nama Customer | No Telpon | Lokasi |
   * Sumber Leads | Status | Nama Sales | Value Setelah Diskon.
   * ("No" is generated on the Sheet side as a row formula, not sent here.)
   * @param {Object} project
   * @returns {Object}
   */
  function buildPayload(project) {
    const summary = window.ALUVE.Calculator.calcProjectSummary(project.items || []);
    return {
      projectId: project.projectId,
      tanggal: project.projectDate || project.createdAt || '',
      namaCustomer: project.clientName || '',
      noTelpon: project.customerPhone || '',
      lokasi: project.location || '',
      sumberLeads: resolveLeadSourceLabel(project),
      status: STATUS_LABELS[project.status] || project.status || '',
      namaSales: project.salesRep || '',
      valueSetelahDiskon: summary.grandTotalAfterDiscount || 0
    };
  }

  function readQueue() {
    try {
      const raw = window.localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('[GSheetSync] Failed to read queue:', err);
      return [];
    }
  }

  function writeQueue(queue) {
    try {
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (err) {
      console.error('[GSheetSync] Failed to write queue:', err);
    }
  }

  /** Replaces any queued entry for the same project (latest state wins). */
  function enqueue(payload) {
    const queue = readQueue().filter(function (p) { return p.projectId !== payload.projectId; });
    queue.push(payload);
    writeQueue(queue);
  }

  function dequeue(projectId) {
    writeQueue(readQueue().filter(function (p) { return p.projectId !== projectId; }));
  }

  function getQueueCount() {
    return readQueue().length;
  }

  /**
   * POSTs one payload to the configured Apps Script Web App. Uses a
   * text/plain content type (a documented workaround for Apps Script Web
   * Apps) so the browser treats it as a CORS "simple request" and skips
   * the OPTIONS preflight, which Apps Script does not handle.
   * @param {Object} payload
   * @returns {Promise<boolean>} whether the push was confirmed successful
   */
  function sendToSheet(payload) {
    const url = getWebhookUrl();
    if (!url) return Promise.resolve(false);

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.ok; })
      .catch(function (err) {
        console.warn('[GSheetSync] Push failed, will retry later:', err);
        return false;
      });
  }

  /**
   * Called after every Storage.saveProject — queues the project's current
   * state and attempts an immediate push. On success the queue entry is
   * cleared; on failure (offline, bad URL, etc.) it stays queued and will
   * be retried by flushQueue().
   * @param {Object} project
   * @returns {Promise<boolean>}
   */
  function pushProject(project) {
    if (!getWebhookUrl()) return Promise.resolve(false);
    const payload = buildPayload(project);
    enqueue(payload);
    return sendToSheet(payload).then(function (ok) {
      if (ok) dequeue(payload.projectId);
      return ok;
    });
  }

  /** Retries every queued (not-yet-confirmed) project push. */
  function flushQueue() {
    if (!getWebhookUrl()) return;
    readQueue().forEach(function (payload) {
      sendToSheet(payload).then(function (ok) {
        if (ok) dequeue(payload.projectId);
      });
    });
  }

  window.addEventListener('online', flushQueue);

  return {
    pushProject: pushProject,
    flushQueue: flushQueue,
    getQueueCount: getQueueCount
  };
})();
