/**
 * versionCheck.js — silent auto-update.
 *
 * MASALAH YANG DISELESAIKAN: app ini file statis (HTML/CSS/JS) yang
 * di-hosting di GitHub Pages. Kalau ada perbaikan/fitur baru diupload,
 * browser yang sudah pernah buka app ini bisa saja masih menyimpan versi
 * LAMA di cache-nya sendiri (bukan cache aplikasi — ini murni perilaku
 * browser biasa), jadi fitur baru tidak langsung kelihatan sampai user
 * clear cache manual.
 *
 * CARA KERJA: setiap beberapa menit (dan setiap kali tab ini dibuka lagi
 * setelah diminimize/pindah tab), file `version.json` ditarik ulang dari
 * server (dipaksa TIDAK boleh dari cache lewat cache:'no-store'). Kalau
 * nomor versinya beda dari yang sedang dipakai (window.APP_BUILD_VERSION,
 * lihat index.html), berarti Anto sudah upload versi baru — halaman
 * di-reload OTOMATIS, diam-diam, TANPA perlu clear cache atau
 * pengumuman ke user.
 *
 * PENGAMAN: reload otomatis DITUNDA (dicoba lagi di siklus polling
 * berikutnya) kalau user kelihatan sedang mengetik/mengisi sesuatu —
 * yaitu saat halaman "Detail Project" sedang aktif, atau ada modal
 * (Project Baru, Export, dst) yang sedang terbuka — supaya tidak ada
 * pekerjaan yang belum ke-save hilang gara-gara reload mendadak.
 *
 * WAJIB DIINGAT SAAT UPDATE FILE: nomor versi di index.html
 * (window.APP_BUILD_VERSION) dan di version.json HARUS SAMA PERSIS dan
 * SELALU dinaikkan bareng setiap kali ada file .js/.css yang diubah —
 * kalau lupa, mekanisme auto-update ini tidak akan mendeteksi apa-apa.
 */
(function () {
  'use strict';

  const CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 menit
  const VERSION_URL = 'version.json';

  function isUnsafeToReloadRightNow() {
    const projectDetailPage = document.querySelector('[data-page-section="project-detail"].is-active');
    if (projectDetailPage) return true;

    const openModal = document.querySelector('.modal.show, .offcanvas.show, .offcanvas.showing');
    if (openModal) return true;

    return false;
  }

  async function checkForNewVersion() {
    if (!window.APP_BUILD_VERSION) return;

    try {
      const res = await fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !data.version) return;

      if (data.version !== window.APP_BUILD_VERSION && !isUnsafeToReloadRightNow()) {
        location.reload();
      }
    } catch (err) {
      // Diam-diam gagal (offline dsb.) — dicoba lagi siklus berikutnya, tidak perlu ganggu user.
    }
  }

  setInterval(checkForNewVersion, CHECK_INTERVAL_MS);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkForNewVersion();
  });
})();
