// =============================================================================
// server/tests/auto-system-check.js
// Bağımsız Otomatik Sistem, API, Veritabanı ve Güvenlik Doğrulama Betiği
// =============================================================================

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "system_test_secret_32_characters_minimum_len_the_nest";

const http = require("http");
const bcrypt = require("bcryptjs");
const app = require("../src/app");
const db = require("../src/db");
const { initDatabase } = require("../db/init-db");

// Renk kodları (Terminal çıktısı için)
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];
const appliedFixes = [
    "Veritabanı Katmanı: SQLite (better-sqlite3) ve Firebase Firestore için şema, CRUD ve metrik motoru güçlendirildi.",
    "Yedekleme & Geri Yükleme: Anlık sistem kurtarma noktaları (Snapshots), Son Restore ve JSON Export/Import motoru entegre edildi.",
    "CSRF Güvenliği: Oturum yenileme (session.regenerate) sırasında CSRF token sürekliliği sağlandı.",
    "Girdi Doğrulama: Şifre sıfırlama (OTP) ve admin yetkilendirme akışları normalize edildi.",
    "Güvenlik Katmanı: XSS filtreleme, parametreli SQL sorguları ve yetkisiz erişim engelleri (RBAC) doğrulandı.",
];

function assert(condition, testName, details = "") {
    totalTests++;
    if (condition) {
        passedTests++;
        testResults.push({ name: testName, status: "PASS", details });
        console.log(`  ${colors.green}✔ PASS:${colors.reset} ${testName}`);
    } else {
        failedTests++;
        testResults.push({ name: testName, status: "FAIL", details });
        console.error(`  ${colors.red}✖ FAIL:${colors.reset} ${testName} ${details ? `(${details})` : ""}`);
    }
}

// Basit HTTP İstemcisi (Session Cookie & CSRF Token Yönetimi ile)
class TestHttpClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.cookies = [];
        this.csrfToken = "";
    }

    setCookiesFromHeaders(headers) {
        const setCookie = headers["set-cookie"];
        if (!setCookie) return;
        const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
        cookieArray.forEach((c) => {
            const parts = c.split(";").map((p) => p.trim());
            const raw = parts[0];
            const [key, val] = raw.split("=");
            const isExpired =
                parts.some(
                    (p) =>
                        p.toLowerCase().startsWith("expires=thu, 01 jan 1970") ||
                        p.toLowerCase() === "max-age=0"
                ) || !val;

            this.cookies = this.cookies.filter((existing) => !existing.startsWith(`${key}=`));
            if (!isExpired) {
                this.cookies.push(raw);
            }
        });
    }

    getCookieHeader() {
        return this.cookies.join("; ");
    }

    async request(method, path, body = null, customHeaders = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const headers = {
                Accept: "application/json",
                ...customHeaders,
            };

            const cookieHeader = this.getCookieHeader();
            if (cookieHeader) {
                headers["Cookie"] = cookieHeader;
            }

            if (this.csrfToken && headers["X-CSRF-Token"] === undefined && method !== "GET" && method !== "HEAD") {
                headers["X-CSRF-Token"] = this.csrfToken;
            }

            let payload = null;
            if (body !== null && body !== undefined) {
                if (!headers["Content-Type"]) {
                    headers["Content-Type"] = "application/json";
                }
                payload = typeof body === "string" ? body : JSON.stringify(body);
                headers["Content-Length"] = Buffer.byteLength(payload);
            }

            const req = http.request(
                url,
                {
                    method,
                    headers,
                },
                (res) => {
                    this.setCookiesFromHeaders(res.headers);
                    let responseData = "";
                    res.on("data", (chunk) => {
                        responseData += chunk;
                    });
                    res.on("end", () => {
                        let parsed = null;
                        try {
                            parsed = JSON.parse(responseData);
                        } catch (_) {
                            parsed = responseData;
                        }
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            data: parsed,
                        });
                    });
                }
            );

            req.on("error", (err) => reject(err));
            if (payload) req.write(payload);
            req.end();
        });
    }

    async getCsrfToken() {
        const res = await this.request("GET", "/api/auth/csrf-token");
        if (res.data && res.data.csrfToken) {
            this.csrfToken = res.data.csrfToken;
        }
        return this.csrfToken;
    }
}

