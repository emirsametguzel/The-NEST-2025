// =============================================================================
// js/admin.js — The Nest Modern SaaS Admin Dashboard & Control Hub Mantığı
// (Güvenli Template Tabanlı Dinamik Mount, Canlı Metrikler & Güvenlik Denetimi)
// =============================================================================

(function () {
    const base = document.documentElement.getAttribute('data-base-path') || '';
    const API = `${base}api`;

    let cachedContent = [];
    let cachedUsers = [];
    let cachedApps = [];
    let currentAdminUser = null;
    let isDashboardMounted = false;
    let activeTab = 'dashboard';

    // =============================================================================
    // API YARDIMCILARI & CSRF TOKEN
    // =============================================================================
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

    function showBannerFeedback(message, isError = false) {
        const banner = document.getElementById('admin-feedback');
        if (!banner) return;
        banner.hidden = false;
        banner.textContent = message;
        banner.className = `saas-alert-banner ${isError ? 'saas-alert-banner--error' : 'saas-alert-banner--success'}`;
        setTimeout(() => {
            if (banner) banner.hidden = true;
        }, 5000);
    }

    function showInlineFeedback(el, message, isError = false) {
        if (!el) return;
        el.hidden = false;
        el.textContent = message;
        el.className = `saas-form-feedback ${isError ? 'saas-form-feedback--error' : 'saas-form-feedback--success'}`;
        setTimeout(() => {
            if (!isError && el) el.hidden = true;
        }, 4000);
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
                minute: '2-digit',
            });
        } catch (_) {
            return iso;
        }
    }

    function timeAgo(iso) {
        if (!iso) return 'Bilinmiyor';
        try {
            const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
            const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
            if (diffSec < 60) return 'Az önce';
            if (diffSec < 3600) return `${Math.floor(diffSec / 60)} dk önce`;
            if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} saat önce`;
            return `${Math.floor(diffSec / 86400)} gün önce`;
        } catch (_) {
            return '—';
        }
    }

    // =============================================================================
    // 1. GÜVENLİK GUARD (YALNIZCA DOĞRULANMIŞ ADMİN OTURUMUNDA MOUNT EDİLİR)
    // =============================================================================
    async function guardAdmin() {
        try {
            const res = await fetch(`${API}/admin/me`, { credentials: 'same-origin' });
            if (!res.ok) throw new Error('not authenticated');
            const data = await res.json();

            if (data.authenticated && data.user && data.user.role === 'admin') {
                currentAdminUser = data.user;
                document.body.style.display = ''; // Doğrulandıktan sonra görünür yap

                if (!isDashboardMounted) {
                    mountDashboard();
                }

                // Profil alanlarını doldur
                const userDisplay = document.getElementById('admin-user-display');
                const emailDisplay = document.getElementById('admin-email-display');
                if (userDisplay) {
                    userDisplay.textContent = currentAdminUser.display_name || currentAdminUser.username || 'Yönetici';
                }
                if (emailDisplay) {
                    emailDisplay.textContent = currentAdminUser.email || 'admin@thenest.org';
                }

                // İlk yükleme ve canlı sistem kontrolü
                loadSystemHealth();
                loadTabContent(activeTab);
                return true;
            }
            throw new Error('not authorized');
        } catch (_) {
            window.location.replace(`${base}login.html`);
            return false;
        }
    }

    // =============================================================================
    // 2. DASHBOARD MOUNT / UNMOUNT
    // =============================================================================
    function mountDashboard() {
        const mountContainer = document.getElementById('admin-dashboard-mount');
        const template = document.getElementById('admin-dashboard-template');
        if (!mountContainer || !template) return;

        mountContainer.innerHTML = '';
        const clone = document.importNode(template.content, true);
        mountContainer.appendChild(clone);
        isDashboardMounted = true;

        // Olay dinleyicilerini başlat
        initSidebarEvents();
        initNavigationTabs();
        initQuickActionButtons();
        initSearchAndFilters();
        initContentForms();
        initUserForms();
        initApplicationPanels();
        initSettingsForm();
        initBackupRestoreEvents();
        initLogoutButton();
    }

    // =============================================================================
    // 3. SİDEBAR & NAVİGASYON & MOBİL YÖNETİMİ
    // =============================================================================
    function initSidebarEvents() {
        const mobileToggle = document.getElementById('saas-mobile-toggle-btn');
        const sidebar = document.getElementById('saas-sidebar');
        const closeBtn = document.getElementById('saas-sidebar-close-btn');

        if (mobileToggle && sidebar) {
            mobileToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });
        }

        if (closeBtn && sidebar) {
            closeBtn.addEventListener('click', () => {
                sidebar.classList.remove('open');
            });
        }
    }

    function initNavigationTabs() {
        const navButtons = document.querySelectorAll('.saas-nav-item');
        navButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                switchTab(targetTab);

                // Mobilde menüyü kapat
                const sidebar = document.getElementById('saas-sidebar');
                if (sidebar) sidebar.classList.remove('open');
            });
        });

        // Hızlı sekme geçiş linkleri (Dashboard içi butonlar)
        const viewAllUsersBtn = document.getElementById('dash-view-all-users');
        if (viewAllUsersBtn) {
            viewAllUsersBtn.addEventListener('click', () => switchTab('users'));
        }
    }

    function switchTab(tabId) {
        if (!tabId) return;
        activeTab = tabId;

        // Aktif buton stilini güncelle
        document.querySelectorAll('.saas-nav-item').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });

        // Aktif paneli göster
        document.querySelectorAll('.saas-tab-panel').forEach((panel) => {
            panel.classList.toggle('active', panel.id === `tab-${tabId}`);
        });

        loadTabContent(tabId);
    }

    function initQuickActionButtons() {
        // Dashboard hızlı içerik ekle
        const dashAddContent = document.getElementById('dash-btn-add-content');
        if (dashAddContent) {
            dashAddContent.addEventListener('click', () => {
                switchTab('content');
                const panel = document.getElementById('content-inline-panel');
                if (panel) {
                    panel.hidden = false;
                    document.getElementById('content-title')?.focus();
                }
            });
        }

        // Dashboard hızlı güvenlik denetimi
        const dashRunAudit = document.getElementById('dash-btn-run-audit');
        if (dashRunAudit) {
            dashRunAudit.addEventListener('click', () => {
                switchTab('security');
            });
        }

        // Yenileme butonu
        const refreshBtn = document.getElementById('saas-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadSystemHealth();
                loadTabContent(activeTab);
                showBannerFeedback('Veriler başarıyla yenilendi.');
            });
        }

        const secRefreshBtn = document.getElementById('sec-refresh-logs-btn');
        if (secRefreshBtn) {
            secRefreshBtn.addEventListener('click', loadSecurityAudit);
        }
    }

    function initLogoutButton() {
        const logoutBtn = document.getElementById('admin-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await apiRequest('POST', '/auth/logout');
                window.location.replace(`${base}`);
            });
        }
    }

    // =============================================================================
    // 4. VERİ YÜKLEME YÖNLENDİRİCİSİ (LOAD TAB CONTENT)
    // =============================================================================
    function loadTabContent(tabId) {
        switch (tabId) {
            case 'dashboard':
                loadOverviewStats();
                break;
            case 'content':
                loadContentItems();
                break;
            case 'users':
                loadUsers();
                break;
            case 'applications':
                loadApplications();
                break;
            case 'security':
                loadSecurityAudit();
                break;
            case 'settings':
                loadSettings();
                break;
            case 'backups':
                loadSnapshots();
                break;
        }
    }

    // =============================================================================
    // 5. ANLIK SİSTEM SAĞLIĞI & GECİKME (HEADER HEALTH PILLS)
    // =============================================================================
    async function loadSystemHealth() {
        try {
            const start = performance.now();
            const { ok, data } = await apiRequest('GET', '/admin/system-health');
            const latency = Math.round(performance.now() - start);

            const latencyVal = document.getElementById('health-latency-val');
            if (latencyVal) {
                latencyVal.textContent = `${latency}ms`;
            }

            const dbPill = document.getElementById('health-db-pill');
            if (dbPill && ok && data.database?.connected) {
                dbPill.innerHTML = `<span class="saas-pulse-dot saas-pulse-dot--green"></span><span class="saas-health-text">DB: <strong>Firestore Connected</strong></span>`;
            }
        } catch (_) {
            const latencyVal = document.getElementById('health-latency-val');
            if (latencyVal) latencyVal.textContent = 'Offline';
        }
    }

    // =============================================================================
    // 6. SEKME 1: DASHBOARD / GENEL BAKIŞ & METRİKLER
    // =============================================================================
    async function loadOverviewStats() {
        const { ok, data } = await apiRequest('GET', '/admin/overview-stats');
        if (!ok || !data) return;

        const m = data.metrics || {};

        // Metrik kartları güncelleme
        const totalUsersEl = document.getElementById('metric-total-users');
        const userGrowthEl = document.getElementById('metric-user-growth');
        const recentUsersEl = document.getElementById('metric-recent-users');
        const totalContentEl = document.getElementById('metric-total-content');
        const passwordResetsEl = document.getElementById('metric-password-resets');
        const totalAppsEl = document.getElementById('metric-total-apps');
        const pendingAppsEl = document.getElementById('metric-pending-apps');

        if (totalUsersEl) totalUsersEl.textContent = m.totalUsers || 0;
        if (recentUsersEl) recentUsersEl.textContent = m.usersLast7Days || 0;
        if (userGrowthEl) {
            userGrowthEl.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> +${m.userGrowthPercentage || 0}%`;
        }

        if (totalContentEl) totalContentEl.textContent = m.publishedItems || m.totalItems || 0;
        if (passwordResetsEl) passwordResetsEl.textContent = m.totalPasswordResets || 0;
        if (totalAppsEl) totalAppsEl.textContent = m.totalApps || 0;
        if (pendingAppsEl) pendingAppsEl.textContent = m.pendingApps || 0;

        // Navigasyon rozetleri güncelle
        const badgeContent = document.getElementById('badge-content-count');
        const badgeUser = document.getElementById('badge-user-count');
        const badgePendingApps = document.getElementById('pending-apps-count');

        if (badgeContent) badgeContent.textContent = m.totalItems || 0;
        if (badgeUser) badgeUser.textContent = m.totalUsers || 0;
        if (badgePendingApps) {
            badgePendingApps.textContent = m.pendingApps || 0;
            badgePendingApps.hidden = !m.pendingApps;
        }

        // Son Giriş Yapanlar / Aktif Kullanıcılar
        renderRecentActiveUsers(m.recentActiveUsers || []);

        // Aktivite Akışı (Audit Logs)
        renderActivityFeed(data.recentLogs || []);

        // Kategori Kırılım Çubukları
        renderContentBreakdown(m.contentByType || {}, m.totalItems || 1);
    }

    function renderRecentActiveUsers(users) {
        const container = document.getElementById('dash-active-users-list');
        if (!container) return;

        if (users.length === 0) {
            container.innerHTML = `<div class="saas-loading-row">Kayıtlı aktif kullanıcı bulunamadı.</div>`;
            return;
        }

        container.innerHTML = users
            .map((u) => {
                const initial = (u.display_name || u.username || 'U')[0].toUpperCase();
                const roleBadge = u.role === 'admin' 
                    ? `<span class="saas-badge-pill saas-badge-pill--green">Admin</span>` 
                    : `<span class="saas-badge-pill saas-badge-pill--blue">Üye</span>`;

                return `
                <div class="saas-user-row">
                    <div class="saas-user-main">
                        <div class="saas-user-avatar-sm">${escapeHtml(initial)}</div>
                        <div>
                            <div class="saas-user-name">${escapeHtml(u.display_name || u.username)}</div>
                            <div class="saas-user-meta">${escapeHtml(u.email)}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        ${roleBadge}
                        <span class="saas-user-meta">${timeAgo(u.last_login_at)}</span>
                    </div>
                </div>
            `;
            })
            .join('');
    }

    function renderActivityFeed(logs) {
        const container = document.getElementById('dash-activity-feed');
        if (!container) return;

        if (logs.length === 0) {
            container.innerHTML = `
                <div class="saas-feed-item">
                    <div class="saas-feed-dot"></div>
                    <div class="saas-feed-content">
                        <div class="saas-feed-title">Sistem <strong>Başlatıldı</strong> ve Güvenlik Denetimi Tamamlandı</div>
                        <div class="saas-feed-time">Sistem aktif</div>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = logs
            .map((log) => {
                return `
                <div class="saas-feed-item">
                    <div class="saas-feed-dot"></div>
                    <div class="saas-feed-content">
                        <div class="saas-feed-title"><strong>${escapeHtml(log.actor_username || 'Yönetici')}</strong> ${escapeHtml(log.action || '')} — ${escapeHtml(log.details || '')}</div>
                        <div class="saas-feed-time">${timeAgo(log.created_at)}</div>
                    </div>
                </div>
            `;
            })
            .join('');
    }

    function renderContentBreakdown(typeStats, total) {
        const container = document.getElementById('dash-content-breakdown');
        if (!container) return;

        const typeLabels = {
            ders: 'Ders / Modüller',
            makale: 'Teknik Makaleler',
            sunum: 'Sunum & Slaytlar',
            obje: 'CAD / 3D Tasarımlar',
            haber: 'Haber & Duyurular',
        };

        const keys = Object.keys(typeLabels);
        container.innerHTML = keys
            .map((key) => {
                const count = typeStats[key] || 0;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return `
                <div class="saas-breakdown-box">
                    <div class="saas-breakdown-header">
                        <span>${typeLabels[key]}</span>
                        <span><strong>${count}</strong> (${pct}%)</span>
                    </div>
                    <div class="saas-progress-bar">
                        <div class="saas-progress-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
            })
            .join('');
    }

    // =============================================================================
    // 7. SEKME 2: İÇERİK YÖNETİMİ
    // =============================================================================
    async function loadContentItems() {
        const tbody = document.getElementById('content-tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="saas-table-loading"><i class="fa-solid fa-spinner fa-spin"></i> İçerikler yükleniyor...</td></tr>`;
        }

        const { ok, data } = await apiRequest('GET', '/content');
        if (!ok || !Array.isArray(data.items)) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="saas-table-loading">İçerikler yüklenirken hata oluştu.</td></tr>`;
            return;
        }

        cachedContent = data.items;
        renderContentTable(cachedContent);
    }

    function renderContentTable(items) {
        const tbody = document.getElementById('content-tbody');
        if (!tbody) return;

        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="saas-table-loading">Kayıtlı içerik bulunamadı.</td></tr>`;
            return;
        }

        tbody.innerHTML = items
            .map((item) => {
                const isPub = item.is_published === 1 || item.is_published === true;
                const statusBadge = isPub
                    ? `<span class="saas-badge-pill saas-badge-pill--green"><i class="fa-solid fa-circle-check"></i> Yayında</span>`
                    : `<span class="saas-badge-pill saas-badge-pill--amber"><i class="fa-solid fa-file-pen"></i> Taslak</span>`;

                return `
                <tr>
                    <td>
                        <div class="font-bold text-white">${escapeHtml(item.title)}</div>
                        <div class="text-xs text-muted truncate max-w-md">${escapeHtml(item.summary || 'Özet yok')}</div>
                    </td>
                    <td>
                        <span class="saas-tag-pill">${escapeHtml(item.type)}</span>
                        <span class="saas-tag-pill">${escapeHtml(item.category)}</span>
                    </td>
                    <td>${statusBadge}</td>
                    <td>${escapeHtml(item.author_name || 'Admin')}</td>
                    <td class="text-xs">${formatDate(item.updated_at || item.created_at)}</td>
                    <td class="text-right">
                        <div class="saas-action-btns">
                            <button type="button" class="saas-btn-icon-action content-edit-btn" data-id="${item.id}" title="Düzenle">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button type="button" class="saas-btn-icon-action content-toggle-btn" data-id="${item.id}" data-published="${isPub ? '1' : '0'}" title="${isPub ? 'Yayından Kaldır' : 'Yayına Al'}">
                                <i class="fa-solid ${isPub ? 'fa-eye-slash' : 'fa-eye'}"></i>
                            </button>
                            <button type="button" class="saas-btn-icon-action saas-btn-icon-action--danger content-del-btn" data-id="${item.id}" data-title="${escapeHtml(item.title)}" title="Sil">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            })
            .join('');

        attachContentActionListeners();
    }

    function attachContentActionListeners() {
        document.querySelectorAll('.content-edit-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const item = cachedContent.find((i) => String(i.id) === String(id));
                if (item) openContentForm(item);
            });
        });

        document.querySelectorAll('.content-toggle-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const currentPub = btn.getAttribute('data-published') === '1';
                const { ok } = await apiRequest('PATCH', `/admin/content/${id}/publish`, { is_published: !currentPub });
                if (ok) {
                    showBannerFeedback('İçerik yayın durumu güncellendi.');
                    loadContentItems();
                    loadOverviewStats();
                } else {
                    showBannerFeedback('Yayın durumu güncellenemedi.', true);
                }
            });
        });

        document.querySelectorAll('.content-del-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const title = btn.getAttribute('data-title');
                if (confirm(`"${title}" başlıklı içeriği silmek istediğinize emin misiniz?`)) {
                    const { ok } = await apiRequest('DELETE', `/admin/content/${id}`);
                    if (ok) {
                        showBannerFeedback('İçerik başarıyla silindi.');
                        loadContentItems();
                        loadOverviewStats();
                    } else {
                        showBannerFeedback('İçerik silinemedi.', true);
                    }
                }
            });
        });
    }

    function initContentForms() {
        const toggleBtn = document.getElementById('content-toggle-add-btn');
        const closeBtn = document.getElementById('content-form-close-btn');
        const cancelBtn = document.getElementById('content-cancel-btn');
        const form = document.getElementById('content-form');
        const panel = document.getElementById('content-inline-panel');

        if (toggleBtn && panel) {
            toggleBtn.addEventListener('click', () => {
                openContentForm(null);
            });
        }

        if (closeBtn && panel) closeBtn.addEventListener('click', () => (panel.hidden = true));
        if (cancelBtn && panel) cancelBtn.addEventListener('click', () => (panel.hidden = true));

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('content-id').value;
                const payload = {
                    type: document.getElementById('content-type').value,
                    category: document.getElementById('content-category').value,
                    title: document.getElementById('content-title').value.trim(),
                    summary: document.getElementById('content-summary').value.trim(),
                    body: document.getElementById('content-body').value.trim(),
                    image_url: document.getElementById('content-image-url').value.trim(),
                    file_url: document.getElementById('content-file-url').value.trim(),
                    is_published: document.getElementById('content-published').checked,
                };

                const feedbackEl = document.getElementById('content-form-feedback');
                const method = id ? 'PUT' : 'POST';
                const endpoint = id ? `/admin/content/${id}` : '/admin/content';

                const { ok, data } = await apiRequest(method, endpoint, payload);
                if (ok) {
                    showInlineFeedback(feedbackEl, 'İçerik başarıyla kaydedildi!');
                    setTimeout(() => {
                        panel.hidden = true;
                        loadContentItems();
                        loadOverviewStats();
                    }, 800);
                } else {
                    showInlineFeedback(feedbackEl, data.error || 'İçerik kaydedilemedi.', true);
                }
            });
        }
    }

    function openContentForm(item) {
        const panel = document.getElementById('content-inline-panel');
        const titleEl = document.getElementById('content-form-title');
        const idInput = document.getElementById('content-id');
        if (!panel) return;

        panel.hidden = false;
        if (item) {
            titleEl.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> İçeriği Düzenle: ${escapeHtml(item.title)}`;
            idInput.value = item.id;
            document.getElementById('content-type').value = item.type || 'ders';
            document.getElementById('content-category').value = item.category || 'Mekanik';
            document.getElementById('content-title').value = item.title || '';
            document.getElementById('content-summary').value = item.summary || '';
            document.getElementById('content-body').value = item.body || '';
            document.getElementById('content-image-url').value = item.image_url || '';
            document.getElementById('content-file-url').value = item.file_url || '';
            document.getElementById('content-published').checked = item.is_published === 1 || item.is_published === true;
        } else {
            titleEl.innerHTML = `<i class="fa-solid fa-plus"></i> Yeni İçerik Ekle`;
            idInput.value = '';
            document.getElementById('content-form').reset();
            document.getElementById('content-published').checked = true;
        }
    }

    // =============================================================================
    // 8. SEKME 3: KULLANICILAR & ROLLER
    // =============================================================================
    async function loadUsers() {
        const tbody = document.getElementById('users-tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="saas-table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Kullanıcılar yükleniyor...</td></tr>`;
        }

        const { ok, data } = await apiRequest('GET', '/admin/users');
        if (!ok || !Array.isArray(data.users)) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="saas-table-loading">Kullanıcılar getirilemedi.</td></tr>`;
            return;
        }

        cachedUsers = data.users;
        const countBadge = document.getElementById('user-count-badge');
        if (countBadge) countBadge.textContent = `${cachedUsers.length} Kayıtlı Kullanıcı`;

        renderUsersTable(cachedUsers);
    }

    function renderUsersTable(users) {
        const tbody = document.getElementById('users-tbody');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="saas-table-loading">Kayıtlı kullanıcı bulunamadı.</td></tr>`;
            return;
        }

        tbody.innerHTML = users
            .map((u) => {
                const isAdmin = u.role === 'admin';
                const isActive = u.is_active !== 0 && u.is_active !== false;

                const roleBadge = isAdmin
                    ? `<span class="saas-badge-pill saas-badge-pill--green"><i class="fa-solid fa-shield-halved"></i> Admin</span>`
                    : `<span class="saas-badge-pill saas-badge-pill--blue"><i class="fa-solid fa-user"></i> Üye</span>`;

                const statusBadge = isActive
                    ? `<span class="saas-badge-pill saas-badge-pill--green">Aktif</span>`
                    : `<span class="saas-badge-pill saas-badge-pill--red">Donduruldu</span>`;

                const isSelf = currentAdminUser && String(currentAdminUser.id) === String(u.id);

                return `
                <tr>
                    <td>
                        <div class="font-bold text-white">${escapeHtml(u.display_name || u.username)}</div>
                        <div class="text-xs text-muted">@${escapeHtml(u.username)}</div>
                    </td>
                    <td>${escapeHtml(u.email)}</td>
                    <td>${roleBadge}</td>
                    <td>${statusBadge}</td>
                    <td class="text-xs">${formatDate(u.created_at)}</td>
                    <td class="text-right">
                        <div class="saas-action-btns">
                            <button type="button" class="saas-btn-icon-action user-role-btn" data-id="${u.id}" data-role="${u.role}" ${isSelf ? 'disabled' : ''} title="Rolü Değiştir">
                                <i class="fa-solid fa-user-gear"></i>
                            </button>
                            <button type="button" class="saas-btn-icon-action user-pwd-btn" data-id="${u.id}" data-username="${escapeHtml(u.username)}" title="Şifre Sıfırla">
                                <i class="fa-solid fa-key"></i>
                            </button>
                            <button type="button" class="saas-btn-icon-action user-status-btn" data-id="${u.id}" data-active="${isActive ? '1' : '0'}" ${isSelf ? 'disabled' : ''} title="${isActive ? 'Hesabı Dondur' : 'Aktifleştir'}">
                                <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-check'}"></i>
                            </button>
                            <button type="button" class="saas-btn-icon-action saas-btn-icon-action--danger user-del-btn" data-id="${u.id}" data-username="${escapeHtml(u.username)}" ${isSelf ? 'disabled' : ''} title="Sil">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            })
            .join('');

        attachUserActionListeners();
    }

    function attachUserActionListeners() {
        document.querySelectorAll('.user-role-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const currentRole = btn.getAttribute('data-role');
                const newRole = currentRole === 'admin' ? 'member' : 'admin';
                if (confirm(`Bu kullanıcının rolünü "${newRole.toUpperCase()}" olarak güncellemek istiyor musunuz?`)) {
                    const { ok } = await apiRequest('PATCH', `/admin/users/${id}/role`, { role: newRole });
                    if (ok) {
                        showBannerFeedback('Kullanıcı rolü güncellendi.');
                        loadUsers();
                    } else {
                        showBannerFeedback('Rol güncellenemedi.', true);
                    }
                }
            });
        });

        document.querySelectorAll('.user-pwd-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const username = btn.getAttribute('data-username');
                const panel = document.getElementById('user-pwd-inline-panel');
                const idInput = document.getElementById('pwd-user-id');
                const label = document.getElementById('pwd-user-label');
                if (panel && idInput && label) {
                    panel.hidden = false;
                    idInput.value = id;
                    label.textContent = `Hedef Kullanıcı: @${username}`;
                    document.getElementById('pwd-new-password').focus();
                }
            });
        });

        document.querySelectorAll('.user-status-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const isActive = btn.getAttribute('data-active') === '1';
                const { ok } = await apiRequest('PATCH', `/admin/users/${id}/status`, { isActive: !isActive });
                if (ok) {
                    showBannerFeedback('Kullanıcı hesap durumu güncellendi.');
                    loadUsers();
                } else {
                    showBannerFeedback('Durum güncellenemedi.', true);
                }
            });
        });

        document.querySelectorAll('.user-del-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const username = btn.getAttribute('data-username');
                if (confirm(`@${username} kullanıcısını ve tüm verilerini kalıcı olarak silmek istediğinize emin misiniz?`)) {
                    const { ok } = await apiRequest('DELETE', `/admin/users/${id}`);
                    if (ok) {
                        showBannerFeedback('Kullanıcı başarıyla silindi.');
                        loadUsers();
                        loadOverviewStats();
                    } else {
                        showBannerFeedback('Kullanıcı silinemedi.', true);
                    }
                }
            });
        });
    }

    function initUserForms() {
        const panel = document.getElementById('user-pwd-inline-panel');
        const closeBtn = document.getElementById('user-pwd-close-btn');
        const cancelBtn = document.getElementById('pwd-cancel-btn');
        const form = document.getElementById('user-pwd-form');

        if (closeBtn && panel) closeBtn.addEventListener('click', () => (panel.hidden = true));
        if (cancelBtn && panel) cancelBtn.addEventListener('click', () => (panel.hidden = true));

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = document.getElementById('pwd-user-id').value;
                const newPassword = document.getElementById('pwd-new-password').value;
                const feedbackEl = document.getElementById('pwd-form-feedback');

                const { ok, data } = await apiRequest('POST', `/admin/users/${id}/reset-password`, { newPassword });
                if (ok) {
                    showInlineFeedback(feedbackEl, 'Kullanıcı şifresi başarıyla güncellendi!');
                    setTimeout(() => {
                        panel.hidden = true;
                        form.reset();
                    }, 1000);
                } else {
                    showInlineFeedback(feedbackEl, data.error || 'Şifre güncellenemedi.', true);
                }
            });
        }
    }

    // =============================================================================
    // 9. SEKME 4: TAKIM BAŞVURULARI
    // =============================================================================
    async function loadApplications() {
        const tbody = document.getElementById('applications-tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="saas-table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Başvurular yükleniyor...</td></tr>`;
        }

        const { ok, data } = await apiRequest('GET', '/admin/applications');
        if (!ok || !Array.isArray(data.applications)) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="saas-table-loading">Başvurular getirilemedi.</td></tr>`;
            return;
        }

        cachedApps = data.applications;
        renderApplicationsTable(cachedApps);
    }

    function renderApplicationsTable(apps) {
        const tbody = document.getElementById('applications-tbody');
        if (!tbody) return;

        if (apps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="saas-table-loading">Henüz bir takım başvurusu gelmedi.</td></tr>`;
            return;
        }

        tbody.innerHTML = apps
            .map((app) => {
                let badgeClass = 'saas-badge-pill--amber';
                let statusLabel = 'Beklemede';
                if (app.status === 'approved') {
                    badgeClass = 'saas-badge-pill--green';
                    statusLabel = 'Onaylandı';
                } else if (app.status === 'rejected') {
                    badgeClass = 'saas-badge-pill--red';
                    statusLabel = 'Reddedildi';
                }

                return `
                <tr>
                    <td class="text-xs">${formatDate(app.created_at)}</td>
                    <td>
                        <div class="font-bold text-white">${escapeHtml(app.full_name)}</div>
                        <div class="text-xs text-muted">${escapeHtml(app.grade || '—')}</div>
                    </td>
                    <td><span class="saas-tag-pill">${escapeHtml(app.department || 'Genel')}</span></td>
                    <td class="text-xs">
                        <div>${escapeHtml(app.email)}</div>
                        <div class="text-muted">${escapeHtml(app.phone || '—')}</div>
                    </td>
                    <td><span class="saas-badge-pill ${badgeClass}">${statusLabel}</span></td>
                    <td class="text-right">
                        <div class="saas-action-btns">
                            <button type="button" class="saas-btn-icon-action app-view-btn" data-id="${app.id}" title="Detayları İncele">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                            <button type="button" class="saas-btn-icon-action app-status-btn" data-id="${app.id}" data-status="approved" title="Onayla">
                                <i class="fa-solid fa-check text-green"></i>
                            </button>
                            <button type="button" class="saas-btn-icon-action app-status-btn" data-id="${app.id}" data-status="rejected" title="Reddet">
                                <i class="fa-solid fa-xmark text-amber"></i>
                            </button>
                            <button type="button" class="saas-btn-icon-action saas-btn-icon-action--danger app-del-btn" data-id="${app.id}" title="Sil">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            })
            .join('');

        attachAppActionListeners();
    }

    function attachAppActionListeners() {
        document.querySelectorAll('.app-view-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const app = cachedApps.find((a) => String(a.id) === String(id));
                if (app) showAppDetail(app);
            });
        });

        document.querySelectorAll('.app-status-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const status = btn.getAttribute('data-status');
                const { ok } = await apiRequest('PATCH', `/admin/applications/${id}/status`, { status });
                if (ok) {
                    showBannerFeedback('Başvuru durumu güncellendi.');
                    loadApplications();
                    loadOverviewStats();
                }
            });
        });

        document.querySelectorAll('.app-del-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (confirm('Bu başvuruyu silmek istediğinize emin misiniz?')) {
                    const { ok } = await apiRequest('DELETE', `/admin/applications/${id}`);
                    if (ok) {
                        showBannerFeedback('Başvuru silindi.');
                        loadApplications();
                        loadOverviewStats();
                    }
                }
            });
        });
    }

    function initApplicationPanels() {
        const closeBtn = document.getElementById('app-detail-close-btn');
        const hideBtn = document.getElementById('app-detail-hide-btn');
        const panel = document.getElementById('app-detail-inline-panel');

        if (closeBtn && panel) closeBtn.addEventListener('click', () => (panel.hidden = true));
        if (hideBtn && panel) hideBtn.addEventListener('click', () => (panel.hidden = true));
    }

    function showAppDetail(app) {
        const panel = document.getElementById('app-detail-inline-panel');
        const content = document.getElementById('app-detail-content');
        if (!panel || !content) return;

        content.innerHTML = `
            <div class="saas-detail-field">
                <div class="saas-detail-label">Aday Adı & Soyadı</div>
                <div class="saas-detail-val">${escapeHtml(app.full_name)}</div>
            </div>
            <div class="saas-detail-field">
                <div class="saas-detail-label">Sınıf & Okul Seviyesi</div>
                <div class="saas-detail-val">${escapeHtml(app.grade || '—')}</div>
            </div>
            <div class="saas-detail-field">
                <div class="saas-detail-label">E-Posta Adresi</div>
                <div class="saas-detail-val">${escapeHtml(app.email)}</div>
            </div>
            <div class="saas-detail-field">
                <div class="saas-detail-label">Telefon Numarası</div>
                <div class="saas-detail-val">${escapeHtml(app.phone || '—')}</div>
            </div>
            <div class="saas-detail-field">
                <div class="saas-detail-label">İlgilenilen Departman</div>
                <div class="saas-detail-val">${escapeHtml(app.department || '—')}</div>
            </div>
            <div class="saas-detail-field">
                <div class="saas-detail-label">Başvuru Tarihi</div>
                <div class="saas-detail-val">${formatDate(app.created_at)}</div>
            </div>
            <div class="saas-detail-field" style="grid-column: span 2;">
                <div class="saas-detail-label">Aday Motivasyonu & Kendini Tanıtma</div>
                <div class="saas-detail-val">${escapeHtml(app.motivation || 'Açıklama girilmemiş.')}</div>
            </div>
        `;

        panel.hidden = false;
    }

    // =============================================================================
    // 10. SEKME 5: CANLI GÜVENLİK & DENETİM EKRANI (SECURITY CENTER)
    // =============================================================================
    async function loadSecurityAudit() {
        const { ok, data } = await apiRequest('GET', '/admin/security-audit');
        if (!ok || !data) return;

        // Güvenlik Skoru
        const scoreEl = document.getElementById('sec-audit-score');
        if (scoreEl) scoreEl.textContent = data.auditScore || 96;

        // 🟢 Aktif Korumalar Listesi
        const activeList = document.getElementById('sec-active-protections-list');
        if (activeList && Array.isArray(data.activeProtections)) {
            activeList.innerHTML = data.activeProtections
                .map(
                    (p) => `
                <div class="saas-audit-item">
                    <div class="saas-audit-item-top">
                        <span class="saas-audit-title"><i class="fa-solid fa-circle-check text-green"></i> ${escapeHtml(p.title)}</span>
                        <span class="saas-badge-pill saas-badge-pill--green">${escapeHtml(p.badge)}</span>
                    </div>
                    <div class="saas-audit-desc">${escapeHtml(p.description)}</div>
                </div>
            `
                )
                .join('');
        }

        // 🟡 Sistem Tavsiyeleri Listesi
        const recList = document.getElementById('sec-recommendations-list');
        if (recList && Array.isArray(data.systemRecommendations)) {
            recList.innerHTML = data.systemRecommendations
                .map(
                    (r) => `
                <div class="saas-audit-item">
                    <div class="saas-audit-item-top">
                        <span class="saas-audit-title"><i class="fa-solid fa-triangle-exclamation text-amber"></i> ${escapeHtml(r.title)}</span>
                        <span class="saas-badge-pill saas-badge-pill--amber">${escapeHtml(r.actionText || 'Öneri')}</span>
                    </div>
                    <div class="saas-audit-desc">${escapeHtml(r.description)}</div>
                </div>
            `
                )
                .join('');
        }

        // Giriş Denemeleri & IP Log Tablosu
        const attemptsTbody = document.getElementById('sec-login-attempts-tbody');
        if (attemptsTbody && Array.isArray(data.recentAttempts)) {
            if (data.recentAttempts.length === 0) {
                attemptsTbody.innerHTML = `<tr><td colspan="5" class="saas-table-loading">Kayıtlı giriş denemesi bulunamadı.</td></tr>`;
            } else {
                attemptsTbody.innerHTML = data.recentAttempts
                    .map((att) => {
                        const isSuccess = att.success === 1 || att.success === true;
                        const resBadge = isSuccess
                            ? `<span class="saas-badge-pill saas-badge-pill--green"><i class="fa-solid fa-check"></i> Başarılı</span>`
                            : `<span class="saas-badge-pill saas-badge-pill--red"><i class="fa-solid fa-xmark"></i> Hatalı Şifre</span>`;

                        return `
                        <tr>
                            <td><strong class="text-white">${escapeHtml(att.identifier || 'Bilinmiyor')}</strong></td>
                            <td class="font-mono text-xs">${escapeHtml(att.ip_address || '127.0.0.1')}</td>
                            <td>${resBadge}</td>
                            <td class="text-xs text-muted truncate max-w-xs">${escapeHtml(att.user_agent || 'Mozilla/5.0')}</td>
                            <td class="text-xs">${formatDate(att.created_at)}</td>
                        </tr>
                    `;
                    })
                    .join('');
            }
        }
    }

    // =============================================================================
    // 11. SEKME 6: SİTE AYARLARI
    // =============================================================================
    async function loadSettings() {
        const { ok, data } = await apiRequest('GET', '/admin/settings');
        if (!ok || !data.settings) return;

        const s = data.settings;
        const form = document.getElementById('settings-form');
        if (form) {
            if (form.elements['site_title']) form.elements['site_title'].value = s.site_title || '';
            if (form.elements['announcement_banner']) form.elements['announcement_banner'].value = s.announcement_banner || '';
            if (form.elements['announcement_active']) {
                form.elements['announcement_active'].checked = s.announcement_active === '1' || s.announcement_active === 1 || s.announcement_active === true || s.announcement_active === 'true';
            }
            if (form.elements['contact_email']) form.elements['contact_email'].value = s.contact_email || '';
            if (form.elements['applications_open']) {
                form.elements['applications_open'].checked = s.applications_open === '1' || s.applications_open === 1 || s.applications_open === true || s.applications_open === 'true';
            }
            if (form.elements['footer_text']) form.elements['footer_text'].value = s.footer_text || '';
        }
    }

    function initSettingsForm() {
        const form = document.getElementById('settings-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const feedbackEl = document.getElementById('settings-feedback');

            const settingsData = {
                site_title: form.elements['site_title'] ? form.elements['site_title'].value.trim() : '',
                announcement_banner: form.elements['announcement_banner'] ? form.elements['announcement_banner'].value.trim() : '',
                announcement_active: form.elements['announcement_active'] && form.elements['announcement_active'].checked ? '1' : '0',
                contact_email: form.elements['contact_email'] ? form.elements['contact_email'].value.trim() : '',
                applications_open: form.elements['applications_open'] && form.elements['applications_open'].checked ? '1' : '0',
                footer_text: form.elements['footer_text'] ? form.elements['footer_text'].value.trim() : '',
            };

            const payload = { settings: settingsData };

            const { ok, data } = await apiRequest('PUT', '/admin/settings', payload);
            if (ok) {
                showInlineFeedback(feedbackEl, 'Sistem ayarları başarıyla kaydedildi!');
                showBannerFeedback('Site ayarları güncellendi.');
            } else {
                showInlineFeedback(feedbackEl, data.error || 'Ayarlar kaydedilemedi.', true);
            }
        });
    }

    // =============================================================================
    // 12. SEKME 7: YEDEKLEME & GERİ YÜKLEME (SNAPSHOT & RESTORE)
    // =============================================================================
    async function loadSnapshots() {
        const { ok, data } = await apiRequest('GET', '/admin/snapshots');
        const tbody = document.getElementById('snapshots-tbody');
        const badgeCount = document.getElementById('badge-snapshots-count');
        const latestDesc = document.getElementById('latest-restore-point-desc');

        if (!ok || !data) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="saas-table-loading text-rose">Kurtarma noktaları alınamadı.</td></tr>`;
            return;
        }

        const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
        if (badgeCount) badgeCount.textContent = snapshots.length;

        // En son kurtarma noktası açıklaması
        if (latestDesc) {
            if (data.latestSnapshot) {
                const s = data.latestSnapshot;
                latestDesc.innerHTML = `En son kurtarma noktası: <strong class="text-white">${escapeHtml(s.label || s.id)}</strong> (${timeAgo(s.created_at)} — ${formatDate(s.created_at)}).`;
            } else {
                latestDesc.textContent = 'Henüz kayıtlı bir kurtarma noktası bulunmuyor. "Yeni Kurtarma Noktası Al" butonu ile hemen oluşturabilirsiniz.';
            }
        }

        if (!tbody) return;

        if (snapshots.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="saas-table-loading">Henüz kayıtlı sistem kurtarma noktası yok.</td></tr>`;
            return;
        }

        tbody.innerHTML = snapshots
            .map((s) => {
                const c = s.counts || {};
                const scopeText = `${c.content_items || 0} İçerik, ${c.users || 0} Kullanıcı, ${c.team_applications || 0} Başvuru`;
                const sizeKb = s.sizeBytes ? `${(s.sizeBytes / 1024).toFixed(1)} KB` : '—';

                return `
                <tr>
                    <td>
                        <div class="font-semibold text-white">${escapeHtml(s.label || s.id)}</div>
                        <div class="font-mono text-xs text-dim">${escapeHtml(s.id)}</div>
                    </td>
                    <td>
                        <div class="text-white">${formatDate(s.created_at)}</div>
                        <div class="text-xs text-muted">${timeAgo(s.created_at)}</div>
                    </td>
                    <td class="font-mono text-xs">${sizeKb}</td>
                    <td><span class="saas-badge-pill saas-badge-pill--blue">${escapeHtml(scopeText)}</span></td>
                    <td class="text-right">
                        <button type="button" class="saas-btn saas-btn--xs saas-btn--primary btn-restore-point" data-id="${escapeHtml(s.id)}" data-label="${escapeHtml(s.label || s.id)}">
                            <i class="fa-solid fa-rotate-left"></i> Geri Yükle
                        </button>
                    </td>
                </tr>
            `;
            })
            .join('');

        // Geri yükle butonları dinleyicisi
        tbody.querySelectorAll('.btn-restore-point').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const snapId = btn.getAttribute('data-id');
                const snapLabel = btn.getAttribute('data-label');
                if (!confirm(`Sistemi "${snapLabel}" kurtarma noktasına geri yüklemek istediğinize emin misiniz?\n(Mevcut veritabanı bu kurtarma noktasındaki haline dönecektir.)`)) {
                    return;
                }

                btn.disabled = true;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...`;

                const res = await apiRequest('POST', `/admin/restore/${encodeURIComponent(snapId)}`);
                if (res.ok) {
                    showBannerFeedback(`Sistem "${snapLabel}" kurtarma noktasına başarıyla geri yüklendi.`);
                    loadSnapshots();
                    loadOverviewStats();
                } else {
                    showBannerFeedback(res.data?.error || 'Kurtarma noktası geri yüklenemedi.', true);
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fa-solid fa-rotate-left"></i> Geri Yükle`;
                }
            });
        });
    }

    function initBackupRestoreEvents() {
        // 1. En Son Yedeğe Geri Yükle (Son Restore)
        const btnRestoreLast = document.getElementById('btn-quick-restore-last');
        if (btnRestoreLast) {
            btnRestoreLast.addEventListener('click', async () => {
                if (!confirm('Sistem en son alınan kurtarma noktasına geri yüklenecektir. Devam etmek istiyor musunuz?')) {
                    return;
                }

                btnRestoreLast.disabled = true;
                btnRestoreLast.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Geri Yükleniyor...`;

                const { ok, data } = await apiRequest('POST', '/admin/restore-last');
                btnRestoreLast.disabled = false;
                btnRestoreLast.innerHTML = `<i class="fa-solid fa-rotate-left"></i> Son Yedeğe Geri Yükle`;

                if (ok) {
                    showBannerFeedback('Sistem en son kurtarma noktasına (Son Restore) başarıyla geri yüklendi.');
                    loadSnapshots();
                    loadOverviewStats();
                    loadContentItems();
                } else {
                    showBannerFeedback(data?.error || 'En son yedeğe geri yüklenemedi.', true);
                }
            });
        }

        // 2. Yeni Kurtarma Noktası Al (Snapshot Oluştur)
        const btnCreateSnap = document.getElementById('btn-create-snapshot');
        if (btnCreateSnap) {
            btnCreateSnap.addEventListener('click', async () => {
                const label = prompt('Kurtarma noktası için bir açıklama/etiket girin:', `Yedek - ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR')}`);
                if (label === null) return;

                btnCreateSnap.disabled = true;
                btnCreateSnap.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Alınıyor...`;

                const { ok, data } = await apiRequest('POST', '/admin/snapshot', { label: label.trim() || 'Manuel Kurtarma Noktası' });
                btnCreateSnap.disabled = false;
                btnCreateSnap.innerHTML = `<i class="fa-solid fa-camera-retro"></i> Yeni Kurtarma Noktası Al`;

                if (ok) {
                    showBannerFeedback('Yeni sistem kurtarma noktası başarıyla kaydedildi.');
                    loadSnapshots();
                } else {
                    showBannerFeedback(data?.error || 'Kurtarma noktası oluşturulamadı.', true);
                }
            });
        }

        // 3. Dosyadan JSON Yedek Geri Yükleme
        const btnTriggerUpload = document.getElementById('btn-trigger-file-upload');
        const fileInput = document.getElementById('backup-file-input');

        if (btnTriggerUpload && fileInput) {
            btnTriggerUpload.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                try {
                    const text = await file.text();
                    const json = JSON.parse(text);

                    if (!json || !json.tables) {
                        alert('Geçersiz yedek dosyası: JSON içinde "tables" alanı bulunmalıdır.');
                        fileInput.value = '';
                        return;
                    }

                    if (!confirm(`"${file.name}" dosyasındaki yedek veritabanına geri yüklenecektir. Bu işlem mevcut verileri değiştirecektir. Onaylıyor musunuz?`)) {
                        fileInput.value = '';
                        return;
                    }

                    const { ok, data } = await apiRequest('POST', '/admin/backup/import', json);
                    fileInput.value = '';

                    if (ok) {
                        showBannerFeedback('Yedek dosyası başarıyla yüklendi ve sistem güncellendi.');
                        loadSnapshots();
                        loadOverviewStats();
                        loadContentItems();
                    } else {
                        showBannerFeedback(data?.error || 'Yedek geri yüklenemedi.', true);
                    }
                } catch (err) {
                    alert('Dosya okuma veya JSON ayrıştırma hatası: ' + err.message);
                    fileInput.value = '';
                }
            });
        }

        // 4. Fabrika Ayarlarına Sıfırla (Factory Reset)
        const btnFactoryReset = document.getElementById('btn-factory-restore');
        if (btnFactoryReset) {
            btnFactoryReset.addEventListener('click', async () => {
                if (!confirm('DİKKAT: Sistem başlangıç tohum verilerine ve fabrika ayarlarına sıfırlanacaktır.\n(Mevcut durum öncesinde otomatik olarak kurtarma noktasına yedeklenecektir.)\n\nDevam etmek istiyor musunuz?')) {
                    return;
                }

                btnFactoryReset.disabled = true;
                btnFactoryReset.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sıfırlanıyor...`;

                const { ok, data } = await apiRequest('POST', '/admin/restore/factory');
                btnFactoryReset.disabled = false;
                btnFactoryReset.innerHTML = `<i class="fa-solid fa-power-off"></i> Fabrika Durumuna Sıfırla`;

                if (ok) {
                    showBannerFeedback('Sistem başarıyla fabrika başlangıç durumuna sıfırlandı.');
                    loadSnapshots();
                    loadOverviewStats();
                    loadContentItems();
                    loadSettings();
                } else {
                    showBannerFeedback(data?.error || 'Fabrika durumuna sıfırlanamadı.', true);
                }
            });
        }

        // 5. Yenile Butonu
        const btnRefreshSnapshots = document.getElementById('btn-refresh-snapshots');
        if (btnRefreshSnapshots) {
            btnRefreshSnapshots.addEventListener('click', loadSnapshots);
        }
    }

    // =============================================================================
    // 13. ARAMA & FİLTRELEME MANTIĞI
    // =============================================================================
    function initSearchAndFilters() {
        // Global Arama
        const globalSearch = document.getElementById('saas-global-search');
        if (globalSearch) {
            globalSearch.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                if (!query) return;

                if (activeTab === 'content') {
                    const filtered = cachedContent.filter((i) => (i.title || '').toLowerCase().includes(query) || (i.category || '').toLowerCase().includes(query));
                    renderContentTable(filtered);
                } else if (activeTab === 'users') {
                    const filtered = cachedUsers.filter(
                        (u) => (u.username || '').toLowerCase().includes(query) || (u.display_name || '').toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query)
                    );
                    renderUsersTable(filtered);
                } else if (activeTab === 'applications') {
                    const filtered = cachedApps.filter((a) => (a.full_name || '').toLowerCase().includes(query) || (a.email || '').toLowerCase().includes(query));
                    renderApplicationsTable(filtered);
                }
            });

            // ESC ile temizle
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && globalSearch) {
                    globalSearch.value = '';
                    loadTabContent(activeTab);
                }
            });
        }

        // İçerik Tür ve Kategori Filtresi
        const typeFilter = document.getElementById('content-type-filter');
        const catFilter = document.getElementById('content-cat-filter');
        const tableSearch = document.getElementById('content-table-search');

        function applyContentFilters() {
            const typeVal = typeFilter ? typeFilter.value : '';
            const catVal = catFilter ? catFilter.value : '';
            const searchVal = tableSearch ? tableSearch.value.toLowerCase().trim() : '';

            let filtered = cachedContent;
            if (typeVal) filtered = filtered.filter((i) => i.type === typeVal);
            if (catVal) filtered = filtered.filter((i) => i.category === catVal);
            if (searchVal) filtered = filtered.filter((i) => (i.title || '').toLowerCase().includes(searchVal));

            renderContentTable(filtered);
        }

        if (typeFilter) typeFilter.addEventListener('change', applyContentFilters);
        if (catFilter) catFilter.addEventListener('change', applyContentFilters);
        if (tableSearch) tableSearch.addEventListener('input', applyContentFilters);

        // Kullanıcı Tablo Araması
        const userSearch = document.getElementById('users-table-search');
        if (userSearch) {
            userSearch.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                const filtered = cachedUsers.filter(
                    (u) => (u.username || '').toLowerCase().includes(query) || (u.display_name || '').toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query)
                );
                renderUsersTable(filtered);
            });
        }
    }

    // =============================================================================
    // BAŞLATICI
    // =============================================================================
    document.addEventListener('DOMContentLoaded', guardAdmin);
})();
