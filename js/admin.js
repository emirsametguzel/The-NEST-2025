// =============================================================================
// js/admin.js — The Nest Yönetim Paneli Mantığı (admin.html)
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
        setTimeout(() => {
            if (!isError) el.hidden = true;
        }, 5000);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    function formatDate(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
            return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (_) {
            return iso;
        }
    }

    // -------------------------------------------------------------------------
    // YETKİ KONTROLÜ (403 Uyarısı ile)
    // -------------------------------------------------------------------------
    async function guardAdmin() {
        const guardLoading = document.getElementById('admin-guard-loading');
        const card403 = document.getElementById('admin-403');
        const card403Msg = document.getElementById('admin-403-message');
        const appEl = document.getElementById('admin-app');
        const userTag = document.getElementById('admin-user-tag');

        try {
            const res = await fetch(`${API}/auth/me`, { credentials: 'same-origin' });
            if (!res.ok) throw new Error('unauthenticated');
            const { user } = await res.json();

            if (user.role !== 'admin') {
                guardLoading.hidden = true;
                card403Msg.textContent = `Giriş yaptığınız hesap ("${user.username}") yönetici yetkisine sahip değildir (403 Forbidden).`;
                card403.hidden = false;
                return false;
            }

            guardLoading.hidden = true;
            card403.hidden = true;
            appEl.hidden = false;
            if (userTag) {
                userTag.innerHTML = `<i class="fa-solid fa-user-shield"></i> ${escapeHtml(user.display_name || user.username)} (Yönetici)`;
            }
            return true;
        } catch (_) {
            guardLoading.hidden = true;
            card403Msg.textContent = 'Yönetim paneline erişmek için yönetici hesabınızla giriş yapmanız gerekmektedir (403 Forbidden).';
            card403.hidden = false;
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
                const target = document.getElementById(`tab-${btn.dataset.tab}`);
                if (target) target.classList.add('active');

                // Tab içeriğini yenile
                if (btn.dataset.tab === 'users') loadUsers();
                else if (btn.dataset.tab === 'content') loadContent();
                else if (btn.dataset.tab === 'applications') loadApplications();
                else if (btn.dataset.tab === 'settings') loadSettings();
            });
        });
    }

    // =============================================================================
    // 1. KULLANICILAR
    // =============================================================================
    async function loadUsers() {
        const tbody = document.getElementById('users-tbody');
        const feedback = document.getElementById('admin-feedback');
        const { ok, data } = await apiRequest('GET', '/admin/users');

        if (!ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">${escapeHtml(data.error || 'Yüklenemedi.')}</td></tr>`;
            return;
        }
        if (data.users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Hiç kullanıcı kaydı yok.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.users
            .map((u) => `
                <tr data-id="${u.id}">
                    <td data-label="Kullanıcı">
                        <strong>${escapeHtml(u.username)}</strong>
                        ${u.display_name ? `<br><small style="color:#64748b;">${escapeHtml(u.display_name)}</small>` : ''}
                    </td>
                    <td data-label="E-posta">${escapeHtml(u.email)}</td>
                    <td data-label="Rol">
                        <select class="admin-select admin-select--role admin-btn--sm" data-user-id="${u.id}">
                            <option value="member" ${u.role === 'member' ? 'selected' : ''}>Üye</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Yönetici</option>
                        </select>
                    </td>
                    <td data-label="Durum">
                        <button class="status-badge user-status-toggle ${u.is_active ? 'status-badge--published' : 'status-badge--frozen'}" data-user-id="${u.id}" data-active="${u.is_active ? '1' : '0'}" title="Durumu Değiştir">
                            <i class="fa-solid ${u.is_active ? 'fa-check' : 'fa-snowflake'}"></i> ${u.is_active ? 'Aktif' : 'Donduruldu'}
                        </button>
                    </td>
                    <td data-label="Kayıt Tarihi">${formatDate(u.created_at)}</td>
                    <td data-label="İşlemler">
                        <button class="admin-btn admin-btn--warning admin-btn--sm user-pwd-btn" data-user-id="${u.id}" data-username="${escapeHtml(u.username)}" title="Şifre Sıfırla">
                            <i class="fa-solid fa-key"></i> Şifre
                        </button>
                        <button class="admin-btn admin-btn--danger admin-btn--sm user-delete-btn" data-user-id="${u.id}" data-username="${escapeHtml(u.username)}" title="Sil">
                            <i class="fa-solid fa-trash"></i> Sil
                        </button>
                    </td>
                </tr>
            `)
            .join('');

        // Rol değiştirme
        tbody.querySelectorAll('.admin-select--role').forEach((sel) => {
            sel.addEventListener('change', async () => {
                const userId = sel.dataset.userId;
                const role = sel.value;
                const { ok, data } = await apiRequest('PATCH', `/admin/users/${userId}/role`, { role });
                showFeedback(feedback, data.message || data.error, !ok);
                loadUsers();
            });
        });

        // Hesap dondur / aktifleştir
        tbody.querySelectorAll('.user-status-toggle').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.userId;
                const currentActive = btn.dataset.active === '1';
                const { ok, data } = await apiRequest('PATCH', `/admin/users/${userId}/status`, { isActive: !currentActive });
                showFeedback(feedback, data.message || data.error, !ok);
                loadUsers();
            });
        });

        // Şifre sıfırlama modalı aç
        tbody.querySelectorAll('.user-pwd-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.userId;
                const username = btn.dataset.username;
                document.getElementById('pwd-user-id').value = userId;
                document.getElementById('pwd-user-label').textContent = `Kullanıcı: ${username}`;
                document.getElementById('pwd-new-password').value = '';
                document.getElementById('pwd-form-feedback').hidden = true;
                document.getElementById('pwd-modal-backdrop').hidden = false;
            });
        });

        // Kullanıcı sil
        tbody.querySelectorAll('.user-delete-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.userId;
                const username = btn.dataset.username;
                if (!confirm(`"${username}" kullanıcısını kalıcı olarak silmek istediğinize emin misiniz?`)) return;

                const { ok, data } = await apiRequest('DELETE', `/admin/users/${userId}`);
                showFeedback(feedback, data.message || data.error, !ok);
                if (ok) loadUsers();
            });
        });
    }

    // Şifre Modal İşlemleri
    function initPasswordModal() {
        const modal = document.getElementById('pwd-modal-backdrop');
        const closeBtn = document.getElementById('pwd-modal-close-btn');
        const cancelBtn = document.getElementById('pwd-cancel-btn');
        const form = document.getElementById('pwd-reset-form');

        const close = () => { modal.hidden = true; };
        closeBtn?.addEventListener('click', close);
        cancelBtn?.addEventListener('click', close);
        modal?.addEventListener('click', (e) => { if (e.target === modal) close(); });

        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userId = document.getElementById('pwd-user-id').value;
            const newPassword = document.getElementById('pwd-new-password').value;
            const feedback = document.getElementById('pwd-form-feedback');

            const { ok, data } = await apiRequest('POST', `/admin/users/${userId}/reset-password`, { newPassword });
            if (ok) {
                close();
                showFeedback(document.getElementById('admin-feedback'), data.message || 'Şifre güncellendi.', false);
            } else {
                showFeedback(feedback, data.error || 'Şifre güncellenemedi.', true);
            }
        });
    }

    // =============================================================================
    // 2. İÇERİK YÖNETİMİ
    // =============================================================================
    const typeLabels = {
        ders: 'Ders / Eğitim',
        makale: 'Makale',
        sunum: 'Sunum',
        obje: 'Obje / CAD',
        haber: 'Haber & Duyuru',
        duyuru: 'Duyuru',
    };

    let cachedItems = [];

    async function loadContent() {
        const tbody = document.getElementById('content-tbody');
        const type = document.getElementById('content-type-filter').value;
        const category = document.getElementById('content-cat-filter').value;

        const params = new URLSearchParams();
        if (type) params.append('type', type);
        if (category) params.append('category', category);
        const qs = params.toString() ? `?${params.toString()}` : '';

        const { ok, data } = await apiRequest('GET', `/admin/content${qs}`);

        if (!ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">${escapeHtml(data.error || 'Yüklenemedi.')}</td></tr>`;
            return;
        }

        cachedItems = data.items || [];
        if (cachedItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Kriterlere uygun içerik bulunamadı.</td></tr>`;
            return;
        }

        tbody.innerHTML = cachedItems
            .map((item) => `
                <tr data-id="${item.id}">
                    <td data-label="Başlık">
                        <strong>${escapeHtml(item.title)}</strong>
                        ${item.summary ? `<br><small style="color:#64748b;">${escapeHtml(item.summary.slice(0, 70))}...</small>` : ''}
                    </td>
                    <td data-label="Tür / Kategori">
                        <span class="role-badge role-badge--admin">${typeLabels[item.type] || item.type}</span>
                        <span class="role-badge role-badge--member">${escapeHtml(item.category || 'Mekanik')}</span>
                    </td>
                    <td data-label="Durum">
                        <span class="status-badge status-badge--${item.is_published ? 'published' : 'draft'}">
                            <i class="fa-solid ${item.is_published ? 'fa-globe' : 'fa-pen-ruler'}"></i> ${item.is_published ? 'Yayında' : 'Taslak'}
                        </span>
                    </td>
                    <td data-label="Yazar">${escapeHtml(item.author_username || 'Yönetici')}</td>
                    <td data-label="Güncellenme">${formatDate(item.updated_at)}</td>
                    <td data-label="İşlemler">
                        <button class="admin-btn admin-btn--ghost admin-btn--sm content-edit-btn" data-id="${item.id}" title="Düzenle">
                            <i class="fa-solid fa-pen"></i> Düzenle
                        </button>
                        <button class="admin-btn admin-btn--danger admin-btn--sm content-delete-btn" data-id="${item.id}" data-title="${escapeHtml(item.title)}" title="Sil">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `)
            .join('');

        tbody.querySelectorAll('.content-edit-btn').forEach((btn) => {
            btn.addEventListener('click', () => openContentModal(Number(btn.dataset.id)));
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

    function openContentModal(id) {
        const backdrop = document.getElementById('content-modal-backdrop');
        const title = document.getElementById('content-modal-title');
        const form = document.getElementById('content-form');
        form.reset();
        document.getElementById('content-form-feedback').hidden = true;

        if (id) {
            const item = cachedItems.find((i) => i.id === id);
            if (item) {
                title.textContent = 'İçeriği Düzenle';
                document.getElementById('content-id').value = item.id;
                document.getElementById('content-type').value = item.type || 'ders';
                document.getElementById('content-category').value = item.category || 'Mekanik';
                document.getElementById('content-title').value = item.title || '';
                document.getElementById('content-summary').value = item.summary || '';
                document.getElementById('content-body').value = item.body || '';
                document.getElementById('content-image-url').value = item.image_url || '';
                document.getElementById('content-file-url').value = item.file_url || '';
                document.getElementById('content-published').checked = !!item.is_published;
            }
        } else {
            title.textContent = 'Yeni İçerik Ekle';
            document.getElementById('content-id').value = '';
            document.getElementById('content-published').checked = true;
        }

        backdrop.hidden = false;
    }

    function initContentModal() {
        const backdrop = document.getElementById('content-modal-backdrop');
        const addBtn = document.getElementById('content-add-btn');
        const cancelBtn = document.getElementById('content-cancel-btn');
        const closeBtn = document.getElementById('content-modal-close-btn');

        const close = () => { backdrop.hidden = true; };
        addBtn?.addEventListener('click', () => openContentModal(null));
        cancelBtn?.addEventListener('click', close);
        closeBtn?.addEventListener('click', close);
        backdrop?.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

        document.getElementById('content-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedback = document.getElementById('content-form-feedback');
            const saveBtn = document.getElementById('content-save-btn');
            saveBtn.disabled = true;

            const id = document.getElementById('content-id').value;
            const payload = {
                type: document.getElementById('content-type').value,
                category: document.getElementById('content-category').value,
                title: document.getElementById('content-title').value,
                summary: document.getElementById('content-summary').value,
                body: document.getElementById('content-body').value,
                imageUrl: document.getElementById('content-image-url').value,
                fileUrl: document.getElementById('content-file-url').value,
                isPublished: document.getElementById('content-published').checked,
            };

            const { ok, data } = id
                ? await apiRequest('PATCH', `/admin/content/${id}`, payload)
                : await apiRequest('POST', '/admin/content', payload);

            if (ok) {
                close();
                showFeedback(document.getElementById('admin-feedback'), data.message || 'İçerik kaydedildi.', false);
                loadContent();
            } else {
                const detail = data.details?.[0]?.msg;
                showFeedback(feedback, detail || data.error || 'Kaydedilemedi.', true);
            }
            saveBtn.disabled = false;
        });

        document.getElementById('content-type-filter')?.addEventListener('change', loadContent);
        document.getElementById('content-cat-filter')?.addEventListener('change', loadContent);
    }

    // =============================================================================
    // 3. TAKIM BAŞVURULARI
    // =============================================================================
    let cachedApps = [];

    async function loadApplications() {
        const tbody = document.getElementById('applications-tbody');
        const feedback = document.getElementById('admin-feedback');
        const { ok, data } = await apiRequest('GET', '/admin/applications');

        if (!ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">${escapeHtml(data.error || 'Yüklenemedi.')}</td></tr>`;
            return;
        }

        cachedApps = data.applications || [];
        if (cachedApps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-empty">Henüz takım başvurusu yapılmamış.</td></tr>`;
            return;
        }

        const statusLabels = {
            pending: 'Beklemede',
            approved: 'Onaylandı',
            rejected: 'Reddedildi',
        };

        tbody.innerHTML = cachedApps
            .map((app) => `
                <tr data-id="${app.id}">
                    <td data-label="Tarih">${formatDate(app.created_at)}</td>
                    <td data-label="İsim & Sınıf">
                        <strong>${escapeHtml(app.name)}</strong>
                        <br><small style="color:#64748b;">${escapeHtml(app.class_name || 'Lise')}</small>
                    </td>
                    <td data-label="Departman">
                        <span class="role-badge role-badge--admin">${escapeHtml(app.department)}</span>
                    </td>
                    <td data-label="İletişim">
                        <a href="mailto:${escapeHtml(app.email)}" style="color:#007bff; text-decoration:none;">${escapeHtml(app.email)}</a>
                        <br><small>${escapeHtml(app.phone)}</small>
                    </td>
                    <td data-label="Durum">
                        <select class="admin-select admin-select--status admin-btn--sm" data-app-id="${app.id}">
                            <option value="pending" ${app.status === 'pending' ? 'selected' : ''}>Beklemede</option>
                            <option value="approved" ${app.status === 'approved' ? 'selected' : ''}>Onaylandı</option>
                            <option value="rejected" ${app.status === 'rejected' ? 'selected' : ''}>Reddedildi</option>
                        </select>
                    </td>
                    <td data-label="İşlemler">
                        <button class="admin-btn admin-btn--ghost admin-btn--sm app-detail-btn" data-id="${app.id}">
                            <i class="fa-solid fa-eye"></i> İncele
                        </button>
                        <button class="admin-btn admin-btn--danger admin-btn--sm app-delete-btn" data-id="${app.id}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `)
            .join('');

        tbody.querySelectorAll('.admin-select--status').forEach((sel) => {
            sel.addEventListener('change', async () => {
                const appId = sel.dataset.appId;
                const status = sel.value;
                const { ok, data } = await apiRequest('PATCH', `/admin/applications/${appId}/status`, { status });
                showFeedback(feedback, data.message || data.error, !ok);
            });
        });

        tbody.querySelectorAll('.app-detail-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const app = cachedApps.find((a) => a.id === Number(btn.dataset.id));
                if (!app) return;

                const detailContent = document.getElementById('app-detail-content');
                detailContent.innerHTML = `
                    <p><strong>Aday İsmi:</strong> ${escapeHtml(app.name)} (${escapeHtml(app.class_name)})</p>
                    <p><strong>E-posta:</strong> <a href="mailto:${escapeHtml(app.email)}">${escapeHtml(app.email)}</a> | <strong>Telefon:</strong> ${escapeHtml(app.phone)}</p>
                    <p><strong>İlgilendiği Departman:</strong> <span class="role-badge role-badge--admin">${escapeHtml(app.department)}</span></p>
                    <p><strong>Deneyim / Geçmiş Çalışmalar:</strong><br>${escapeHtml(app.experience || 'Belirtilmedi')}</p>
                    <p><strong>Kullandığı Araçlar / Diller / Programlar:</strong><br>${escapeHtml(app.tools || 'Belirtilmedi')}</p>
                    <p><strong>Motivasyon & Takıma Katılma Amacı:</strong><br>${escapeHtml(app.motivation || 'Belirtilmedi')}</p>
                    <p><strong>Başvuru Tarihi:</strong> ${formatDate(app.created_at)}</p>
                `;
                document.getElementById('app-detail-modal-backdrop').hidden = false;
            });
        });

        tbody.querySelectorAll('.app-delete-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (!confirm('Bu başvuruyu silmek istediğinize emin misiniz?')) return;
                const { ok, data } = await apiRequest('DELETE', `/admin/applications/${id}`);
                showFeedback(feedback, data.message || data.error, !ok);
                if (ok) loadApplications();
            });
        });
    }

    function initApplicationModal() {
        const modal = document.getElementById('app-detail-modal-backdrop');
        const closeBtn = document.getElementById('app-modal-close-btn');
        const closeBtn2 = document.getElementById('app-detail-close-btn');
        const close = () => { modal.hidden = true; };
        closeBtn?.addEventListener('click', close);
        closeBtn2?.addEventListener('click', close);
        modal?.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    // =============================================================================
    // 4. SİTE AYARLARI
    // =============================================================================
    async function loadSettings() {
        const { ok, data } = await apiRequest('GET', '/admin/settings');
        if (!ok || !data.settings) return;

        const s = data.settings;
        if (document.getElementById('setting-site-title')) document.getElementById('setting-site-title').value = s.site_title || '';
        if (document.getElementById('setting-announcement-banner')) document.getElementById('setting-announcement-banner').value = s.announcement_banner || '';
        if (document.getElementById('setting-announcement-active')) document.getElementById('setting-announcement-active').checked = s.announcement_active === '1';
        if (document.getElementById('setting-contact-email')) document.getElementById('setting-contact-email').value = s.contact_email || '';
        if (document.getElementById('setting-applications-open')) document.getElementById('setting-applications-open').checked = s.applications_open === '1';
        if (document.getElementById('setting-footer-text')) document.getElementById('setting-footer-text').value = s.footer_text || '';
    }

    function initSettingsForm() {
        const form = document.getElementById('settings-form');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedback = document.getElementById('settings-feedback');
            const saveBtn = document.getElementById('settings-save-btn');
            saveBtn.disabled = true;

            const settings = {
                site_title: document.getElementById('setting-site-title').value,
                announcement_banner: document.getElementById('setting-announcement-banner').value,
                announcement_active: document.getElementById('setting-announcement-active').checked ? '1' : '0',
                contact_email: document.getElementById('setting-contact-email').value,
                applications_open: document.getElementById('setting-applications-open').checked ? '1' : '0',
                footer_text: document.getElementById('setting-footer-text').value,
            };

            const { ok, data } = await apiRequest('PUT', '/admin/settings', { settings });
            showFeedback(feedback, data.message || data.error, !ok);
            saveBtn.disabled = false;
        });
    }

    // =============================================================================
    // BAŞLATMA
    // =============================================================================
    document.addEventListener('nest:partials-loaded', async () => {
        const isAdmin = await guardAdmin();
        if (!isAdmin) return;

        initTabs();
        initPasswordModal();
        initContentModal();
        initApplicationModal();
        initSettingsForm();

        loadUsers();
    });
})();
