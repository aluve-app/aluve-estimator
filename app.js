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
   VIEW: DETAIL QUOTATION (+ Item Builder & Kalkulator)
   ============================================================ */
const QuotationDetailView = {
  current: null,
  items: [], // working copy, disinkronkan ke this.current.items saat Save

  async open(quotationId) {
    Router.go('quotation-detail');
    State.currentQuotationId = quotationId;

    await CatalogHelper.ensureLoaded();

    const result = await Api.call('readQuotation', { quotation_id: quotationId });
    if (!result.success) {
      Toast.show(result.message || 'Gagal memuat quotation', 'error');
      Router.go('queue');
      return;
    }

    this.current = result.data;
    this.items = Array.isArray(this.current.items) ? JSON.parse(JSON.stringify(this.current.items)) : [];
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

    const pd = q.project_discount || { type: 'percent', value: '' };
    document.getElementById('project-discount-type').value = pd.type || 'percent';
    document.getElementById('project-discount-value').value = pd.value || '';

    this.renderItems();
    this.renderSummary();
  },

  addItem() {
    this.items.push({
      _uid: 'item-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      label: 'Item ' + (this.items.length + 1),
      width_mm: '', height_mm: '', qty: 1,
      aluminium_lines: [], glass_lines: [], other_lines: [],
      sealant_unit_price: 50000,
      discount: { type: 'percent', value: '' }
    });
    this.renderItems();
    this.renderSummary();
  },

  removeItem(uid) {
    this.items = this.items.filter((it) => it._uid !== uid);
    this.renderItems();
    this.renderSummary();
  },

  findItem(uid) { return this.items.find((it) => it._uid === uid); },

  updateItemField(uid, field, value) {
    const item = this.findItem(uid);
    if (!item) return;
    item[field] = value;
    this.renderSummary();
    this.renderItemTotalsOnly(uid);
  },

  addLine(uid, category) {
    const item = this.findItem(uid);
    if (!item) return;
    const key = category + '_lines';
    item[key] = item[key] || [];
    item[key].push({ sku_name: '', unit_price: 0, qty: '', uom: category === 'aluminium' ? 'meter_lari' : 'unit' });
    this.renderItems();
    this.renderSummary();
  },

  removeLine(uid, category, index) {
    const item = this.findItem(uid);
    if (!item) return;
    item[category + '_lines'].splice(index, 1);
    this.renderItems();
    this.renderSummary();
  },

  setLineSku(uid, category, index, skuKey) {
    const item = this.findItem(uid);
    if (!item) return;
    const line = item[category + '_lines'][index];
    const sku = CatalogHelper.findByKey(skuKey);
    if (sku) {
      line.sku_name = sku.name;
      line.unit_price = sku.harga_modal;
      line.uom = sku.uom;
    } else {
      line.sku_name = ''; line.unit_price = 0; line.uom = category === 'aluminium' ? 'meter_lari' : 'unit';
    }
    this.renderItems();
    this.renderSummary();
  },

  setLineQty(uid, category, index, qty) {
    const item = this.findItem(uid);
    if (!item) return;
    item[category + '_lines'][index].qty = qty;
    this.renderSummary();
    this.renderItemTotalsOnly(uid);
  },

  renderItems() {
    const container = document.getElementById('items-list');
    if (this.items.length === 0) {
      container.innerHTML = '<p class="empty-state">Belum ada item. Klik "+ Tambah Item" untuk mulai.</p>';
      return;
    }
    container.innerHTML = this.items.map((item) => this.renderItemCard(item)).join('');
  },

  renderItemCard(item) {
    const uid = item._uid;
    const categories = [
      { key: 'aluminium', label: 'Aluminium', options: CatalogHelper.aluminiumOptions() },
      { key: 'glass', label: 'Kaca', options: CatalogHelper.flatOptions('glass') },
      { key: 'other', label: 'Lain-lain', options: CatalogHelper.flatOptions('other') }
    ];

    const linesHtml = categories.map((cat) => {
      const lines = item[cat.key + '_lines'] || [];
      const rows = lines.map((line, idx) => `
        <div class="line-row">
          <select onchange="QuotationDetailView.setLineSku('${uid}','${cat.key}',${idx},this.value)">
            <option value="">Pilih SKU...</option>
            ${cat.options.map((o) => `<option value="${escapeHtml(o.key)}" ${o.name === line.sku_name ? 'selected' : ''}>${escapeHtml(o.name)} (${escapeHtml(o.uom)})</option>`).join('')}
          </select>
          <input type="number" min="0" step="0.01" placeholder="Qty" value="${line.qty || ''}" oninput="QuotationDetailView.setLineQty('${uid}','${cat.key}',${idx},this.value)">
          <span class="line-price">${formatCurrency(line.unit_price)}</span>
          <span class="line-subtotal">${formatCurrency(Calculator.calcLineSubtotal(line.unit_price, line.qty))}</span>
          <button class="line-remove" onclick="QuotationDetailView.removeLine('${uid}','${cat.key}',${idx})"><i class="bi bi-trash"></i></button>
        </div>`).join('');

      return `
        <div class="line-group">
          <div class="line-group-header">
            <span>${cat.label}</span>
            <button class="btn-add-line" onclick="QuotationDetailView.addLine('${uid}','${cat.key}')">+ Baris</button>
          </div>
          ${rows || '<p class="line-empty">Belum ada baris.</p>'}
        </div>`;
    }).join('');

    const totals = Calculator.calcItemTotals(item);

    return `
      <div class="item-card" id="item-card-${uid}">
        <div class="item-card-header">
          <input type="text" class="item-label-input" value="${escapeHtml(item.label)}" oninput="QuotationDetailView.updateItemField('${uid}','label',this.value)">
          <button class="btn-remove-item" onclick="QuotationDetailView.removeItem('${uid}')"><i class="bi bi-trash"></i> Hapus Item</button>
        </div>
        <div class="item-meta-row">
          <div class="field-inline"><label>Lebar (mm)</label><input type="number" value="${item.width_mm || ''}" oninput="QuotationDetailView.updateItemField('${uid}','width_mm',this.value)"></div>
          <div class="field-inline"><label>Tinggi (mm)</label><input type="number" value="${item.height_mm || ''}" oninput="QuotationDetailView.updateItemField('${uid}','height_mm',this.value)"></div>
          <div class="field-inline"><label>Qty Item</label><input type="number" min="1" value="${item.qty || 1}" oninput="QuotationDetailView.updateItemField('${uid}','qty',this.value)"></div>
          <div class="field-inline"><label>Diskon Item</label>
            <div class="discount-input-row">
              <select onchange="QuotationDetailView.updateItemDiscount('${uid}','type',this.value)">
                <option value="percent" ${item.discount && item.discount.type === 'percent' ? 'selected' : ''}>%</option>
                <option value="nominal" ${item.discount && item.discount.type === 'nominal' ? 'selected' : ''}>Rp</option>
              </select>
              <input type="text" placeholder="cth: 10+5" value="${(item.discount && item.discount.value) || ''}" oninput="QuotationDetailView.updateItemDiscount('${uid}','value',this.value)">
            </div>
          </div>
        </div>
        ${linesHtml}
        <div class="item-totals" id="item-totals-${uid}">${this.itemTotalsHtml(totals)}</div>
      </div>`;
  },

  itemTotalsHtml(totals) {
    return `
      <div class="item-totals-row"><span>Aluminium</span><span>${formatCurrency(totals.aluminiumTotal)}</span></div>
      <div class="item-totals-row"><span>Kaca</span><span>${formatCurrency(totals.glassTotal)}</span></div>
      <div class="item-totals-row"><span>Lain-lain</span><span>${formatCurrency(totals.otherTotal)}</span></div>
      <div class="item-totals-row"><span>Sealant (qty ${totals.sealantQty.toFixed(2)})</span><span>${formatCurrency(totals.sealantTotal)}</span></div>
      ${totals.discountAmount > 0 ? `<div class="item-totals-row"><span>Diskon Item</span><span>-${formatCurrency(totals.discountAmount)}</span></div>` : ''}
      <div class="item-totals-row item-totals-row--total"><span>Total / unit &times; ${totals.qty}</span><span>${formatCurrency(totals.itemTotal)}</span></div>`;
  },

  renderItemTotalsOnly(uid) {
    const item = this.findItem(uid);
    if (!item) return;
    const el = document.getElementById('item-totals-' + uid);
    if (el) el.innerHTML = this.itemTotalsHtml(Calculator.calcItemTotals(item));
  },

  updateItemDiscount(uid, field, value) {
    const item = this.findItem(uid);
    if (!item) return;
    item.discount = item.discount || { type: 'percent', value: '' };
    item.discount[field] = value;
    this.renderSummary();
    this.renderItemTotalsOnly(uid);
  },

  renderSummary() {
    const projectDiscount = {
      type: document.getElementById('project-discount-type').value,
      value: document.getElementById('project-discount-value').value
    };
    const summary = Calculator.calcProjectSummary(this.items, projectDiscount);

    document.getElementById('summary-rows').innerHTML = `
      <div class="summary-row"><span>Subtotal Aluminium</span><span>${formatCurrency(summary.aluminiumSubtotal)}</span></div>
      <div class="summary-row"><span>Subtotal Kaca</span><span>${formatCurrency(summary.glassSubtotal)}</span></div>
      <div class="summary-row"><span>Subtotal Aksesoris/Sealant</span><span>${formatCurrency(summary.accessorySubtotal)}</span></div>
      <div class="summary-row"><span>Total Diskon</span><span>-${formatCurrency(summary.totalDiscount)}</span></div>
      <div class="summary-row summary-row--grand"><span>GRAND TOTAL</span><span>${formatCurrency(summary.grandTotalAfterDiscount)}</span></div>`;

    document.getElementById('btn-mark-complete').disabled = this.items.length === 0;
  },

  buildItemsPayload() {
    // Buang field internal "_uid" (cuma dipakai UI) sebelum dikirim ke backend
    return this.items.map((item) => {
      const clean = Object.assign({}, item);
      delete clean._uid;
      return clean;
    });
  },

  async save(silent) {
    const payload = {
      quotation_id: State.currentQuotationId,
      client_name: document.getElementById('detail-client-name').value.trim(),
      project_name: document.getElementById('detail-project-name').value.trim(),
      location: document.getElementById('detail-location').value.trim(),
      customer_phone: document.getElementById('detail-phone').value.trim(),
      notes: document.getElementById('detail-notes').value.trim(),
      items: this.buildItemsPayload(),
      project_discount: {
        type: document.getElementById('project-discount-type').value,
        value: document.getElementById('project-discount-value').value
      }
    };

    const result = await Api.call('saveQuotation', payload);
    if (!result.success) { Toast.show(result.message || 'Gagal menyimpan', 'error'); return false; }
    if (!silent) Toast.show('Quotation berhasil disimpan', 'success');
    return true;
  },

  async markComplete() {
    if (this.items.length === 0) { Toast.show('Tambahkan minimal 1 item dulu.', 'error'); return; }
    const saved = await this.save(true);
    if (!saved) return;

    const result = await Api.call('markQuotationComplete', { quotation_id: State.currentQuotationId });
    if (!result.success) { Toast.show(result.message || 'Gagal menandai selesai', 'error'); return; }
    Toast.show('Quotation ditandai selesai — Sales App sudah diperbarui', 'success');
    this.open(State.currentQuotationId);
  }
};

