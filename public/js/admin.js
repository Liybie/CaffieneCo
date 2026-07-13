let authToken = localStorage.getItem('caffeine_admin_token');
let shopData = {};
let lockoutInterval = null;

const TAB_TITLES = {
  'shop-info': 'Shop Info',
  location: 'Location / Map',
  specialty: 'Specialty',
  discount: 'Discount',
  images: 'Images',
  pros: 'Why Us / Pros',
  subscribers: 'Subscribers',
  logs: 'System Log'
};

let locationMap = null;
let locationMarker = null;
let locationMapReady = false;
let allSubscribers = [];

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
      if (tab === 'location') initLocationMap();
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
  document.getElementById('fieldSpecialty').value = data.specialty || '';
  document.getElementById('fieldDiscountPercent').value = data.discountPercent || 20;
  document.getElementById('fieldDiscountMessage').value = data.discountMessage || '';

  populateImageEditor(data);
  populateLocationEditor(data);
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
      }
    });
  });

  document.getElementById('specialtyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveShopData({
      specialty: document.getElementById('fieldSpecialty').value
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
  document.getElementById('refreshSubscribersBtn')?.addEventListener('click', loadSubscribers);
  document.getElementById('subscriberSearch')?.addEventListener('input', () => renderSubscribersTable());
  document.getElementById('logCategoryFilter').addEventListener('change', loadLogs);
  document.getElementById('logLevelFilter').addEventListener('change', loadLogs);

  initImageEditor();
  initLocationEditor();
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

function filterSubscribers(list, query) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(s =>
    s.email.toLowerCase().includes(q) ||
    s.code.toLowerCase().includes(q) ||
    String(s.discountPercent).includes(q)
  );
}

function subscriberRowHtml(s, { showRevoke = false } = {}) {
  const revokeCell = showRevoke
    ? `<td><button type="button" class="btn btn-outline btn-sm btn-revoke" data-email="${escapeHtml(s.email)}">Revoke</button></td>`
    : '';
  return `
    <tr>
      <td>${escapeHtml(s.email)}</td>
      <td><code>${escapeHtml(s.code)}</code></td>
      <td>${s.discountPercent}%</td>
      <td>${new Date(s.subscribedAt).toLocaleString()}</td>
      <td>${claimedToggleHtml(s)}</td>
      ${revokeCell}
    </tr>
  `;
}

function claimedToggleHtml(s) {
  const checked = s.used ? 'checked' : '';
  const label = s.used ? 'Claimed' : 'Active';
  const labelClass = s.used ? 'claimed' : 'active';
  return `
    <label class="claim-toggle" title="Toggle claimed status">
      <input type="checkbox" class="claim-toggle-input" data-email="${escapeHtml(s.email)}" ${checked}>
      <span class="claim-toggle-track" aria-hidden="true"></span>
      <span class="claim-toggle-label ${labelClass}">${label}</span>
    </label>
  `;
}

function bindRevokeButtons(container) {
  container?.querySelectorAll('.btn-revoke').forEach(btn => {
    btn.addEventListener('click', () => revokeSubscriber(btn.dataset.email));
  });
}

function bindClaimToggles(container) {
  container?.querySelectorAll('.claim-toggle-input').forEach(input => {
    input.addEventListener('change', () => toggleSubscriberClaimed(input.dataset.email, input.checked, input));
  });
}

async function toggleSubscriberClaimed(email, used, inputEl) {
  const prevUsed = !used;
  try {
    const res = await apiFetch(`/api/admin/subscribers/${encodeURIComponent(email)}/claimed`, {
      method: 'PATCH',
      body: JSON.stringify({ used })
    });
    const data = await res.json();
    if (!res.ok) {
      if (inputEl) inputEl.checked = prevUsed;
      alert(data.error || 'Failed to update claim status.');
      return;
    }

    const idx = allSubscribers.findIndex(s => s.email.toLowerCase() === email.toLowerCase());
    if (idx !== -1) allSubscribers[idx].used = used;

    renderSubscribersTable();

    const statusEl = document.getElementById('saveStatus');
    statusEl.textContent = used ? 'Marked claimed ✓' : 'Marked active ✓';
    statusEl.className = 'status-badge success';
    setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status-badge'; }, 2500);
  } catch {
    if (inputEl) inputEl.checked = prevUsed;
    alert('Failed to update claim status.');
  }
}

