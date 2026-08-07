/* ============================================================
   STATE
   ============================================================ */
const State = {
  idToken: null,
  user: null, // { uid, name, role, business_id, status, email }
  quotationsCache: [],
  currentStatusFilter: '',
  currentQuotationId: null
};

/* ============================================================
   TOAST
   ============================================================ */
const Toast = {
  el: null, timer: null,
  init() { this.el = document.getElementById('toast'); },
  show(message, type) {
    if (!this.el) return;
    clearTimeout(this.timer);
    this.el.className = 'toast show' + (type ? ' ' + type : '');
    this.el.textContent = message;
    this.timer = setTimeout(() => this.el.classList.remove('show'), 3000);
  }
};

/* ============================================================
   LOGIN / LOGOUT
   ============================================================ */
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');
  errorEl.textContent = '';

  if (!email || !password) { errorEl.textContent = 'Isi email dan password.'; return; }

  btn.disabled = true;
  btn.textContent = 'Masuk...';

  try {
    const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FIREBASE_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ? json.error.message : 'Login gagal');

    State.idToken = json.idToken;

    const profileResult = await Api.rawCall('readMyProfile', {});
    if (!profileResult.success) throw new Error(profileResult.message || 'Gagal memuat profil');
    State.user = profileResult.data;

    document.getElementById('view-login').hidden = true;
    document.getElementById('app').hidden = false;
    initApp();
  } catch (err) {
    const msg = String(err.message || '');
    errorEl.textContent = (msg.includes('INVALID') || msg.includes('PASSWORD') || msg.includes('EMAIL'))
      ? 'Email atau password salah.'
      : msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
}

function doLogout() {
  State.idToken = null;
  State.user = null;
  document.getElementById('app').hidden = true;
  document.getElementById('view-login').hidden = false;
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}

function togglePasswordVisibility() {
  const input = document.getElementById('login-password');
  const icon = document.getElementById('login-eye-icon');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  icon.className = showing ? 'bi bi-eye' : 'bi bi-eye-slash';
}

function initApp() {
  const displayName = State.user.name || State.user.email;
  document.getElementById('navbar-user-name').textContent = displayName;
  document.getElementById('navbar-user-initial').textContent = displayName.charAt(0).toUpperCase();
  Router.go('queue');
}

/* ============================================================
   ROUTER
   ============================================================ */
const Router = {
  go(viewName) {
    document.querySelectorAll('.view').forEach((el) => { el.hidden = true; });
    document.querySelectorAll('.app-sidebar__link').forEach((el) => el.classList.toggle('active', el.dataset.nav === viewName));

    if (viewName === 'queue') {
      document.getElementById('view-queue').hidden = false;
      QueueView.load();
    } else if (viewName === 'catalog') {
      document.getElementById('view-catalog').hidden = false;
      CatalogView.load();
    } else if (viewName === 'quotation-detail') {
      document.getElementById('view-quotation-detail').hidden = false;
    }
  }
};

/* ============================================================
   VIEW: ANTRIAN QUOTATION
   ============================================================ */
const QueueView = {
  async load() {
    const listEl = document.getElementById('queue-list');
    listEl.innerHTML = '<p class="empty-state">Memuat data...</p>';

    const result = await Api.call('listQuotationQueue', {
      business_id: State.user.business_id,
      status: State.currentStatusFilter || undefined
    });

    if (!result.success) {
      listEl.innerHTML = '<p class="empty-state">Gagal memuat: ' + escapeHtml(result.message || '') + '</p>';
      return;
    }

    State.quotationsCache = result.data || [];
    this.render();
  },

  render() {
    const listEl = document.getElementById('queue-list');
    const rows = State.quotationsCache;

    if (rows.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Belum ada quotation. Klik "+ Quotation Baru" untuk mulai, atau tunggu Sales App mengirim project yang butuh estimasi harga.</p>';
      return;
    }

    listEl.innerHTML = rows.map((q) => {
      const updated = q.updated_at ? formatDateTime(q.updated_at) : '-';
      return `
        <div class="queue-row" onclick="QuotationDetailView.open('${q.id}')">
          <div class="queue-row-main">
            <div class="queue-row-title">${escapeHtml(q.client_name || q.project_name || '(Tanpa nama)')}</div>
            <div class="queue-row-sub">${escapeHtml(q.quotation_number || q.id)} · Revisi ${q.revision_number || 1} · Diperbarui ${updated}</div>
          </div>
          <div class="queue-row-right">
            <span class="status-badge status-${q.status}">${statusLabel(q.status)}</span>
          </div>
        </div>`;
    }).join('');
  },

  filterStatus(status) {
    State.currentStatusFilter = status;
    document.querySelectorAll('#queue-tabs .tab').forEach((el) => el.classList.toggle('active', el.dataset.status === status));
    this.load();
  },

  openCreateModal() {
    document.getElementById('create-client-name').value = '';
    document.getElementById('create-project-name').value = '';
    document.getElementById('create-location').value = '';
    document.getElementById('create-error').textContent = '';
    document.getElementById('modal-create-quotation').hidden = false;
  },

  closeCreateModal() {
    document.getElementById('modal-create-quotation').hidden = true;
  },

  async submitCreate() {
    const clientName = document.getElementById('create-client-name').value.trim();
    const errorEl = document.getElementById('create-error');
    if (!clientName) { errorEl.textContent = 'Nama klien wajib diisi.'; return; }

    const result = await Api.call('createManualQuotation', {
      client_name: clientName,
      project_name: document.getElementById('create-project-name').value.trim(),
      location: document.getElementById('create-location').value.trim()
    });

    if (!result.success) { errorEl.textContent = result.message || 'Gagal membuat quotation.'; return; }

    this.closeCreateModal();
    Toast.show('Quotation baru berhasil dibuat', 'success');
    QuotationDetailView.open(result.data.quotation_id);
  }
};

