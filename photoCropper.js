/**
 * photoCropper.js — a thin, reusable wrapper around Cropper.js (CDN)
 * that drives the shared #modalPhotoCrop modal. Any part of the app that
 * needs "pick an image, let the user crop it, get back a data URL" calls
 * PhotoCropper.open() instead of reinventing this flow — currently used
 * by the Item Editor's photo field and Settings' logo upload.
 *
 * Public API: window.ALUVE.PhotoCropper
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.PhotoCropper = (function () {
  'use strict';

  let dom = null;
  let cropperInstance = null;
  let modalInstance = null;
  let activeOptions = null; // { maxWidth, maxHeight, quality, aspectRatio, onDone }
  let objectUrl = null; // revoked on close to avoid leaking memory

  function cacheElements() {
    if (dom) return;
    dom = {
      modalEl: document.getElementById('modalPhotoCrop'),
      image: document.getElementById('photoCropImage'),
      confirmBtn: document.getElementById('photoCropConfirmBtn'),
      cancelBtn: document.getElementById('photoCropCancelBtn')
    };
  }

  function teardown() {
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    activeOptions = null;
  }

  function handleConfirm() {
    if (!cropperInstance || !activeOptions) return;
    const canvas = cropperInstance.getCroppedCanvas({
      maxWidth: activeOptions.maxWidth,
      maxHeight: activeOptions.maxHeight,
      imageSmoothingQuality: 'high'
    });
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/jpeg', activeOptions.quality);
    const callback = activeOptions.onDone;
    modalInstance.hide();
    if (callback) callback(dataUrl);
  }

  /**
   * Opens the crop modal for a given File, and calls onDone(dataUrl) once
   * the user confirms their crop. Does nothing (silently) if the file
   * fails basic type/size validation — the caller's file input keeps
   * whatever it had before.
   * @param {File} file
   * @param {Object} [options]
   * @param {number} [options.maxWidth=800] - max output width in px
   * @param {number} [options.maxHeight=800] - max output height in px
   * @param {number} [options.quality=0.8] - JPEG quality 0-1
   * @param {number} [options.aspectRatio] - lock crop box ratio (e.g. 1 for square); omit for free-form
   * @param {number} [options.maxInputBytes=8*1024*1024]
   * @param {function(string):void} options.onDone - called with the cropped image's data URL
   */
  function open(file, options) {
    cacheElements();
    if (!dom.modalEl) return;

    if (!file) return;
    if (!file.type || file.type.indexOf('image/') !== 0) {
      window.ALUVE.UiFeedback.showToast('File harus berupa gambar (PNG/JPG).', 'danger');
      return;
    }
    const maxInputBytes = (options && options.maxInputBytes) || 8 * 1024 * 1024;
    if (file.size > maxInputBytes) {
      window.ALUVE.UiFeedback.showToast('Ukuran file maksimal ' + Math.round(maxInputBytes / (1024 * 1024)) + 'MB.', 'danger');
      return;
    }

    activeOptions = {
      maxWidth: (options && options.maxWidth) || 800,
      maxHeight: (options && options.maxHeight) || 800,
      quality: (options && options.quality) || 0.8,
      aspectRatio: options && options.aspectRatio, // undefined = free-form, matches Cropper.js default
      onDone: options && options.onDone
    };

    objectUrl = URL.createObjectURL(file);
    dom.image.src = objectUrl;

    if (!modalInstance) modalInstance = new window.bootstrap.Modal(dom.modalEl);
    modalInstance.show();
  }

  function init() {
    cacheElements();
    if (!dom.modalEl) return;

    // Cropper.js needs the <img> to be visible/laid-out before it can
    // measure it, so (re)initialize only once the modal has finished
    // its show transition — not on the plain 'show' event.
    dom.modalEl.addEventListener('shown.bs.modal', function () {
      if (cropperInstance) cropperInstance.destroy();
      cropperInstance = new window.Cropper(dom.image, {
        aspectRatio: activeOptions ? activeOptions.aspectRatio : NaN,
        viewMode: 1,
        autoCropArea: 1,
        responsive: true,
        background: false
      });
    });

    dom.modalEl.addEventListener('hidden.bs.modal', teardown);
    dom.confirmBtn.addEventListener('click', handleConfirm);
  }

  return { init: init, open: open };
})();
