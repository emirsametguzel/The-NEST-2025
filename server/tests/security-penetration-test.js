// =============================================================================
// server/tests/security-penetration-test.js
// 🦅 THE NEST — OWASP TOP 10 SIZMA TESTİ & SİBER SALDIRI SİMÜLATÖRÜ 🦅
// =============================================================================

process.env.NODE_ENV = "test";
process.env.ENABLE_RATE_LIMIT_TEST = "true";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "penetration_test_secret_32_characters_minimum_len_the_nest";

const http = require("http");
const app = require("../src/app");
const db = require("../src/db");
const { initDatabase } = require("../db/init-db");

// ANSI Renk Kodları
const C = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    white: "\x1b[37m",
};

let totalAttacks = 0;
let blockedAttacks = 0;
let successfulBreaches = 0;
const attackLogs = [];

function recordAttack({ category, attackType, payload, httpStatus, responseDetails, blocked, note }) {
    totalAttacks++;
    if (blocked) {
        blockedAttacks++;
    } else {
        successfulBreaches++;
    }

    const shortPayload = String(payload).replace(/\n/g, " ").slice(0, 45);
    const statusText = blocked
        ? `${C.green}${C.bright}ENGELLEDİ 🛡️${C.reset}`
        : `${C.bgRed}${C.white}${C.bright} BAŞARISIZ ❌ ${C.reset}`;

    const logEntry = {
        category,
        attackType,
        payload: shortPayload,
        httpStatus,
        statusText,
        blocked,
        note: note || responseDetails,
    };
    attackLogs.push(logEntry);

    const typeCol = `${attackType}`.padEnd(26, " ");
    const payloadCol = `${shortPayload}`.padEnd(46, " ");
    const statusCol = `HTTP ${httpStatus}`.padEnd(10, " ");

    console.log(` [${typeCol}] | [${payloadCol}] | [${statusCol}] | [Durum: ${statusText}]`);
}

// Güvenli Test HTTP İstemcisi
class AttackClient {
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
                Accept: "application/json, text/plain, */*",
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

    async fetchCsrfToken() {
        const res = await this.request("GET", "/api/auth/csrf-token");
        if (res.data && res.data.csrfToken) {
            this.csrfToken = res.data.csrfToken;
        }
        return this.csrfToken;
    }
}

// =============================================================================
// SALDIRI SİMÜLASYONU MODÜLLERİ
// =============================================================================