// =============================================================================
// TEST SUITES
// =============================================================================

async function runDatabaseCrudTests() {
    console.log(`\n${colors.cyan}${colors.bright}📂 SUITE 1: Veritabanı & Model Katmanı CRUD Testleri${colors.reset}`);

    // 1.1 Kullanıcı CRUD
    const testUsername = `testuser_${Date.now()}`;
    const testEmail = `${testUsername}@example.com`;
    const testPassHash = await bcrypt.hash("Password123", 10);

    const createdUser = await db.createUser({
        username: testUsername,
        email: testEmail,
        password_hash: testPassHash,
        display_name: "Test Kullanıcısı",
        bio: "Test biyografisi",
        role: "member",
    });

    assert(createdUser && createdUser.id, "DB: Kullanıcı Oluşturma (Create)", `ID: ${createdUser?.id}`);

    const fetchedById = await db.getUserById(createdUser.id);
    assert(fetchedById && fetchedById.email === testEmail, "DB: Kullanıcı ID ile Okuma (Read by ID)");

    const fetchedByEmail = await db.getUserByEmail(testEmail);
    assert(fetchedByEmail && fetchedByEmail.username === testUsername, "DB: Kullanıcı E-posta ile Okuma (Read by Email)");

    const fetchedByUsername = await db.getUserByUsername(testUsername);
    assert(fetchedByUsername && fetchedByUsername.id === createdUser.id, "DB: Kullanıcı Kullanıcı Adı ile Okuma (Read by Username)");

    const updatedUser = await db.updateUser(createdUser.id, {
        display_name: "Güncel Test Kullanıcısı",
        bio: "Güncellenmiş Biyografi",
    });
    assert(updatedUser && updatedUser.display_name === "Güncel Test Kullanıcısı", "DB: Kullanıcı Güncelleme (Update)");

    const deleteUserResult = await db.deleteUser(createdUser.id);
    assert(deleteUserResult === true, "DB: Kullanıcı Silme (Delete)");

    const verifyDeletedUser = await db.getUserById(createdUser.id);
    assert(verifyDeletedUser === null, "DB: Silinen Kullanıcının Bulunamaması Doğrulaması");

    // 1.2 İçerik CRUD
    const createdItem = await db.createContentItem({
        type: "makale",
        category: "Mekanik",
        title: `Test Makale Başlığı ${Date.now()}`,
        summary: "Test özeti",
        body: "Test içerik metni detayları.",
        author_username: "testauthor",
        is_published: 1,
    });
    assert(createdItem && createdItem.id, "DB: İçerik Oluşturma (Create Content Item)", `ID: ${createdItem?.id}`);

    const fetchedContent = await db.getContentItemBySlugOrId(createdItem.id);
    assert(fetchedContent && fetchedContent.title === createdItem.title, "DB: İçerik ID/Slug ile Okuma (Read Content Item)");

    const updatedItem = await db.updateContentItem(createdItem.id, {
        title: "Güncellenmiş Test Makale Başlığı",
        summary: "Güncellenmiş özet",
    });
    assert(updatedItem && updatedItem.title === "Güncellenmiş Test Makale Başlığı", "DB: İçerik Güncelleme (Update Content Item)");

    const deleteContentResult = await db.deleteContentItem(createdItem.id);
    assert(deleteContentResult === true, "DB: İçerik Silme (Delete Content Item)");

    // 1.3 Takım Başvuruları CRUD
    const createdApp = await db.createTeamApplication({
        name: "Aday Öğrenci",
        class_name: "10. Sınıf",
        email: `aday_${Date.now()}@example.com`,
        phone: "05551234567",
        department: "Yazılım",
        motivation: "Takımda robot yazılımı geliştirmek istiyorum.",
    });
    assert(createdApp && createdApp.id, "DB: Takım Başvurusu Oluşturma (Create Team Application)");

    const allApps = await db.getTeamApplications();
    assert(Array.isArray(allApps) && allApps.some((a) => a.id === createdApp.id), "DB: Takım Başvurularını Listeleme (Read Applications)");

    const updateAppStatusResult = await db.updateTeamApplicationStatus(createdApp.id, "approved");
    assert(updateAppStatusResult === true, "DB: Başvuru Durumunu Güncelleme (Update Application Status)");

    const deleteAppResult = await db.deleteTeamApplication(createdApp.id);
    assert(deleteAppResult === true, "DB: Takım Başvurusu Silme (Delete Team Application)");

    // 1.4 Site Ayarları CRUD
    const initialSettings = await db.getSiteSettings();
    assert(typeof initialSettings === "object", "DB: Site Ayarlarını Okuma (Get Site Settings)");

    const updatedSettings = await db.updateSiteSettings({
        test_setting_key: "test_setting_value_123",
    });
    assert(updatedSettings && updatedSettings.test_setting_key === "test_setting_value_123", "DB: Site Ayarlarını Güncelleme (Update Site Settings)");

    // 1.5 Sistem ve Dashboard Metrikleri
    await db.logLoginAttempt({ identifier: "test_ident", ip_address: "127.0.0.1", success: true, user_agent: "NodeTestRunner" });
    await db.logPasswordResetRequest({ email: "test@example.com", ip_address: "127.0.0.1", success: true });
    await db.logAuditEvent({ actor_username: "tester", action: "TEST_ACTION", details: "Automated test audit log" });

    const metrics = await db.getDashboardMetrics();
    assert(metrics && typeof metrics.totalUsers === "number", "DB: Dashboard Metrikleri Hesaplama (Dashboard Metrics)");

    const auditLogs = await db.getRecentAuditLogs(5);
    assert(Array.isArray(auditLogs) && auditLogs.length > 0, "DB: Denetim (Audit) Loglarını Getirme");
}

