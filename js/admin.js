// =============================================================================
// js/admin.js — Yönetim Paneli Mantığı (admin.html)
// Yalnızca role='admin' kullanıcılar için: kullanıcı listesi/rol/silme,
// içerik (makale/ders/duyuru) listeleme/ekleme/düzenleme/silme.
// =============================================================================

(function () {
    const base = document.documentElement.getAttribute('data-base-path') || '';
    const API = `${base}api`;

    async function getCsrfToken() {
        const res = await fetch(`${API}/auth/csrf-token`, { credentials: 'same-origin' });
        const data = await res.json();
        return data.csrfToken;
    }

    async function apiRequest(method, path, body) {
        const csrfToken = await getCsrfToken();
        const opts = {
            method,
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': csrfToken },
        };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(`${API}${path}`, opts);
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    }

    function showFeedback(el, message, isError) {
        if (!el) return;
        el.hidden = false;
        el.textContent = message;
        el.classList.toggle('is-error', !!isError);
        el.classList.toggle('is-success', !isError);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    function formatDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // -------------------------------------------------------------------------
    // Yetki kontrolü: admin değilse anasayfaya yönlendir.
    // -------------------------------------------------------------------------
    async function guardAdmin() {
        const guardEl = document.getElementById('admin-guard');
        const appEl = document.getElementById('admin-app');
        try {
            const res = await fetch(`${API}/auth/me`, { credentials: 'same-origin' });
            if (!res.ok) throw new Error('unauthenticated');
            const { user } = await res.json();
            if (user.role !== 'admin') {
                window.location.href = `${base}index.html`;
                return false;
            }
            guardEl.hidden = true;
            appEl.hidden = false;
            return true;
        } catch {
            window.location.href = `${base}login.html`;
            return false;
        }
    }

    // =============================================================================
    // TABLAR
    // =============================================================================
    function initTabs() {
        document.querySelectorAll('.admin-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.admin-tab').forEach((b) => b.classList.remove('active'));
                document.querySelectorAll('.admin-panel').forEach((p) => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            });
        });
    }

    // =============================================================================
    // KULLANICILAR
    // =============================================================================
    async function loadUsers() {
        const tbody = document.getElementById('users-tbody');
        const { ok, data } = await apiRequest('GET', '/admin/users');
        if (!ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">${escapeHtml(data.error || 'Yüklenemedi.')}</td></tr>`;
            return;
        }
        if (data.users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Hiç kullanıcı yok.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.users
            .map((u) => `
                <tr data-id="${u.id}">
                    <td data-label="Kullanıcı Adı">${escapeHtml(u.username)}</td>
                    <td data-label="E-posta">${escapeHtml(u.email)}</td>
                    <td data-label="Rol">
                        <span class="role-badge role-badge--${u.role === 'admin' ? 'admin' : 'member'}">${u.role === 'admin' ? 'Yönetici' : 'Üye'}</span>
                    </td>
                    <td data-label="Kayıt Tarihi">${formatDate(u.created_at)}</td>
                    <td data-label="Son Giriş">${formatDate(u.last_login_at)}</td>
                    <td data-label="İşlemler">
                        <select class="admin-select admin-select--role" data-user-id="${u.id}">
                            <option value="member" ${u.role === 'member' ? 'selected' : ''}>Üye</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Yönetici</option>
                        </select>
                        <button class="admin-btn admin-btn--danger admin-btn--sm user-delete-btn" data-user-id="${u.id}" data-username="${escapeHtml(u.username)}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `)
            .join('');

        tbody.querySelectorAll('.admin-select--role').forEach((sel) => {
            sel.addEventListener('change', async () => {
                const userId = sel.dataset.userId;
                const role = sel.value;
                const feedback = document.getElementById('admin-feedback');
                const { ok, data } = await apiRequest('PATCH', `/admin/users/${userId}/role`, { role });
                showFeedback(feedback, data.message || data.error, !ok);
                if (!ok) loadUsers(); // başarısızsa seçimi eski haline döndürmek için yeniden yükle
            });
        });

        tbody.querySelectorAll('.user-delete-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.userId;
                const username = btn.dataset.username;
                if (!confirm(`"${username}" kullanıcısını kalıcı olarak silmek istediğinize emin misiniz?`)) return;

                const feedback = document.getElementById('admin-feedback');
                const { ok, data } = await apiRequest('DELETE', `/admin/users/${userId}`);
                showFeedback(feedback, data.message || data.error, !ok);
                if (ok) loadUsers();
            });
        });
    }

    // =============================================================================
    // İÇERİKLER
    // =============================================================================
    const typeLabels = { makale: 'Makale', ders: 'Ders', duyuru: 'Duyuru' };

    async function loadContent() {
        const tbody = document.getElementById('content-tbody');
        const type = document.getElementById('content-type-filter').value;
        const qs = type ? `?type=${encodeURIComponent(type)}` : '';
        const { ok, data } = await apiRequest('GET', `/admin/content${qs}`);

        if (!ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">${escapeHtml(data.error || 'Yüklenemedi.')}</td></tr>`;
            return;
        }
        if (data.items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Hiç içerik yok.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.items
            .map((item) => `
                <tr data-id="${item.id}">
                    <td data-label="Başlık">${escapeHtml(item.title)}</td>
                    <td data-label="Tür">${typeLabels[item.type] || item.type}</td>
                    <td data-label="Durum">
                        <span class="status-badge status-badge--${item.is_published ? 'published' : 'draft'}">${item.is_published ? 'Yayında' : 'Taslak'}</span>
                    </td>
                    <td data-label="Yazar">${escapeHtml(item.author_username || '—')}</td>
                    <td data-label="Güncellenme">${formatDate(item.updated_at)}</td>
                    <td data-label="İşlemler">
                        <button class="admin-btn admin-btn--ghost admin-btn--sm content-edit-btn" data-id="${item.id}"><i class="fa-solid fa-pen"></i></button>
                        <button class="admin-btn admin-btn--danger admin-btn--sm content-delete-btn" data-id="${item.id}" data-title="${escapeHtml(item.title)}"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `)
            .join('');

        tbody.querySelectorAll('.content-edit-btn').forEach((btn) => {
            btn.addEventListener('click', () => openContentModal(Number(btn.dataset.id), data.items));
        });

        tbody.querySelectorAll('.content-delete-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const title = btn.dataset.title;
                if (!confirm(`"${title}" içeriğini silmek istediğinize emin misiniz?`)) return;

                const feedback = document.getElementById('admin-feedback');
                const { ok, data } = await apiRequest('DELETE', `/admin/content/${id}`);
                showFeedback(feedback, data.message || data.error, !ok);
                if (ok) loadContent();
            });
        });
    }

    function openContentModal(id, items) {
        const backdrop = document.getElementById('content-modal-backdrop');
        const title = document.getElementById('content-modal-title');
        const form = document.getElementById('content-form');
        form.reset();
        document.getElementById('content-form-feedback').hidden = true;

        if (id) {
            const item = items.find((i) => i.id === id);
            title.textContent = 'İçeriği Düzenle';
            document.getElementById('content-id').value = item.id;
            document.getElementById('content-type').value = item.type;
            document.getElementById('content-title').value = item.title;
            document.getElementById('content-summary').value = item.summary || '';
            document.getElementById('content-body').value = item.body || '';
            document.getElementById('content-published').checked = !!item.is_published;
        } else {
            title.textContent = 'Yeni İçerik';
            document.getElementById('content-id').value = '';
        }

        backdrop.hidden = false;
    }

    function closeContentModal() {
        document.getElementById('content-modal-backdrop').hidden = true;
    }

    function initContentModal() {
        document.getElementById('content-add-btn').addEventListener('click', () => openContentModal(null, []));
        document.getElementById('content-cancel-btn').addEventListener('click', closeContentModal);
        document.getElementById('content-modal-backdrop').addEventListener('click', (e) => {
            if (e.target.id === 'content-modal-backdrop') closeContentModal();
        });

        document.getElementById('content-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedback = document.getElementById('content-form-feedback');
            const saveBtn = document.getElementById('content-save-btn');
            saveBtn.disabled = true;

            const id = document.getElementById('content-id').value;
            const payload = {
                type: document.getElementById('content-type').value,
                title: document.getElementById('content-title').value,
                summary: document.getElementById('content-summary').value,
                body: document.getElementById('content-body').value,
                isPublished: document.getElementById('content-published').checked,
            };

            const { ok, data } = id
                ? await apiRequest('PATCH', `/admin/content/${id}`, payload)
                : await apiRequest('POST', '/admin/content', payload);

            if (ok) {
                closeContentModal();
                loadContent();
            } else {
                const detail = data.details?.[0]?.msg;
                showFeedback(feedback, detail || data.error || 'Kaydedilemedi.', true);
                saveBtn.disabled = false;
            }
        });

        document.getElementById('content-type-filter').addEventListener('change', loadContent);
    }

    // =============================================================================
    // BAŞLAT
    // =============================================================================
    document.addEventListener('nest:partials-loaded', async () => {
        const isAdmin = await guardAdmin();
        if (!isAdmin) return;

        initTabs();
        initContentModal();
        loadUsers();
        loadContent();
    });
})();