function renderSubscribersTable() {
  const query = document.getElementById('subscriberSearch')?.value || '';
  const filtered = filterSubscribers(allSubscribers, query);
  const tbody = document.getElementById('subscribersTable');
  const meta = document.getElementById('subscriberSearchMeta');

  document.getElementById('subscriberCount').textContent = allSubscribers.length;

  if (meta) {
    meta.textContent = query
      ? `Showing ${filtered.length} of ${allSubscribers.length} subscriber(s) matching “${query}”`
      : `${allSubscribers.length} subscriber(s) total`;
  }

  if (!tbody) return;

  if (allSubscribers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;">No subscribers yet.</td></tr>';
    return;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;">No matches for your search.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(s => subscriberRowHtml(s, { showRevoke: true })).join('');
  bindRevokeButtons(tbody);
  bindClaimToggles(tbody);
}

async function loadSubscribers(force = false) {
  try {
    const res = await apiFetch('/api/admin/subscribers');
    allSubscribers = await res.json();
    renderSubscribersTable();
    return allSubscribers;
  } catch (err) {
    console.error('Failed to load subscribers:', err);
    return [];
  }
}

async function revokeSubscriber(email) {
  if (!confirm(`Revoke the discount code for ${email}?\n\nThis deletes their registration so they can sign up again to test the email function.`)) {
    return;
  }
  try {
    const res = await apiFetch(`/api/admin/subscribers/${encodeURIComponent(email)}/revoke`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (res.ok) {
      loadSubscribers();
      const statusEl = document.getElementById('saveStatus');
      statusEl.textContent = data.message || 'Code revoked';
      statusEl.className = 'status-badge success';
      setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status-badge'; }, 4000);
    } else {
      alert(data.error || 'Failed to revoke code.');
    }
  } catch {
    alert('Failed to revoke code.');
  }
}

function populateImageEditor(data) {
  const heroUrl = data.heroImage || '';
  const specialtyUrl = data.specialtyImage || '';
  document.getElementById('fieldHeroImageUrl').value = heroUrl;
  document.getElementById('fieldSpecialtyImageUrl').value = specialtyUrl;
  setPreviewImage('previewHero', heroUrl);
  setPreviewImage('previewSpecialty', specialtyUrl);
  renderGalleryEditor(data.galleryImages || []);
}

function setPreviewImage(imgId, url) {
  const img = document.getElementById(imgId);
  if (!img) return;
  if (url) {
    img.src = url;
    img.style.display = 'block';
  } else {
    img.removeAttribute('src');
    img.style.display = 'none';
  }
}

function renderGalleryEditor(images) {
  const gallery = [...images];
  while (gallery.length < 3) gallery.push('');

  const container = document.getElementById('galleryEditor');
  container.innerHTML = gallery.map((url, i) => `
    <div class="gallery-edit-item" data-index="${i}">
      <span class="gallery-edit-label">Image ${i + 1}</span>
      <div class="image-edit-row">
        <div class="image-preview-wrap small">
          <img src="${escapeHtml(url)}" alt="Gallery ${i + 1}" class="image-preview gallery-preview" data-preview="${i}" style="${url ? '' : 'display:none'}">
        </div>
        <div class="image-edit-fields">
          <input type="url" class="gallery-url-input" data-index="${i}" value="${escapeHtml(url)}" placeholder="https://... or upload">
          <input type="file" accept="image/*" class="file-input gallery-file-input" data-index="${i}">
          <button type="button" class="btn btn-outline btn-sm gallery-upload-btn" data-index="${i}">Upload</button>
        </div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.gallery-url-input').forEach(input => {
    input.addEventListener('input', () => {
      const idx = input.dataset.index;
      const preview = container.querySelector(`[data-preview="${idx}"]`);
      if (input.value) {
        preview.src = input.value;
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    });
  });

  container.querySelectorAll('.gallery-upload-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.index;
      const fileInput = container.querySelector(`.gallery-file-input[data-index="${idx}"]`);
      if (fileInput?.files?.[0]) {
        uploadImageFile(fileInput.files[0], (url) => {
          const urlInput = container.querySelector(`.gallery-url-input[data-index="${idx}"]`);
          urlInput.value = url;
          urlInput.dispatchEvent(new Event('input'));
        });
      } else {
        fileInput?.click();
      }
    });
  });

  container.querySelectorAll('.gallery-file-input').forEach(input => {
    input.addEventListener('change', () => {
      if (!input.files?.[0]) return;
      const idx = input.dataset.index;
      uploadImageFile(input.files[0], (url) => {
        const urlInput = container.querySelector(`.gallery-url-input[data-index="${idx}"]`);
        urlInput.value = url;
        urlInput.dispatchEvent(new Event('input'));
      });
    });
  });
}

function getGalleryUrls() {
  return Array.from(document.querySelectorAll('.gallery-url-input'))
    .map(input => input.value.trim())
    .filter(Boolean);
}

function initImageEditor() {
  document.getElementById('fieldHeroImageUrl')?.addEventListener('input', (e) => {
    setPreviewImage('previewHero', e.target.value);
  });
  document.getElementById('fieldSpecialtyImageUrl')?.addEventListener('input', (e) => {
    setPreviewImage('previewSpecialty', e.target.value);
  });

  document.querySelector('[data-upload="hero"]')?.addEventListener('click', () => {
    const fileInput = document.getElementById('uploadHero');
    if (fileInput?.files?.[0]) {
      uploadImageFile(fileInput.files[0], (url) => {
        document.getElementById('fieldHeroImageUrl').value = url;
        setPreviewImage('previewHero', url);
      });
    } else {
      fileInput?.click();
    }
  });

  document.getElementById('uploadHero')?.addEventListener('change', (e) => {
    if (!e.target.files?.[0]) return;
    uploadImageFile(e.target.files[0], (url) => {
      document.getElementById('fieldHeroImageUrl').value = url;
      setPreviewImage('previewHero', url);
    });
  });

  document.querySelector('[data-upload="specialty"]')?.addEventListener('click', () => {
    const fileInput = document.getElementById('uploadSpecialty');
    if (fileInput?.files?.[0]) {
      uploadImageFile(fileInput.files[0], (url) => {
        document.getElementById('fieldSpecialtyImageUrl').value = url;
        setPreviewImage('previewSpecialty', url);
      });
    } else {
      fileInput?.click();
    }
  });

  document.getElementById('uploadSpecialty')?.addEventListener('change', (e) => {
    if (!e.target.files?.[0]) return;
    uploadImageFile(e.target.files[0], (url) => {
      document.getElementById('fieldSpecialtyImageUrl').value = url;
      setPreviewImage('previewSpecialty', url);
    });
  });

  document.getElementById('imagesForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveShopData({
      heroImage: document.getElementById('fieldHeroImageUrl').value,
      specialtyImage: document.getElementById('fieldSpecialtyImageUrl').value,
      galleryImages: getGalleryUrls()
    });
  });
}

async function uploadImageFile(file, onSuccess) {
  const statusEl = document.getElementById('saveStatus');
  statusEl.textContent = 'Uploading...';
  statusEl.className = 'status-badge';

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.url) {
      onSuccess(data.url);
      statusEl.textContent = 'Uploaded ✓';
      statusEl.className = 'status-badge success';
      setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'status-badge'; }, 3000);
    } else {
      statusEl.textContent = data.error || 'Upload failed';
      statusEl.className = 'status-badge error';
    }
  } catch {
    statusEl.textContent = 'Upload failed';
    statusEl.className = 'status-badge error';
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

function buildMapEmbedUrl(lat, lng, zoom = 15) {
  return `https://maps.google.com/maps?q=${lat},${lng}&hl=en&z=${zoom}&output=embed`;
}

function buildGoogleMapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function getLocationCoords() {
  const lat = parseFloat(document.getElementById('fieldMapLat')?.value);
  const lng = parseFloat(document.getElementById('fieldMapLng')?.value);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

function populateLocationEditor(data) {
  const addressEl = document.getElementById('fieldLocationAddress');
  const latEl = document.getElementById('fieldMapLat');
  const lngEl = document.getElementById('fieldMapLng');
  const zoomEl = document.getElementById('fieldMapZoom');
  const customEl = document.getElementById('fieldMapEmbedCustom');

  if (!addressEl) return;

  addressEl.value = data.contact?.address || '';
  latEl.value = data.mapLat ?? '';
  lngEl.value = data.mapLng ?? '';
  zoomEl.value = data.mapZoom || 15;
  document.getElementById('mapZoomValue').textContent = zoomEl.value;
  customEl.value = '';

  updateMapPreview();
  updateGoogleMapsLink();

  if (locationMapReady && locationMarker) {
    const coords = getLocationCoords();
    if (coords) {
      locationMarker.setLatLng([coords.lat, coords.lng]);
      locationMap.setView([coords.lat, coords.lng], parseInt(zoomEl.value, 10));
    }
  }
}

function updateMapPreview() {
  const preview = document.getElementById('adminMapPreview');
  const custom = document.getElementById('fieldMapEmbedCustom')?.value.trim();
  const coords = getLocationCoords();
  const zoom = parseInt(document.getElementById('fieldMapZoom')?.value || '15', 10);

  if (!preview) return;

  if (custom) {
    preview.src = custom;
    return;
  }
  if (coords) {
    preview.src = buildMapEmbedUrl(coords.lat, coords.lng, zoom);
    return;
  }
  preview.removeAttribute('src');
}

function updateGoogleMapsLink() {
  const link = document.getElementById('openGoogleMapsLink');
  const coords = getLocationCoords();
  if (!link) return;
  if (coords) {
    link.href = buildGoogleMapsUrl(coords.lat, coords.lng);
    link.classList.remove('disabled');
  } else {
    link.href = '#';
  }
}

function setLocationCoords(lat, lng, panMap = true, clearCustom = true) {
  document.getElementById('fieldMapLat').value = Number(lat).toFixed(6);
  document.getElementById('fieldMapLng').value = Number(lng).toFixed(6);
  if (clearCustom) {
    const customEl = document.getElementById('fieldMapEmbedCustom');
    if (customEl) customEl.value = '';
  }
  updateMapPreview();
  updateGoogleMapsLink();

  if (locationMapReady && locationMarker) {
    locationMarker.setLatLng([lat, lng]);
    if (panMap) {
      const zoom = parseInt(document.getElementById('fieldMapZoom')?.value || '15', 10);
      locationMap.setView([lat, lng], zoom);
    }
  }
}

function initLocationMap() {
  if (locationMapReady || typeof L === 'undefined') return;

  const container = document.getElementById('locationPickerMap');
  if (!container || container.dataset.initialized) return;

  const coords = getLocationCoords() || { lat: 34.052235, lng: -118.243683 };
  const zoom = parseInt(document.getElementById('fieldMapZoom')?.value || '15', 10);

  locationMap = L.map(container, { scrollWheelZoom: true }).setView([coords.lat, coords.lng], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(locationMap);

  locationMarker = L.marker([coords.lat, coords.lng], { draggable: true }).addTo(locationMap);

  locationMarker.on('dragend', () => {
    const { lat, lng } = locationMarker.getLatLng();
    setLocationCoords(lat, lng, false);
  });

  locationMap.on('click', (e) => {
    setLocationCoords(e.latlng.lat, e.latlng.lng, false);
  });

  container.dataset.initialized = 'true';
  locationMapReady = true;

  setTimeout(() => locationMap.invalidateSize(), 200);
}

function initLocationEditor() {
  const form = document.getElementById('locationForm');
  if (!form) return;

  const latEl = document.getElementById('fieldMapLat');
  const lngEl = document.getElementById('fieldMapLng');
  const zoomEl = document.getElementById('fieldMapZoom');
  const customEl = document.getElementById('fieldMapEmbedCustom');

  document.getElementById('geocodeBtn')?.addEventListener('click', async () => {
    const address = document.getElementById('fieldLocationAddress')?.value.trim();
    if (!address) return alert('Enter an address to search.');

    const btn = document.getElementById('geocodeBtn');
    btn.disabled = true;
    btn.textContent = 'Searching...';

    try {
      const res = await apiFetch(`/api/admin/geocode?q=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Location not found.');
        return;
      }
      setLocationCoords(data.lat, data.lng);
      if (data.displayName && !document.getElementById('fieldLocationAddress').value) {
        document.getElementById('fieldLocationAddress').value = data.displayName;
      }
    } catch {
      alert('Failed to search address.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Search address';
    }
  });

  const onCoordChange = () => {
    updateMapPreview();
    updateGoogleMapsLink();
    const coords = getLocationCoords();
    if (coords && locationMarker) {
      locationMarker.setLatLng([coords.lat, coords.lng]);
    }
  };

  latEl?.addEventListener('input', onCoordChange);
  lngEl?.addEventListener('input', onCoordChange);
  zoomEl?.addEventListener('input', () => {
    document.getElementById('mapZoomValue').textContent = zoomEl.value;
    onCoordChange();
    if (locationMap && getLocationCoords()) {
      locationMap.setZoom(parseInt(zoomEl.value, 10));
    }
  });
  customEl?.addEventListener('input', updateMapPreview);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const coords = getLocationCoords();
    const customEmbed = customEl.value.trim();
    const payload = {
      contact: {
        ...shopData.contact,
        address: document.getElementById('fieldLocationAddress').value
      },
      mapZoom: parseInt(zoomEl.value, 10)
    };

    if (coords) {
      payload.mapLat = coords.lat;
      payload.mapLng = coords.lng;
    }

    if (customEmbed) {
      payload.mapEmbed = customEmbed;
      payload.mapUseCustomEmbed = true;
    } else if (coords) {
      payload.mapEmbed = buildMapEmbedUrl(coords.lat, coords.lng, payload.mapZoom);
      payload.mapUseCustomEmbed = false;
    }

    saveShopData(payload);
  });
}