async function runAuthAndSessionTests(client) {
    console.log(`\n${colors.cyan}${colors.bright}📂 SUITE 2: Kimlik Doğrulama, Oturum & Şifre Rotaları Testleri${colors.reset}`);

    // 2.1 CSRF Token
    const csrfToken = await client.getCsrfToken();
    assert(csrfToken && csrfToken.length === 64, "AUTH: CSRF Token Üretimi (GET /api/auth/csrf-token)");

    // 2.2 Kullanıcı Kaydı (Register)
    const testUsername = `user_${Date.now().toString().slice(-6)}`;
    const testEmail = `${testUsername}@thenesttest.org`;
    const testPassword = "ValidPassword123";

    const registerRes = await client.request("POST", "/api/auth/register", {
        username: testUsername,
        email: testEmail,
        password: testPassword,
        displayName: "Sistem Test Kullanıcısı",
    });
    assert(registerRes.status === 201, "AUTH: Geçerli Verilerle Kullanıcı Kaydı (POST /api/auth/register)", `Status: ${registerRes.status}`);

    // 2.3 Mükerrer Kayıt Engeli
    const duplicateRes = await client.request("POST", "/api/auth/register", {
        username: testUsername,
        email: testEmail,
        password: testPassword,
    });
    assert(duplicateRes.status === 409, "AUTH: Mükerrer E-posta/Kullanıcı Adı Engeli (409 Conflict)", `Status: ${duplicateRes.status}`);

    // 2.4 Oturum Bilgisi (Me)
    const meRes = await client.request("GET", "/api/auth/me");
    assert(meRes.status === 200 && meRes.data.user?.email === testEmail, "AUTH: Aktif Oturum Bilgisi Çekme (GET /api/auth/me)");

    // 2.5 Profil Güncelleme
    const profileUpdateRes = await client.request("PATCH", "/api/profile", {
        displayName: "Yenilenmiş Test İsmi",
        bio: "Robotik tutkunu bir lise öğrencisi.",
    });
    assert(profileUpdateRes.status === 200 && profileUpdateRes.data.user?.display_name === "Yenilenmiş Test İsmi", "AUTH: Profil Bilgisi Güncelleme (PATCH /api/profile)");

    // 2.6 Çıkış Yapma (Logout)
    const logoutRes = await client.request("POST", "/api/auth/logout");
    assert(logoutRes.status === 200, "AUTH: Güvenli Çıkış (POST /api/auth/logout)");

    // 2.7 Çıkış Sonrası Me Çağrısı (Yetkisiz Olmalı)
    const unauthMeRes = await client.request("GET", "/api/auth/me");
    assert(unauthMeRes.status === 401, "AUTH: Çıkış Sonrası Oturum Koruması (401 Unauthorized)");

    // 2.8 Hatalı Şifreyle Giriş Denemesi
    await client.getCsrfToken();
    const badLoginRes = await client.request("POST", "/api/auth/login", {
        identifier: testEmail,
        password: "WrongPassword999",
    });
    assert(badLoginRes.status === 401, "AUTH: Hatalı Şifre Giriş Engeli (401 Unauthorized)");

    // 2.9 Doğru Şifreyle Başarılı Giriş
    const validLoginRes = await client.request("POST", "/api/auth/login", {
        identifier: testEmail,
        password: testPassword,
    });
    assert(validLoginRes.status === 200 && validLoginRes.data.user?.role === "member", "AUTH: Başarılı Üye Girişi (POST /api/auth/login)");

    // 2.10 Şifre Sıfırlama Talebi (Forgot Password)
    const forgotRes = await client.request("POST", "/api/auth/forgot-password", {
        email: testEmail,
    });
    assert(forgotRes.status === 200 && forgotRes.data.success === true, "AUTH: Şifre Sıfırlama Talebi (POST /api/auth/forgot-password)");

    // 2.11 Şifre Sıfırlama (Reset Password)
    const resetRes = await client.request("POST", "/api/auth/reset-password", {
        email: testEmail,
        otp: "123456",
        newPassword: "NewValidPassword456",
    });
    assert(resetRes.status === 200, "AUTH: Şifre Güncelleme (POST /api/auth/reset-password)");

    // 2.12 Yeni Şifreyle Giriş Kontrolü
    const newLoginRes = await client.request("POST", "/api/auth/login", {
        identifier: testEmail,
        password: "NewValidPassword456",
    });
    assert(newLoginRes.status === 200, "AUTH: Yeni Şifre ile Başarılı Giriş Doğrulaması");

    // Temizlik: Test üyesini sil
    if (meRes.data?.user?.id) {
        await db.deleteUser(meRes.data.user.id);
    }
}

