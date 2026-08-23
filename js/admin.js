// =============================================================================
// js/admin.js — The Nest Özel Yönetim Paneli ve Dashboard Mantığı
// (Güvenli Template Tabanlı Dinamik Mount & Inline Form Mimarisi)
// =============================================================================

(function () {
    const base = document.documentElement.getAttribute('data-base-path') || '';
    const API = `${base}api`;

    let cachedItems = [];
    let cachedApps = [];
    let currentAdminUser = null;
    let isDashboardMounted = false;

    async function getCsrfToken() {
        try {
            const res = await fetch(`${API}/auth/csrf-token`, { credentials: 'same-origin' });
            const data = await res.json();
            return data.csrfToken;
        } catch (_) {
            return '';
        }
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
        el.className = `admin-alert ${isError ? 'admin-alert--danger' : 'admin-alert--success'}`;
        setTimeout(() => {
            if (!isError && el) el.hidden = true;
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
            return d.toLocaleDateString('tr-TR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (_) {
            return iso;
        }
    }

    // =============================================================================
    // 1. GÜVENLİK & YETKİ GUARD (OTURUM YOKSA DASHBOARD DOM'DA OLUŞTURULMAZ)
    // =============================================================================
    async function guardAdmin() {
        const loadingEl = document.getElementById('admin-guard-loading');
        const loginScreen = document.getElementById('admin-login-screen');
        const mountContainer = document.getElementById('admin-dashboard-mount');

        try {
            const res = await fetch(`${API}/admin/me`, { credentials: 'same-origin' });
            if (!res.ok) throw new Error('not authenticated');
            const data = await res.json();

            if (data.authenticated && data.user && data.user.role === 'admin') {
                currentAdminUser = data.user;
                if (loadingEl) loadingEl.hidden = true;
                if (loginScreen) loginScreen.hidden = true;

                // Dashboard henüz DOM'a eklenmemişse şablondan dinamik olarak ekle
                if (!isDashboardMounted) {
                    mountDashboard();
                }

                const userDisplay = document.getElementById('admin-user-display');
                if (userDisplay) {
                    userDisplay.textContent = currentAdminUser.display_name || currentAdminUser.username || currentAdminUser.email;
                }

                loadActiveTabContent();
                return true;
            }
            throw new Error('not authorized');
        } catch (_) {
            unmountDashboard();
            if (loadingEl) loadingEl.hidden = true;
            if (loginScreen) loginScreen.hidden = false;
            return false;
        }
    }

    // =============================================================================
    // 2. DASHBOARD MOUNT / UNMOUNT (HTML/DOM BYPASS KORUMASI)
    // =============================================================================
    function mountDashboard() {
        const mountContainer = document.getElementById('admin-dashboard-mount');
        const template = document.getElementById('admin-dashboard-template');
        if (!mountContainer || !template) return;

        mountContainer.innerHTML = '';
        const clone = document.importNode(template.content, true);
        mountContainer.appendChild(clone);
        isDashboardMounted = true;

        // Dashboard bileşen olaylarını başlat
        initTabs();
        initUserInlinePwdPanel();
        initContentInlinePanel();
        initAppDetailInlinePanel();
        initSettingsForm();
        initLogoutButton();
    }

    function unmountDashboard() {
        const mountContainer = document.getElementById('admin-dashboard-mount');
        if (mountContainer) {
            mountContainer.innerHTML = '';
        }
        isDashboardMounted = false;
        currentAdminUser = null;
    }

    function initLogoutButton() {
        const logoutBtn = document.getElementById('admin-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await apiRequest('POST', '/admin/logout');
                unmountDashboard();
                guardAdmin();
            });
        }
    }

    // =============================================================================
    // 3. ÖZEL ADMİN GİRİŞİ (Yalnızca emirsametguzel@gmail.com & emir2011)
    // =============================================================================
    function initAdminLogin() {
        const form = document.getElementById('admin-login-form');
        const feedback = document.getElementById('admin-login-feedback');
        const submitBtn = document.getElementById('admin-login-submit-btn');

        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (submitBtn) submitBtn.disabled = true;
            if (feedback) feedback.hidden = true;

            const email = (document.getElementById('admin-email')?.value || '').trim();
            const password = (document.getElementById('admin-password')?.value || '').trim();

            const { ok, data } = await apiRequest('POST', '/admin/login', { email, password });

            if (ok && data.success) {
                form.reset();
                await guardAdmin();
            } else {
                showFeedback(feedback, data.error || 'Geçersiz yönetici bilgileri.', true);
            }
            if (submitBtn) submitBtn.disabled = false;
        });
    }

    // =============================================================================
    // 4. DASHBOARD SEKME YÖNETİMİ
    // =============================================================================
    function initTabs() {
        document.querySelectorAll('.admin-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.admin-tab-btn').forEach((b) => b.classList.remove('active'));
                document.querySelectorAll('.admin-tab-content').forEach((p) => p.classList.remove('active'));

                btn.classList.add('active');
                const target = document.getElementById(`tab-${btn.dataset.tab}`);
                if (target) target.classList.add('active');

                loadActiveTabContent();
            });
        });
    }

    function loadActiveTabContent() {
        const activeBtn = document.querySelector('.admin-tab-btn.active');
        const tab = activeBtn ? activeBtn.dataset.tab : 'users';

        if (tab === 'users') loadUsers();
        else if (tab === 'content') loadContent();
        else if (tab === 'applications') loadApplications();
        else if (tab === 'settings') loadSettings();
    }

    // =============================================================================
    // 5. KULLANICI YÖNETİMİ & INLINE ŞİFRE PANELİ
    // =============================================================================
    async function loadUsers() {
        const tbody = document.getElementById('users-tbody');
        const feedback = document.getElementById('admin-feedback');
        const countBadge = document.getElementById('user-count-badge');
        if (!tbody) return;

        const { ok, data } = await apiRequest('GET', '/admin/users');

        if (!ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty">${escapeHtml(data.error || 'Kullanıcılar yüklenemedi.')}</td></tr>`;
            return;
        }

        const users = data.users || [];
        if (countBadge) countBadge.textContent = `${users.length} Kullanıcı`;

        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty">Henüz kayıtlı kullanıcı bulunmuyor.</td></tr>`;
            return;
        }

        tbody.innerHTML = users
            .map((u) => `
                <tr data-id="${u.id}">
                    <td data-label="Kullanıcı">
                        <div class="admin-user-cell">
                            <div class="admin-user-avatar"><i class="fa-solid fa-user"></i></div>
                            <div>
                                <strong class="admin-user-name">${escapeHtml(u.username)}</strong>
                                ${u.display_name ? `<span class="admin-user-sub">${escapeHtml(u.display_name)}</span>` : ''}
                            </div>
                        </div>
                    </td>
                    <td data-label="E-Posta">${escapeHtml(u.email)}</td>
                    <td data-label="Rol">
                        <select class="admin-select admin-select--sm admin-select-role" data-user-id="${u.id}">
                            <option value="member" ${u.role === 'member' ? 'selected' : ''}>Üye</option>
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Yönetici</option>
                        </select>
                    </td>
                    <td data-label="Durum">
                        <button type="button" class="admin-badge-btn user-status-toggle ${u.is_active ? 'admin-badge-btn--active' : 'admin-badge-btn--frozen'}" data-user-id="${u.id}" data-active="${u.is_active ? '1' : '0'}" title="Tıklayarak durumu değiştirin">
                            <i class="fa-solid ${u.is_active ? 'fa-check' : 'fa-snowflake'}"></i> ${u.is_active ? 'Aktif' : 'Donduruldu'}
                        </button>
                    </td>
                    <td data-label="Kayıt Tarihi">${formatDate(u.created_at)}</td>
                    <td data-label="İşlemler" class="text-right">
                        <button type="button" class="admin-btn admin-btn--warning admin-btn--sm user-pwd-inline-btn" data-user-id="${u.id}" data-username="${escapeHtml(u.username)}">
                            <i class="fa-solid fa-key"></i> Şifre Sıfırla
                        </button>
                        <button type="button" class="admin-btn admin-btn--danger admin-btn--sm user-delete-btn" data-user-id="${u.id}" data-username="${escapeHtml(u.username)}" title="Kullanıcıyı Sil">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `)
            .join('');

        // Rol Değiştirme
        tbody.querySelectorAll('.admin-select-role').forEach((sel) => {
            sel.addEventListener('change', async () => {
                const userId = sel.dataset.userId;
                const role = sel.value;
                const { ok, data } = await apiRequest('PATCH', `/admin/users/${userId}/role`, { role });
                showFeedback(feedback, data.message || data.error, !ok);
                loadUsers();
            });
        });

        // Hesap Durumu Dondur / Aktifleştir
        tbody.querySelectorAll('.user-status-toggle').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.userId;
                const currentActive = btn.dataset.active === '1';
                const { ok, data } = await apiRequest('PATCH', `/admin/users/${userId}/status`, { isActive: !currentActive });
                showFeedback(feedback, data.message || data.error, !ok);
                loadUsers();
            });
        });

        // Sayfa İçi Inline Şifre Sıfırlama Formunu Aç
        tbody.querySelectorAll('.user-pwd-inline-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const panel = document.getElementById('user-pwd-inline-panel');
                const userId = btn.dataset.userId;
                const username = btn.dataset.username;

                document.getElementById('pwd-user-id').value = userId;
                document.getElementById('pwd-user-label').textContent = `Seçilen Kullanıcı: ${username} (ID: ${userId})`;
                document.getElementById('pwd-new-password').value = '';
                document.getElementById('pwd-form-feedback').hidden = true;

                panel.hidden = false;
                panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        });

        // Kullanıcıyı Sil
        tbody.querySelectorAll('.user-delete-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.userId;
                const username = btn.dataset.username;
                if (!confirm(`"${username}" kullanıcısını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return;

                const { ok, data } = await apiRequest('DELETE', `/admin/users/${userId}`);
                showFeedback(feedback, data.message || data.error, !ok);
                if (ok) loadUsers();
            });
        });
    }

    function initUserInlinePwdPanel() {
        const panel = document.getElementById('user-pwd-inline-panel');
        const closeBtn = document.getElementById('user-pwd-close-btn');
        const cancelBtn = document.getElementById('pwd-cancel-btn');
        const form = document.getElementById('user-pwd-form');

        const close = () => { if (panel) panel.hidden = true; };
        closeBtn?.addEventListener('click', close);
        cancelBtn?.addEventListener('click', close);

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
    // 6. İÇERİK YÖNETİMİ & INLINE PANEL (MODAL'SIZ)
    // =============================================================================
    const typeLabels = {
        ders: 'Ders / Eğitim',
        makale: 'Makale',
        sunum: 'Sunum',
        obje: 'Obje / CAD',
        haber: 'Haber & Duyuru',
        duyuru: 'Duyuru',
    };

    async function loadContent() {
        const tbody = document.getElementById('content-tbody');
        const type = document.getElementById('content-type-filter')?.value || '';
        const category = document.getElementById('content-cat-filter')?.value || '';
        if (!tbody) return;

        const params = new URLSearchParams();
        if (type) params.append('type', type);
        if (category) params.append('category', category);
        const qs = params.toString() ? `?${params.toString()}` : '';

        const { ok, data } = await apiRequest('GET', `/admin/content${qs}`);

        if (!ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty">${escapeHtml(data.error || 'İçerikler yüklenemedi.')}</td></tr>`;
            return;
        }

        cachedItems = data.items || [];
        if (cachedItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty">Seçilen filtrelere uygun içerik bulunamadı.</td></tr>`;
            return;
        }

        tbody.innerHTML = cachedItems
            .map((item) => `
                <tr data-id="${item.id}">
                    <td data-label="Başlık & Özet">
                        <div class="admin-content-title-cell">
                            <strong>${escapeHtml(item.title)}</strong>
                            ${item.summary ? `<span class="admin-content-summary-text">${escapeHtml(item.summary.slice(0, 90))}...</span>` : ''}
                        </div>
                    </td>
                    <td data-label="Tür & Kategori">
                        <span class="admin-tag admin-tag--primary">${typeLabels[item.type] || item.type}</span>
                        <span class="admin-tag admin-tag--secondary">${escapeHtml(item.category || 'Mekanik')}</span>
                    </td>
                    <td data-label="Yayın Durumu">
                        <span class="admin-badge ${item.is_published ? 'admin-badge--published' : 'admin-badge--draft'}">
                            <i class="fa-solid ${item.is_published ? 'fa-globe' : 'fa-pen-ruler'}"></i> ${item.is_published ? 'Yayında' : 'Taslak'}
                        </span>
                    </td>
                    <td data-label="Yazar">${escapeHtml(item.author_username || 'Yönetici')}</td>
                    <td data-label="Son Güncelleme">${formatDate(item.updated_at)}</td>
                    <td data-label="İşlemler" class="text-right">
                        <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm content-edit-btn" data-id="${item.id}">
                            <i class="fa-solid fa-pen"></i> Düzenle
                        </button>
                        <button type="button" class="admin-btn admin-btn--danger admin-btn--sm content-delete-btn" data-id="${item.id}" data-title="${escapeHtml(item.title)}" title="Sil">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `)
            .join('');

        // Düzenleme Butonları
        tbody.querySelectorAll('.content-edit-btn').forEach((btn) => {
            btn.addEventListener('click', () => openInlineContentForm(Number(btn.dataset.id)));
        });

        // Silme Butonları
        tbody.querySelectorAll('.content-delete-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const title = btn.dataset.title;
                if (!confirm(`"${title}" başlıklı içeriği silmek istediğinize emin misiniz?`)) return;

                const feedback = document.getElementById('admin-feedback');
                const { ok, data } = await apiRequest('DELETE', `/admin/content/${id}`);
                showFeedback(feedback, data.message || data.error, !ok);
                if (ok) loadContent();
            });
        });
    }

    function openInlineContentForm(id) {
        const panel = document.getElementById('content-inline-panel');
        const formTitle = document.getElementById('content-form-title');
        const form = document.getElementById('content-form');
        form.reset();
        document.getElementById('content-form-feedback').hidden = true;

        if (id) {
            const item = cachedItems.find((i) => i.id === id);
            if (item) {
                formTitle.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> İçeriği Düzenle: "${escapeHtml(item.title)}"`;
                document.getElementById('content-id').value = item.id;
                document.getElementById('content-type').value = item.type || 'ders';
                document.getElementById('content-category').value = item.category || 'Mekanik';
                document.getElementById('content-title').value = item.title || '';
                document.getElementById('content-summary').value = item.summary || '';
                document.getElementById('content-body').value = item.body || '';
                document.getElementById('content-image-url').value = item.image_url || '';
                document.getElementById('content-file-url').value = item.file_url || '';
                document.getElementById('content-published').checked = Boolean(item.is_published);
            }
        } else {
            formTitle.innerHTML = `<i class="fa-solid fa-plus-circle"></i> Yeni İçerik Ekle`;
            document.getElementById('content-id').value = '';
            document.getElementById('content-published').checked = true;
        }

        panel.hidden = false;
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function initContentInlinePanel() {
        const panel = document.getElementById('content-inline-panel');
        const addBtn = document.getElementById('content-toggle-add-btn');
        const closeBtn = document.getElementById('content-form-close-btn');
        const cancelBtn = document.getElementById('content-cancel-btn');

        const close = () => { if (panel) panel.hidden = true; };
        addBtn?.addEventListener('click', () => openInlineContentForm(null));
        closeBtn?.addEventListener('click', close);
        cancelBtn?.addEventListener('click', close);

        document.getElementById('content-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedback = document.getElementById('content-form-feedback');
            const saveBtn = document.getElementById('content-save-btn');
            if (saveBtn) saveBtn.disabled = true;

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
                showFeedback(document.getElementById('admin-feedback'), data.message || 'İçerik başarıyla kaydedildi.', false);
                loadContent();
            } else {
                const detail = data.details?.[0]?.msg;
                showFeedback(feedback, detail || data.error || 'İçerik kaydedilemedi.', true);
            }
            if (saveBtn) saveBtn.disabled = false;
        });

        document.getElementById('content-type-filter')?.addEventListener('change', loadContent);
        document.getElementById('content-cat-filter')?.addEventListener('change', loadContent);
    }

    // =============================================================================
    // 7. TAKIM BAŞVURULARI & INLINE DETAY PANELİ
    // =============================================================================
    async function loadApplications() {
        const tbody = document.getElementById('applications-tbody');
        const badge = document.getElementById('pending-apps-count');
        const feedback = document.getElementById('admin-feedback');
        if (!tbody) return;

        const { ok, data } = await apiRequest('GET', '/admin/applications');

        if (!ok) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty">${escapeHtml(data.error || 'Başvurular yüklenemedi.')}</td></tr>`;
            return;
        }

        cachedApps = data.applications || [];
        const pendingCount = cachedApps.filter((a) => a.status === 'pending').length;
        if (badge) {
            badge.textContent = pendingCount;
            badge.hidden = pendingCount === 0;
        }

        if (cachedApps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty">Henüz yapılmış bir takım başvurusu bulunmuyor.</td></tr>`;
            return;
        }

        tbody.innerHTML = cachedApps
            .map((app) => `
                <tr data-id="${app.id}">
                    <td data-label="Tarih">${formatDate(app.created_at)}</td>
                    <td data-label="Aday & Sınıf">
                        <strong>${escapeHtml(app.name)}</strong>
                        <span class="admin-user-sub">${escapeHtml(app.class_name || 'Lise')}</span>
                    </td>
                    <td data-label="Departman">
                        <span class="admin-tag admin-tag--primary">${escapeHtml(app.department)}</span>
                    </td>
                    <td data-label="İletişim">
                        <a href="mailto:${escapeHtml(app.email)}" class="admin-link-inline">${escapeHtml(app.email)}</a>
                        <span class="admin-user-sub">${escapeHtml(app.phone)}</span>
                    </td>
                    <td data-label="Durum">
                        <select class="admin-select admin-select--sm admin-app-status-select" data-app-id="${app.id}">
                            <option value="pending" ${app.status === 'pending' ? 'selected' : ''}>Beklemede</option>
                            <option value="approved" ${app.status === 'approved' ? 'selected' : ''}>Onaylandı</option>
                            <option value="rejected" ${app.status === 'rejected' ? 'selected' : ''}>Reddedildi</option>
                        </select>
                    </td>
                    <td data-label="İşlemler" class="text-right">
                        <button type="button" class="admin-btn admin-btn--ghost admin-btn--sm app-detail-inline-btn" data-id="${app.id}">
                            <i class="fa-solid fa-eye"></i> İncele
                        </button>
                        <button type="button" class="admin-btn admin-btn--danger admin-btn--sm app-delete-btn" data-id="${app.id}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `)
            .join('');

        // Başvuru Durumunu Değiştir
        tbody.querySelectorAll('.admin-app-status-select').forEach((sel) => {
            sel.addEventListener('change', async () => {
                const appId = sel.dataset.appId;
                const status = sel.value;
                const { ok, data } = await apiRequest('PATCH', `/admin/applications/${appId}/status`, { status });
                showFeedback(feedback, data.message || data.error, !ok);
            });
        });

        // Başvuru Detayını Aç (Inline)
        tbody.querySelectorAll('.app-detail-inline-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const app = cachedApps.find((a) => a.id === Number(btn.dataset.id));
                if (!app) return;

                const panel = document.getElementById('app-detail-inline-panel');
                const content = document.getElementById('app-detail-content');

                content.innerHTML = `
                    <div class="admin-detail-item">
                        <span class="admin-detail-label">Aday Adı & Soyadı</span>
                        <strong class="admin-detail-value">${escapeHtml(app.name)}</strong>
                    </div>
                    <div class="admin-detail-item">
                        <span class="admin-detail-label">Sınıf & Okul</span>
                        <strong class="admin-detail-value">${escapeHtml(app.class_name || 'Belirtilmedi')}</strong>
                    </div>
                    <div class="admin-detail-item">
                        <span class="admin-detail-label">Tercih Edilen Departman</span>
                        <strong class="admin-detail-value">${escapeHtml(app.department)}</strong>
                    </div>
                    <div class="admin-detail-item">
                        <span class="admin-detail-label">İletişim</span>
                        <span class="admin-detail-value"><a href="mailto:${escapeHtml(app.email)}">${escapeHtml(app.email)}</a> • ${escapeHtml(app.phone)}</span>
                    </div>
                    <div class="admin-detail-item admin-detail-item--full">
                        <span class="admin-detail-label">Daha Önceki Robotik / STEM Deneyimleri</span>
                        <p class="admin-detail-text">${escapeHtml(app.experience || 'Belirtilmedi')}</p>
                    </div>
                    <div class="admin-detail-item admin-detail-item--full">
                        <span class="admin-detail-label">Bildiği Diller / CAD / Yazılım / Araçlar</span>
                        <p class="admin-detail-text">${escapeHtml(app.tools || 'Belirtilmedi')}</p>
                    </div>
                    <div class="admin-detail-item admin-detail-item--full">
                        <span class="admin-detail-label">Takıma Katılma Motivasyonu & Hedefleri</span>
                        <p class="admin-detail-text">${escapeHtml(app.motivation || 'Belirtilmedi')}</p>
                    </div>
                `;

                panel.hidden = false;
                panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });

        // Başvuruyu Sil
        tbody.querySelectorAll('.app-delete-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (!confirm('Bu başvuruyu kalıcı olarak silmek istediğinize emin misiniz?')) return;
                const { ok, data } = await apiRequest('DELETE', `/admin/applications/${id}`);
                showFeedback(feedback, data.message || data.error, !ok);
                if (ok) loadApplications();
            });
        });
    }

    function initAppDetailInlinePanel() {
        const panel = document.getElementById('app-detail-inline-panel');
        const closeBtn = document.getElementById('app-detail-close-btn');
        const hideBtn = document.getElementById('app-detail-hide-btn');

        const close = () => { if (panel) panel.hidden = true; };
        closeBtn?.addEventListener('click', close);
        hideBtn?.addEventListener('click', close);
    }

    // =============================================================================
    // 8. SİTE AYARLARI
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
            if (saveBtn) saveBtn.disabled = true;

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
            if (saveBtn) saveBtn.disabled = false;
        });
    }

    // =============================================================================
    // BAŞLATMA
    // =============================================================================
    document.addEventListener('DOMContentLoaded', () => {
        initAdminLogin();
        guardAdmin();
    });

    document.addEventListener('nest:partials-loaded', () => {
        guardAdmin();
    });
})();
