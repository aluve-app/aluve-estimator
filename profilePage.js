/**
 * profilePage.js — "Profil Saya" subpage: menampilkan info akun yang sedang
 * login, dan form ganti password mandiri (tidak perlu lagi minta Super
 * Admin reset-kan).
 *
 * Ganti password dilakukan LANGSUNG dari sisi Estimator ke Firebase
 * Identity Toolkit (pola yang sama seperti login di bootstrap.js), TANPA
 * perlu endpoint backend baru:
 *   1. Verifikasi password lama dengan re-login (accounts:signInWithPassword)
 *   2. Kalau cocok, set password baru (accounts:update) pakai idToken segar
 *      dari langkah 1
 *   3. idToken (dan refresh token, kalau "Remember Me" aktif) yang sedang
 *      dipakai app ini ikut di-update ke yang baru, supaya user TIDAK
 *      ter-logout setelah ganti password.
 *
 * Public API: window.ALUVE.ProfilePage
 */
window.ALUVE = window.ALUVE || {};

window.ALUVE.ProfilePage = (function () {
  'use strict';

  let dom = {};

  function cacheElements() {
    dom.nameDisplay = document.getElementById('profileNameDisplay');
    dom.emailDisplay = document.getElementById('profileEmailDisplay');
    dom.roleDisplay = document.getElementById('profileRoleDisplay');
    dom.businessDisplay = document.getElementById('profileBusinessDisplay');
    dom.currentPassword = document.getElementById('profileCurrentPassword');
    dom.newPassword = document.getElementById('profileNewPassword');
    dom.confirmPassword = document.getElementById('profileConfirmPassword');
    dom.error = document.getElementById('profilePasswordError');
    dom.submitBtn = document.getElementById('profileChangePasswordBtn');
  }

  const ROLE_LABELS = { super_admin: 'Super Admin', manager: 'Manager', sales: 'Sales', estimator: 'Estimator' };

  /** Dipanggil dari bootstrap.js setelah login sukses/refresh data, supaya info akun selalu terkini. */
  function renderUser(user) {
    if (!dom.nameDisplay || !user) return;
    dom.nameDisplay.value = user.name || '-';
    dom.emailDisplay.value = user.email || '-';
    dom.roleDisplay.value = ROLE_LABELS[user.role] || user.role || '-';
    dom.businessDisplay.value = (user.business_id || '-').toUpperCase();
  }

  function setError(msg) {
    if (dom.error) dom.error.textContent = msg || '';
  }

  function resetForm() {
    dom.currentPassword.value = '';
    dom.newPassword.value = '';
    dom.confirmPassword.value = '';
  }

  async function handleChangePassword() {
    setError('');
    const currentPw = dom.currentPassword.value;
    const newPw = dom.newPassword.value;
    const confirmPw = dom.confirmPassword.value;

    if (!currentPw || !newPw || !confirmPw) { setError('Semua kolom wajib diisi.'); return; }
    if (newPw.length < 6) { setError('Password baru minimal 6 karakter.'); return; }
    if (newPw !== confirmPw) { setError('Konfirmasi password baru tidak cocok.'); return; }

    dom.submitBtn.disabled = true;
    dom.submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';

    const result = await window.EstAuth.changePassword(currentPw, newPw);

    dom.submitBtn.disabled = false;
    dom.submitBtn.innerHTML = '<i class="bi bi-key"></i> Simpan Password Baru';

    if (!result.success) {
      setError(result.message || 'Gagal mengganti password.');
      return;
    }

    resetForm();
    window.ALUVE.UiFeedback.showToast('Password berhasil diganti.', 'success');
  }

  function bindEvents() {
    if (dom.submitBtn) dom.submitBtn.addEventListener('click', handleChangePassword);
    [dom.currentPassword, dom.newPassword, dom.confirmPassword].forEach(function (input) {
      if (!input) return;
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleChangePassword(); });
    });
  }

  function init() {
    cacheElements();
    bindEvents();
  }

  return { init: init, renderUser: renderUser };
})();