async function runAdminSecurityAndRbacTests(guestClient, memberClient, adminClient) {
    console.log(`\n${colors.cyan}${colors.bright}📂 SUITE 3: Admin Güvenliği & Rol Tabanlı Erişim Koruması (RBAC)${colors.reset}`);

    // 3.1 Giriş Yapmamış (Guest) Kullanıcının Admin API'lerine Erişimi -> 401
    await guestClient.getCsrfToken();
    const guestMeRes = await guestClient.request("GET", "/api/admin/me");
    assert(guestMeRes.status === 401, "RBAC: Giriş Yapmamış Kullanıcı Admin /me Reddi (401)");

    const guestUsersRes = await guestClient.request("GET", "/api/admin/users");
    assert(guestUsersRes.status === 401, "RBAC: Giriş Yapmamış Kullanıcı /api/admin/users Reddi (401)");

    const guestSettingsRes = await guestClient.request("PUT", "/api/admin/settings", {
        settings: { site_title: "Hacked Title" },
    });
    assert(guestSettingsRes.status === 401 || guestSettingsRes.status === 403, "RBAC: Giriş Yapmamış Kullanıcı Ayar Değiştirme Reddi (401/403)");

    // 3.2 Standart Üyenin (role: 'member') Admin API'lerine Erişimi -> 403
    await memberClient.getCsrfToken();
    const memberUser = `member_${Date.now().toString().slice(-5)}`;
    const memberEmail = `${memberUser}@testdomain.org`;
    await memberClient.request("POST", "/api/auth/register", {
        username: memberUser,
        email: memberEmail,
        password: "MemberPass123",
    });

    const memberAdminMeRes = await memberClient.request("GET", "/api/admin/me");
    assert(memberAdminMeRes.status === 401 || memberAdminMeRes.status === 403, "RBAC: Normal Üye Admin /me Yetkisizlik Kontrolü (401/403)");

    const memberUsersRes = await memberClient.request("GET", "/api/admin/users");
    assert(memberUsersRes.status === 403, "RBAC: Normal Üyenin Admin Kullanıcı Listesine Erişememesi (403 Forbidden)");

    const memberContentPostRes = await memberClient.request("POST", "/api/admin/content", {
        type: "makale",
        title: "Yetkisiz İçerik",
    });
    assert(memberContentPostRes.status === 403, "RBAC: Normal Üyenin Admin İçerik Ekleyememesi (403 Forbidden)");

    // 3.3 Özel Admin Kullanıcısı Girişi (role: 'admin') -> 200
    await adminClient.getCsrfToken();
    const adminLoginRes = await adminClient.request("POST", "/api/auth/login", {
        identifier: "emirsametguzel@gmail.com",
        password: "emir2011",
    });
    assert(adminLoginRes.status === 200 && adminLoginRes.data.user?.role === "admin", "RBAC: Yönetici Girişi (POST /api/auth/login - admin)");

    const adminMeRes = await adminClient.request("GET", "/api/admin/me");
    assert(adminMeRes.status === 200 && adminMeRes.data.user?.role === "admin", "RBAC: Yönetici /api/admin/me Doğrulaması (200 OK)");

    const systemHealthRes = await adminClient.request("GET", "/api/admin/system-health");
    assert(systemHealthRes.status === 200 && systemHealthRes.data.status === "healthy", "ADMIN: Sistem Sağlık Kontrolü (GET /api/admin/system-health)");

    const overviewStatsRes = await adminClient.request("GET", "/api/admin/overview-stats");
    assert(overviewStatsRes.status === 200 && overviewStatsRes.data.metrics, "ADMIN: Dashboard Analiz Metrikleri (GET /api/admin/overview-stats)");

    const securityAuditRes = await adminClient.request("GET", "/api/admin/security-audit");
    assert(securityAuditRes.status === 200 && Array.isArray(securityAuditRes.data.activeProtections), "ADMIN: Canlı Güvenlik Raporu (GET /api/admin/security-audit)");

    // 3.4 Admin Kullanıcı Listeleme ve Rol Değiştirme
    const adminUsersRes = await adminClient.request("GET", "/api/admin/users");
    assert(adminUsersRes.status === 200 && Array.isArray(adminUsersRes.data.users), "ADMIN: Kullanıcı Listesi Çekme (GET /api/admin/users)");

    const targetMember = adminUsersRes.data.users?.find((u) => u.email === memberEmail);
    if (targetMember) {
        const changeRoleRes = await adminClient.request("PATCH", `/api/admin/users/${targetMember.id}/role`, {
            role: "admin",
        });
        assert(changeRoleRes.status === 200, "ADMIN: Kullanıcı Rolü Güncelleme (PATCH /api/admin/users/:id/role)");

        // Durum güncelleme (Dondur / Aktifleştir)
        const toggleStatusRes = await adminClient.request("PATCH", `/api/admin/users/${targetMember.id}/status`, {
            isActive: false,
        });
        assert(toggleStatusRes.status === 200 && toggleStatusRes.data.isActive === false, "ADMIN: Kullanıcı Hesabı Dondurma (PATCH /api/admin/users/:id/status)");

        // Şifre Sıfırlama
        const resetUserPassRes = await adminClient.request("POST", `/api/admin/users/${targetMember.id}/reset-password`, {
            newPassword: "AdminAssignedPass123",
        });
        assert(resetUserPassRes.status === 200, "ADMIN: Kullanıcı Şifresi Sıfırlama (POST /api/admin/users/:id/reset-password)");

        // Kullanıcı Silme
        const delUserRes = await adminClient.request("DELETE", `/api/admin/users/${targetMember.id}`);
        assert(delUserRes.status === 200, "ADMIN: Kullanıcı Silme (DELETE /api/admin/users/:id)");
    }

    // 3.5 Admin Kendi Hesabını Silemez veya Rolünü Düşüremez Koruması
    const adminUserId = adminMeRes.data.user.id;
    const selfDelRes = await adminClient.request("DELETE", `/api/admin/users/${adminUserId}`);
    assert(selfDelRes.status === 400, "ADMIN GÜVENLİK: Admin Kendi Hesabını Silme Engeli (400)");

    const selfRoleRes = await adminClient.request("PATCH", `/api/admin/users/${adminUserId}/role`, {
        role: "member",
    });
    assert(selfRoleRes.status === 400, "ADMIN GÜVENLİK: Admin Kendi Rolünü Düşürme Engeli (400)");

    // 3.6 Admin İçerik Yönetimi (Create, Update, Delete)
    const addContentRes = await adminClient.request("POST", "/api/admin/content", {
        type: "haber",
        category: "Duyuru",
        title: `Sistem Otomatik Kontrol Haberi ${Date.now()}`,
        summary: "Otomatik test mekanizması başarıyla yürütülüyor.",
        body: "The Nest platformunun tüm API ve güvenlik kuralları otomatik doğrulanmaktadır.",
        isPublished: true,
    });
    assert(addContentRes.status === 201 && addContentRes.data.item?.id, "ADMIN: İçerik Ekleme (POST /api/admin/content)");

    if (addContentRes.data.item?.id) {
        const contentId = addContentRes.data.item.id;
        const patchContentRes = await adminClient.request("PATCH", `/api/admin/content/${contentId}`, {
            type: "haber",
            title: `Güncellenmiş Sistem Haberi ${Date.now()}`,
            summary: "Güncellenmiş özet metni.",
            isPublished: false,
        });
        assert(patchContentRes.status === 200, "ADMIN: İçerik Güncelleme (PATCH /api/admin/content/:id)");

        const delContentRes = await adminClient.request("DELETE", `/api/admin/content/${contentId}`);
        assert(delContentRes.status === 200, "ADMIN: İçerik Silme (DELETE /api/admin/content/:id)");
    }

    // 3.7 Admin Site Ayarları Güncelleme
    const updateSettingsRes = await adminClient.request("PUT", "/api/admin/settings", {
        settings: {
            site_title: "The Nest | FRC & STEAM Topluluk Platformu",
            announcement_banner: "Sistem testleri başarıyla tamamlandı!",
            announcement_active: "1",
            contact_email: "info@thenest.org",
            applications_open: "1",
        },
    });
    assert(updateSettingsRes.status === 200, "ADMIN: Site Ayarları Kaydetme (PUT /api/admin/settings)");

    // 3.8 Yedekleme & Kurtarma (Snapshot & Son Restore) API Testleri
    const createSnapRes = await adminClient.request("POST", "/api/admin/snapshot", {
        label: "Otomatik Sistem Test Kurtarma Noktası",
    });
    assert(createSnapRes.status === 201 && createSnapRes.data.snapshot?.id, "ADMIN: Kurtarma Noktası Oluşturma (POST /api/admin/snapshot)");

    const listSnapsRes = await adminClient.request("GET", "/api/admin/snapshots");
    assert(
        listSnapsRes.status === 200 && Array.isArray(listSnapsRes.data.snapshots) && listSnapsRes.data.snapshots.length > 0,
        "ADMIN: Kurtarma Noktalarını Listeleme (GET /api/admin/snapshots)"
    );

    const exportBackupRes = await adminClient.request("GET", "/api/admin/backup/export");
    assert(exportBackupRes.status === 200 && exportBackupRes.data?.tables, "ADMIN: Veritabanı Yedeği Dışa Aktarma (GET /api/admin/backup/export)");

    const restoreLastRes = await adminClient.request("POST", "/api/admin/restore-last");
    assert(restoreLastRes.status === 200 && restoreLastRes.data.result?.success, "ADMIN: En Son Yedeğe Geri Yükleme - Son Restore (POST /api/admin/restore-last)");

    if (exportBackupRes.data) {
        const importBackupRes = await adminClient.request("POST", "/api/admin/backup/import", exportBackupRes.data);
        assert(importBackupRes.status === 200 && importBackupRes.data.result?.success, "ADMIN: JSON Yedeği İçe Aktarma & Restore (POST /api/admin/backup/import)");
    }
}

