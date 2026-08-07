/**
 * ============================================================
 * BOOTSTRAP.JS — PATCH MULTI-USER (baru ditambahkan)
 * ============================================================
 * Satu-satunya file yang benar-benar baru di seluruh app ini.
 * Tugasnya:
 *   1. Login (Firebase Auth REST, sama seperti Sales App)
 *   2. Setelah login sukses, tarik data project/katalog harga/
 *      settings dari backend, taruh di window.__EST (dibaca
 *      Storage.* yang sudah dipatch di atas)
 *   3. Baru setelah itu nyalakan app asli lewat
 *      window.__startEstimatorApp()
 * ============================================================
 */
(function () {
  'use strict';

  const WORKER_BASE_URL = 'https://svs-api.aluve.workers.dev';
  const FIREBASE_API_KEY = 'AIzaSyByAh6qbd0YS4QcMI3WwBpPjbDU1jDAlWQ';

  let idToken = null;
  let currentUser = null;

  window.EstApi = {
    businessId: function () { return currentUser && currentUser.business_id; },
    currentUser: function () { return currentUser; },
    call: function (action, payload) {
      return fetch(WORKER_BASE_URL + '/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
        body: JSON.stringify(payload || {})
      })
        .then(function (res) { return res.json(); })
        .catch(function () { return { success: false, message: 'Gagal terhubung ke server. Cek koneksi internet.' }; });
    }
  };

  function setLoginError(msg) {
    const el = document.getElementById('estLoginError');
    if (el) el.textContent = msg || '';
  }

  function updateNavbarForUser(user) {
    const initials = (user.name || user.email || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
    const avatarBtn = document.querySelector('.app-navbar__avatar');
    if (avatarBtn) avatarBtn.textContent = initials;
    const nameHeader = document.querySelector('.dropdown-header:not(.dropdown-header--sub)');
    if (nameHeader) nameHeader.textContent = user.name || user.email;
    const subHeader = document.querySelector('.dropdown-header--sub');
    if (subHeader) subHeader.textContent = (user.role || '') + ' \u00b7 ALUVE';
  }

  /**
   * Kalau role user BUKAN super_admin, Price Manager & Settings dibuat
   * read-only (input di-disable) — sesuai keputusan Anto: hanya
   * super_admin yang boleh edit katalog harga & pengaturan perusahaan.
   * Estimator biasa tetap bisa MELIHAT halaman-halaman ini.
   */
  function applyRoleRestrictions(user) {
    if (user.role === 'super_admin') return;

    [['page-price-manager', 'Anda login sebagai Estimator — Katalog Harga hanya bisa diedit oleh Super Admin.'],
     ['page-settings', 'Anda login sebagai Estimator — Pengaturan hanya bisa diedit oleh Super Admin.']]
      .forEach(function (pair) {
        const page = document.getElementById(pair[0]);
        if (!page) return;
        const banner = document.createElement('div');
        banner.className = 'est-readonly-banner';
        banner.textContent = pair[1];
        page.insertBefore(banner, page.firstChild);
        page.querySelectorAll('input, textarea, select, button.btn-primary').forEach(function (el) {
          if (el.closest('.est-readonly-banner')) return;
          el.setAttribute('disabled', 'disabled');
        });
      });
  }

  /**
   * PATCH BUG FIX: item katalog yang datang dari server (hasil migrasi)
   * TIDAK punya field "id" — id itu normalnya baru dikasih oleh
   * priceManager.js's buildCatalogFromSeed() saat seeding PERTAMA KALI
   * dari masterData.js. Karena kita melewati proses seeding itu (catalog
   * sudah langsung terisi dari server), item jadi tidak pernah dapat id
   * sama sekali — akibatnya PriceManager.getItemById() selalu gagal,
   * SKU yang dipilih di form Tambah Item selalu jadi Rp 0.
   *
   * Fungsi ini mereplikasi PERSIS logic buildCatalogFromSeed (assign id +
   * lastUpdated + isActive ke tiap item) — dijalankan sekali saat
   * bootstrap, SEBELUM window.__EST.catalog diisi, supaya seluruh app
   * (yang tidak diubah sama sekali) bisa jalan seperti biasa.
   */
  function ensureCatalogItemIds(catalog) {
    const Helper = window.ALUVE && window.ALUVE.Helper;
    if (!Helper || !catalog) return { catalog: catalog, changed: false };

    let changed = false;
    function enrichItem(item) {
      if (!item.id) {
        item.id = Helper.generateId('sku');
        item.lastUpdated = item.lastUpdated || new Date().toISOString();
        item.isActive = item.isActive !== false;
        changed = true;
      }
    }

    Object.keys(catalog.brand_tiers || {}).forEach(function (tierKey) {
      (catalog.brand_tiers[tierKey].groups || []).forEach(function (group) {
        (group.items || []).forEach(enrichItem);
      });
    });
    ((catalog.glass && catalog.glass.items) || []).forEach(enrichItem);
    ((catalog.other && catalog.other.items) || []).forEach(enrichItem);
    if (catalog.sealant && catalog.sealant.name) enrichItem(catalog.sealant);

    return { catalog: catalog, changed: changed };
  }

  async function bootstrapData(user) {
    window.__EST = window.__EST || {};
    window.__EST.user = user;

    const [projectsRes, catalogRes, settingsRes] = await Promise.all([
      window.EstApi.call('listLegacyProjects', {}),
      window.EstApi.call('readPriceCatalog', { business_id: user.business_id }),
      window.EstApi.call('readEstimatorSettings', { business_id: user.business_id })
    ]);

    window.__EST.projects = projectsRes.success ? projectsRes.data : [];

    const rawCatalog = catalogRes.success ? catalogRes.data : { brand_tiers: {}, glass: { items: [] }, other: { items: [] } };
    const enrichResult = ensureCatalogItemIds(rawCatalog);
    window.__EST.catalog = enrichResult.catalog;

    // Kalau ada item yang baru dapat id (pertama kali sejak migrasi),
    // simpan balik ke server supaya id-nya STABIL untuk semua user
    // berikutnya (tidak berubah-ubah tiap login). Backend hanya
    // mengizinkan super_admin — kalau yang login estimator biasa,
    // percobaan simpan ini akan ditolak (403) dan dilewati diam-diam;
    // id yang di-generate tadi tetap dipakai LOKAL untuk sesi ini saja.
    if (enrichResult.changed) {
      window.EstApi.call('updatePriceCatalog', {
        business_id: user.business_id,
        catalog: enrichResult.catalog,
        change_summary: 'Migrasi otomatis: tambah id ke tiap item katalog'
      }).catch(function () {});
    }

    window.__EST.settings = settingsRes.success ? settingsRes.data : {};
  }

  async function doEstLogin() {
    const email = document.getElementById('estLoginEmail').value.trim();
    const password = document.getElementById('estLoginPassword').value;
    const btn = document.getElementById('estLoginBtn');
    setLoginError('');

    if (!email || !password) { setLoginError('Isi email dan password.'); return; }

    btn.disabled = true;
    btn.textContent = 'Masuk...';

    try {
      const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FIREBASE_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password, returnSecureToken: true })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ? json.error.message : 'Login gagal');

      idToken = json.idToken;

      const profileResult = await window.EstApi.call('readMyProfile', {});
      if (!profileResult.success) throw new Error(profileResult.message || 'Gagal memuat profil');
      currentUser = profileResult.data;

      await bootstrapData(currentUser);

      document.getElementById('estLoginScreen').hidden = true;
      document.getElementById('estAppShell').hidden = false;

      updateNavbarForUser(currentUser);
      window.__startEstimatorApp();
      applyRoleRestrictions(currentUser);
    } catch (err) {
      const msg = String(err.message || '');
      setLoginError((msg.indexOf('INVALID') !== -1 || msg.indexOf('PASSWORD') !== -1 || msg.indexOf('EMAIL') !== -1) ? 'Email atau password salah.' : msg);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Log in';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('estLoginBtn').addEventListener('click', doEstLogin);
    document.getElementById('estLoginPassword').addEventListener('keydown', function (e) { if (e.key === 'Enter') doEstLogin(); });
    document.getElementById('estLoginEyeToggle').addEventListener('click', function () {
      const input = document.getElementById('estLoginPassword');
      const icon = this.querySelector('i');
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      icon.className = showing ? 'bi bi-eye' : 'bi bi-eye-slash';
    });
  });
})();