/* ============================================================
   CATALOG HELPER — cache katalog harga untuk dipakai Item Builder
   ============================================================ */
const CatalogHelper = {
  data: null,
  flatIndex: {}, // key -> { name, harga_modal, uom }

  async ensureLoaded() {
    if (this.data) return;
    const result = await Api.call('readPriceCatalog', { business_id: State.user.business_id });
    this.data = result.success ? result.data : { brand_tiers: {}, glass: { items: [] }, other: { items: [] } };
    this.buildFlatIndex();
  },

  buildFlatIndex() {
    this.flatIndex = {};
    Object.entries(this.data.brand_tiers || {}).forEach(([tierKey, tier]) => {
      (tier.groups || []).forEach((group) => {
        (group.items || []).forEach((item, i) => {
          const key = 'alu:' + tierKey + ':' + group.code + ':' + i;
          this.flatIndex[key] = item;
        });
      });
    });
    ((this.data.glass && this.data.glass.items) || []).forEach((item, i) => { this.flatIndex['glass:' + i] = item; });
    ((this.data.other && this.data.other.items) || []).forEach((item, i) => { this.flatIndex['other:' + i] = item; });
  },

  findByKey(key) { return this.flatIndex[key] || null; },

  aluminiumOptions() {
    const opts = [];
    Object.entries(this.data.brand_tiers || {}).forEach(([tierKey, tier]) => {
      (tier.groups || []).forEach((group) => {
        (group.items || []).forEach((item, i) => {
          opts.push({ key: 'alu:' + tierKey + ':' + group.code + ':' + i, name: (tier.label || tierKey) + ' — ' + group.name + ' — ' + item.name, uom: item.uom, harga_modal: item.harga_modal });
        });
      });
    });
    return opts;
  },

  flatOptions(section) {
    const items = (this.data[section] && this.data[section].items) || [];
    return items.map((item, i) => ({ key: section + ':' + i, name: item.name, uom: item.uom, harga_modal: item.harga_modal }));
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