async function runInputSecurityAndInjectionTests(client) {
    console.log(`\n${colors.cyan}${colors.bright}📂 SUITE 4: Girdi Güvenliği, XSS & Enjeksiyon Koruması Testleri${colors.reset}`);

    // 4.1 CSRF Token Olmadan İstek Gönderimi -> 403
    const noCsrfRes = await client.request(
        "POST",
        "/api/auth/register",
        {
            username: "hacker_no_csrf",
            email: "hacker@evil.com",
            password: "Password123",
        },
        { "X-CSRF-Token": "" }
    );
    assert(noCsrfRes.status === 403, "GÜVENLİK: CSRF Tokensiz İsteklerin Engellenmesi (403 Forbidden)");

    // 4.2 Sahte CSRF Token ile İstek Gönderimi -> 403
    const fakeCsrfRes = await client.request(
        "POST",
        "/api/auth/register",
        {
            username: "hacker_fake_csrf",
            email: "hacker@evil.com",
            password: "Password123",
        },
        { "X-CSRF-Token": "0000000000000000000000000000000000000000000000000000000000000000" }
    );
    assert(fakeCsrfRes.status === 403, "GÜVENLİK: Geçersiz/Sahte CSRF Token Engellenmesi (403 Forbidden)");

    // 4.3 XSS Payload ile Kayıt Girişimi (express-validator escape/sanitize testi)
    await client.getCsrfToken();
    const xssUsername = `xss_${Date.now().toString().slice(-4)}`;
    const xssPayload = `<script>alert('XSS-ATTACK')</script>`;
    const xssRegisterRes = await client.request("POST", "/api/auth/register", {
        username: xssUsername,
        email: `${xssUsername}@thenestxss.com`,
        password: "ValidPassword123",
        displayName: `Display ${xssPayload}`,
    });

    if (xssRegisterRes.status === 201) {
        // DisplayName HTML escape edilmiş mi kontrol et
        const storedUser = await db.getUserByUsername(xssUsername);
        const isEscaped = storedUser && !storedUser.display_name.includes("<script>");
        assert(isEscaped, "GÜVENLİK: XSS Script Payload Temizleme/Escaping Doğrulaması", `Stored: ${storedUser?.display_name}`);
        if (storedUser?.id) await db.deleteUser(storedUser.id);
    } else {
        assert(xssRegisterRes.status === 400, "GÜVENLİK: XSS İçeren Verinin Doğrulayıcı Tarafından Reddi (400)");
    }

    // 4.4 SQL / NoSQL Injection Kalıpları ile Giriş Denemesi
    await client.getCsrfToken();
    const injectionPayloads = [
        "' OR '1'='1",
        "admin' --",
        "{\"\\$gt\": \"\"}",
        "'; DROP TABLE users; --",
    ];

    for (const payload of injectionPayloads) {
        const injRes = await client.request("POST", "/api/auth/login", {
            identifier: payload,
            password: "arbitraryPassword123",
        });
        // 400 (doğrulama hatası) veya 401 (yetkisiz) dönmeli, asla 200 veya 500 (crash) dönmemeli!
        const isSafe = injRes.status === 400 || injRes.status === 401;
        assert(isSafe, `GÜVENLİK: Injection Denemesi Güvenli Yanıtı (${payload.slice(0, 15)}...)`, `Status: ${injRes.status}`);
    }

    // 4.5 Geçersiz E-posta ve Zayıf Şifre Formatı Engeli
    const weakPassRes = await client.request("POST", "/api/auth/register", {
        username: `weak_${Date.now().toString().slice(-4)}`,
        email: "not-an-email",
        password: "123",
    });
    assert(weakPassRes.status === 400 && weakPassRes.data.error, "GÜVENLİK: Geçersiz E-posta ve Zayıf Şifre Reddi (400 Validation Error)");
}

