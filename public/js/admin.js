let authToken = localStorage.getItem('caffeine_admin_token');
let shopData = {};
let lockoutInterval = null;

const TAB_TITLES = {
  'shop-info': 'Shop Info',
  specialty: 'Specialty',
  discount: 'Discount & Email',
  pros: 'Why Us / Pros',
  subscribers: 'Subscribers',
  logs: 'System Log'
};

document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
  if (authToken) {
    showDashboard();
  } else {
    showLogin();
  }
  initLoginForm();
  initTabs();
  initForms();
  initLogout();
});

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('adminDashboard').classList.add('hidden');
  checkLockoutStatus();
}

function showDashboard() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminDashboard').classList.remove('hidden');
  loadShopData();
  loadSubscribers();
  loadLogs();
}

async function checkAuthStatus() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/admin/shop', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) {
      authToken = null;
      localStorage.removeItem('caffeine_admin_token');
    }
  } catch {
    authToken = null;
    localStorage.removeItem('caffeine_admin_token');
  }
}

async function checkLockoutStatus() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    const banner = document.getElementById('lockoutBanner');
    const form = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');

    if (data.locked) {
      banner.classList.remove('hidden');
      form.querySelectorAll('input').forEach(i => i.disabled = true);
      loginBtn.disabled = true;
      startLockoutTimer(data.remainingMs);
    } else {
      banner.classList.add('hidden');
      form.querySelectorAll('input').forEach(i => i.disabled = false);
      loginBtn.disabled = false;
      if (lockoutInterval) clearInterval(lockoutInterval);
    }
  } catch { /* ignore */ }
}

function startLockoutTimer(remainingMs) {
  const timerEl = document.getElementById('lockoutTimer');
  if (lockoutInterval) clearInterval(lockoutInterval);

  let remaining = remainingMs;
  const update = () => {
    if (remaining <= 0) {
      clearInterval(lockoutInterval);
      checkLockoutStatus();
      return;
    }
    const min = Math.floor(remaining / 60000);
    const sec = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    remaining -= 1000;
  };
  update();
  lockoutInterval = setInterval(update, 1000);
}

function initLoginForm() {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.querySelector('.btn-text').classList.add('hidden');
    loginBtn.querySelector('.btn-loader').classList.remove('hidden');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('username').value,
          password: document.getElementById('password').value
        })
      });
      const data = await res.json();

      if (res.ok && data.token) {
        authToken = data.token;
        localStorage.setItem('caffeine_admin_token', authToken);
        form.reset();
        showDashboard();
      } else if (res.status === 423) {
        checkLockoutStatus();
        errorEl.textContent = data.error;
        errorEl.classList.remove('hidden');
      } else {
        errorEl.textContent = data.error || 'Invalid credentials.';
        errorEl.classList.remove('hidden');
      }
    } catch {
      errorEl.textContent = 'Network error. Please try again.';
      errorEl.classList.remove('hidden');
    } finally {
      loginBtn.disabled = false;
      loginBtn.querySelector('.btn-text').classList.remove('hidden');
      loginBtn.querySelector('.btn-loader').classList.add('hidden');
    }
  });
}

function initLogout() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (authToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      }).catch(() => {});
    }
    authToken = null;
    localStorage.removeItem('caffeine_admin_token');
    showLogin();
  });
}

function initTabs() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');
      document.getElementById('tabTitle').textContent = TAB_TITLES[tab] || tab;

      if (tab === 'subscribers') loadSubscribers();
      if (tab === 'logs') loadLogs();
    });
  });
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...options.headers
    }
  });
  if (res.status === 401) {
    authToken = null;
    localStorage.removeItem('caffeine_admin_token');
    showLogin();
    throw new Error('Session expired');
  }
  return res;
}

async function loadShopData() {
  try {
    const res = await apiFetch('/api/admin/shop');
    shopData = await res.json();
    populateForms(shopData);
  } catch (err) {
    console.error('Failed to load shop data:', err);
  }
}

function populateForms(data) {
  document.getElementById('fieldShopName').value = data.shopName || '';
  document.getElementById('fieldTagline').value = data.tagline || '';
  document.getElementById('fieldDescription').value = data.description || '';
  document.getElementById('fieldPhone').value = data.contact?.phone || '';
  document.getElementById('fieldEmail').value = data.contact?.email || '';
  document.getElementById('fieldAddress').value = data.contact?.address || '';
  document.getElementById('fieldHoursWeekdays').value = data.hours?.weekdays || '';
  document.getElementById('fieldHoursWeekends').value = data.hours?.weekends || '';
  document.getElementById('fieldHeroImage').value = data.heroImage || '';
  document.getElementById('fieldMapEmbed').value = data.mapEmbed || '';
  document.getElementById('fieldSpecialty').value = data.specialty || '';
  document.getElementById('fieldSpecialtyImage').value = data.specialtyImage || '';
  document.getElementById('fieldDiscountPercent').value = data.discountPercent || 20;
  document.getElementById('fieldDiscountMessage').value = data.discountMessage || '';

  updateSpecialtyPreview();
  updateEmailPreview();
  renderProsEditor(data.pros || []);
}

function updateSpecialtyPreview() {
  const text = document.getElementById('fieldSpecialty').value;
  document.getElementById('specialtyPreview').textContent = text || '—';
}

