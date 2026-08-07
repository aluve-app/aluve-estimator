/**
 * ============================================================
 * API.JS — komunikasi ke Cloudflare Workers (Bearer token)
 * ============================================================
 * Estimator dipakai desktop/kantor saja (bukan lapangan), jadi
 * TIDAK perlu OfflineQueue seperti Sales App — kalau request
 * gagal, langsung tampilkan error ke user.
 * ============================================================
 */
const Api = {
  TIMEOUT_MS: 15000,

  rawCall(action, payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    return fetch(WORKER_BASE_URL + '/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + State.idToken },
      body: JSON.stringify(payload || {}),
      signal: controller.signal
    })
      .then((res) => res.json())
      .finally(() => clearTimeout(timeoutId));
  },

  async call(action, payload) {
    try {
      return await this.rawCall(action, payload);
    } catch (err) {
      return { success: false, message: 'Gagal terhubung ke server. Cek koneksi internet Anda.' };
    }
  }
};