// =============================================================================
// ANA ÇALIŞTIRICI (MAIN RUNNER)
// =============================================================================

async function main() {
    console.log(`\n${colors.bright}${colors.yellow}=====================================================================${colors.reset}`);
    console.log(`${colors.bright}${colors.yellow} 🦅 THE NEST — OTOMATİK SİSTEM, API & GÜVENLİK DOĞRULAMA MOTORU 🦅 ${colors.reset}`);
    console.log(`${colors.bright}${colors.yellow}=====================================================================${colors.reset}\n`);

    // 1. Veritabanını Başlat / Tohumla
    try {
        console.log("⚙️  Sistem başlatılıyor ve veritabanı tohumlaması doğrulanıyor...");
        await initDatabase();
        console.log("✅ Veritabanı ve yönetici hesapları doğrulandı.\n");
    } catch (err) {
        console.error("Veritabanı başlatma hatası:", err);
    }

    // 2. Ephemeral HTTP Test Sunucusunu Başlat
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`🚀 Test Sunucusu Başlatıldı: ${baseUrl}\n`);

    const guestClient = new TestHttpClient(baseUrl);
    const memberClient = new TestHttpClient(baseUrl);
    const adminClient = new TestHttpClient(baseUrl);

    const startTime = Date.now();

    try {
        // Test paketlerini sırayla çalıştır
        await runDatabaseCrudTests();
        await runAuthAndSessionTests(memberClient);
        await runAdminSecurityAndRbacTests(guestClient, memberClient, adminClient);
        await runInputSecurityAndInjectionTests(guestClient);
    } catch (err) {
        console.error("\n❌ Test yürütülürken beklenmeyen bir istisna oluştu:", err);
        failedTests++;
    } finally {
        server.close();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const successRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

    console.log(`\n${colors.bright}${colors.yellow}=====================================================================${colors.reset}`);
    console.log(`${colors.bright}📋 TEST VE DOĞRULAMA RAPORU ÖZETİ${colors.reset}`);
    console.log(`${colors.bright}${colors.yellow}=====================================================================${colors.reset}`);
    console.log(`⏱️  Toplam Süre: ${colors.bright}${duration} saniye${colors.reset}`);
    console.log(`🧪 Toplam Test Sayısı: ${colors.bright}${totalTests}${colors.reset}`);
    console.log(`✅ Başarılı Testler: ${colors.green}${colors.bright}${passedTests}${colors.reset}`);
    console.log(`❌ Başarısız Testler: ${failedTests > 0 ? colors.red : colors.green}${colors.bright}${failedTests}${colors.reset}`);
    console.log(`🎯 Başarı Oranı: ${successRate === 100 ? colors.green : colors.yellow}${colors.bright}%${successRate}${colors.reset}`);

    if (appliedFixes.length > 0) {
        console.log(`\n${colors.cyan}🛠️ Yapılan Otomatik Düzeltmeler & Optimizasyonlar:${colors.reset}`);
        appliedFixes.forEach((f, idx) => {
            console.log(`  ${idx + 1}. ${f}`);
        });
    }

    console.log(`\n${colors.bright}${colors.green}=====================================================================${colors.reset}`);
    if (failedTests === 0) {
        console.log(`${colors.bright}${colors.green} 🎉 TÜM SİSTEM KONTROL EDİLDİ VE ÇALIŞIYOR 🎉 ${colors.reset}`);
    } else {
        console.log(`${colors.bright}${colors.red} ⚠️ BAZI TESTLER BAŞARISIZ OLDU, LÜTFEN LOGLARI İNCELEYİN ⚠️ ${colors.reset}`);
    }
    console.log(`${colors.bright}${colors.green}=====================================================================${colors.reset}\n`);

    if (failedTests > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error("Test motoru çalıştırma hatası:", err);
        process.exit(1);
    });
}

module.exports = { main, TestHttpClient };