function updateEmailPreview() {
  const percent = document.getElementById('fieldDiscountPercent').value || 20;
  const template = document.getElementById('fieldDiscountMessage').value || 'Enjoy {discount}% off!';
  document.getElementById('emailPreview').textContent = template.replace('{discount}', percent);
}

function initForms() {
  document.getElementById('fieldSpecialty').addEventListener('input', updateSpecialtyPreview);
  document.getElementById('fieldDiscountPercent').addEventListener('input', updateEmailPreview);
  document.getElementById('fieldDiscountMessage').addEventListener('input', updateEmailPreview);

  document.getElementById('shopInfoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveShopData({
      shopName: document.getElementById('fieldShopName').value,
      tagline: document.getElementById('fieldTagline').value,
      description: document.getElementById('fieldDescription').value,
      contact: {
        phone: document.getElementById('fieldPhone').value,
        email: document.getElementById('fieldEmail').value,
        address: document.getElementById('fieldAddress').value
      },
      hours: {
        weekdays: document.getElementById('fieldHoursWeekdays').value,
        weekends: document.getElementById('fieldHoursWeekends').value
      },
      heroImage: document.getElementById('fieldHeroImage').value,
      mapEmbed: document.getElementById('fieldMapEmbed').value
    });
  });

  document.getElementById('specialtyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveShopData({
      specialty: document.getElementById('fieldSpecialty').value,
      specialtyImage: document.getElementById('fieldSpecialtyImage').value
    });
  });

  document.getElementById('discountForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveShopData({
      discountPercent: parseInt(document.getElementById('fieldDiscountPercent').value, 10),
      discountMessage: document.getElementById('fieldDiscountMessage').value
    });
  });

  document.getElementById('addProBtn').addEventListener('click', () => {
    const pros = getProsFromEditor();
    const next = String(pros.length + 1).padStart(2, '0');
    pros.push({ label: next, title: 'New Feature', description: 'Description here.' });
    renderProsEditor(pros);
  });

  document.getElementById('saveProsBtn').addEventListener('click', () => {
    saveShopData({ pros: getProsFromEditor() });
  });

  document.getElementById('refreshLogsBtn').addEventListener('click', loadLogs);
  document.getElementById('logCategoryFilter').addEventListener('change', loadLogs);
  document.getElementById('logLevelFilter').addEventListener('change', loadLogs);
}

async function saveShopData(updates) {
  const statusEl = document.getElementById('saveStatus');
  try {
    const res = await apiFetch('/api/admin/shop', {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    shopData = await res.json();
    statusEl.textContent = 'Saved ✓';
    statusEl.className = 'status-badge success';
    setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status-badge'; }, 3000);
  } catch {
    statusEl.textContent = 'Save failed';
    statusEl.className = 'status-badge error';
  }
}

function renderProsEditor(pros) {
  const container = document.getElementById('prosEditor');
  container.innerHTML = pros.map((pro, i) => `
    <div class="pro-edit-card" data-index="${i}">
      <input type="text" class="label-input" value="${escapeHtml(pro.label || pro.icon || '')}" data-field="label" maxlength="4" placeholder="01">
      <input type="text" value="${escapeHtml(pro.title)}" data-field="title" placeholder="Title">
      <textarea data-field="description" placeholder="Description">${escapeHtml(pro.description)}</textarea>
      <button type="button" class="btn-remove" data-remove="${i}" title="Remove">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.remove, 10);
      const current = getProsFromEditor();
      current.splice(idx, 1);
      renderProsEditor(current);
    });
  });
}

function getProsFromEditor() {
  const cards = document.querySelectorAll('.pro-edit-card');
  return Array.from(cards).map(card => ({
    label: card.querySelector('[data-field="label"]').value,
    title: card.querySelector('[data-field="title"]').value,
    description: card.querySelector('[data-field="description"]').value
  }));
}

async function loadSubscribers() {
  try {
    const res = await apiFetch('/api/admin/subscribers');
    const subs = await res.json();
    document.getElementById('subscriberCount').textContent = subs.length;

    const tbody = document.getElementById('subscribersTable');
    if (subs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;">No subscribers yet.</td></tr>';
      return;
    }

    tbody.innerHTML = subs.map(s => `
      <tr>
        <td>${escapeHtml(s.email)}</td>
        <td><code>${s.code}</code></td>
        <td>${s.discountPercent}%</td>
        <td>${new Date(s.subscribedAt).toLocaleString()}</td>
        <td><span class="badge ${s.used ? 'badge-used' : 'badge-active'}">${s.used ? 'Used' : 'Active'}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load subscribers:', err);
  }
}

async function loadLogs() {
  try {
    const category = document.getElementById('logCategoryFilter').value;
    const level = document.getElementById('logLevelFilter').value;
    let url = '/api/admin/logs?limit=100';
    if (category) url += `&category=${category}`;
    if (level) url += `&level=${level}`;

    const res = await apiFetch(url);
    const logs = await res.json();
    const container = document.getElementById('logList');

    if (logs.length === 0) {
      container.innerHTML = '<div class="log-empty">No log entries found.</div>';
      return;
    }

    container.innerHTML = logs.map(log => `
      <div class="log-entry level-${log.level}">
        <span class="log-time">${new Date(log.timestamp).toLocaleString()}</span>
        <span class="log-level ${log.level}">${log.level}</span>
        <span class="log-category">${log.category}</span>
        <span class="log-message">${escapeHtml(log.message)}</span>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load logs:', err);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