/* ============================================================
   VIEW: DETAIL QUOTATION
   ============================================================ */
const QuotationDetailView = {
  current: null,

  async open(quotationId) {
    Router.go('quotation-detail');
    State.currentQuotationId = quotationId;

    const result = await Api.call('readQuotation', { quotation_id: quotationId });
    if (!result.success) {
      Toast.show(result.message || 'Gagal memuat quotation', 'error');
      Router.go('queue');
      return;
    }

    this.current = result.data;
    this.render();
  },

  render() {
    const q = this.current;
    document.getElementById('detail-quotation-number').textContent = q.quotation_number || q.id;
    document.getElementById('detail-revision').textContent = q.revision_number || 1;

    const statusEl = document.getElementById('detail-status');
    statusEl.textContent = statusLabel(q.status);
    statusEl.className = 'status-badge status-' + q.status;

    document.getElementById('detail-client-name').value = q.client_name || '';
    document.getElementById('detail-project-name').value = q.project_name || '';
    document.getElementById('detail-location').value = q.location || '';
    document.getElementById('detail-phone').value = q.customer_phone || '';
    document.getElementById('detail-notes').value = q.notes || '';
  },

  async save() {
    const payload = {
      quotation_id: State.currentQuotationId,
      client_name: document.getElementById('detail-client-name').value.trim(),
      project_name: document.getElementById('detail-project-name').value.trim(),
      location: document.getElementById('detail-location').value.trim(),
      customer_phone: document.getElementById('detail-phone').value.trim(),
      notes: document.getElementById('detail-notes').value.trim()
    };

    const result = await Api.call('saveQuotation', payload);
    if (!result.success) { Toast.show(result.message || 'Gagal menyimpan', 'error'); return; }
    Toast.show('Quotation berhasil disimpan', 'success');
  },

  async markComplete() {
    // Tombol ini sengaja dinonaktifkan (disabled) sampai fitur input item
    // selesai dibangun — backend akan menolak kalau item masih kosong.
    Toast.show('Fitur input item menyusul di update berikutnya.', 'error');
  }
};

/* ============================================================
   VIEW: KATALOG HARGA (read-only)
   ============================================================ */
const CatalogView = {
  async load() {
    const contentEl = document.getElementById('catalog-content');
    contentEl.innerHTML = '<p class="empty-state">Memuat data...</p>';

    const result = await Api.call('readPriceCatalog', { business_id: State.user.business_id });
    if (!result.success) {
      contentEl.innerHTML = '<p class="empty-state">Gagal memuat: ' + escapeHtml(result.message || '') + '</p>';
      return;
    }

    this.render(result.data);
  },

  render(catalog) {
    const contentEl = document.getElementById('catalog-content');
    const groups = [];

    // Brand tiers (aluminium)
    Object.entries(catalog.brand_tiers || {}).forEach(([tierKey, tier]) => {
      (tier.groups || []).forEach((group) => {
        groups.push({ title: (tier.label || tierKey) + ' — ' + (group.name || group.code), items: group.items || [] });
      });
    });

    // Kaca & lain-lain
    if (catalog.glass && catalog.glass.items && catalog.glass.items.length) {
      groups.push({ title: 'Kaca', items: catalog.glass.items });
    }
    if (catalog.other && catalog.other.items && catalog.other.items.length) {
      groups.push({ title: 'Lain-lain', items: catalog.other.items });
    }

    if (groups.length === 0) {
      contentEl.innerHTML = '<p class="empty-state">Katalog harga belum diatur.</p>';
      return;
    }

    contentEl.innerHTML = groups.map((g) => `
      <div class="catalog-group">
        <div class="catalog-group-title">${escapeHtml(g.title)}</div>
        <table class="catalog-table">
          <thead><tr><th>Nama Item</th><th>Satuan</th><th>Harga Modal</th></tr></thead>
          <tbody>
            ${g.items.map((item) => `
              <tr>
                <td>${escapeHtml(item.name || '-')}</td>
                <td>${escapeHtml(item.uom || '-')}</td>
                <td>${formatCurrency(item.harga_modal)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `).join('');
  }
};

/* ============================================================
   HELPERS
   ============================================================ */
function statusLabel(status) {
  const labels = {
    draft: 'Draft',
    selesai_dihitung: 'Selesai Dihitung',
    terkirim: 'Terkirim',
    won: 'Won',
    lost: 'Lost'
  };
  return labels[status] || status || '-';
}

function formatCurrency(value) {
  const n = Number(value) || 0;
  return 'Rp ' + n.toLocaleString('id-ID');
}

function formatDateTime(value) {
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '-';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();
  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
});