// 1. SQL INJECTION (SQLi) SİMÜLATÖRÜ
async function testSqlInjection(client) {
    console.log(`\n${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log(`${C.yellow}${C.bright}🎯 [1/7] SQL INJECTION (SQLi) & VERİTABANI ELE GEÇİRME SALDIRI SİMÜLASYONU${C.reset}`);
    console.log(`${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);

    const sqliPayloads = [
        { name: "Auth Bypass: Boolean True", payload: "' OR '1'='1", field: "identifier" },
        { name: "Auth Bypass: Line Comment", payload: "admin' --", field: "identifier" },
        { name: "Auth Bypass: Always True Or", payload: "' OR 1=1 --", field: "identifier" },
        { name: "Union Based Data Leak", payload: "' UNION SELECT 1, 'hacked', 'h@ck.com', 'hash', 'admin' --", field: "identifier" },
        { name: "Destructive: Table Drop", payload: "'; DROP TABLE users; --", field: "identifier" },
        { name: "Nested SQL Subquery", payload: "' OR (SELECT COUNT(*) FROM users) > 0 --", field: "identifier" },
        { name: "Content Slug SQLi", payload: "article-1' OR 1=1 --", urlParam: true },
        { name: "Search Query SQLi", payload: "mekanik' UNION SELECT * FROM users --", queryParam: true },
    ];

    for (const item of sqliPayloads) {
        await client.fetchCsrfToken();
        let res;
        if (item.urlParam) {
            res = await client.request("GET", `/api/content/${encodeURIComponent(item.payload)}`);
            // Slug bulunamadı (404) veya hata (400) -> Başarıyla engellendi
            const isBlocked = res.status === 404 || res.status === 400 || res.status === 403;
            recordAttack({
                category: "SQL Injection",
                attackType: item.name,
                payload: item.payload,
                httpStatus: res.status,
                blocked: isBlocked,
                note: isBlocked ? "Parametreli SQLite sorgusu ile bypass engellendi" : "SQL Enjeksiyonu gerçekleşti!",
            });
        } else if (item.queryParam) {
            res = await client.request("GET", `/api/content?category=${encodeURIComponent(item.payload)}`);
            // Sadece boş dizi veya 400 dönmeli, kullanıcı tablosu sızmamalı
            const isSafe = !JSON.stringify(res.data).includes("password_hash") && res.status === 200;
            recordAttack({
                category: "SQL Injection",
                attackType: item.name,
                payload: item.payload,
                httpStatus: res.status,
                blocked: isSafe,
                note: isSafe ? "Parametreli sorgu veri sızıntısını engelledi" : "Yetkisiz veri sızdı!",
            });
        } else {
            res = await client.request("POST", "/api/auth/login", {
                identifier: item.payload,
                password: "arbitraryAttackPassword123",
            });
            // 400 (doğrulama reddi) veya 401 (yetkisiz) olmalı, asla 200 (giriş) veya 500 (crash) olmamalı!
            const isBlocked = (res.status === 400 || res.status === 401) && res.status !== 200 && res.status !== 500;
            recordAttack({
                category: "SQL Injection",
                attackType: item.name,
                payload: item.payload,
                httpStatus: res.status,
                blocked: isBlocked,
                note: isBlocked ? "Kimlik doğrulama baypas edilemedi" : "Kritik: SQLi ile giriş yapıldı!",
            });
        }
    }
}

// 2. CROSS-SITE SCRIPTING (XSS) SİMÜLATÖRÜ
async function testCrossSiteScripting(client) {
    console.log(`\n${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log(`${C.yellow}${C.bright}🎯 [2/7] CROSS-SITE SCRIPTING (XSS) & KÖTÜ AMAÇLI KOD ENJEKSİYON SİMÜLASYONU${C.reset}`);
    console.log(`${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);

    const xssPayloads = [
        { name: "Stored Script Tag", payload: "<script>alert('XSS-THE-NEST')</script>" },
        { name: "Image Error Handler", payload: '<img src="x" onerror="alert(document.cookie)" />' },
        { name: "SVG Vector XSS", payload: "<svg/onload=alert(1)>" },
        { name: "Iframe Injection", payload: '<iframe src="javascript:alert(1)"></iframe>' },
        { name: "DOM Event Handler", payload: '" onfocus="alert(\'XSS\')" autofocus="' },
        { name: "Javascript Protocol", payload: "javascript:alert(window.location)" },
    ];

    for (const item of xssPayloads) {
        await client.fetchCsrfToken();
        const testUser = `xss_${Date.now().toString().slice(-4)}_${Math.floor(Math.random() * 1000)}`;
        const email = `${testUser}@xsstest.com`;

        const registerRes = await client.request("POST", "/api/auth/register", {
            username: testUser,
            email: email,
            password: "ValidSecurePassword123",
            displayName: `Student ${item.payload}`,
        });

        if (registerRes.status === 201) {
            // Kayıt başarılı olsa bile veritabanına HTML entity encode olarak geçmiş mi?
            const userInDb = await db.getUserByUsername(testUser);
            const rawStored = userInDb ? userInDb.display_name : "";
            const isSanitized = !rawStored.includes("<script>") && !rawStored.includes("<img") && !rawStored.includes("<svg") && !rawStored.includes("<iframe");
            
            recordAttack({
                category: "Cross-Site Scripting (XSS)",
                attackType: item.name,
                payload: item.payload,
                httpStatus: registerRes.status,
                blocked: isSanitized,
                note: isSanitized ? "Payload HTML Entity olarak sanitize & escape edildi" : "Zararlı script temizlenmedi!",
            });

            if (userInDb && userInDb.id) {
                await db.deleteUser(userInDb.id);
            }
        } else {
            // Doğrulayıcı tarafından reddedildi (400) -> Güvenli
            recordAttack({
                category: "Cross-Site Scripting (XSS)",
                attackType: item.name,
                payload: item.payload,
                httpStatus: registerRes.status,
                blocked: registerRes.status === 400,
                note: "Girdi doğrulayıcı saldırı payload'unu engelledi (HTTP 400)",
            });
        }
    }
}

// 3. CROSS-SITE REQUEST FORGERY (CSRF) SİMÜLATÖRÜ
async function testCsrfAttacks(client) {
    console.log(`\n${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log(`${C.yellow}${C.bright}🎯 [3/7] CROSS-SITE REQUEST FORGERY (CSRF) SALDIRI SİMÜLASYONU${C.reset}`);
    console.log(`${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);

    const csrfScenarios = [
        { name: "POST Register Headersız CSRF", method: "POST", path: "/api/auth/register", body: { username: "csrf_victim1", email: "v1@test.com", password: "Password123" }, headerVal: undefined },
        { name: "POST Register Boş Token", method: "POST", path: "/api/auth/register", body: { username: "csrf_victim2", email: "v2@test.com", password: "Password123" }, headerVal: "" },
        { name: "POST Register Sahte Hex Token", method: "POST", path: "/api/auth/register", body: { username: "csrf_victim3", email: "v3@test.com", password: "Password123" }, headerVal: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
    ];

    for (const scenario of csrfScenarios) {
        const headers = {};
        if (scenario.headerVal !== undefined) {
            headers["X-CSRF-Token"] = scenario.headerVal;
        } else {
            headers["X-CSRF-Token"] = "";
        }

        const res = await client.request(scenario.method, scenario.path, scenario.body, headers);
        const isBlocked = res.status === 403 || res.status === 400;

        recordAttack({
            category: "CSRF",
            attackType: scenario.name,
            payload: `Header: X-CSRF-Token='${scenario.headerVal || "EMPTY"}'`,
            httpStatus: res.status,
            blocked: isBlocked,
            note: isBlocked ? "CSRF token doğrulaması isteği 403 Forbidden ile engelledi" : "Kritik: CSRF koruması atlatıldı!",
        });
    }

    // Giriş yapmış kullanıcı ile CSRF koruması testi
    const authClient = new AttackClient(client.baseUrl);
    await authClient.fetchCsrfToken();
    const csrfUser = `csrfuser_${Date.now().toString().slice(-4)}`;
    await authClient.request("POST", "/api/auth/register", {
        username: csrfUser,
        email: `${csrfUser}@csrftest.com`,
        password: "ValidPassword123",
    });

    // Oturumu açık kullanıcının sahte/boş tokenla PATCH /api/profile isteği
    const forgedProfileRes = await authClient.request(
        "PATCH",
        "/api/profile",
        { displayName: "CSRF Hacked Display Name" },
        { "X-CSRF-Token": "invalid_forged_csrf_token_value_here" }
    );
    const isProfileBlocked = forgedProfileRes.status === 403;
    recordAttack({
        category: "CSRF",
        attackType: "Oturumlu PATCH Profil CSRF",
        payload: "PATCH /api/profile with forged CSRF token",
        httpStatus: forgedProfileRes.status,
        blocked: isProfileBlocked,
        note: isProfileBlocked ? "Oturumlu istekte sahte CSRF token 403 ile engellendi" : "Kritik: Oturumlu CSRF açığı!",
    });

    // Admin oturumu ile sahte CSRF token testi
    const adminCsrfClient = new AttackClient(client.baseUrl);
    await adminCsrfClient.fetchCsrfToken();
    await adminCsrfClient.request("POST", "/api/auth/login", {
        identifier: "emirsametguzel@gmail.com",
        password: "emir2011",
    });

    const forgedAdminRes = await adminCsrfClient.request(
        "PUT",
        "/api/admin/settings",
        { settings: { site_title: "Defaced Title by CSRF" } },
        { "X-CSRF-Token": "0000000000000000000000000000000000000000000000000000000000000000" }
    );
    const isAdminCsrfBlocked = forgedAdminRes.status === 403;
    recordAttack({
        category: "CSRF",
        attackType: "Admin PUT Settings CSRF",
        payload: "PUT /api/admin/settings with fake CSRF token",
        httpStatus: forgedAdminRes.status,
        blocked: isAdminCsrfBlocked,
        note: isAdminCsrfBlocked ? "Admin ayar değiştirme isteğinde sahte CSRF 403 ile engellendi" : "Kritik: Admin CSRF açığı!",
    });
}

// 4. BROKEN ACCESS CONTROL & YETKİ AŞIMI (RBAC) SİMÜLATÖRÜ
async function testBrokenAccessControl(guestClient, memberClient, adminClient) {
    console.log(`\n${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log(`${C.yellow}${C.bright}🎯 [4/7] BROKEN ACCESS CONTROL & YETKİ AŞIMI (PRIVILEGE ESCALATION) SİMÜLASYONU${C.reset}`);
    console.log(`${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);

    // Misafir istekleri
    const guestAttempts = [
        { name: "Guest -> Admin Dashboard", method: "GET", path: "/api/admin/me" },
        { name: "Guest -> Kullanıcı Listesi", method: "GET", path: "/api/admin/users" },
        { name: "Guest -> Sistem Sağlık Bilgisi", method: "GET", path: "/api/admin/system-health" },
        { name: "Guest -> Güvenlik Denetim Raporu", method: "GET", path: "/api/admin/security-audit" },
        { name: "Guest -> Profil Güncelleme", method: "PATCH", path: "/api/profile", body: { displayName: "Hacked" } },
    ];

    for (const att of guestAttempts) {
        await guestClient.fetchCsrfToken();
        const res = await guestClient.request(att.method, att.path, att.body || null);
        const isBlocked = res.status === 401 || res.status === 403;
        recordAttack({
            category: "Access Control",
            attackType: att.name,
            payload: `${att.method} ${att.path}`,
            httpStatus: res.status,
            blocked: isBlocked,
            note: isBlocked ? "Yetkisiz misafir isteği engellendi (401/403)" : "Yetkisiz erişim açığı!",
        });
    }

    // Normal üye ile oturum aç
    await memberClient.fetchCsrfToken();
    const memberName = `stdmember_${Date.now().toString().slice(-4)}`;
    const memberEmail = `${memberName}@school.edu.tr`;
    await memberClient.request("POST", "/api/auth/register", {
        username: memberName,
        email: memberEmail,
        password: "StandardPassword123",
        displayName: "Standart Öğrenci",
    });

    const memberAttempts = [
        { name: "Member -> /api/admin/me", method: "GET", path: "/api/admin/me" },
        { name: "Member -> /api/admin/users", method: "GET", path: "/api/admin/users" },
        { name: "Member -> İçerik Ekleme", method: "POST", path: "/api/admin/content", body: { type: "haber", title: "Hacked" } },
        { name: "Member -> Site Ayarları Değiştirme", method: "PUT", path: "/api/admin/settings", body: { settings: { site_title: "Defaced" } } },
        { name: "Member -> Kendini Admin Yapma", method: "PATCH", path: `/api/admin/users/1/role`, body: { role: "admin" } },
    ];

    for (const att of memberAttempts) {
        const res = await memberClient.request(att.method, att.path, att.body || null);
        const isBlocked = res.status === 403 || res.status === 401;
        recordAttack({
            category: "Access Control",
            attackType: att.name,
            payload: `${att.method} ${att.path}`,
            httpStatus: res.status,
            blocked: isBlocked,
            note: isBlocked ? "Rol tabanlı erişim (RBAC) yetkisiz isteği 403 ile engelledi" : "Yetki aşımı gerçekleşti!",
        });
    }

    // Admin Self-Harm Engeli Testi
    await adminClient.fetchCsrfToken();
    await adminClient.request("POST", "/api/auth/login", {
        identifier: "emirsametguzel@gmail.com",
        password: "emir2011",
    });
    const adminMe = await adminClient.request("GET", "/api/admin/me");
    const adminId = adminMe.data.user.id;

    // Admin kendi hesabını silmeye çalışıyor
    const delSelfRes = await adminClient.request("DELETE", `/api/admin/users/${adminId}`);
    const isSelfDelBlocked = delSelfRes.status === 400;
    recordAttack({
        category: "Access Control",
        attackType: "Admin Kendi Hesabını Silme Engeli",
        payload: `DELETE /api/admin/users/${adminId}`,
        httpStatus: delSelfRes.status,
        blocked: isSelfDelBlocked,
        note: isSelfDelBlocked ? "Admin kendini silmeye karşı kilitlendi (400)" : "Kritik: Admin kendini sildi!",
    });

    // Admin kendi rolünü düşürmeye çalışıyor
    const demoteSelfRes = await adminClient.request("PATCH", `/api/admin/users/${adminId}/role`, { role: "member" });
    const isDemoteBlocked = demoteSelfRes.status === 400;
    recordAttack({
        category: "Access Control",
        attackType: "Admin Kendi Rolünü Düşürme Engeli",
        payload: `PATCH /api/admin/users/${adminId}/role (role: member)`,
        httpStatus: demoteSelfRes.status,
        blocked: isDemoteBlocked,
        note: isDemoteBlocked ? "Admin rol düşürme engellendi (400)" : "Kritik: Admin rolünü düşürdü!",
    });
}

// 5. BRUTE-FORCE & RATE LIMITING & DOS KORUMASI SİMÜLATÖRÜ
async function testBruteForceAndDos(client) {
    console.log(`\n${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log(`${C.yellow}${C.bright}🎯 [5/7] BRUTE-FORCE, RATE LIMITING & DOS (DENIAL OF SERVICE) SALDIRI SİMÜLASYONU${C.reset}`);
    console.log(`${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);

    // 5.1 50+ Hızlı İstek Burst Saldırısı
    console.log(`  ${C.cyan}⚡ /api/auth/login uç noktasına 50 adet eşzamanlı hatalı şifre denemesi gönderiliyor...${C.reset}`);
    await client.fetchCsrfToken();
    const burstRequests = [];
    for (let i = 0; i < 50; i++) {
        burstRequests.push(
            client.request("POST", "/api/auth/login", {
                identifier: "victim@example.com",
                password: `bruteforce_guess_${i}`,
            })
        );
    }

    const burstResponses = await Promise.all(burstRequests);
    const rateLimitedResponses = burstResponses.filter((r) => r.status === 429);
    const unauthorizedResponses = burstResponses.filter((r) => r.status === 401);

    const isRateLimitActive = rateLimitedResponses.length > 0;
    recordAttack({
        category: "Brute Force / Rate Limit",
        attackType: "50x Eşzamanlı Login Flood",
        payload: "50 concurrent POST /api/auth/login requests",
        httpStatus: isRateLimitActive ? 429 : unauthorizedResponses[0]?.status || 401,
        blocked: isRateLimitActive,
        note: isRateLimitActive
            ? `Rate limiter devreye girdi: ${rateLimitedResponses.length} istek HTTP 429 Too Many Requests ile durduruldu`
            : "Rate limiter tetiklenmedi (uyarı)",
    });

    // 5.2 Aşırı Büyük Payload (Large Payload DoS)
    console.log(`  ${C.cyan}⚡ 3MB boyutunda devasa JSON gövdesi ile DoS saldırısı simüle ediliyor...${C.reset}`);
    await client.fetchCsrfToken();
    const hugeString = "A".repeat(3 * 1024 * 1024); // 3 Megabytes
    const largePayloadRes = await client.request("POST", "/api/auth/login", {
        identifier: "admin@thenest.org",
        password: "pass",
        junkBuffer: hugeString,
    });

    // 413 Payload Too Large dönmeli
    const isPayloadBlocked = largePayloadRes.status === 413;
    recordAttack({
        category: "DoS / Payload Size",
        attackType: "3MB Large Payload DoS",
        payload: "3,145,728 bytes JSON body",
        httpStatus: largePayloadRes.status,
        blocked: isPayloadBlocked,
        note: isPayloadBlocked
            ? "Maksimum 1MB gövde sınırı aşıldığı için HTTP 413 Payload Too Large ile engellendi"
            : "Büyük payload kabul edildi!",
    });
}

// 6. DIRECTORY TRAVERSAL / PATH TRAVERSAL & HASSAS DOSYA SİMÜLATÖRÜ
async function testDirectoryTraversal(client) {
    console.log(`\n${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log(`${C.yellow}${C.bright}🎯 [6/7] DIRECTORY TRAVERSAL & HASSAS SİSTEM DOSYASI SIZDIRMA SİMÜLASYONU${C.reset}`);
    console.log(`${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);

    const traversalPayloads = [
        { name: "Linux /etc/passwd", path: "/../../../../etc/passwd" },
        { name: "URL Encoded Traversal", path: "/%2e%2e%2f%2e%2e%2fetc%2fpasswd" },
        { name: "Windows win.ini", path: "/..\\..\\..\\windows\\win.ini" },
        { name: "Gizli .env Dosyası", path: "/.env" },
        { name: "Git Yapılandırma Dosyası", path: "/.git/config" },
        { name: "SQLite Veritabanı Dosyası", path: "/server/db/the_nest.db" },
        { name: "Sunucu Kaynak Kodu (db.js)", path: "/server/src/db.js" },
        { name: "Package Manifest (package.json)", path: "/package.json" },
        { name: "Uploads Klasörü Traversal", path: "/uploads/../../server/src/app.js" },
    ];

    for (const item of traversalPayloads) {
        const res = await client.request("GET", item.path);
        // 403 Forbidden veya 404 Not Found dönmeli, asla 200 dönmemeli ve kaynak kodu/db sızmamalı!
        const isBlocked = (res.status === 403 || res.status === 404) && res.status !== 200;
        recordAttack({
            category: "Directory Traversal",
            attackType: item.name,
            payload: item.path,
            httpStatus: res.status,
            blocked: isBlocked,
            note: isBlocked ? "Güvenlik katmanı hassas dosyayı korudu ve erişimi engelledi" : "Kritik: Sistem dosyası sızdırıldı!",
        });
    }
}

// 7. GÜVENLİK BAŞLIKLARI & PROTOTYPE POLLUTION SİMÜLATÖRÜ
async function testHeadersAndPrototypePollution(client) {
    console.log(`\n${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log(`${C.yellow}${C.bright}🎯 [7/7] GÜVENLİK BAŞLIKLARI, PROTOKOL & PROTOTYPE POLLUTION KONTROLÜ${C.reset}`);
    console.log(`${C.yellow}${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);

    // 7.1 Helmet Güvenlik Başlıkları
    const rootRes = await client.request("GET", "/");
    const headers = rootRes.headers || {};

    const nosniff = headers["x-content-type-options"] === "nosniff";
    recordAttack({
        category: "Security Headers",
        attackType: "X-Content-Type-Options",
        payload: "Header: X-Content-Type-Options",
        httpStatus: rootRes.status,
        blocked: nosniff,
        note: nosniff ? "MIME-sniffing saldırılarına karşı 'nosniff' aktif" : "nosniff başlığı eksik",
    });

    // 7.2 Prototype Pollution Denemesi
    await client.fetchCsrfToken();
    const protoPollutionRes = await client.request("POST", "/api/auth/register", {
        username: "proto_victim",
        email: "proto@test.org",
        password: "Password123",
        "__proto__.isAdmin": true,
        "constructor.prototype.hacked": true,
    });

    const isProtoClean = ({}).isAdmin === undefined && ({}).hacked === undefined;
    recordAttack({
        category: "Prototype Pollution",
        attackType: "Object Prototype Pollution",
        payload: "__proto__.isAdmin = true",
        httpStatus: protoPollutionRes.status,
        blocked: isProtoClean,
        note: isProtoClean ? "JavaScript nesne prototipi güvenli, kirlenme engellendi" : "Kritik: Prototype pollution açığı!",
    });
}

// =============================================================================
// ANA ÇALIŞTIRICI & RAPOR ÜRETECİ
// =============================================================================

async function runPenetrationSuite() {
    console.log(`\n${C.yellow}${C.bright}======================================================================================================${C.reset}`);
    console.log(`${C.yellow}${C.bright} 🦅 THE NEST — OWASP TOP 10 SIZMA TESTİ VE SİBER SALDIRI SİMÜLATÖRÜ 🦅 ${C.reset}`);
    console.log(`${C.yellow}${C.bright}======================================================================================================${C.reset}\n`);

    console.log(`${C.cyan}⚙️  Veritabanı başlatılıyor ve güvenlik servisleri hazır hale getiriliyor...${C.reset}`);
    await initDatabase();

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`${C.green}🚀 Test Sunucusu Başlatıldı: ${baseUrl}${C.reset}\n`);

    const startTime = Date.now();

    try {
        await testSqlInjection(new AttackClient(baseUrl));
        await testCrossSiteScripting(new AttackClient(baseUrl));
        await testCsrfAttacks(new AttackClient(baseUrl));
        await testBrokenAccessControl(new AttackClient(baseUrl), new AttackClient(baseUrl), new AttackClient(baseUrl));
        await testBruteForceAndDos(new AttackClient(baseUrl));
        await testDirectoryTraversal(new AttackClient(baseUrl));
        await testHeadersAndPrototypePollution(new AttackClient(baseUrl));
    } catch (err) {
        console.error("\n❌ Sızma testi sırasında beklenmeyen istisna oluştu:", err);
    } finally {
        server.close();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const defenseRate = totalAttacks > 0 ? Math.round((blockedAttacks / totalAttacks) * 100) : 0;

    // DETAYLI DENETİM RAPORU ÇIKTISI
    console.log(`\n${C.yellow}${C.bright}======================================================================================================${C.reset}`);
    console.log(`${C.yellow}${C.bright} 🛡️ SİBER GÜVENLİK DENETİM VE SIZMA TESTİ RAPORU 🛡️ ${C.reset}`);
    console.log(`${C.yellow}${C.bright}======================================================================================================${C.reset}`);
    console.log(`⏱️  Toplam Denetim Süresi  : ${C.bright}${duration} saniye${C.reset}`);
    console.log(`🎯 Toplam Simüle Saldırı   : ${C.bright}${totalAttacks} adet${C.reset}`);
    console.log(`🛡️ Başarıyla Engellenen   : ${C.green}${C.bright}${blockedAttacks} adet${C.reset}`);
    console.log(`❌ Başarısız / Açık Veren  : ${successfulBreaches > 0 ? C.red : C.green}${C.bright}${successfulBreaches} adet${C.reset}`);
    console.log(`🏆 Güvenlik Savunma Skoru  : ${defenseRate === 100 ? C.green : C.yellow}${C.bright}%${defenseRate}${C.reset}`);
    console.log(`${C.yellow}${C.bright}======================================================================================================${C.reset}`);

    // OWASP TOP 10 KAPSAM ÖZETİ
    console.log(`\n${C.cyan}${C.bright}📋 OWASP TOP 10 KAPSAM VE SAVUNMA DURUMU:${C.reset}`);
    const categories = [...new Set(attackLogs.map((l) => l.category))];
    categories.forEach((cat, index) => {
        const items = attackLogs.filter((l) => l.category === cat);
        const catBlocked = items.filter((l) => l.blocked).length;
        const catRate = Math.round((catBlocked / items.length) * 100);
        const badge = catRate === 100 ? `${C.green}TAM KORUMA (%100)${C.reset}` : `${C.red}AÇIK MEVCUT (%${catRate})${C.reset}`;
        console.log(`  ${index + 1}. [${cat.padEnd(28, " ")}] : ${badge} (${catBlocked}/${items.length} saldırı engellendi)`);
    });

    console.log(`\n${C.green}${C.bright}======================================================================================================${C.reset}`);
    if (successfulBreaches === 0) {
        console.log(`${C.green}${C.bright} 🎉 TEBRİKLER! TÜM SALDIRILAR BAŞARIYLA PÜSKÜRTÜLDÜ VE SİSTEM GÜVENLİĞİ ONAYLANDI 🎉 ${C.reset}`);
    } else {
        console.log(`${C.red}${C.bright} ⚠️ DİKKAT: BAZI SALDIRILAR ENGELLENEMEDİ. LÜTFEN İLGİLİ GÜVENLİK MODÜLLERİNİ SERTLEŞTİRİN. ⚠️ ${C.reset}`);
    }
    console.log(`${C.green}${C.bright}======================================================================================================${C.reset}\n`);

    if (successfulBreaches > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

if (require.main === module) {
    runPenetrationSuite().catch((err) => {
        console.error("Penetration test failed to run:", err);
        process.exit(1);
    });
}

module.exports = { runPenetrationSuite };
